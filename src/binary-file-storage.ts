import { Storage, Page } from './engine';
import fs from 'fs-extra';
import readline from 'readline';
import path from 'path';

export class BinaryFileStorage implements Storage {
  readonly headerSize: number = 4;
  readonly hashRowSize: number = 128 + 4;
  readonly indexSize: number = 256000;
  readonly blockSize: number = 512;
  private fd: number;
  /**
   * Word to page index
   * Example: {
   *    'planet': [1],
   *    'giant: [1],
   * }
   *
   * Storage format:
   * label (starts at)
   * header (0): [next free block index]
   * index (4):  [word 128][block index 4]
   * ...
   * data (256 000): [4 byte site index, ...][0x0000 (end) or 0xffffff + next block index]
   */
  constructor(public indexPath: string) {
    this.fd = 0;
  }

  async *getWordIterator(word: string): AsyncIterableIterator<number> {
    let i = 0;
    const blockIndex = await this.getHashEntryBlockIndex(word);
    let block = await this.getBlock(await this.getBlockOffset(blockIndex));
    let siteId: number;
    do {
      siteId = block.readUInt32BE(i);
      if (siteId === 4294967295) {
        i += 4;
        const nextBlock = block.readUInt32BE(i);
        block = await this.getBlock(await this.getBlockOffset(nextBlock));
        i = 0;
        continue;
      }
      if (siteId > 0) yield siteId;
      i += 4;
    } while (siteId > 0);
  }

  async initWord(word: string): Promise<void> {
    const wordBuf = Buffer.from(word, 'utf-8');
    const readBuf = await this.getHashEntry(word);

    if (readBuf.slice(0, wordBuf.length).compare(wordBuf) === 0) {
      return;
    }

    const blockIndex = await this.getCurrentBlockIndex();
    await this.writeHashEntry(word, blockIndex, false);

    await this.addBlock(blockIndex);
    await this.writeBlockIndex(blockIndex + 1);
  }
  async resetWord(word: string): Promise<void> {
    await this.writeHashEntry(word, 0, true);
  }
  async addWord(word: string, pageId: number): Promise<void> {
    const blockIndex = await this.getHashEntryBlockIndex(word);
    const blockOffset = await this.getBlockOffset(blockIndex);
    const {
      blockOffset: blockEndingOffset,
      insertEnding,
    } = await this.getBlockEndingOffset(blockOffset);
    let data: Buffer;

    if (insertEnding) {
      const currBlockIndex = await this.getCurrentBlockIndex();
      await this.addBlock(currBlockIndex);
      await this.writeBlockIndex(currBlockIndex + 1);

      data = Buffer.concat([
        Buffer.from(this.toBEInt32(pageId)),
        Buffer.from([0xff, 0xff, 0xff, 0xff]),
        Buffer.from(this.toBEInt32(currBlockIndex)), // new block pointer
      ]);
    } else
      data = Buffer.concat([
        Buffer.from(this.toBEInt32(pageId)),
        Buffer.from(this.toBEInt32(0)),
      ]);

    await fs.write(
      await this.getFileDescriptor(),
      data,
      undefined,
      undefined,
      blockEndingOffset
    );
  }

  private async addBlock(blockIndex: number) {
    const blockOffset = await this.getBlockOffset(blockIndex);
    // write empty block
    await fs.write(
      await this.getFileDescriptor(),
      Buffer.from(this.toBEInt32(0)),
      undefined,
      undefined,
      blockOffset
    );
  }

  private async getFileDescriptor(): Promise<number> {
    if (this.fd) return this.fd;
    this.fd = await fs.open(path.join(this.indexPath, '/word-dic'), 'a+');
    return this.fd;
  }

  private async getBlock(blockOffset: number): Promise<Buffer> {
    const buf = Buffer.allocUnsafe(this.blockSize);
    await fs.read(
      await this.getFileDescriptor(),
      buf,
      0,
      buf.length,
      blockOffset
    );
    return buf;
  }

  /**
   * Given a block, find end of data of that block or other linked blocks
   * @param blockOffset
   */
  private async getBlockEndingOffset(
    blockOffset: number
  ): Promise<{ blockOffset: number; insertEnding: boolean }> {
    let buf = await this.getBlock(blockOffset);
    for (let i = 0; i < buf.length; i += 4) {
      let val = buf.readUInt32BE(i);
      if (val === 0)
        return {
          blockOffset: blockOffset + i,
          insertEnding: this.blockSize - i * 4 < 12,
        };
      if (val === 4294967295) {
        i += 4;
        blockOffset = buf.readUInt32BE(i);
        buf = await this.getBlock(blockOffset);
        i = -4;
      }
    }

    throw new Error('should not have ended up here');
  }

  private async getBlockOffset(blockIndex: number) {
    const blockOffset =
      this.headerSize + this.indexSize + blockIndex * this.blockSize;
    return blockOffset;
  }

  private async writeBlockIndex(blockIndex: number) {
    // write block index
    await fs.write(
      await this.getFileDescriptor(),
      Buffer.from(this.toBEInt32(blockIndex)),
      undefined,
      undefined,
      0
    );
  }

  private async getCurrentBlockIndex() {
    const buf = Buffer.alloc(4);
    await fs.read(await this.getFileDescriptor(), buf, 0, buf.length, 0);
    return buf.readUInt32BE() + 1;
  }

  private async getHashEntryBlockIndex(word: string) {
    const buf = await this.getHashEntry(word);
    const block = buf.readUInt32BE(128);
    return block;
  }

  private async getHashEntry(word: string): Promise<Buffer> {
    const hash = this.fnv32a(word);
    const hashIndex = hash % this.indexSize;

    // // hash row:
    // // [word 128][block pointer]
    // const hashRowBuf = Buffer.alloc(this.hashRowSize);
    const wordBuf = Buffer.from(word, 'utf-8');
    if (wordBuf.byteLength > 128)
      throw new Error(`${word} to long (${wordBuf.byteLength} bytes)`);

    const hashRowOffset = this.headerSize + hashIndex * this.hashRowSize;
    const hashBuf = Buffer.alloc(this.hashRowSize);

    await fs.read(
      await this.getFileDescriptor(),
      hashBuf,
      0,
      hashBuf.length,
      hashRowOffset
    );
    return hashBuf;
  }

  private async writeHashEntry(
    word: string,
    block: number,
    reset: boolean = false
  ) {
    const hash = this.fnv32a(word);
    const hashIndex = hash % this.indexSize;

    // hash row:
    // [word 128][block pointer]
    const hashRowBuf = Buffer.alloc(this.hashRowSize);
    const wordBuf = Buffer.from(word, 'utf-8');
    if (wordBuf.byteLength > 128)
      throw new Error(`${word} to long (${wordBuf.byteLength} bytes)`);

    if (!reset) {
      wordBuf.copy(hashRowBuf);
      Buffer.from(this.toBEInt32(block)).copy(hashRowBuf, 128);
    }
    const hashRowOffset = this.headerSize + hashIndex * this.hashRowSize;

    await fs.write(
      await this.getFileDescriptor(),
      hashRowBuf,
      0,
      hashRowBuf.length,
      hashRowOffset
    );
  }

  /**
   * Big endian
   * @param num
   */
  private toBEInt32(num: number) {
    const arr = new Uint8Array([
      (num & 0xff000000) >> 24,
      (num & 0x00ff0000) >> 16,
      (num & 0x0000ff00) >> 8,
      num & 0x000000ff,
    ]);
    return arr.buffer;
  }

  // 32 bit FNV-1a hash
  // Ref.: http://isthe.com/chongo/tech/comp/fnv/
  private fnv32a(str: string): number {
    var FNV1_32A_INIT = 0x811c9dc5;
    var hval = FNV1_32A_INIT;
    for (var i = 0; i < str.length; ++i) {
      hval ^= str.charCodeAt(i);
      hval +=
        (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    return hval >>> 0;
  }

  private divideIntoParts(str: string, chunkSize: number) {
    const parts = [];
    let i;
    const partsToDivideInto = Math.floor(str.length / chunkSize);
    for (i = 0; i < partsToDivideInto - 1; i += chunkSize) {
      parts.push(str.substring(i, i + chunkSize));
    }
    parts.push(str.substring(i));
    return parts;
  }

  // pages

  async initPage(pageId: number, page: Page): Promise<void> {
    const file = this.getPageFilename(pageId);
    await fs.ensureFile(file);
    await fs.writeFile(file, JSON.stringify(page), { encoding: 'utf-8' });
  }

  async getPage(pageId: number): Promise<Page> {
    return fs.readJson(this.getPageFilename(pageId));
  }

  private getPageFilename(pageId: number): string {
    const filename = pageId.toString();
    return path.join(
      this.indexPath,
      '/pages',
      '/' + filename.length,
      '/',
      this.divideIntoParts(filename, 1).join('/')
    );
  }

  // url to page

  async getUrlToPage(url: string): Promise<number | undefined> {
    try {
      return await fs.readJson(this.getUrlToPageFilename(url));
    } catch (err) {
      return undefined;
    }
  }

  async setUrlToPage(url: string, pageId: number): Promise<void> {
    await fs.ensureFile(this.getUrlToPageFilename(url));
    await fs.writeFile(this.getUrlToPageFilename(url), JSON.stringify(pageId), {
      encoding: 'utf-8',
    });
  }

  private getUrlToPageFilename(url: string) {
    // const filename = url
    //   .replace(/[^a-zA-Z0-9]/gi, '_')
    //   .replace(/([A-Z])/g, '-$1-')
    //   .toLowerCase();
    const filename = Buffer.from(url).toString('base64');
    return path.join(
      this.indexPath,
      '/urls',
      '/' + filename.length,
      '/',
      this.divideIntoParts(filename, 5).join('/')
    );
  }

  // seed
  async getSeed(): Promise<number> {
    try {
      return await fs.readJson(this.getSeedFilename());
    } catch (err) {
      return 1;
    }
  }

  async increaseSeed(): Promise<void> {
    let seed = await this.getSeed();
    seed++;
    await fs.ensureFile(this.getSeedFilename());
    await fs.writeFile(this.getSeedFilename(), JSON.stringify(seed), {
      encoding: 'utf-8',
    });
  }

  private getSeedFilename() {
    const filename = 'seed';
    return path.join(this.indexPath, filename);
  }
}
