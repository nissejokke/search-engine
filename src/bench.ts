/// <reference types="./@types/xml-stream" />

import fs from 'fs-extra';
import path from 'path';
import XmlStream from 'xml-stream';
import { Engine } from './engine';
import { FileStorage } from './file-storage';

// Create a file stream and pass it to XmlStream
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
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

let count = 0;
const engine = new Engine(new FileStorage('./.index/'));
const max = 50;
let skipped = 0;

(async () => {
  try {
    await fs.remove(dir);

    //if (!(await fs.pathExists(dir)))
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

      if (count % 500 === 0) {
        process.stdout.write('\b\b\b');
        process.stdout.write(Math.round((count * 100) / max).toString());
      }
      await engine.add({
        text: item.title.replace('Wikipedia: ', '') + ' - ' + item.abstract,
        url: item.url,
      });
      const keepAdding = ++count < max;
      return keepAdding;
    });

    console.log('');
    console.log(engine.seed, 'pages loaded');
    console.log(skipped, 'skipped');
    console.time();

    const result = await engine.search('philosophy psychology');
    console.log(result);
    console.log(result.length);

    console.timeEnd();
    console.log('-----');
    console.time();

    const result2 = await engine.search('"carl friedrich" german');
    console.log(result2);

    console.timeEnd();
  } catch (err) {
    console.error(err);
  }
})();
