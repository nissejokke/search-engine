import fs from 'fs-extra';
import path from 'path';

export class Hash {
  readonly headerSize: number = 4;
  readonly wordSize: number = 64;
  readonly hashRowSize: number = 64 + 4;
  readonly hashRows: number = 256000;
  readonly blockSize: number = 256;

  private fd: number;
  constructor(private opts: { filePath: string }) {
    this.fd = 0;
  }

  async set(key: string, data?: Buffer): Promise<number> {
    let blockIndex = await this.getHashEntryBlockIndex(key);
    const blockExists = blockIndex > 0;
    if (!blockExists) {
      blockIndex = await this.getCurrentBlockIndex();
      await this.writeBlockIndex(blockIndex + 1);
    }

    // hash row:
    // [word 128][block pointer]
    const hashBuf = Buffer.alloc(this.hashRowSize);
    const keyBuf = Buffer.from(key, 'utf-8');

    keyBuf.copy(hashBuf);
    Buffer.from(this.toBEInt32(blockIndex)).copy(hashBuf, this.wordSize);

    await this.writeHash(key, hashBuf);
    const buf = Buffer.alloc(this.blockSize);
    if (data) data.copy(buf);
    await this.writeBlock(blockIndex, buf);

    return this.getBlockOffset(blockIndex);
  }

  async *appendIterator(
    key: string
  ): AsyncIterableIterator<(buf: Buffer) => Promise<void>> {
    const fd = await this.getFileDescriptor();

    let blockOffset = (await this.get(key)) - 4;
    let isBlockFull = false;
    let firstAvailable: number;

    // iterate until last block
    do {
      firstAvailable = (await this.getBlock(blockOffset, 4)).readUInt32BE();
      isBlockFull = firstAvailable === 4294967295;
      if (isBlockFull) {
        let nextBlockIndex = (
          await this.getBlock(blockOffset + this.blockSize - 4, 4)
        ).readUInt32BE();
        if (nextBlockIndex > 0)
          blockOffset = this.getBlockOffset(nextBlockIndex);
        else return;
      }
    } while (isBlockFull);

    let blockRemaining = this.blockSize - 8 - firstAvailable;
    let offset = blockOffset + 4 + firstAvailable;

    while (true) {
      yield async (buf: Buffer) => {
        // block full, allocate new block
        if (blockRemaining < buf.length) {
          const newBlockIndex = await this.getCurrentBlockIndex();
          await this.writeBlock(newBlockIndex, Buffer.alloc(this.blockSize));
          await this.writeBlockIndex(newBlockIndex + 1);
          // new block index
          await fs.write(
            fd,
            Buffer.from(this.toBEInt32(newBlockIndex)),
            undefined,
            undefined,
            blockOffset + this.blockSize - 4
          );
          // mark block as full
          await fs.write(
            fd,
            Buffer.from(this.toBEInt32(4294967295)),
            undefined,
            undefined,
            blockOffset
          );

          blockOffset = this.getBlockOffset(newBlockIndex);
          offset = blockOffset + 4;
          blockRemaining = this.blockSize - 8;
          firstAvailable = 0;
        }

        await fs.write(fd, buf, undefined, undefined, offset);
        offset += buf.length;
        firstAvailable += buf.length;
        blockRemaining -= buf.length;

        await fs.write(
          fd,
          Buffer.from(this.toBEInt32(firstAvailable)),
          undefined,
          undefined,
          blockOffset
        );
      };
    }
  }

  async has(key: string) {
    return this.hashEntryExist(key);
  }

  async get(key: string): Promise<number> {
    const blockIndex = await this.getHashEntryBlockIndex(key);
    return this.getBlockOffset(blockIndex) + 4 /* skip fist available */;
  }

  async *getIterator(
    key: string
  ): AsyncIterableIterator<{ buffer: Buffer; offset: number }> {
    let offset: number = -1;
    let block: Buffer = Buffer.alloc(0);
    while (true) {
      if (offset === -1) offset = (await this.get(key)) - 4;
      else {
        const nextBlockIndex = block.readUInt32BE(this.blockSize - 4);
        if (nextBlockIndex > 0) offset = this.getBlockOffset(nextBlockIndex);
        else break;
      }
      block = await this.getBlock(offset);
      yield { buffer: block.slice(4, this.blockSize - 4), offset: offset + 4 };
    }
  }

  async hashEntryExist(key: string): Promise<boolean> {
    const wordBuf = Buffer.from(key, 'utf-8');
    const readBuf = await this.getHashEntry(key);

    return (
      readBuf
        .slice(0, wordBuf.length + 4)
        .compare(Buffer.concat([wordBuf, Buffer.from(this.toBEInt32(0))])) === 0
    );
  }

  /**
   * Write empty block at block index
   * @param blockIndex
   */
  private async writeBlock(blockIndex: number, data: Buffer) {
    if (data.length > this.blockSize) throw new Error('Not valid currently');
    const blockOffset = this.getBlockOffset(blockIndex);
    // write empty block
    await fs.write(
      await this.getFileDescriptor(),
      data,
      undefined,
      undefined,
      blockOffset
    );
  }

  /**
   * Word file descriptor
   */
  private async getFileDescriptor(): Promise<number> {
    if (this.fd) return this.fd;
    const file = this.opts.filePath;
    const exists = await fs.pathExists(file);
    this.fd = await fs.open(file, 'a+');
    if (!exists)
      await fs.write(
        this.fd,
        Buffer.alloc(this.headerSize + this.hashRows * this.hashRowSize)
      );
    return this.fd;
  }

  /**
   * Get block at offset
   * @param blockOffset
   */
  private async getBlock(
    blockOffset: number,
    size = this.blockSize
  ): Promise<Buffer> {
    const buf = Buffer.allocUnsafe(size);
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
   * Block index to block offset
   * @param blockIndex
   */
  private getBlockOffset(blockIndex: number): number {
    const blockOffset =
      this.headerSize +
      this.hashRows * this.hashRowSize +
      blockIndex * this.blockSize;
    return blockOffset;
  }

  /**
   * Write next free block index in header
   * @param blockIndex
   */
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

  /**
   * Get free block index from header
   */
  private async getCurrentBlockIndex() {
    const buf = Buffer.alloc(4);
    await fs.read(await this.getFileDescriptor(), buf, 0, buf.length, 0);
    return buf.readUInt32BE() + 1;
  }

  /**
   * Get hash entry data for word, which is block index
   * @param word
   */
  private async getHashEntryBlockIndex(word: string) {
    const buf = await this.getHashEntry(word);
    const block = buf.readUInt32BE(this.wordSize);
    return block;
  }

  /**
   * Get hash entry [word 128][block index 4]
   * @param key
   */
  private async getHashEntry(key: string): Promise<Buffer> {
    const hash = this.fnv32a(key);
    const hashIndex = hash % this.hashRows;

    // // hash row:
    // // [word 128][block pointer]
    // const hashRowBuf = Buffer.alloc(this.hashRowSize);
    const wordBuf = Buffer.from(key, 'utf-8');

    if (wordBuf.byteLength > this.wordSize)
      throw new Error(
        `${key} to long (${wordBuf.byteLength} bytes, max ${this.wordSize})`
      );

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

  /**
   * Write hash entry
   * @param word
   * @param block
   * @param reset
   */
  private async writeHash(key: string, data: Buffer) {
    const hash = this.fnv32a(key);
    const hashIndex = hash % this.hashRows;

    if (data.byteLength > this.hashRowSize)
      throw new Error(
        `${key} to long (${data.byteLength} bytes, max ${this.wordSize})`
      );

    const hashRowOffset = this.headerSize + hashIndex * this.hashRowSize;

    await fs.write(
      await this.getFileDescriptor(),
      data,
      0,
      data.length,
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

  /**
   *  32 bit FNV-1a hash
   *  @link http://isthe.com/chongo/tech/comp/fnv/
   */
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
}
