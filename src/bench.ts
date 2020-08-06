/// <reference types="./@types/xml-stream" />

import fs from 'fs';
import path from 'path';
import XmlStream from 'xml-stream';
import { Engine } from './engine';

// Create a file stream and pass it to XmlStream
function parse(
  encoding: string,
  onItem: (item: { title: string; url: string; abstract: string }) => boolean
) {
  return new Promise((resolve, reject) => {
    try {
      const stream = fs.createReadStream(
        path.join(__dirname, '../../../Downloads/enwiki-latest-abstract.xml')
      );
      const xml = new XmlStream(stream, encoding);
      xml.on('endElement: doc', function (node: any) {
        try {
          if (!onItem(node)) {
            xml.pause();
            resolve();
          }
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

let count = 0;
const engine = new Engine();
const max = 10000;
let skipped = 0;

(async () => {
  try {
    await parse('utf8', (item) => {
      const skip =
        !item.abstract ||
        !item.url ||
        item.abstract.indexOf('|') > -1 ||
        item.abstract.startsWith(']');
      if (skip) {
        skipped++;
        return true;
      }

      if (count % 500 === 0) {
        process.stdout.write('\b\b\b');
        process.stdout.write(Math.round((count * 100) / max).toString());
      }
      engine.add({ text: item.abstract, url: item.url });
      const keepAdding = ++count < max;
      return keepAdding;
    });

    console.log('');
    console.log(engine.seed, 'pages loaded');
    console.log(Object.keys(engine.index).length, 'words loaded');
    console.log(skipped, 'skipped');
    console.time();

    const result = engine.search('philosophy psychology');
    console.log(result);

    console.timeEnd();
    console.log('-----');
    console.time();

    const result2 = engine.search('"carl friedrich" german');
    console.log(result2);

    console.timeEnd();
  } catch (err) {
    console.error(err);
  }
})();
