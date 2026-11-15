// JSON-file store for local development. Writes are serialised per process.
import fs from 'node:fs/promises';
import path from 'node:path';

export class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.chain = Promise.resolve();
  }

  #file(id) { return path.join(this.dir, `${id.replace(/[^A-Za-z0-9-]/g, '')}.json`); }

  async get(id) {
    try { return JSON.parse(await fs.readFile(this.#file(id), 'utf8')); } catch { return null; }
  }

  async create(circle) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.#file(circle.id), JSON.stringify(circle, null, 2));
    return circle;
  }

  /** Read-modify-write under a lock. `mutate` may throw to abort. */
  update(id, mutate) {
    const run = async () => {
      const circle = await this.get(id);
      if (!circle) return null;
      const result = await mutate(circle);
      await fs.writeFile(this.#file(id), JSON.stringify(circle, null, 2));
      return result === undefined ? circle : result;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  async list() {
    try {
      const files = (await fs.readdir(this.dir)).filter((f) => f.endsWith('.json'));
      return files.map((f) => f.replace('.json', ''));
    } catch { return []; }
  }
}
