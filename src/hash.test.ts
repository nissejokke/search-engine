import { Hash } from './hash';
import fs from 'fs-extra';

beforeAll(async () => {
  await fs.ensureDir('../test-results');
});

afterAll(async () => {
  await fs.remove('../test-results');
});

describe('#insertAt', () => {
  let hash: Hash;
  beforeEach(() => {
    hash = new Hash({
      filePath: '../test-results/hash',
      hashRows: 1000,
      keySize: 32,
      nodeSize: 4,
    });
  });

  test('Should insert', async () => {
    const key = 'hello';
    const num1 = Buffer.from(Hash.toBEInt32(1));
    const num2 = Buffer.from(Hash.toBEInt32(2));
    const num3 = Buffer.from(Hash.toBEInt32(3));
    const num4 = Buffer.from(Hash.toBEInt32(4));

    await hash.set(key, Buffer.alloc(0));

    // 2 3 1 4
    await hash.insertAt(key, 0, num1);
    await hash.insertAt(key, 0, num2);
    await hash.insertAt(key, 1, num3);
    await hash.insertAt(key, 3, num4);

    const buffers: number[] = [];
    for await (const { buffer } of hash.getIterator(key)) {
      const num = buffer.readInt32BE();
      buffers.push(num);
    }

    // expect(buffers).toHaveLength(4);
    expect(buffers[0]).toEqual(2);
    expect(buffers[1]).toEqual(3);
    expect(buffers[2]).toEqual(1);
    expect(buffers[3]).toEqual(4);
  });
});
