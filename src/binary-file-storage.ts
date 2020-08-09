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
   * [word 32*4][block pointer 4]
   * ...
   * 256 000:
   * [data array]..\1[pointer to next block]\0
   */
  constructor(public indexPath: string) {
    this.fd = 0;
  }

  async *getWordIterator(word: string): AsyncIterableIterator<number> {
    // try {
    //   const fileStream = await this.createReadStreamSafe(
    //     this.getWordFilename(word)
    //   );

    //   const rl = readline.createInterface({
    //     input: fileStream,
    //     crlfDelay: Infinity,
    //   });
    //   for await (let line of rl) {
    //     yield parseInt(line);
    //   }
    // } catch (err) {}

    let i = 0;
    const blockIndex = await this.getHashEntryBlockIndex(word);
    const block = await this.getBlock(await this.getBlockOffset(blockIndex));
    let siteId: number;
    do {
      siteId = block.readUInt32BE(i);
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

    const block = await this.getBlockIndex();
    await this.writeHashEntry(word, block, false);

    const blockOffset = await this.getBlockOffset(block);

    // write empty block
    fs.write(
      await this.getFileDescriptor(),
      Buffer.from(this.toBEInt32(0)),
      undefined,
      undefined,
      blockOffset
    );

    // write block index
    fs.write(
      await this.getFileDescriptor(),
      Buffer.from(this.toBEInt32(block + 1)),
      undefined,
      undefined,
      0
    );
  }
  async resetWord(word: string): Promise<void> {
    await this.writeHashEntry(word, 0, true);
  }
  async addWord(word: string, pageId: number): Promise<void> {
    const block = await this.getHashEntryBlockIndex(word);
    const blockOffset = await this.getBlockOffset(block);
    const blockEnding = await this.getBlockEndingBytes(blockOffset);
    const data = Buffer.concat([
      Buffer.from(this.toBEInt32(pageId)),
      Buffer.from(this.toBEInt32(0)),
    ]);
    await fs.write(
      await this.getFileDescriptor(),
      data,
      undefined,
      undefined,
      blockOffset + blockEnding
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

  private async getBlockEndingBytes(blockOffset: number) {
    const buf = await this.getBlock(blockOffset);
    for (let i = 0; i < buf.length; i += 4) {
      const val = buf.readUInt32BE(i);
      if (val === 0) return i;
    }
    throw new Error('should not have ended up here');
  }

  private async getBlockOffset(block: number) {
    const blockOffset =
      this.headerSize + this.indexSize + block * this.blockSize;
    return blockOffset;
  }

  private async getBlockIndex() {
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
    const readBuf = Buffer.alloc(this.hashRowSize);

    await fs.read(
      await this.getFileDescriptor(),
      readBuf,
      0,
      readBuf.length,
      hashRowOffset
    );
    return readBuf;
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

  private createReadStreamSafe(filename: string): Promise<fs.ReadStream> {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filename);
      fileStream.on('error', reject).on('open', () => {
        resolve(fileStream);
      });
    });
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

  private getWordFilename(word: string): string {
    const filename = word.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return path.join(
      this.indexPath,
      '/words',
      '/' + filename.length,
      '/',
      this.divideIntoParts(filename, 2).join('/')
    );
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

  //   private async wordExists(word: string): Promise<boolean> {
  //     try {
  //       await fs.promises.access(this.getWordFilename(word));
  //       return true;
  //     } catch (error) {
  //       return false;
  //     }
  //   }

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
