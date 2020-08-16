import fs from 'fs-extra';

/**
 * Binary file based hash table with linked list as value for each key
 */
export class Hash {
  readonly headerSize: number = 4;
  keySize: number; // 64;
  hashRowSize: number; // 64 + 4;
  hashRows: number; // 256000;
  nodeSize: number;
  private fd: number;

  /**
   * Hash
   *
   * Storage format:
   * label (starts at)
   * header (0): [next free node byte index]
   * index (4):  [word 64][head node 4 byte index][tail node 4 byte index]
   * ...
   * data (256 000): [4 byte data][4 byte next node index]..
   */
  constructor(
    private opts: {
      filePath: string;
      keySize: number;
      hashRows: number;
      nodeSize: number;
    }
  ) {
    this.fd = 0;
    this.keySize = opts.keySize;
    this.hashRows = opts.hashRows;
    this.nodeSize = opts.nodeSize + 4; // value + next node offset
    this.hashRowSize = this.keySize + 8; // key + head + tail
  }

  /**
   * Initiate key
   * @param key
   * @param data
   */
  async set(key: string, data?: Buffer): Promise<void> {
    let { hashIndex, headOffset } = await this.getHashEntryMatchingKey(key);

    const blockExists = headOffset > 0;
    if (!blockExists) {
      headOffset = await this.getFreeNodeOffset();
      await this.writeFreeNodeOffset(headOffset + this.nodeSize);
    }

    // hash row: [key][head offset 4 byte][tail offset 4 byte]
    const hashBuf = Buffer.alloc(this.hashRowSize);
    const keyBuf = Buffer.from(key, 'utf-8');

    // copy key to hash buffer
    keyBuf.copy(hashBuf);
    // copy node offset to the end off hash buffer
    Buffer.from(this.toBEInt32(headOffset)).copy(hashBuf, this.keySize);
    // copy last node offset to the end off hash buffer
    Buffer.from(this.toBEInt32(headOffset)).copy(hashBuf, this.keySize + 4);

    // write hash
    await this.writeHash(hashIndex, key, hashBuf);

    // write node
    const buf = Buffer.alloc(this.nodeSize);
    if (data && data.length > this.nodeSize - 4)
      throw new Error(
        `Data ${data.length} too large max: ${this.nodeSize - 4}`
      );
    if (data) data.copy(buf);
    await this.writeNode(headOffset, buf);
  }

  /**
   * Append data to value at key
   * @param key
   */
  async *appendIterator(
    key: string
  ): AsyncIterableIterator<(buf: Buffer) => Promise<void>> {
    const fd = await this.getFileDescriptor();

    let { tailOffset } = await this.get(key);

    while (true) {
      yield async (buf: Buffer) => {
        if (buf.length > this.nodeSize - 4)
          throw new Error(`Trying to write too large node`);

        const offset = await this.getFreeNodeOffset();
        await this.writeFreeNodeOffset(offset + this.nodeSize);
        const offsetBuffer = Buffer.from(this.toBEInt32(offset));

        const dataAndNext = Buffer.concat([buf, offsetBuffer]);

        // write node
        await fs.write(fd, dataAndNext, undefined, undefined, tailOffset);

        // write tail to hash
        const { hashIndex } = await this.getHashEntryMatchingKey(key);
        const hashOffset = this.getHashOffset(hashIndex);
        await fs.write(
          fd,
          offsetBuffer,
          undefined,
          undefined,
          hashOffset + this.keySize + 4
        );
      };
    }
  }

  /**
   * Key exists?
   * @param key
   */
  async has(key: string) {
    return this.hashEntryExist(key);
  }

  /**
   * Get offset to node
   * @param key
   */
  async get(key: string): Promise<{ headOffset: number; tailOffset: number }> {
    const { headOffset, tailOffset } = await this.getHashEntryMatchingKey(key);
    return { headOffset, tailOffset };
  }

  /**
   * Get iterator for key
   * @param key
   */
  async *getIterator(
    key: string
  ): AsyncIterableIterator<{ buffer: Buffer; offset: number }> {
    let headOffset: number = -1;
    let block: Buffer = Buffer.alloc(0);
    while (true) {
      if (headOffset === -1) headOffset = (await this.get(key)).headOffset;
      else {
        const nextNodeOffset = block.readUInt32BE(this.nodeSize - 4);
        if (nextNodeOffset > 0) headOffset = nextNodeOffset;
        else break;
      }

      block = await this.getNode(headOffset);
      yield { buffer: block.slice(0, this.nodeSize - 4), offset: headOffset };
    }
  }

  /**
   * Find hash entry matching or first available
   * @param key
   */
  async getHashEntryMatchingKey(key: string) {
    let hashIndex = this.getHashIndexFromKey(key);
    let hashEntry: Buffer;
    let checkNextEntry: boolean;
    let headOffset: number;
    let tailOffset: number;
    let collisions = 0;
    do {
      hashEntry = await this.getHashEntryByIndex(hashIndex);
      headOffset = hashEntry.readUInt32BE(this.keySize);
      tailOffset = hashEntry.readUInt32BE(this.keySize + 4);
      if (headOffset > 0) {
        const hashEntryContainsKey = await this.hashEntryContainsData(
          hashEntry,
          key
        );
        if (!hashEntryContainsKey) {
          hashIndex += (collisions + 1) ** 2;
          if (hashIndex > this.hashRows) throw new Error('Out of bounds');
          checkNextEntry = true;
        } else checkNextEntry = false;
      } else checkNextEntry = false;
    } while (checkNextEntry);
    return { hashIndex, headOffset, tailOffset };
  }

  async hashEntryExist(key: string): Promise<boolean> {
    const { headOffset } = await this.getHashEntryMatchingKey(key);
    return headOffset > 0;
  }

  hashEntryContainsData(hashEntry: Buffer, key: string) {
    const keyBuf = Buffer.from(key, 'utf-8');

    return (
      hashEntry
        .slice(0, keyBuf.length + 4)
        .compare(Buffer.concat([keyBuf, Buffer.from(this.toBEInt32(0))])) === 0
    );
  }

  /**
   * Write empty block at block index
   */
  private async writeNode(offset: number, data: Buffer) {
    if (data.length > this.nodeSize) throw new Error('Node size too large');
    // write empty block
    await fs.write(
      await this.getFileDescriptor(),
      data,
      undefined,
      undefined,
      offset
    );
  }

  /**
   * File descriptor
   */
  private async getFileDescriptor(): Promise<number> {
    if (this.fd) return this.fd;
    const file = this.opts.filePath;
    const exists = await fs.pathExists(file);
    this.fd = await fs.open(file, 'a+');
    if (!exists) {
      const data = Buffer.alloc(
        this.headerSize + this.hashRows * this.hashRowSize
      );
      // write first node offset to data
      Buffer.from(
        this.toBEInt32(this.headerSize + this.hashRows * this.hashRowSize)
      ).copy(data);
      await fs.write(this.fd, data);
    }
    return this.fd;
  }

  /**
   * Get block at offset
   * @param blockOffset
   */
  private async getNode(
    blockOffset: number,
    size = this.nodeSize
  ): Promise<Buffer> {
    const buf = Buffer.alloc(size);
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
   * Write next free block index in header
   * @param nodeOffset
   */
  private async writeFreeNodeOffset(nodeOffset: number) {
    // write block index
    await fs.write(
      await this.getFileDescriptor(),
      Buffer.from(this.toBEInt32(nodeOffset)),
      undefined,
      undefined,
      0
    );
  }

  /**
   * Get free block index from header
   */
  private async getFreeNodeOffset() {
    const buf = Buffer.alloc(4);
    await fs.read(await this.getFileDescriptor(), buf, 0, buf.length, 0);
    return buf.readUInt32BE() + 1;
  }

  private getHashIndexFromKey(key: string) {
    const hash = this.fnv32a(key);
    const hashIndex = hash % this.hashRows;
    return hashIndex;
  }

  private async getHashEntryByIndex(hashIndex: number) {
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
   * @param key
   * @param block
   * @param reset
   */
  private async writeHash(hashIndex: number, key: string, data: Buffer) {
    if (data.byteLength > this.hashRowSize)
      throw new Error(
        `${key} to long (${data.byteLength} bytes, max ${this.keySize})`
      );

    const hashRowOffset = this.getHashOffset(hashIndex);

    await fs.write(
      await this.getFileDescriptor(),
      data,
      0,
      data.length,
      hashRowOffset
    );
  }

  private getHashOffset(hashIndex: number) {
    return this.headerSize + hashIndex * this.hashRowSize;
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

  private fnv32(str: string): number {
    const offset_basis = 2166136261; // The prime, 32 bit offset_basis = 2,166,136,261 = 0x811C9DC5.

    const data = new Buffer(str);

    if (!Buffer.isBuffer(data)) {
      throw new Error('fnv32 input must be a String or Buffer.');
    }

    var hashint = offset_basis;

    for (var i = 0; i < data.length; i++) {
      hashint +=
        (hashint << 1) +
        (hashint << 4) +
        (hashint << 7) +
        (hashint << 8) +
        (hashint << 24);
      hashint = hashint ^ data[i];
    }

    return hashint >>> 0; // unsigned 32 bit integer.
  }
}
