export interface SearchResult {
    ingress: string;
    url: string;
}

export interface SearchWord {
    url: string;
    index: number;
}

export interface SearchWordExtended extends SearchWord {
    word: string;
}

export class Engine {
    index: Record<string, SearchWord[]>;

    constructor() {
        this.index = {};
    }

    add({text, url}: {text: string, url : string}) {
        this.toWords(text).forEach((word, index) => {
            const lowerWord = word.toLowerCase();
            this.index[lowerWord] = this.index[lowerWord] || [];
            this.index[lowerWord].push({ url, index });
        });
    }

    search(text: string): SearchResult[] {
        const words = this.toWords(text).map(word => word.toLowerCase());
        const usedUrls = {};
        const searchWords: SearchWordExtended[][] = words.map((word, index) => {
            const resultWords = this.index[word];
            if (!resultWords || resultWords.length === 0) return;
            const results = resultWords.map(resultWord => {
                return { word, ...resultWord } as SearchWordExtended;
            });
            return results.map(result => {
                if (usedUrls[result.url]) return;
                usedUrls[result.url] = true;
                return result;
            }).filter(result => Boolean(result));
        });

        return searchWords[0].map(word => ({ url: word.url, ingress: word.word }));
    }

    private toWords (text: string): string[] {
        return text.split(/\s/g).map(word => word.replace(/[^\w\dåäö]/g, ''));
    }
}