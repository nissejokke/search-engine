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

            // "botanik": [{ index: 0 }, { index: 10 }]
            // "de": [{ index: 11 }]
            // site:http://wikipedia/växt
            // index:de:11
        });
    }

    search(text: string): SearchResult[] {
        const words = this.toWords(text).map(word => word.toLowerCase());
        const searchWordsResult: SearchWordExtended[] = [];
        let i = 0;
        words.forEach((word, index, arr) => {
            if (index === 0) {
                const resultWords = this.index[word];
                if (!resultWords || resultWords.length === 0) return;
                const results: SearchWordExtended[] = resultWords.map(resultWord => {
                    return { word, ...resultWord };
                });
            }
            else {

            }
        });

        const usedUrls = {};
        searchWordsResult.map(searchWords => {
            return searchWords.map(result => {
                if (usedUrls[result.url]) return;
                usedUrls[result.url] = true;
                return result;
            });
        }).filter(result => Boolean(result));

        return searchWordsResult[0].map(word => {
            return { url: word.url, ingress: word.word };
        });
    }

    private toWords (text: string): string[] {
        return text.split(/\s/g).map(word => word.replace(/[^\w\dåäö]/g, ''));
    }
}