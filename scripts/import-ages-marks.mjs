// Copia UNA VEZ las ❤️/🚫 de echo-reloj a data/ages-marks.json (fork fsrhome, tarjeta "A esta edad").
// Uso: node scripts/import-ages-marks.mjs <URL de /api/marcas | archivo.json> <carpeta data de Marco>
import fs from 'node:fs';
import path from 'node:path';
import { parseMarks } from '../server/core/agesCore.js';

const [src, dataDir] = process.argv.slice(2);
if (!src || !dataDir) {
  console.error('uso: node scripts/import-ages-marks.mjs <url|archivo> <carpeta data>');
  process.exit(1);
}
const raw = /^https?:\/\//.test(src) ? await (await fetch(src)).json() : JSON.parse(fs.readFileSync(src, 'utf8'));
const { favorites, hidden } = parseMarks(raw);
fs.writeFileSync(path.join(dataDir, 'ages-marks.json'), JSON.stringify({ favorites, hidden, importedAt: new Date().toISOString() }, null, 2));
console.log(`favoritas ${favorites.length}, ocultas ${hidden.length}`);
