// The saved real answers the fake price sources serve (server/core/pricesFake.js, MARCO_PRICES_FAKE and the tests):
// read here, in Node, so the core stays free of files.
import fs from 'node:fs';
import { setFakeFixtures } from './core/pricesFake.js';

const DIR = new URL('./test/fixtures/tariffs/', import.meta.url);

let loaded = false;
/** Loads the DataHub tariffs and the DK2 day-ahead prices of 2026-10-13 into the fake sources (once). */
export function loadFakeFixtures() {
  if (loaded) return;
  loaded = true;
  const read = (n) => {
    try {
      return JSON.parse(fs.readFileSync(new URL(n, DIR), 'utf8')).records;
    } catch {
      return [];
    }
  };
  setFakeFixtures({ datahub: read('datahub-households-2026-10.json'), dk2: read('dayahead-dk2-2026-10-13.json') });
}
