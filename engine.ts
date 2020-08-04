export interface SearchResult {
  ingress: string;
  url: string;
}

export interface Site {
  url: string;
}

export class Engine {
  index: Record<string, number[]>;
  site: Record<number, Site>;
  urlToSite: Record<string, number>;
  seed: number;

  constructor() {
    this.index = {};
    this.site = {};
    this.urlToSite = {};
    this.seed = 0;
  }

  add({ text, url }: { text: string; url: string }) {
    const siteKey = `site:${url}`;
    if (!this.urlToSite[url]) {
      this.urlToSite[url] = this.seed;
      this.site[this.seed] = {
        url,
      };
      this.index[siteKey] = [];
    }

    this.toWords(text).forEach((word, index) => {
      const wordKey = word.toLowerCase();

      if (!this.index[wordKey]) this.index[wordKey] = [];
      this.index[wordKey].push(this.seed);
      this.index[siteKey].push(this.seed);
    });

    this.seed += 1;
  }

  search(text: string): SearchResult[] {
    const words = this.toWords(text).map((word) => word.toLowerCase());
    const arrs = words
      .map((word) => {
        return this.uniqueArr(this.index[word] || []);
      })
      .filter((arr) => arr.length > 0);

    const result = this.intersectMax(arrs, 5);
    return this.uniqueArr(result).map((site) => {
      return {
        ingress: "",
        url: this.site[site].url,
      };
    });
  }

  private uniqueArr(arr: number[]): number[] {
    return [...new Set(arr)];
  }

  private intersectMax(arrs: number[][], maxCount: number): number[] {
    if (arrs.length === 0) return [];
    if (arrs.length === 1) return arrs[0];
    const result: number[] = [];
    let indices = new Array(arrs.length).fill(0);
    while (result.length < maxCount) {
      let vals = [];
      for (let i = 0; i < arrs.length; i++) {
        const ind = indices[i];
        if (ind >= arrs[i].length) return result;
        vals.push(arrs[i][ind]);
      }
      if (this.isAllEqual(vals)) result.push(vals[0]);
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

  private toWords(text: string): string[] {
    return text.split(/\s/g).map((word) => word.replace(/[^\w\dåäö]/g, ""));
  }
}
