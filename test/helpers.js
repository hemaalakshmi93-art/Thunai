import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import { FileStore } from '../src/store/fileStore.js';

export async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thunai-'));
  const store = new FileStore(dir);
  const server = createApp(store).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (p, { method = 'GET', body, token, headers = {} } = {}) => {
    const res = await fetch(base + p, {
      method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  return { store, port: server.address().port, call, close: () => new Promise((r) => server.close(r)) };
}
