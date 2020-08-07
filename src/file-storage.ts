import { Storage, Page } from './engine';
import fs from 'fs-extra';
import readline from 'readline';
import path from 'path';

export class FileStorage implements Storage {
  /**
   * Word to page index
   * Example: {
   *    'planet': [1],
   *    'giant: [1],
   * }
   */
  constructor(public indexPath: string) {}

  async *getWordIterator(word: string): AsyncIterableIterator<number> {
    try {
      const fileStream = await this.createReadStreamSafe(
        this.getWordFilename(word)
      );

      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });
      for await (let line of rl) {
        yield parseInt(line);
      }
    } catch (err) {}
  }
  async initWord(word: string): Promise<void> {
    if (!(await this.wordExists(word))) await this.resetWord(word);
  }
  async resetWord(word: string): Promise<void> {
    const file = this.getWordFilename(word);
    await fs.ensureFile(file);
  }
  async addWord(word: string, pageId: number): Promise<void> {
    await fs.promises.appendFile(
      this.getWordFilename(word),
      pageId.toString() + '\n',
      'utf-8'
    );
  }

  createReadStreamSafe(filename: string): Promise<fs.ReadStream> {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filename);
      fileStream.on('error', reject).on('open', () => {
        resolve(fileStream);
      });
    });
  }

  private getWordFilename(word: string): string {
    const filename = word.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return path.join(
      this.indexPath,
      '/words/',
      filename.substring(0, 1) + '/' + filename.substring(1)
    );
  }

  private async wordExists(word: string): Promise<boolean> {
    try {
      await fs.promises.access(this.getWordFilename(word));
      return true;
    } catch (error) {
      return false;
    }
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
      '/pages/',
      filename.substring(0, 2) + '/' + filename.substring(2)
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
    const filename = url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return path.join(this.indexPath, '/url-to-page/', filename);
  }
}
