import fs from 'fs-extra';

/**
 * Binary file based hash table with linked list as value for each key
 */
export class Hash {
  /**
   * Size of header, the header is first in file
   */
  readonly headerSize: number = 4;
  /**
   * Bytes reserved for each key
   */
  keySize: number;
  /**
   * Hash row size (keySize + head offset (4) + tail offset (4))
   */
  hashRowSize: number;
  /**
   * Number of hash rows
   */
  hashRows: number;
  /**
   * Size of node including pointer to next node
   */
  nodeSize: number;
  /**
   * File descriptor for hash file
   */
  private fd: number;

  /**
   * Hash
   *
   * Storage format:
   * label (starts at byte)
   * header (0): [byte offset to next free node byte index]
   * index (4):  [<keySize> bytes][head node 4 byte index][tail node 4 byte index]
   * ...
   * ... x <hashRows> times
   * data (<headerSize> + <hashRowSize> * <hashRows>): [<nodeSize> byte data][4 byte next node index].. x repeat
   */
  constructor(
    private opts: {
      /**
       * File path
       */
      filePath: string;
      /**
       * Key size
       */
      keySize: number;
      /**
       * Max hash rows to allocate (hashRows * keySize + 8) + 4 is size of index
       */
      hashRows: number;
      /**
       * Size of each node in the linked list (excluding pointer to next node)
       */
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
   * Initiate key with data or empty node
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
    if (keyBuf.length > this.keySize) throw new Error(`Key too large: ${key}`);

    // copy key to hash buffer
    keyBuf.copy(hashBuf);
    // copy node offset to the end off hash buffer
    Buffer.from(Hash.toBEInt32(headOffset)).copy(hashBuf, this.keySize);
    // copy last node offset to the end off hash buffer
    Buffer.from(Hash.toBEInt32(headOffset)).copy(hashBuf, this.keySize + 4);

    // write hash
    await this.writeHash(hashIndex, key, hashBuf);

    // write node
    const buf = Buffer.alloc(this.nodeSize);
    if (data && data.length > this.nodeSize - 4)
      throw new Error(
        `Data ${data.length} too large max: ${this.nodeSize - 4}`
      );
    if (data) data.copy(buf);
    await this.writeNode(headOffset, buf, 0);
  }

  /**
   * Insert value at linked list position at key
   * @param key
   * @param index
   * @param buf
   */
  async insertAt(key: string, index: number, buf: Buffer): Promise<void> {
    if (index === 0) {
      return await this.insertFirst(key, buf);
    }

    let { headOffset } = await this.get(key);
    const headData = await this.getNode(headOffset);

    interface Node {
      offset: number;
      buffer: Buffer;
    }

    let node: Node;
    let previous: Node | undefined;
    let current: Node | undefined;

    // allocate new node
    const newNodeOffset = await this.getAndIncreateFreeNodeOffset();
    node = { offset: newNodeOffset, buffer: buf };
    current = {
      offset: headOffset,
      buffer: headData.slice(0, this.nodeSize - 4),
    };

    for await (const {
      index: currIndex,
      offset: currOffset,
      buffer: currBuffer,
    } of this.getIterator(key, true)) {
      if (currIndex === 0) {
        continue;
      }

      if (currIndex - 1 < index) {
        previous = current;
        current = { offset: currOffset, buffer: currBuffer };
      } else break;
    }

    if (!previous) return this.insertFirst(key, buf);

    // write new node, points current
    await this.writeNode(node.offset, buf, current!.offset);

    // write previous node, points to new node
    await this.writeNode(previous!.offset, previous!.buffer, node.offset);
  }

  /**
   * Insert value into linked list at first position
   * @param key
   * @param buf
   */
  async insertFirst(key: string, buf: Buffer): Promise<void> {
    let { headOffset } = await this.get(key);
    const nextNodeOffset = await this.getAndIncreateFreeNodeOffset();

    // write new node, points to old headoffset
    await this.writeNode(nextNodeOffset, buf, headOffset);
    // write new headoffset
    await this.writeHashEntryHeadOffset(key, nextNodeOffset);
  }

  // might be needed later:
  /**
   * Appends value to linked list at last position
   * @param key
   * @param buf
   */
  // async appendLast(key: string, buf: Buffer): Promise<void> {
  //   let { tailOffset } = await this.get(key);
  //   const nextNodeOffset = await this.getAndIncreateFreeNodeOffset();

  //   // write new node, points to old headoffset
  //   await this.writeNode(tailOffset, buf, nextNodeOffset);
  //   // write new headoffset
  //   await this.writeHashEntryTailOffset(key, nextNodeOffset);
  // }

  /**
   * Append data to value at key, adds node add end of linked list
   * @param key key to append to
   * @return appendIterator, buf bytes <= nodeSize bytes
   */
  async *appendIterator(
    key: string
  ): AsyncIterableIterator<(buf: Buffer) => Promise<void>> {
    const fd = await this.getFileDescriptor();

    let { tailOffset } = await this.get(key);
    if (tailOffset < this.headerSize + this.hashRows * this.hashRowSize)
      throw new Error(
        `tailoffset ${tailOffset} for ${key} is in hash index area, not allowed`
      );
    const { hashIndex } = await this.getHashEntryMatchingKey(key);
    const hashOffset = this.getHashOffset(hashIndex);

    while (true) {
      yield async (buf: Buffer) => {
        if (buf.length > this.nodeSize - 4)
          throw new Error(
            `Trying to write data of size ${
              buf.length
            } to node of max data size ${this.nodeSize - 4}`
          );

        const nextNodeOffset = await this.getFreeNodeOffset();
        await this.writeFreeNodeOffset(nextNodeOffset + this.nodeSize);
        const nextNodeOffsetBuf = Buffer.from(Hash.toBEInt32(nextNodeOffset));
        const dataAndNext = Buffer.concat([buf, nextNodeOffsetBuf]);

        // write node
        this.writeNode(tailOffset, buf, nextNodeOffset);
        await fs.write(fd, dataAndNext, undefined, undefined, tailOffset);
        tailOffset = nextNodeOffset;

        // write tail to hash
        await fs.write(
          fd,
          nextNodeOffsetBuf,
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
    key: string,
    includeTrailingEmpyNode = false
  ): AsyncIterableIterator<{ buffer: Buffer; offset: number; index: number }> {
    let headOffset: number = -1;
    let block: Buffer = Buffer.alloc(0);
    let index = 0;
    while (true) {
      if (headOffset === -1) headOffset = (await this.get(key)).headOffset;
      else {
        index++;
        const nextNodeOffset = block.readUInt32BE(this.nodeSize - 4);
        if (nextNodeOffset > 0) headOffset = nextNodeOffset;
        else break;
      }

      block = await this.getNode(headOffset);
      // only include last empty node if should
      if (
        includeTrailingEmpyNode ||
        (!includeTrailingEmpyNode &&
          block.readUInt32BE(this.nodeSize - 4) !== 0)
      )
        yield {
          buffer: block.slice(0, this.nodeSize - 4),
          offset: headOffset,
          index,
        };
    }
  }

  /**
   * Find index to insert data in to keep linked list sorted
   * @param key
   * @param buf
   */
  async findIndexToInsertSortedAt(key: string, buf: Buffer): Promise<number> {
    let i = 0;
    for await (const { index, buffer } of this.getIterator(key, true)) {
      if (buf <= buffer) return index;
      i = index;
    }
    return i + 1;
  }

  /**
   * Write head offset value for key
   * @param key
   * @param headOffset
   */
  async writeHashEntryHeadOffset(key: string, headOffset: number) {
    const { hashIndex } = await this.getHashEntryMatchingKey(key);
    const hashOffset = this.getHashOffset(hashIndex);
    // write new head to hash
    await fs.write(
      await this.getFileDescriptor(),
      Buffer.from(Hash.toBEInt32(headOffset)),
      undefined,
      undefined,
      hashOffset + this.keySize
    );
  }

  /**
   * Write head offset value for key
   * @param key
   * @param tailOffset
   */
  async writeHashEntryTailOffset(key: string, tailOffset: number) {
    const { hashIndex } = await this.getHashEntryMatchingKey(key);
    const hashOffset = this.getHashOffset(hashIndex);
    // write new head to hash
    await fs.write(
      await this.getFileDescriptor(),
      Buffer.from(Hash.toBEInt32(tailOffset)),
      undefined,
      undefined,
      hashOffset + this.keySize + 4
    );
  }

  /**
   * Allocate new node and return offset to it
   */
  async getAndIncreateFreeNodeOffset() {
    const nextNodeOffset = await this.getFreeNodeOffset();
    await this.writeFreeNodeOffset(nextNodeOffset + this.nodeSize);
    return nextNodeOffset;
  }

  /**
   * Get next value of node at offset
   * @param offset
   */
  async getNodeNextOffset(offset: number) {
    let next = Buffer.alloc(4);
    await fs.read(this.fd, next, offset + this.nodeSize - 4, 0, null);
    return next.readInt32BE();
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
          hashIndex %= this.hashRows;
          checkNextEntry = true;
        } else checkNextEntry = false;
      } else checkNextEntry = false;
    } while (checkNextEntry);
    if (tailOffset === 0) tailOffset = headOffset;
    return { hashIndex, headOffset, tailOffset };
  }

  /**
   * Hash entry exist?
   * @param key
   */
  private async hashEntryExist(key: string): Promise<boolean> {
    const { headOffset } = await this.getHashEntryMatchingKey(key);
    return headOffset > 0;
  }

  /**
   * Hash entry contains key?
   * @param hashEntry
   * @param key
   */
  private hashEntryContainsData(hashEntry: Buffer, key: string) {
    const keyBuf = Buffer.from(key, 'utf-8');

    return (
      hashEntry
        .slice(0, keyBuf.length + 4)
        .compare(Buffer.concat([keyBuf, Buffer.from(Hash.toBEInt32(0))])) === 0
    );
  }

  /**
   * Write data and next node offset to node
   */
  private async writeNode(offset: number, data: Buffer, nextOffset: number) {
    if (data.length > this.nodeSize) throw new Error('Node size too large');

    const nextNodeOffsetBuf = Buffer.from(Hash.toBEInt32(nextOffset));
    const dataAndNext = Buffer.concat([data, nextNodeOffsetBuf]);

    await fs.write(
      await this.getFileDescriptor(),
      dataAndNext,
      undefined,
      undefined,
      offset
    );
  }

  /**
   * File descriptor (cached)
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
        Hash.toBEInt32(this.headerSize + this.hashRows * this.hashRowSize)
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
      Buffer.from(Hash.toBEInt32(nodeOffset)),
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
    const offset = buf.readUInt32BE();
    return offset;
  }

  /**
   * Key to hash index
   * @param key
   */
  private getHashIndexFromKey(key: string) {
    const hash = this.fnv32a(key);
    const hashIndex = hash % this.hashRows;
    return hashIndex;
  }

  /**
   * Hash entry at index
   * @param hashIndex
   */
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

  /**
   * get offset to hash for index
   * @param hashIndex
   */
  private getHashOffset(hashIndex: number) {
    return this.headerSize + hashIndex * this.hashRowSize;
  }

  /**
   * Number to 32bit big endian
   * @param num
   */
  public static toBEInt32(num: number) {
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

  /**
   * 32 bit FNV hash
   * @param str
   */
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
