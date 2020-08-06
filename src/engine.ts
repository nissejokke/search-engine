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

  /**
   * Stop words - excluded from index
   */
  stopWords: Record<string, boolean>;

  constructor() {
    this.index = {};
    this.site = {};
    this.urlToSite = {};
    this.seed = 0;
    this.stopWords = {
      a: true,
      an: true,
      am: true,
      and: true,
      be: true,
      have: true,
      i: true,
      in: true,
      is: true,
      of: true,
      on: true,
      that: true,
      the: true,
      to: true,
    };
  }

  /**
   * Add text to index
   * @param param0
   */
  add({ text, url }: { text: string; url: string }) {
    const siteKey = `site:${url}`;
    const { words } = this.toWords(text);

    if (!this.urlToSite[url]) {
      this.urlToSite[url] = this.seed;
      this.site[this.seed] = {
        url,
        words,
        index: {},
      };
      this.index[siteKey] = [];
    }
    this.index[siteKey].push(this.seed);

    // word index
    words
      .map((word) => word.toLowerCase())
      .filter((word) => !this.isStopWord(word))
      .forEach((word) => {
        if (!this.index[word]) this.index[word] = [];
        if (!Array.isArray(this.index[word])) return;

        if (this.index[word].indexOf(this.seed) === -1) {
        }
        this.index[word].push(this.seed);
      });

    // site index
    words.forEach((word, index) => {
      if (!word) return;
      const siteIndex = this.site[this.seed].index;
      const wordLower = word.toLowerCase();
      if (!siteIndex[wordLower]) siteIndex[wordLower] = [];
      if ((siteIndex[wordLower] as any).push) siteIndex[wordLower].push(index);
    });

    this.seed += 1;
  }

  /**
   * Free text search
   * @param text
   */
  search(text: string): SearchResult[] {
    const { words, quotes } = this.toWords(text);
    const wordsWithoutStopWords = words.filter(
      (word) => !this.isStopWord(word)
    );

    // arrays of sites where words exist
    const arrs = wordsWithoutStopWords.map(
      (word) => this.index[word.toLowerCase()] || []
    );

    /**
     * Checks if at least one quote exist on site
     * @param siteId
     */
    const isQuoteOnSite = (siteId: number) => {
      if (quotes.length === 0) return true;
      const site = this.site[siteId];
      for (let i = 0; i < quotes.length; i += 2) {
        const quotedWords = words.slice(quotes[i], quotes[i + 1]);
        if (this.isAdjecentWords(quotedWords, site)) return true;
      }
      return false;
    };

    // intersect arrays to get all site where all words exist
    const sitesWithWords = this.uniqueArr(
      this.intersect(arrs, 100, isQuoteOnSite)
    );

    this.rankSites(wordsWithoutStopWords, sitesWithWords);

    return sitesWithWords.map((siteId) => {
      const site = this.site[siteId];
      return {
        ingress: this.constructIngress(words, quotes, site),
        url: site.url,
      };
    });
  }

  private rankSites(words: string[], sites: number[]) {
    const indicesForWord = (word: string, site: Site) =>
      site.index[word.toLowerCase()];

    const sorted = sites.sort((siteA, siteB) => {
      const indicesA = indicesForWord(words[0], this.site[siteA]);
      const indicesB = indicesForWord(words[0], this.site[siteB]);

      const titleA = indicesA[0] === 0;
      const titleB = indicesB[0] === 0;

      if (titleA === titleB) return siteA - siteB;
      if (titleB) return 1;
      return -1;
    });
    return sorted;
  }

  /**
   * Are given words in order in given site? For quote search.
   * @param words
   * @param site
   */
  private isAdjecentWords(words: string[], site: Site): boolean {
    const indices = words.map((word) => site.index[word.toLowerCase()]);
    return this.isWordIndicesAdjecent(indices);
  }

  /**
   * Given multiple arrays of numbers, are there numbers which in each arr which come after each others
   * @param indexArrs
   */
  private isWordIndicesAdjecent(indexArrs: number[][]) {
    return this.adjecentWordIndicesIntersection(indexArrs).length > 0;
  }

  /**
   * Word indices which intersections (first word index)
   * @param indexArrs
   */
  private adjecentWordIndicesIntersection(indexArrs: number[][]): number[] {
    // shift words according to index
    // [[12,13,14]] => [[12,12,12]] (=true, they are adjectent, next to each other)
    const indicesEqualized = indexArrs.map((wordIndices, i) =>
      wordIndices.map((ind) => ind - i)
    );

    return this.intersect(indicesEqualized, 1);
  }

  /**
   * Creates search result introduction text
   * @param words searched words
   * @param index site index
   */
  private constructIngress(
    words: string[],
    quotes: number[],
    site: Site
  ): string {
    /**
     * Push word att index to ingress
     * @param ingress ingress to append to
     * @param wordIndex index of word
     */
    const pushAtIndex = (ingress: string[], wordIndex: number) => {
      const word = site.words[wordIndex];
      if (word) ingress.push(word);
    };

    /**
     * Merge arrays
     * @param arrs
     */
    const joinArrs = (arrs: number[][]) =>
      arrs.reduce((av, cv) => {
        return av.concat(cv);
      }, []);

    // words to indices
    const indices = words
      .map((word) => site.index[word.toLowerCase()])
      .map((arr) => arr.filter((val) => Number.isInteger(val)));

    // get quoted indices first and keep them separate
    let quotedIndices: number[][] = [];
    for (let i = 0; i < quotes.length; i += 2) {
      const qIndices = indices.slice(quotes[i], quotes[i + 1]);
      const intersection = this.adjecentWordIndicesIntersection(qIndices);
      for (let j = 0; j < qIndices.length - 1; j++)
        intersection.push(intersection[j] + 1);
      quotedIndices.push(intersection);
    }

    // remove quoted words from indices (leaving unquoted words)
    for (let i = 0; i < quotes.length; i += 2) {
      indices.splice(quotes[i], quotes[i + 1]);
    }

    let ingressIndexResult: number[] = [];

    // join quotes
    if (quotedIndices.length) ingressIndexResult = joinArrs(quotedIndices);

    // join the rest
    ingressIndexResult = ingressIndexResult.concat(joinArrs(indices));

    return ingressIndexResult
      .sort((a, b) => a - b)
      .reduce((ingress, index, arrIndex, arr) => {
        const getIndRelative = (relative: number) => arr[arrIndex + relative];

        const isFirstWord = arrIndex === 0 || index !== getIndRelative(-1) + 1;
        const isLastWord =
          arrIndex === arr.length - 1 || index !== getIndRelative(+1) - 1;

        // two words before word to two words after word
        if (isFirstWord) {
          pushAtIndex(ingress, index - 2);
          pushAtIndex(ingress, index - 1);
          ingress.push('"-');
        }
        pushAtIndex(ingress, index);
        if (isLastWord) {
          ingress.push('-"');
          pushAtIndex(ingress, index + 1);
          pushAtIndex(ingress, index + 2);
        }
        if (
          arrIndex < arr.length - 1 &&
          Math.abs(index - arr[arrIndex + 1]) > 1 // the two words are not right next to each other
        )
          ingress.push('...');

        return ingress;
      }, [] as string[])
      .join(' ')
      .replace(/("- | -")/g, '"');
  }

  /**
   * Unique values
   * @param arr
   */
  private uniqueArr(arr: number[]): number[] {
    return [...new Set(arr)];
  }

  /**
   * Get intersection of arrays up to max count
   * @param arrs
   * @param maxCount
   * @param shouldBeAdded - if defined, will be required to return true to add value to intersection result list
   */
  private intersect(
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

      // fill vals with next values
      for (let i = 0; i < arrs.length; i++) {
        const ind = indices[i];
        if (ind >= arrs[i].length) return result;
        vals.push(arrs[i][ind]);
      }

      // if all equal, they intersect
      if (this.isAllEqual(vals)) {
        let add = false;
        if (shouldBeAdded) {
          if (shouldBeAdded(vals[0])) add = true;
        } else add = true;
        if (add) result.push(vals[0]);
      }

      // which arr to increase index
      const minValue = Math.min(...vals);
      const arrIndexWithSmallestValue = vals.indexOf(minValue);
      indices[arrIndexWithSmallestValue] += 1;
    }
    return result;
  }

  /**
   * Sum values in array
   * @param vals
   */
  private sumArray(vals: number[]): number {
    return vals.reduce((av, cv) => {
      return av + cv;
    }, 0);
  }

  /**
   * Are all values equal?
   * @param vals
   */
  private isAllEqual(vals: number[]) {
    return this.sumArray(vals) / vals.length == vals[0];
  }

  /**
   * Binary search
   * @param arr
   * @param value
   */
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
    lowerCase: boolean = false,
    removeStopWords: boolean = false
  ): { words: string[]; quotes: number[] } {
    const isOkWord = (word: string) =>
      Boolean(word) &&
      (!removeStopWords ||
        (removeStopWords && (word === '"' || !this.isStopWord(word))));

    const words = text
      .replace(/[^\w\dåäö"\s]/g, ' ')
      .replace(/[\"]/g, ' " ')
      .split(/[\s]/g)
      .map((word) => word.replace(/[^\w\dåäö"]/g, ''))
      .filter((word) => isOkWord(word));

    return words.reduce(
      (av, word, index) => {
        if (word === '"') av.quotes.push(index - av.quotes.length);
        else av.words.push(lowerCase ? word.toLowerCase() : word);
        return av;
      },
      { words: [] as string[], quotes: [] as number[] }
    );
  }

  /**
   * Filter stop words from words
   * @param words
   */
  private removeStopWords(words: string[]) {
    return words.filter((word) => !this.isStopWord(word));
  }

  /**
   * Is word a stop word?
   * @param word
   */
  private isStopWord(word: string): boolean {
    return word.length < 2 || this.stopWords[word];
  }

  capitalizeFirstLetter(str: string) {
    return str.substring(0, 1).toUpperCase() + str.substring(1);
  }
}
