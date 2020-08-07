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

  async getWord(word: string): Promise<number[]> {
    return this.index[word];
  }
  async resetWord(word: string): Promise<void> {
    this.index[word] = [];
  }
  async addWord(word: string, pageId: number): Promise<void> {
    this.index[word].push(pageId);
  }
}
