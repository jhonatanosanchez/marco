// Entry for `node --test server/test/` (Node ≥ 22 resolves a directory argument to its index.js):
// imports every *.test.js so they run in one process. Individual files can also be run directly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort()) {
  await import(pathToFileURL(path.join(dir, f)).href);
}
