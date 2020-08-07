import { Storage, Page } from './engine';

export class MemoryStorage implements Storage {
  /**
   * Word to page index
   * Example: {
   *    'planet': [1],
   *    'giant: [1],
   * }
   */
  index: Record<string, number[]>;
  /**
   * page id to pages index
   * Example: {
   *    1: {
   *        url: 'https://en.wikipedia.org/wiki/planet',
   *        words: ['A', 'planet', 'is', 'an', 'astronomical', 'body', 'orbiting', '.']
   *        index: {
   *            'a': [0],
   *            'gas': [44,22],
   *            'giant': [89, 99]
   *        },
   *
   *    }
   * }
   */
  pages: Record<number, Page>;

  constructor() {
    this.index = {};
    this.pages = {};
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

  async initPage(pageId: number, page: Page): Promise<void> {
    const { url, words, index } = page;
    this.pages[pageId] = {
      url,
      words,
      index,
    };
  }

  async getPage(pageId: number): Promise<Page> {
    return this.pages[pageId];
  }
}
