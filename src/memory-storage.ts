import { Storage } from './engine';

export class MemoryStorage implements Storage {
  /**
   * Word to page index
   * Example: {
   *    'planet': [1],
   *    'giant: [1],
   * }
   */
  index: Record<string, number[]>;
  constructor() {
    this.index = {};
  }

  async *getWordIterator(word: string): AsyncIterableIterator<number> {
    let i = 0;
    if (this.index[word])
      while (i < this.index[word].length) yield this.index[word][i++];
  }
  async initWord(word: string): Promise<void> {
    if (!this.index[word]) this.index[word] = [];
  }
  async resetWord(word: string): Promise<void> {
    this.index[word] = [];
  }
  async addWord(word: string, pageId: number): Promise<void> {
    this.index[word].push(pageId);
  }
}
