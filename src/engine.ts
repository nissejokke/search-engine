import { MemoryStorage } from './memory-storage';
import { Storage, SearchResult, Page } from './@types';

export interface RankWeights {
  titleExactMatch: number;
  titleBegins: number;
  titleContainsInBeginning: number;
  urlContains: number;
}

export interface EngineProps {
  storage?: Storage;
  stopWords?: string[];
  rankWeights?: RankWeights;
}

/**
 * Search engine
 */
export class Engine {
  /**
   * Stop words - excluded from index
   */
  stopWords: Set<string>;

  storage: Storage;

  rankWeights?: RankWeights;

  constructor(props?: EngineProps) {
    this.storage = props?.storage || new MemoryStorage();
    this.stopWords = (props?.stopWords || []).reduce((dic, word) => {
      dic.add(word);
      return dic;
    }, new Set<string>());
    this.rankWeights = props?.rankWeights;
  }

  /**
   * Add text to index
   * @param param0
   */
  async add({
    title,
    text,
    url,
    rank,
  }: {
    title: string;
    text: string;
    url: string;
    rank: number;
  }): Promise<void> {
    const { words } = this.toWords(title + ' ' + text);

    const pageId = await this.storage.getUrlToPage(url);
    if (pageId)
      throw new Error('page already in index: ' + url + ', ' + pageId);

    // get a free seed (pageId)
    const seed = await this.storage.getSeed(rank);

    await this.storage.setUrlToPage(url, seed);

    const addedWordsForPage = new Set();

    // words to add
    const addWords = words
      .map((word) => word.toLowerCase())
      .filter((word) => !this.isStopWord(word))
      .map((word) => {
        if (addedWordsForPage.has(word)) {
          return;
        }
        addedWordsForPage.add(word);
        return word;
      });

    // init words
    for (let i = 0; i < addWords.length; i++) {
      const word = addWords[i];
      if (!word) continue;
      await this.storage.initWord(word);
      await this.storage.addWord(word, seed);
    }

    // page index
    const pageIndex: Record<string, number[]> = {};
    words.forEach((word, index) => {
      if (!word) return;
      const wordLower = word.toLowerCase();
      if (!pageIndex[wordLower]) pageIndex[wordLower] = [];
      if ((pageIndex[wordLower] as any).push) pageIndex[wordLower].push(index);
    });

    // init page
    await this.storage.initPage(seed, { title, url, words, index: pageIndex });
    // await this.storage.increaseSeed();
  }

  /**
   * Free text search
   * @param text search phrase
   */
  async search(text: string, maxCount = 100): Promise<SearchResult[]> {
    const { words, quotes } = this.toWords(text);

    // words with out stop words
    const wordsWithoutStopWords = words.filter(
      (word) => !this.isStopWord(word)
    );

    /**
     * Checks if at least one quote exist on page
     * @param pageId
     */
    const isQuoteOnPage = async (pageId: number) => {
      if (quotes.length === 0) return true;
      const page = await this.storage.getPage(pageId);
      for (let i = 0; i < quotes.length; i += 2) {
        const quotedWords = words.slice(quotes[i], quotes[i + 1]);
        if (await this.isAdjecentWords(quotedWords, page!)) return true;
      }
      return false;
    };

    // arrays of pages where words exist
    const arrs = wordsWithoutStopWords.map((word) =>
      this.storage.getWordIterator(word.toLowerCase())
    );

    // intersect arrays to get all page where all words exist
    const pages = this.uniqueArr(
      await this.intersect(arrs, 100, isQuoteOnPage)
    );

    // rank on content
    let sortedPages = await this.rankPages(wordsWithoutStopWords, pages);

    // get pages and construct introduction
    return await Promise.all(
      sortedPages.slice(0, maxCount).map(async (pageId) => {
        const page = (await this.storage.getPage(pageId)) as Page;
        return {
          title: page.title,
          introduction: await this.constructIntroduction(words, quotes, page),
          url: page.url,
        };
      })
    );
  }

  /**
   * Rank pages on title and url
   * @param words
   * @param pages
   */
  private async rankPages(words: string[], pages: number[]): Promise<number[]> {
    const indicesForWord = (word: string, page: Page) =>
      page.index[word.toLowerCase()];

    /**
     * Is words in title
     * @param pageId
     */
    const titleEqual = async (
      pageId: number
    ): Promise<{ exact: boolean; begins: boolean; pos: number }> => {
      const page = await this.storage.getPage(pageId);

      const matches = words.filter((word, index) => {
        const indices = indicesForWord(word, page!);
        if (!indices) return false;
        const equals = indices[0] === index;
        return equals;
      }).length;

      const titleWords = this.toWords(page!.title, true).words;

      return {
        exact: matches === titleWords.length,
        begins: matches > 0,
        pos: words
          .map((word) => titleWords.indexOf(word))
          .filter((index) => index > -1)
          .sort()[0],
      };
    };

    /**
     * Is words is in url
     * @param url
     */
    const urlMatch = (url: string): boolean => {
      return (
        words.filter((word) => {
          // prettier-ignore
          const match = url.match(new RegExp('(?![\w\d])' + word + '(?![\w\d])', 'i'));
          return Boolean(match);
        }).length >= words.length
      );
    };

    /**
     * Score for page
     * @param pageId
     */
    const getScore = async (pageId: number): Promise<number> => {
      let score = 0;
      if (!this.rankWeights) return score;
      const { exact, begins, pos } = await titleEqual(pageId);
      if (exact) score += this.rankWeights.titleExactMatch;
      // 10;
      else if (begins) score += this.rankWeights.titleBegins;
      //5;
      else if (pos < 3) score += this.rankWeights.titleContainsInBeginning; //1;
      if (urlMatch((await this.storage.getPage(pageId))!.url))
        score += this.rankWeights.urlContains; //1;
      return score;
    };

    // calc scores

    let scores: Record<number, number> = {};
    for (let pageId of pages) {
      const score = await getScore(pageId);
      scores[pageId] = score;
    }

    // sort on scores
    const sorted = pages.sort((pageA, pageB) => {
      let scoreA = scores[pageA];
      let scoreB = scores[pageB];

      if (scoreA === scoreB) return pageA - pageB; // sort on pageId, lower pages is better
      if (scoreB > scoreA) return 1;
      return -1;
    });
    return sorted;
  }

  /**
   * Are given words in order in given page? For quote search.
   * @param words
   * @param page
   */
  private async isAdjecentWords(words: string[], page: Page): Promise<boolean> {
    const indices = words.map((word) => page.index[word.toLowerCase()] || []);
    return this.isWordIndicesAdjecent(indices);
  }

  /**
   * Given multiple arrays of numbers, are there numbers which in each arr which come after each others
   * @param indexArrs
   */
  private async isWordIndicesAdjecent(indexArrs: number[][]) {
    return (await this.adjecentWordIndicesIntersection(indexArrs)).length > 0;
  }

  /**
   * Word indices which intersections (first word index)
   * @param indexArrs
   */
  private adjecentWordIndicesIntersection(
    indexArrs: number[][]
  ): Promise<number[]> {
    // shift words according to index
    // [[12,13,14]] => [[12,12,12]] (=true, they are adjectent, next to each other)
    const indicesEqualized = indexArrs.map((wordIndices, i) =>
      wordIndices.map((ind) => ind - i)
    );

    const iterators = indicesEqualized.map((index) =>
      (async function* get(): AsyncIterableIterator<number> {
        let i = 0;
        while (i < index.length) yield index[i++];
      })()
    );

    return this.intersect(iterators, 1);
  }

  /**
   * Creates search result introduction text
   * @param words searched words
   * @param index page index
   */
  private async constructIntroduction(
    words: string[],
    quotes: number[],
    page: Page
  ): Promise<string> {
    /**
     * Push word att index to introduction
     * @param introduction introduction to append to
     * @param wordIndex index of word
     */
    const pushAtIndex = (introduction: string[], wordIndex: number) => {
      const word = page.words[wordIndex];
      if (word) introduction.push(word);
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
      .map((word) => page.index[word.toLowerCase()] || [])
      .map((arr) => arr.filter((val) => Number.isInteger(val)));

    // get quoted indices first and keep them separate
    let quotedIndices: number[][] = [];
    for (let i = 0; i < quotes.length; i += 2) {
      const qIndices = indices.slice(quotes[i], quotes[i + 1]);
      const intersection = await this.adjecentWordIndicesIntersection(qIndices);
      for (let j = 0; j < qIndices.length - 1; j++)
        intersection.push(intersection[j] + 1);
      quotedIndices.push(intersection);
    }

    // remove quoted words from indices (leaving unquoted words)
    for (let i = 0; i < quotes.length; i += 2) {
      indices.splice(quotes[i], quotes[i + 1]);
    }

    let introductionIndexResult: number[] = [];

    // join quotes
    if (quotedIndices.length) introductionIndexResult = joinArrs(quotedIndices);

    // join the rest
    introductionIndexResult = introductionIndexResult.concat(joinArrs(indices));

    return introductionIndexResult
      .sort((a, b) => a - b)
      .reduce((introduction, index, arrIndex, arr) => {
        const getIndRelative = (relative: number) => arr[arrIndex + relative];

        const isFirstWord = arrIndex === 0 || index !== getIndRelative(-1) + 1;
        const isLastWord =
          arrIndex === arr.length - 1 || index !== getIndRelative(+1) - 1;

        // two words before word to two words after word
        if (isFirstWord) {
          pushAtIndex(introduction, index - 2);
          pushAtIndex(introduction, index - 1);
          introduction.push('"-');
        }
        pushAtIndex(introduction, index);
        if (isLastWord) {
          introduction.push('-"');
          pushAtIndex(introduction, index + 1);
          pushAtIndex(introduction, index + 2);
        }
        if (
          arrIndex < arr.length - 1 &&
          Math.abs(index - arr[arrIndex + 1]) > 1 // the two words are not right next to each other
        )
          introduction.push('...');

        return introduction;
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
   * Get intersection of arrays up to max count.
   * Intersects arrays by getting a value at the time from the array with the lowest value.
   * @param arrs
   * @param maxCount
   * @param shouldBeAdded - if defined, will be required to return true to add value to intersection result list
   */
  private async intersect(
    arrs: AsyncIterableIterator<number>[],
    maxCount: number,
    shouldBeAdded?: (val: number) => Promise<boolean>
  ): Promise<number[]> {
    const result: number[] = [];
    if (arrs.length === 0) return [];
    if (arrs.length === 1) {
      for await (let val of arrs[0]) {
        if (result.length >= maxCount) break;
        result.push(val);
      }
      return result;
    }
    let values: number[] = [];

    for (let i = 0; i < arrs.length; i++) {
      const next = await arrs[i].next();
      if (next.done) return result;
      values.push(next.value);
    }

    while (result.length < maxCount) {
      // if all equal, they intersect
      if (this.isAllEqual(values)) {
        let add = false;
        if (shouldBeAdded) {
          if (await shouldBeAdded(values[0])) add = true;
        } else add = true;
        if (add) result.push(values[0]);
      }

      // which arr to increase index
      const minValue = Math.min(...values);
      const arrIndexWithSmallestValue = values.indexOf(minValue);
      const next = await arrs[arrIndexWithSmallestValue].next();
      if (next.done) break;
      values[arrIndexWithSmallestValue] = next.value;
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
   * Is word a stop word?
   * @param word
   */
  private isStopWord(word: string): boolean {
    return word.length < 2 || this.stopWords.has(word);
  }
}
