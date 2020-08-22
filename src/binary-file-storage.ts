import { Storage, Page } from './engine';
import fs from 'fs-extra';
import path from 'path';
import { Hash } from './hash';

/**
 * File storage
 */
export class BinaryFileStorage implements Storage {
  private hash: Hash;

  constructor(public indexPath: string) {
    this.hash = new Hash({
      filePath: path.join(this.indexPath, '/word-dic'),
      keySize: 32,
      hashRows: 500000,
      nodeSize: 4,
    });
  }

  /**
   * Word to pageId iterator
   * @param word
   */
  async *getWordIterator(word: string): AsyncIterableIterator<number> {
    if (!(await this.hash.has(word))) return;

    for await (const { buffer, offset } of this.hash.getIterator(word)) {
      let i = 0;
      let pageId: number;
      do {
        pageId = buffer.readUInt32BE(i);
        if (pageId > 0) yield pageId;
        i += 4;
      } while (pageId > 0 && i < buffer.length);
    }
  }

  /**
   * Initiate if not already exist
   * @param word
   */
  async initWord(word: string): Promise<void> {
    if (await this.hash.has(word)) return;
    await this.hash.set(word);
  }

  /**
   * Reset word
   * @param word
   */
  async resetWord(word: string): Promise<void> {
    await this.hash.set(word);
  }

  /**
   * Add pageId to word index
   * @param word
   * @param pageId
   */
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

  /**
   * Splits string in to chunks
   * @param str
   * @param chunkSize
   */
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
