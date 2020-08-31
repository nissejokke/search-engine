import { Storage, Page } from './@types';

export class MemoryStorage implements Storage {
  /**
   * Page seed
   */
  seed: number;

  /**
   * Word to page index
   * Example: {
   *    'planet': [1],
   *    'giant: [1],
   * }
   */
  index: Record<string, LinkedList<number>>;

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

  /**
   * Url to page id
   * Example: {
   *    'https://en.wikipedia.org/wiki/planet': 1
   * }
   */
  urlToPage: Record<string, number>;

  constructor() {
    this.index = {};
    this.pages = {};
    this.urlToPage = {};
    this.seed = 0; // so that page files can be broken up in directories with two digits
  }

  async *getWordIterator(word: string): AsyncIterableIterator<number> {
    let i = 0;
    const list = this.index[word];
    if (!list) return;
    let item: Node<number> | null = null;
    while (i === 0 || item) {
      item = list.getAt(i);
      if (item) yield item.data;
      i++;
    }
  }
  async initWord(word: string): Promise<void> {
    if (!this.index[word]) this.index[word] = new LinkedList();
  }
  async resetWord(word: string): Promise<void> {
    this.index[word] = new LinkedList();
  }
  async addWord(word: string, pageId: number): Promise<void> {
    const hash = this.index[word];
    const result = hash.findLast((val) => val < pageId);
    if (result) hash.insertAt(result?.index, pageId);
    else hash.insertLast(pageId);
  }

  async initPage(pageId: number, page: Page): Promise<void> {
    const { title, url, words, index } = page;
    this.pages[pageId] = {
      title,
      url,
      words,
      index,
    };
  }

  async getPage(pageId: number): Promise<Page> {
    return this.pages[pageId];
  }

  async getUrlToPage(url: string): Promise<number> {
    return this.urlToPage[url];
  }

  async setUrlToPage(url: string, pageId: number): Promise<void> {
    this.urlToPage[url] = pageId;
  }

  // seed
  async getSeed(): Promise<number> {
    return this.seed;
  }
  async increaseSeed(): Promise<void> {
    this.seed++;
  }
}

// Construct Single Node
class Node<T> {
  data: T;
  next: Node<T> | null;

  constructor(data: T, next: Node<T> | null = null) {
    this.data = data;
    this.next = next;
  }
}

// Create/Get/Remove Nodes From Linked List
class LinkedList<T> {
  head: Node<T> | null;
  size: number;

  constructor() {
    this.head = null;
    this.size = 0;
  }

  // Insert first node
  insertFirst(data: T) {
    this.head = new Node(data, this.head);
    this.size++;
  }

  // Insert last node
  insertLast(data: T) {
    let node = new Node(data);
    let current;

    // If empty, make head
    if (!this.head) {
      this.head = node;
    } else {
      current = this.head;

      while (current.next) {
        current = current.next;
      }

      current.next = node;
    }

    this.size++;
  }

  // Insert at index
  insertAt(data: T, index: number) {
    //  If index is out of range
    if (index > 0 && index > this.size) {
      return;
    }

    // If first index
    if (index === 0) {
      this.insertFirst(data);
      return;
    }

    const node = new Node(data);
    let previous: Node<T> | null;

    // Set current to first
    let current = this.head;
    let count = 0;

    while (count < index) {
      previous = current; // Node before index
      count++;
      current = current!.next; // Node after index
    }

    node.next = current;
    previous!.next = node;

    this.size++;
  }

  // Get at index
  getAt(index: number): Node<T> | null {
    let current = this.head;
    let count = 0;

    while (current) {
      if (count == index) {
        return current;
      }
      count++;
      current = current.next;
    }

    return null;
  }

  // Remove at index
  removeAt(index: number) {
    if (index > 0 && index > this.size) {
      return;
    }

    let current = this.head;
    let previous: Node<T> | null;
    let count = 0;

    if (!current) return;

    // Remove first
    if (index === 0) {
      this.head = current.next;
    } else {
      while (count < index) {
        count++;
        previous = current;
        current = current!.next;
      }

      previous!.next = current!.next;
    }

    this.size--;
  }

  // Clear list
  clearList() {
    this.head = null;
    this.size = 0;
  }

  // Print list data
  printListData() {
    let current = this.head;

    while (current) {
      console.log(current.data);
      current = current.next;
    }
  }

  find(fn: (val: T, index?: number) => boolean): Node<T> | null {
    let node = this.head;
    while (node) {
      let i = 0;
      if (fn(node.data, i)) return node;
      node = node.next;
      i++;
    }
    return null;
  }

  /**
   * Find last node where fn() returns true
   * @param fn
   */
  findLast(
    fn: (val: T, index?: number) => boolean
  ): { node: Node<T>; index: number } | null {
    let node = this.head;
    let found: Node<T> | null = null;
    while (node) {
      let i = 0;
      if (fn(node.data, i)) found = node;
      else if (found) return { node: found, index: i };
      node = node.next;
      i++;
    }
    return null;
  }
}
