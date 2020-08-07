import { Engine } from './engine';

describe('Planets', () => {
  let engine: Engine;
  beforeEach(async () => {
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
    await engine.add({
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
    await engine.add({
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
  test('Single hit', async () => {
    const result = await engine.search('brightest');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Jupiter');
    expect(result[0].ingress).toContain('of the "brightest" objects visible');
    expect(result[0].ingress).toContain('the third "brightest" natural object');
  });
  test('Two results', async () => {
    const result = await engine.search('giant');
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Jupiter');
    expect(result[1].url).toBe('https://en.wikipedia.org/wiki/Saturn');
    expect(result[0].ingress).toContain('gas "giant"');
    expect(result[1].ingress).toContain('gas "giant"');
  });
  test('Multiple hits', async () => {
    const result = await engine.search('Solar');
    expect(result).toHaveLength(2);
  });
  test('Single adjecent words', async () => {
    const result = await engine.search('ancient civilizations');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Jupiter');
    expect(result[0].ingress).toBe(
      'known to "ancient civilizations" since before'
    );
  });
  test('Single words', async () => {
    const result = await engine.search('planet sixth');
    expect(result).toHaveLength(1);

    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Saturn');
    expect(result[0].ingress).toBe('is the "sixth planet" from the');
  });

  test('Quotes no matches', async () => {
    const result = await engine.search('"planet sixth"');
    expect(result).toHaveLength(0);
  });

  test('Quotes one match', async () => {
    const result = await engine.search('"after Jupiter"');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Saturn');
    expect(result[0].ingress).toContain('after Jupiter');
  });

  test('Quotes + suffix word', async () => {
    const result = await engine.search('"from the Sun" Moon');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Jupiter');
    expect(result[0].ingress).toMatch(/"from the Sun".*?"Moon"/);
  });

  test('Quotes + prefix word occuring after, incorrect case', async () => {
    const result = await engine.search('moon "from the Sun"'); // moon incorrect case
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Jupiter');
    expect(result[0].ingress).toMatch(/"from the Sun".*?"Moon"/);
  });

  test('Quotes + prefix word ocurring first, incorrect case', async () => {
    const result = await engine.search('fifth "from the sun"'); // sun incorrect case
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Jupiter');
    expect(result[0].ingress).toMatch(/"fifth".*"from the Sun"/);
  });

  test('Quotes incorrect case', async () => {
    const result = await engine.search('"moon and venus"'); // incorrect case
    expect(result).toHaveLength(1);
  });
});

test('Should not match', async () => {
  let engine: Engine;
  engine = new Engine();
  await engine.add({
    text: `Petrochemicals (also known as petroleum distillates) are the 
            chemical products obtained from petroleum by refining. 
            Some chemical compounds made from petroleum are also obtained 
            from other fossil fuels, such as coal or natural gas, 
            or renewable sources such as maize, palm fruit or sugar cane.`,
    url: 'https://en.wikipedia.org/wiki/Petrochemical',
  });

  const result = await engine.search('from country he');
  expect(result).toHaveLength(0);
});

test('should get results', async () => {
  let engine: Engine;
  engine = new Engine();
  const pages = [
    {
      text: 'generalized by Friedrich Bessel are',
      url: 'https://en.wikipedia.org/wiki/Bessel_function',
    },
    {
      text: 'upon by Friedrich Hayek',
      url: 'https://en.wikipedia.org/wiki/Economic_calculation_problem',
    },
    {
      text: 'V or Friedrich V may',
      url: 'https://en.wikipedia.org/wiki/Frederick_V',
    },
    {
      text:
        'other deities Friedrich Schelling 1775 ... word and Friedrich Welcker 1784',
      url: 'https://en.wikipedia.org/wiki/Henotheism',
    },
    {
      text: 'Johann Friedrich Agricola 4',
      url: 'https://en.wikipedia.org/wiki/Johann_Friedrich_Agricola',
    },
    {
      text: 'Johann Friedrich Endersch 25',
      url: 'https://en.wikipedia.org/wiki/Johann_Friedrich_Endersch',
    },
    {
      text: 'by Carl Friedrich Gauss in',
      url: 'https://en.wikipedia.org/wiki/Modular_arithmetic',
    },
    {
      text: 'and mineralogist Friedrich Mohs it',
      url: 'https://en.wikipedia.org/wiki/Mohs_scale_of_mineral_hardness',
    },
    {
      text: 'mathematician Carl Friedrich Gauss 1777',
      url: 'https://en.wikipedia.org/wiki/Number_theory',
    },
    {
      text:
        'Georg Wilhelm Friedrich Hegel 1770 ... 1831 and Friedrich Wilhelm Joseph',
      url: 'https://en.wikipedia.org/wiki/Panentheism',
    },
    {
      text: 'Marx and Friedrich Engels Commissioned',
      url: 'https://en.wikipedia.org/wiki/The_Communist_Manifesto',
    },
    {
      text:
        'also spelled Carl Friedrich Bahrdt was ... an unorthodox German Protestant biblical ... characters in German learning',
      url: 'https://en.wikipedia.org/wiki/Karl_Friedrich_Bahrdt',
    },
    {
      text:
        'Franz Ludwig Carl Friedrich Passow September ... was a German classical scholar',
      url: 'https://en.wikipedia.org/wiki/Franz_Passow',
    },
    {
      text:
        'Geologist Carl Friedrich Christian Mohs ... was a German geologist and',
      url: 'https://en.wikipedia.org/wiki/Friedrich_Mohs',
    },
    {
      text: 'of Johann Friedrich Meckel after',
      url: 'https://en.wikipedia.org/wiki/Recapitulation_theory',
    },
    {
      text: 'German mathematician "CARL FrieDricH" Gauss Richard',
      url: 'https://en.wikipedia.org/wiki/G._Waldo_Dunnington',
    },
  ];
  for (let i = 0; i < pages.length; i++) {
    const text = pages[i];
    await engine.add({ text: text.text, url: text.url });
  }

  const result = await engine.search('"carl friedrich"');
  expect(result).toHaveLength(6);
  expect(result[0].ingress).toContain('by "Carl Friedrich" Gauss in');
  expect(result[1].ingress).toContain(
    'mathematician "Carl Friedrich" Gauss 1777'
  );
  expect(result[5].ingress).toContain('"CARL FrieDricH"');
});

describe('Rank', () => {
  let engine: Engine;
  beforeEach(async () => {
    engine = new Engine();
    // hackapedia articles is not as good as wikipedia, they have not as nice urls
    await engine.add({
      text: `Process - A process is series or set of activities that interact to 
      produce a result; it may occur once-only or be recurrent 
      or periodic.`,
      url: 'https://hackapedia.org/?id=12345',
    });
    await engine.add({
      text: `Process - A process is series or set of activities that interact to 
      produce a result; it may occur once-only or be recurrent 
      or periodic.`,
      url: 'https://en.wikipedia.org/wiki/Process',
    });
    await engine.add({
      text: `Haber - Haber is a surname of German origin. The meaning in 
      old German is "oat". The cereal is now in German called "Hafer".
      The process of making is ....`,
      url: 'https://en.wikipedia.org/wiki/Haber',
    });
    await engine.add({
      text: `Haber process - The Haber process,[1] also called the Haber–Bosch process, 
            is an artificial nitrogen fixation process and is the main 
            industrial procedure for the production of ammonia today.`,
      url: 'https://hackapedia.org/?id=4567&title=Haber',
    });
    await engine.add({
      text: `Haber process - The Haber process,[1] also called the Haber–Bosch process, 
            is an artificial nitrogen fixation process and is the main 
            industrial procedure for the production of ammonia today.`,
      url: 'https://en.wikipedia.org/wiki/Haber_process',
    });
  });
  test('Process', async () => {
    const result = await engine.search('process');
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Process');
  });

  test('Haber', async () => {
    const result = await engine.search('haber');
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Haber');
  });

  test('Haber process', async () => {
    const result = await engine.search('haber process');
    expect(result[0].url).toBe('https://en.wikipedia.org/wiki/Haber_process');
  });
});
