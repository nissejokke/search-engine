# Search engine

Simple search engine with focus on performance.

Example:

```typescript
engine = new Engine();
engine.add({
  text:
    'Jupiter is the fifth planet from the Sun and the largest in the Solar System. It is a gas giant with a mass one-thousandth that of the Sun, but two-and-a-half times that of all the other planets in the Solar System combined. Jupiter is one of the brightest objects visible to the naked eye in the night sky, and has been known to ancient civilizations since before recorded history. It is named after the Roman god Jupiter.[18] When viewed from Earth, Jupiter can be bright enough for its reflected light to cast visible shadows,[19] and is on average the third-brightest natural object in the night sky after the Moon and Venus.',
  url: 'https://en.wikipedia.org/wiki/Jupiter',
});
engine.add({
  text:
    'Saturn is the sixth planet from the Sun and the second-largest in the Solar System, after Jupiter. It is a gas giant with an average radius of about nine times that of Earth.[18][19] It only has one-eighth the average density of Earth; however, with its larger volume, Saturn is over 95 times more massive.[20][21][22] Saturn is named after the Roman god of wealth and agriculture; its astronomical symbol (♄) represents the god´s sickle.',
  url: 'https://en.wikipedia.org/wiki/Saturn',
});
```

```typescript
const result = engine.search('jupiter');
```

Result:

```json
[
  {
    "ingress": "jupiter is ... combined jupiter is ... earth jupiter can",
    "url": "https://en.wikipedia.org/wiki/Jupiter"
  },
  {
    "ingress": "after jupiter it",
    "url": "https://en.wikipedia.org/wiki/Saturn"
  }
]
```

## Benchmark

- 50000 [wikipedia abstracts](https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-abstract.xml.gz) added to index
- 121295 words loaded (no stop words)
- Tested on 2018 MacBook Pro.

Test command: npm run bench

```typescript
const result = engine.search('philosophy psychology');
```

Result in 2.632ms

```js
[
  {
    ingress:
      'branches of philosophy and psychology ... philosophy and psychology concerning emotion',
    url: 'https://en.wikipedia.org/wiki/Affection',
  },
  {
    ingress:
      'in developmental psychology and moral ... and bioethical philosophy autonomy from',
    url: 'https://en.wikipedia.org/wiki/Autonomy',
  },
  {
    ingress: 'such as philosophy and psychology ... philosophy and psychology',
    url: 'https://en.wikipedia.org/wiki/Social_studies',
  },
  {
    ingress:
      'hague studied philosophy and psychology ... philosophy and psychology at groningen',
    url: 'https://en.wikipedia.org/wiki/Johannes_Jacobus_Poortman',
  },
  {
    ingress:
      'encyclopedia of philosophy which begins ... in moral psychology ethical theory',
    url: 'https://en.wikipedia.org/wiki/Suffering',
  },
];
```

```typescript
const result2 = engine.search('"carl friedrich" german');
```

Result in 1.021ms

```js
[
  {
    ingress:
      'valued functions german mathematician carl ... german mathematician carl friedrich gauss 1777',
    url: 'https://en.wikipedia.org/wiki/Number_theory',
  },
  {
    ingress:
      'karl friedrich bahrdt august ... also spelled carl friedrich bahrdt was ... an unorthodox german protestant biblical ... characters in german learning',
    url: 'https://en.wikipedia.org/wiki/Karl_Friedrich_Bahrdt',
  },
  {
    ingress:
      'was a german classical scholar ... franz ludwig carl friedrich passow september',
    url: 'https://en.wikipedia.org/wiki/Franz_Passow',
  },
];
```

## TODO

- [x] Search single word
- [x] Search multiple words
- [x] Search result introduction
- [x] Search quotes
- [ ] Stopwords
- [ ] Stemming
- [ ] Ranking of results
