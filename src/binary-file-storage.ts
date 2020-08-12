import { Storage, Page } from './engine';
import fs from 'fs-extra';
import path from 'path';
import { Hash } from './hash';

export class BinaryFileStorage implements Storage {
  readonly headerSize: number = 4;
  readonly wordSize: number = 64;
  readonly hashRowSize: number = 64 + 4;
  readonly hashRows: number = 256000;
  readonly blockSize: number = 256;
  private hash: Hash;
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
    const file = path.join(this.indexPath, '/word-dic');
    this.hash = new Hash({ filePath: file });
  }

  async *getWordIterator(word: string): AsyncIterableIterator<number> {
    if (!(await this.hash.has(word))) return;

    for await (const { buffer } of this.hash.getIterator(word)) {
      let i = 0;
      let siteId: number;
      do {
        siteId = buffer.readUInt32BE(i);
        if (siteId > 0) yield siteId;
        i += 4;
      } while (siteId > 0 && i < buffer.length);
    }
  }

  async initWord(word: string): Promise<void> {
    if (await this.hash.has(word)) return;
    await this.hash.set(word);
  }

  async resetWord(word: string): Promise<void> {
    await this.hash.set(word);
  }

  async addWord(word: string, pageId: number): Promise<void> {
    for await (const write of this.hash.appendIterator(word)) {
      const buf = Buffer.from(this.toBEInt32(pageId));
      await write(buf);
      break;
    }
  }

  // /**
  //  * Big endian
  //  * @param num
  //  */
  private toBEInt32(num: number) {
    const arr = new Uint8Array([
      (num & 0xff000000) >> 24,
      (num & 0x00ff0000) >> 16,
      (num & 0x0000ff00) >> 8,
      num & 0x000000ff,
    ]);
    return arr.buffer;
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
