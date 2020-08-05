export interface SearchResult {
  ingress: string;
  url: string;
}

export interface Site {
  url: string;
  words: string[];
  /**
   * Word index for site
   */
  index: Record<string, number[]>;
}

export class Engine {
  /**
   * Word to site index
   * Example: {
   *    'planet': [1],
   *    'giant: [1],
   * }
   */
  index: Record<string, number[]>;
  /**
   * Site id to sites index
   * Example: {
   *    1: {
   *        url: 'https://en.wikipedia.org/wiki/planet',
   *        words: ['A', 'planet', 'is', 'an', 'astronomical', 'body', 'orbiting']
   *        index: {
   *            'gas': [44,22],
   *            'giant': [89, 99]
   *        },
   *
   *    }
   * }
   */
  site: Record<number, Site>;
  /**
   * Url to site id
   * Example: {
   *    'https://en.wikipedia.org/wiki/planet': 1
   * }
   */
  urlToSite: Record<string, number>;
  /**
   * Site seed
   */
  seed: number;

  constructor() {
    this.index = {};
    this.site = {};
    this.urlToSite = {};
    this.seed = 0;
  }

  /**
   * Add text to index
   * @param param0
   */
  add({ text, url }: { text: string; url: string }) {
    const siteKey = `site:${url}`;
    const { words } = this.toWords(text, true);

    if (!this.urlToSite[url]) {
      this.urlToSite[url] = this.seed;
      this.site[this.seed] = {
        url,
        words,
        index: {},
      };
      this.index[siteKey] = [];
    }

    words.forEach((word, index) => {
      const wordKey = word;

      if (!this.index[wordKey]) this.index[wordKey] = [];
      if (this.index[wordKey].indexOf(this.seed) === -1)
        this.index[wordKey].push(this.seed);
      this.index[siteKey].push(this.seed);

      const siteIndex = this.site[this.seed].index;
      if (!siteIndex[wordKey]) siteIndex[wordKey] = [];
      siteIndex[wordKey].push(index);
    });

    this.seed += 1;
  }

  /**
   * Free text search
   * @param text
   */
  search(text: string): SearchResult[] {
    const { words, quotes } = this.toWords(text, true);
    // arrays of sites where words exist
    const arrs = words
      .map((word) => this.index[word] || [])
      .filter((arr) => arr.length > 0);

    const isWordsValidForSite = (siteId: number) => {
      if (quotes.length === 0) return true;
      const site = this.site[siteId];
      for (let i = 0; i < quotes.length; i += 2) {
        const quotedWords = words.slice(quotes[i], quotes[i + 1]);
        if (this.isAdjecentWords(quotedWords, site)) return true;
      }
      return false;
    };

    // intersect arrays to get all site where all words exist
    const sitesWithWords = this.intersectMax(arrs, 5, isWordsValidForSite);

    return this.uniqueArr(sitesWithWords).map((siteId) => {
      const site = this.site[siteId];
      return {
        ingress: this.constructIngress(words, site),
        url: site.url,
      };
    });
  }

  private isAdjecentWords(words: string[], site: Site): boolean {
    const indices = words.map((word) => [...site.index[word]]);

    // shift words according to index
    // [[12,13,14]] => [[12,12,12]] (=true, they are adjectent, next to each other)
    const indicesEqualized = indices.map((wordIndices, i) =>
      wordIndices.map((ind) => ind - i)
    );

    return this.intersectMax(indicesEqualized, 1).length > 0;
  }

  /**
   * Creates search result introduction text
   * @param words searched words
   * @param index site index
   */
  private constructIngress(words: string[], site: Site): string {
    /**
     * Push word att index to ingress
     * @param ingress ingress to append to
     * @param wordIndex index of word
     */
    const pushAtIndex = (ingress: string[], wordIndex: number) => {
      const word = site.words[wordIndex];
      if (word) ingress.push(word);
    };

    // word indices to all hits in text
    const indices = this.uniqueArr(
      words
        .reduce((indices: number[], word) => {
          const indicesForWord = site.index[word];
          if (!indicesForWord) return indices;
          return indices.concat(indicesForWord);
        }, [])
        .sort()
    );

    return indices
      .reduce((ingress, ind, ingIndex) => {
        const getIndRelative = (relative: number) =>
          indices[ingIndex + relative];
        const isFirstWord = ingIndex === 0 || ind !== getIndRelative(-1) + 1;
        const isLastWord =
          ingIndex === indices.length - 1 || ind !== getIndRelative(+1) - 1;

        // two words before word to two words after word
        if (isFirstWord) pushAtIndex(ingress, ind - 2);
        if (isFirstWord) pushAtIndex(ingress, ind - 1);
        pushAtIndex(ingress, ind);
        if (isLastWord) pushAtIndex(ingress, ind + 1);
        if (isLastWord) pushAtIndex(ingress, ind + 2);
        if (
          ingIndex < indices.length - 1 &&
          Math.abs(ind - indices[ingIndex + 1]) > 1 // the two words are not right next to each other
        )
          ingress.push('...');

        return ingress;
      }, [] as string[])
      .join(' ');
  }

  private uniqueArr(arr: number[]): number[] {
    return [...new Set(arr)];
  }

  /**
   * Get intersection of arrays up to max count
   * @param arrs
   * @param maxCount
   * @param shouldBeAdded - if defined, will be required to return true to add value to intersection result list
   */
  private intersectMax(
    arrs: number[][],
    maxCount: number,
    shouldBeAdded?: (val: number) => boolean
  ): number[] {
    if (arrs.length === 0) return [];
    if (arrs.length === 1) return arrs[0];
    const result: number[] = [];
    let indices = new Array(arrs.length).fill(0);
    while (result.length < maxCount) {
      let vals: number[] = [];
      for (let i = 0; i < arrs.length; i++) {
        const ind = indices[i];
        if (ind >= arrs[i].length) return result;
        vals.push(arrs[i][ind]);
      }
      if (this.isAllEqual(vals)) {
        let add = false;
        if (shouldBeAdded) {
          if (shouldBeAdded(vals[0])) add = true;
        } else add = true;
        if (add) result.push(vals[0]);
      }
      const minValue = Math.min(...vals);
      const arrIndexWithSmallestValue = vals.indexOf(minValue);
      indices[arrIndexWithSmallestValue] += 1;
    }
    return result;
  }

  private sumArray(vals: number[]): number {
    return vals.reduce((av, cv) => {
      return av + cv;
    }, 0);
  }

  private isAllEqual(vals: number[]) {
    return this.sumArray(vals) / vals.length == vals[0];
  }

  private binarySearch(arr: number[], value: number): number {
    const len = arr.length;
    if (len === 1) return arr[0];
    const index = Math.floor(len / 2);
    if (arr[index] < value)
      return this.binarySearch(arr.slice(0, index), value);
    else return this.binarySearch(arr.slice(index), value);
  }

  /**
   * Factorize text to words
   * @param text
   * @param lowerCase
   * @return {}
   *    words - words in text
   *    quotes - index where quotes start and end (pairs)
   */
  private toWords(
    text: string,
    lowerCase: boolean = false
  ): { words: string[]; quotes: number[] } {
    const words = text
      .replace(/[\[\]\-,.?!]/g, ' ')
      .replace(/[\"]/g, ' " ')
      .split(/[\s]/g)
      .map((word) => word.replace(/[^\w\dåäö"]/g, ''))
      .filter(Boolean);
    return words.reduce(
      (av, word, index) => {
        if (word === '"') av.quotes.push(index - av.quotes.length);
        else av.words.push(lowerCase ? word.toLowerCase() : word);
        return av;
      },
      { words: [] as string[], quotes: [] as number[] }
    );
  }
}
