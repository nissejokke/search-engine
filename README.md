# Search engine

Simple full text index search engine with focus on performance.

- Search single or multiple words
- Quotes to match exact
- Page ranking and scoring on title and url
- Persistent file based storage
- Memory storage

![Brightest search example](brightest-search.png)

Example:

```typescript
engine = new Engine({
  storage: new BinaryFileStorage({
    indexPath: '/.index',
    wordSizeBytes: 32,
    uniqueWords: 500000,
  }),
  stopWords: [
    'a',
    'an',
    'am',
    'and',
    'be',
    'have',
    'i',
    'in',
    'is',
    'of',
    'on',
    'that',
    'the',
    'to',
  ],
  scoreWeights: {
    titleExactMatch: 10,
    titleBegins: 5,
    urlContains: 5,
    titleContainsInBeginning: 1,
  },
});

engine.add({
  title: 'Jupiter',
  text:
    'Jupiter is the fifth planet from the Sun and the largest in the Solar System. It is a gas giant with a mass one-thousandth that of the Sun, but two-and-a-half times that of all the other planets in the Solar System combined. Jupiter is one of the brightest objects visible to the naked eye in the night sky, and has been known to ancient civilizations since before recorded history. It is named after the Roman god Jupiter.[18] When viewed from Earth, Jupiter can be bright enough for its reflected light to cast visible shadows,[19] and is on average the third-brightest natural object in the night sky after the Moon and Venus.',
  url: 'https://en.wikipedia.org/wiki/Jupiter',
  rank: 100,
});

engine.add({
  title: 'Saturn',
  text:
    'Saturn is the sixth planet from the Sun and the second-largest in the Solar System, after Jupiter. It is a gas giant with an average radius of about nine times that of Earth.[18][19] It only has one-eighth the average density of Earth; however, with its larger volume, Saturn is over 95 times more massive.[20][21][22] Saturn is named after the Roman god of wealth and agriculture; its astronomical symbol (♄) represents the god´s sickle.',
  url: 'https://en.wikipedia.org/wiki/Saturn',
  rank: 200,
});
```

```typescript
await engine.search('brightest');

// result
[
  {
    ingress:
      'of the "brightest" objects visible ... the third "brightest" natural object',
    url: 'https://en.wikipedia.org/wiki/Jupiter',
  },
];
```

```typescript
await engine.search('planet sixth');

// result
[
  {
    ingress: 'is the "sixth planet" from the',
    url: 'https://en.wikipedia.org/wiki/Saturn',
  },
];
```

```typescript
await engine.search('"from the Sun" Moon');

// result
[
  {
    ingress:
      'fifth planet "from the Sun" and the ... after the "Moon" and Venus',
    url: 'https://en.wikipedia.org/wiki/Jupiter',
  },
];
```

## Guidelines

- Rank must be unique
  When adding pages, rank is make sure that it is unique be searching for an unused id to insert at. For example if rank=200 and a page already exists at that position, one less (199) will be used if that is free. If that is not free 198 will be used, and so on. Beware ending up at rank 0 is not allowed and an exception is thrown.

## How it works

A hash table where word is the key and value is a linked list consisting of page id´s. The page id is also the rank. Lower page id means better page rank.

### Adding

The linked list for a word is inserted at the position of the rank, keeping the list sorted. Currently the list is traversed from the head meaning it can be slow to insert words.

### Searching

Searching for a single word is straight forward, the linked list is traversed one item and the first x nodes is the result.

When search for multiple words, each word´s linked list is traversed one node at the time. When a node with the same page id is found in all of the lists it is added to the results array, checking the list with the lowest page id each time. Since the nodes are in order of page rank, traversing stops when results array are of desired length.

Each page id is optionally adjusted with a score, lowering the rank of pages with has searched word in title or in url.

## Benchmark

- 50000 [wikipedia abstracts](https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-abstract.xml.gz) added to index
- Tested on 2018 MacBook Pro.

Test command: npm run demo

```typescript
const result = await engine.search('philosophy psychology');
```

Result in 3.850ms

```js
[
  {
    title: 'Affection',
    ingress:
      'branches of "philosophy" and psychology ... philosophy and "psychology" concerning emotion',
    url: 'https://en.wikipedia.org/wiki/Affection',
  },
  {
    title: 'Autonomy',
    ingress:
      'In developmental "psychology" and moral ... and bioethical "philosophy" autonomy from',
    url: 'https://en.wikipedia.org/wiki/Autonomy',
  },
  {
    title: 'Social Studies',
    ingress:
      'such as "philosophy" and psychology ... philosophy and "psychology"',
    url: 'https://en.wikipedia.org/wiki/Social_studies',
  },
  {
    title: 'Johannes Jacobus Poortman',
    ingress:
      'Hague studied "philosophy" and psychology ... philosophy and "psychology" at Groningen',
    url: 'https://en.wikipedia.org/wiki/Johannes_Jacobus_Poortman',
  },
  {
    title: 'Suffering',
    ingress:
      'Encyclopedia of "Philosophy" which begins ... in moral "psychology" ethical theory',
    url: 'https://en.wikipedia.org/wiki/Suffering',
  },
];
```

```typescript
const result2 = engine.search('"carl friedrich" german');
```

Result in 6.177ms

```js
[
  {
    title: 'Number Theory',
    ingress:
      'valued functions "German" mathematician Carl ... German mathematician "Carl Friedrich" Gauss 1777',
    url: 'https://en.wikipedia.org/wiki/Number_theory',
  },
  {
    title: 'Karl Friedrich Bahrdt',
    ingress:
      'also spelled "Carl Friedrich" Bahrdt was ... an unorthodox "German" Protestant biblical ... characters in "German" learning',
    url: 'https://en.wikipedia.org/wiki/Karl_Friedrich_Bahrdt',
  },
  {
    title: 'Franz Passow',
    ingress:
      'Franz Ludwig "Carl Friedrich" Passow September ... was a "German" classical scholar',
    url: 'https://en.wikipedia.org/wiki/Franz_Passow',
  },
];
```

## TODO

- [x] Search single word
- [x] Search multiple words
- [x] Search result introduction
- [x] Search quotes
- [x] Stopwords
- [ ] Stemming
- [x] Ranking of results, higher rank if searched words is in:
  - [x] Title
  - [x] Url
- [x] Store index as files
- [x] Store index as binary
  - [x] Handle collisions
  - [ ] Optimize insertions - currently slow, will seek from head for every insertion
- [x] Change storage for words to linked list for easier insert based on rank
- [x] Ranking of each page
