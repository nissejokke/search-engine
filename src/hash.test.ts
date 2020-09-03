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
      hashRows: 100,
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

    await hash.set(key);

    // 2 3 1 4
    await hash.insertAt(key, 0, num1);
    await hash.insertAt(key, 0, num2);
    await hash.insertAt(key, 1, num3);
    await hash.insertAt(key, 3, num4);

    const buffers: { value: number; offset: number }[] = [];
    for await (const { buffer, offset } of hash.getIterator(key)) {
      const num = buffer.readInt32BE();
      buffers.push({ value: num, offset });
    }

    // buffers is of length 5
    expect(buffers).toHaveLength(4);
    expect(buffers[0].value).toEqual(2);
    expect(buffers[1].value).toEqual(3);
    expect(buffers[2].value).toEqual(1);
    expect(buffers[3].value).toEqual(4);

    // const { tailOffset } = await hash.get(key);
    // expect(buffers[buffers.length - 1].offset).toBe(tailOffset);
  });

  test('Add and get', async () => {
    const key = 'hello';
    const numData = (val: number) => Buffer.from(Hash.toBEInt32(val));
    await hash.set(key);

    let i = 0;
    for await (const fn of hash.appendIterator(key)) {
      await fn(numData(i++));
      if (i === 5) break;
    }

    i = 0;
    for await (const { buffer } of hash.getIterator(key)) {
      const num = buffer.readUInt32BE();
      expect(num).toBe(i++);
    }
  });
});
