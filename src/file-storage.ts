import { Storage } from './engine';
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
  //   readInterface: readline.Interface;

  constructor(public indexPath: string) {}

  async *getWordIterator(word: string): AsyncIterableIterator<number> {
    const fileStream = fs.createReadStream(this.getFilename(word));

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });
    for await (let line of rl) {
      yield parseInt(line);
    }
  }
  async initWord(word: string): Promise<void> {
    if (!(await this.wordExists(word))) await this.resetWord(word);
  }
  async resetWord(word: string): Promise<void> {
    const file = this.getFilename(word);
    await fs.ensureFile(file);
  }
  async addWord(word: string, pageId: number): Promise<void> {
    await fs.promises.appendFile(
      this.getFilename(word),
      pageId.toString() + '\n',
      'utf-8'
    );
  }

  private getFilename(word: string): string {
    const filename = word.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return path.join(
      this.indexPath,
      filename.substring(0, 1) + '/' + filename.substring(1)
    );
  }

  private async wordExists(word: string): Promise<boolean> {
    try {
      await fs.promises.access(this.getFilename(word));
      return true;
    } catch (error) {
      return false;
    }
  }
}
