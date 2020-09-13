/// <reference types="./@types/xml-stream" />

import fs from 'fs-extra';
import path from 'path';
import XmlStream from 'xml-stream';
import { Engine } from './engine';
import readline from 'readline';
import colors from 'colors/safe';
import { BinaryFileStorage } from './binary-file-storage';
import { MemoryStorage } from './memory-storage';

/**
 * Example usage of Search engine. Creates index of it does'nt exist loads it and displays search prompt.
 *
 * Usage:
 * 1. Download https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-abstract.xml.gz
 * 2. Adjust url below to enwiki-latest-abstract.xml
 * 3. npm run demo
 */

/**
 * Parse wiki abstracts
 * @param encoding
 * @param onItem
 */
function parse(
  encoding: string,
  onItem: (item: {
    title: string;
    url: string;
    abstract: string;
  }) => Promise<boolean>
) {
  return new Promise((resolve, reject) => {
    try {
      const stream = fs.createReadStream(
        path.join(__dirname, '../../../Downloads/enwiki-latest-abstract.xml')
      );
      const xml = new XmlStream(stream, encoding);
      xml.on('endElement: doc', async function (node: any) {
        try {
          xml.pause();
          onItem(node)
            .then((keepGoing) => {
              if (keepGoing) xml.resume();
              else resolve();
            })
            .catch((err) => reject(err));
        } catch (err) {
          reject(err);
        }
      });
      xml.on('error', function (message: string) {
        console.log(
          'Parsing as ' + (encoding || 'auto') + ' failed: ' + message
        );
        reject(message);
      });
      xml.on('end', () => resolve());
    } catch (err) {
      reject(err);
    }
  });
}

const stopWords = [
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
];
const dir = './.index';
let count = 0;
const engine = new Engine({
  storage: new BinaryFileStorage({
    indexPath: dir,
    wordSizeBytes: 32,
    uniqueWords: 500000,
  }),
  stopWords,
  scoreWeights: {
    titleExactMatch: 10,
    titleBegins: 5,
    urlContains: 5,
    titleContainsInBeginning: 1,
  },
});
// const engine = new Engine({ storage: new MemoryStorage(), stopWords });
const max = 10000;
let skipped = 0;

(async () => {
  try {
    // await fs.remove(dir);

    if (false || !(await fs.pathExists(dir))) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
        console.log('Creating index..');
      } else console.log('Appending index..');

      const lastUrlFile = path.join(dir, 'last-url');
      let lastUrl = '';
      let skippingMode = true;
      if (await fs.pathExists(lastUrlFile))
        lastUrl = await fs.readJson(lastUrlFile, { encoding: 'utf-8' });
      await parse('utf8', async (item) => {
        const skip =
          !item.abstract ||
          !item.url ||
          item.abstract.indexOf('|') > -1 ||
          item.abstract.startsWith(']');
        if (skip) {
          skipped++;
          return true;
        }
        if (skippingMode && lastUrl && item.url !== lastUrl) return true;
        skippingMode = false;
        if (lastUrl === item.url) return true;
        lastUrl = item.url;

        if (count % 200 === 0) {
          process.stdout.write('\b\b\b\b');
          process.stdout.write(
            Math.round((count * 100) / max).toString() + '%'
          );
        }
        try {
          await engine.add({
            title: item.title.replace('Wikipedia: ', ''),
            text: item.abstract,
            url: item.url,
            rank: count,
          });
        } catch (err) {
          console.error(`Failed to add page to index: ${item.url}: ${err}`);
        }
        const keepAdding = ++count < max;
        return keepAdding;
      });
      await fs.writeJSON(lastUrlFile, lastUrl, { encoding: 'utf-8' });
      console.log('');
      console.log(`last item added: ${lastUrl}`);
    }

    console.log('');
    console.log(await engine.storage.getCount(), 'pages loaded');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = (): Promise<string> =>
      new Promise((resolve) =>
        rl.question('search> ', function (query) {
          resolve(query);
        })
      );

    while (true) {
      console.log('');
      const query = await prompt();
      console.time('Query time');
      const results = await engine.search(query, 10);
      console.log();
      console.log(
        results
          .map(
            (item) =>
              `${colors.cyan(item.title)}\n${item.introduction}\n${colors.gray(
                item.url
              )}`
          )
          .join('\n\n')
      );
      console.log('');
      console.log(results.length, 'results');
      console.timeEnd('Query time');
    }
  } catch (err) {
    console.error(err);
  }
})();
