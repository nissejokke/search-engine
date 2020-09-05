import { Engine } from './engine';
import fs from 'fs-extra';
import { BinaryFileStorage } from './binary-file-storage';

beforeEach(async () => await fs.remove('./.test-results-engine/index'));
afterEach(async () => await fs.remove('./.test-results-engine/index'));
afterAll(async () => await fs.remove('./.test-results-engine'));

describe('carl friedrich', () => {
  beforeEach(async () => await fs.ensureDir('./.test-results-engine/carl'));
  afterEach(async () => await fs.remove('./.test-results-engine/carl'));

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

  test('Should work', async () => {
    let engine = new Engine({
      storage: new BinaryFileStorage({
        indexPath: './.test-results-engine/carl',
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
        rank: i + 1,
      });
    }

    const result = await engine.search('"carl friedrich"');
    expect(result).toHaveLength(6);
    expect(result[0].introduction).toContain('by "Carl Friedrich" Gauss in');
    expect(result[1].introduction).toContain(
      'mathematician "Carl Friedrich" Gauss 1777'
    );
    expect(result[5].introduction).toContain('"CARL FrieDricH"');
  });
});
