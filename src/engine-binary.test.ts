import { Engine } from './engine';
import fs from 'fs-extra';
import { BinaryFileStorage } from './binary-file-storage';

beforeEach(async () => await fs.ensureDir('./.test-results-engine/index'));
afterEach(async () => await fs.remove('./.test-results-engine/index'));
afterAll(async () => await fs.remove('./.test-results-engine'));

describe('carl friedrich', () => {
  const pages = [
    {
      text: 'generalized by Friedrich Bessel are',
      url: 'https://en.wikipedia.org/wiki/Bessel_function',
      rank: 100,
    },
    {
      text: 'upon by Friedrich Hayek',
      url: 'https://en.wikipedia.org/wiki/Economic_calculation_problem',
      rank: 100,
    },
    {
      text: 'V or Friedrich V may',
      url: 'https://en.wikipedia.org/wiki/Frederick_V',
      rank: 100,
    },
    {
      text:
        'other deities Friedrich Schelling 1775 ... word and Friedrich Welcker 1784',
      url: 'https://en.wikipedia.org/wiki/Henotheism',
      rank: 100,
    },
    {
      text: 'Johann Friedrich Agricola 4',
      url: 'https://en.wikipedia.org/wiki/Johann_Friedrich_Agricola',
      rank: 100,
    },
    {
      text: 'Johann Friedrich Endersch 25',
      url: 'https://en.wikipedia.org/wiki/Johann_Friedrich_Endersch',
      rank: 100,
    },
    {
      text: 'by Carl Friedrich Gauss in',
      url: 'https://en.wikipedia.org/wiki/Modular_arithmetic',
      rank: 100,
    },
    {
      text: 'and mineralogist Friedrich Mohs it',
      url: 'https://en.wikipedia.org/wiki/Mohs_scale_of_mineral_hardness',
      rank: 100,
    },
    {
      text: 'mathematician Carl Friedrich Gauss 1777',
      url: 'https://en.wikipedia.org/wiki/Number_theory',
      rank: 100,
    },
    {
      text:
        'Georg Wilhelm Friedrich Hegel 1770 ... 1831 and Friedrich Wilhelm Joseph',
      url: 'https://en.wikipedia.org/wiki/Panentheism',
      rank: 100,
    },
    {
      text: 'Marx and Friedrich Engels Commissioned',
      url: 'https://en.wikipedia.org/wiki/The_Communist_Manifesto',
      rank: 100,
    },
    {
      text:
        'also spelled Carl Friedrich Bahrdt was ... an unorthodox German Protestant biblical ... characters in German learning',
      url: 'https://en.wikipedia.org/wiki/Karl_Friedrich_Bahrdt',
      rank: 100,
    },
    {
      text:
        'Johann Carl Friedrich Gauss was a German mathematician and physicist who made significant contributions to many fields in mathematics and science.',
      url: 'https://en.wikipedia.org/wiki/Carl_Friedrich_Gauss',
      rank: 10,
    },
    {
      text:
        'Geologist Carl Friedrich Christian Mohs ... was a German geologist and',
      url: 'https://en.wikipedia.org/wiki/Friedrich_Mohs',
      rank: 100,
    },
    {
      text: 'of Johann Friedrich Meckel after',
      url: 'https://en.wikipedia.org/wiki/Recapitulation_theory',
      rank: 100,
    },
    {
      text: 'German mathematician "CARL FrieDricH" Gauss Richard',
      url: 'https://en.wikipedia.org/wiki/G._Waldo_Dunnington',
      rank: 100,
    },
  ];

  test('Should work', async () => {
    let engine = new Engine({
      storage: new BinaryFileStorage({
        indexPath: './.test-results-engine/index',
        uniqueWords: 100,
        wordSizeBytes: 32,
      }),
    });
    for (let i = 0; i < pages.length; i++) {
      const text = pages[i];
      await engine.add({
        title: text.url.replace('_', ' '),
        text: text.text,
        url: text.url,
        rank: text.rank + i,
      });
    }

    const result = await engine.search('"carl friedrich"');
    expect(result).toHaveLength(6);
    expect(result[0].url).toBe(
      'https://en.wikipedia.org/wiki/Carl_Friedrich_Gauss'
    );
    expect(result[1].introduction).toContain(
      'arithmetic by "Carl Friedrich" Gauss in'
    );
    expect(result[5].introduction).toContain('"CARL FrieDricH"');
  });
});
