import { Engine } from "./engine";

describe('Search', () => {
    let engine: Engine;
    beforeEach(() => {
        /*
            urlToSite: {
                "/botanik": 1
            }

            site = {
                1: {
                    url: "/botanik",
                    rank: 10,
                },
                2000: {
                    url: "/växt",
                    rank: 100
                },
            }

            index = {
                "botanik": [1,..2000],
                "växt": [50.., 2000],
                "site:/botanik": [1,4,6,7,8,9,..,200]
            }
        */
        engine = new Engine();
        engine.add({
            text: 'Botanik (av grekiska βοτανική, "som rör örter";[1] även fytologi, "läran om växter") är det område inom biologin som studerar växtriket. Botanik omfattar tillväxt, reproduktion, ämnesomsättning, utveckling, sjukdomar, ekologi och evolution av växter.',
            url: 'https://sv.wikipedia.org/wiki/Botanik'
        });
        engine.add({
            text: 'Växtriket (Plantae) är ett av de riken vilka ingår i den biologiska systematiken. Studiet av växtriket kallas botanik. De gröna växterna indelas i divisioner.',
            url: 'https://sv.wikipedia.org/wiki/Växt'
        });
    })
    test('Single hit', () => {
        const result = engine.search('växter');
        expect(result).toHaveLength(1),
        expect(result[0].url).toBe('https://sv.wikipedia.org/wiki/Botanik');
    });
    test('Two results', () => {
        const result = engine.search('botanik');
        expect(result).toHaveLength(2),
        expect(result[0].url).toBe('https://sv.wikipedia.org/wiki/Botanik');
        expect(result[1].url).toBe('https://sv.wikipedia.org/wiki/Växt');
    });
    test('Single adjecent words', () => {
        const result = engine.search('botanik de');
        expect(result).toHaveLength(1),
        expect(result[0].url).toBe('https://sv.wikipedia.org/wiki/Växt');
    });
    test('Single words', () => {
        const result = engine.search('botanik biologiska divisioner');
        expect(result).toHaveLength(1),
        expect(result[0].url).toBe('https://sv.wikipedia.org/wiki/Växt');
    });
})