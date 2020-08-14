/// <reference types="./@types/xml-stream" />

import fs from 'fs-extra';
import path from 'path';
import XmlStream from 'xml-stream';
import { Engine } from './engine';
import { FileStorage } from './file-storage';
import readline from 'readline';
import colors from 'colors/safe';
import { BinaryFileStorage } from './binary-file-storage';

/**
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

const dir = './.index';

let count = 0;
const engine = new Engine(new BinaryFileStorage(dir));
const max = 2000;
let skipped = 0;

(async () => {
  try {
    // await fs.remove(dir);

    if (true || !(await fs.pathExists(dir))) {
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
            text: item.title.replace('Wikipedia: ', '') + ' - ' + item.abstract,
            url: item.url,
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
    console.log(await engine.storage.getSeed(), 'pages loaded');

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

    // console.log('by', await (await engine.search('by', 1000)).length);

    while (true) {
      console.log('');
      const query = await prompt();
      console.time('Query time');
      const r = await engine.search(query, 1000);
      console.log();
      console.log(
        r
          .map((item) => `${item.ingress}\n  ${colors.gray(item.url)}`)
          .join('\n\n')
      );
      console.log('');
      console.log(r.length, 'results');
      console.timeEnd('Query time');
    }
  } catch (err) {
    console.error(err);
  }
})();
