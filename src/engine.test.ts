import { Engine } from './engine';

describe('Planets', () => {
  let engine: Engine;
  beforeEach(() => {
    /*
            urlToSite: {
                "/jupiter": 1
            }

            site = {
                1: {
                    url: "/jupiter",
                    index: {
                        "Jupiter": [1,100],
                        "god": [3],
                    }
                },
                2000: {
                    url: "/saturn",
                },
            }

            index = {
                "planet": [1,..2000],
                "god": [50.., 2000],
                "site:/saturn": [1,4,6,7,8,9,..,200]
            }
        */
    engine = new Engine();
    engine.add({
      text: `Jupiter is the fifth planet from the Sun and the largest in the 
      Solar System. It is a gas giant with a mass one-thousandth that of the Sun, 
      but two-and-a-half times that of all the other planets in the Solar System 
      combined. Jupiter is one of the brightest objects visible to the naked eye 
      in the night sky, and has been known to ancient civilizations since before 
      recorded history. It is named after the Roman god Jupiter.[18] When viewed 
      from Earth, Jupiter can be bright enough for its reflected light to cast 
      visible shadows,[19] and is on average the third-brightest natural object 
      in the night sky after the Moon and Venus.`,
      url: 'https://en.wikipedia.org/wiki/Jupiter',
    });
    engine.add({
      text: `Saturn is the sixth planet from the Sun and the second-largest in the 
        Solar System, after Jupiter. It is a gas giant with an average radius 
        of about nine times that of Earth.[18][19] It only has one-eighth the 
        average density of Earth; however, with its larger volume, Saturn is 
        over 95 times more massive.[20][21][22] Saturn is named after the Roman 
        god of wealth and agriculture; its astronomical symbol (♄) represents 
        the god´s sickle.`,
      url: 'https://en.wikipedia.org/wiki/Saturn',
    });
  });
  test('Single hit', () => {
    const result = engine.search('brightest');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Jupiter');
  });
  test('Two results', () => {
    const result = engine.search('giant');
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Jupiter');
    expect(result[1].url).toBe('https://en.wikipedia.org/wiki/Saturn');
    expect(result[0].ingress).toContain('gas giant');
    expect(result[1].ingress).toContain('gas giant');
  });
  test('Multiple hits', () => {
    const result = engine.search('Solar');
    expect(result).toHaveLength(2);
  });
  test('Single adjecent words', () => {
    const result = engine.search('ancient civilizations');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Jupiter');
    expect(result[0].ingress).toBe(
      'known to ancient civilizations since before'
    );
  });
  test('Single words', () => {
    const result = engine.search('planet sixth');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Saturn');
    expect(result[0].ingress).toBe('is the sixth planet from the');
  });

  test('Quotes no matches', () => {
    const result = engine.search('"planet sixth"');
    expect(result).toHaveLength(0);
  });

  test('Quotes one match', () => {
    const result = engine.search('"after Jupiter"');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Saturn');
    expect(result[0].ingress).toContain('after jupiter');
  });

  test('Quotes + suffix word', () => {
    const result = engine.search('"from the Sun" Moon');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Jupiter');
    expect(result[0].ingress).toContain('from the sun');
  });

  test('Quotes + prefix word', () => {
    const result = engine.search('moon "from the Sun"');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Jupiter');
    expect(result[0].ingress).toContain('from the sun');
  });
});

describe('Chemicals', () => {
  let engine: Engine;
  beforeEach(() => {
    engine = new Engine();
    engine.add({
      text: `Petrochemicals (also known as petroleum distillates) are the 
            chemical products obtained from petroleum by refining. 
            Some chemical compounds made from petroleum are also obtained 
            from other fossil fuels, such as coal or natural gas, 
            or renewable sources such as maize, palm fruit or sugar cane.`,
      url: 'https://en.wikipedia.org/wiki/Petrochemical',
    });
  });
  test('Should not match', () => {
    const result = engine.search('from country he');
    expect(result).toHaveLength(0);
  });
});
