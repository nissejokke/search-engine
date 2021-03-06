export interface Storage {
  getWordIterator: (word: string) => AsyncIterableIterator<number>;
  initWord: (word: string) => Promise<void>;
  resetWord: (word: string) => Promise<void>;
  addWord: (word: string, pageId: number) => Promise<void>;

  initPage: (pageId: number, page: Page) => Promise<void>;
  getPage: (pageId: number) => Promise<Page | null>;

  getUrlToPage: (url: string) => Promise<number | undefined>;
  setUrlToPage: (url: string, pageId: number) => Promise<void>;

  getSeed: (rank: number) => Promise<number>;
  //   increaseSeed: () => Promise<void>;
  getCount: () => Promise<number>;
}

export interface SearchResult {
  title: string;
  introduction: string;
  url: string;
}

export interface Page {
  title: string;
  url: string;
  words: string[];
  /**
   * Word index for page
   */
  index: Record<string, number[]>;
}
