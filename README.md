# Search engine

Experimenting with simple search engine

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
const result = engine.search('jupiter');
/*
[
    {
        ingress: 'jupiter is ... combined jupiter is ... earth jupiter can',
        url: 'https://en.wikipedia.org/wiki/Jupiter'
    },
    {
        ingress: 'after jupiter it',
        url: 'https://en.wikipedia.org/wiki/Saturn'
    }
]
*/
```

TODO:

- [x] Search single word
- [x] Search multiple words
- [x] Search result introduction
- [x] Search quotes
- [ ] Ranking of results
- [ ] Crawler
