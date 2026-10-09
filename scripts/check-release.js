#!/usr/bin/env node
// Pre-release check: fails while a repository URL placeholder (an OWNER account in a github.com URL) is still present in
// tracked files. Run before publishing a release or a fork:  npm run check:release
import { execFileSync } from 'node:child_process';

const PLACEHOLDER = 'OWNER';
const PATTERN = `github\\.com/${PLACEHOLDER}/`;
let out = '';
try {
  out = execFileSync('git', ['grep', '-n', '-E', PATTERN, '--', '.', ':!scripts/check-release.js'], { encoding: 'utf8' });
} catch (err) {
  if (err.status === 1) {
    console.log('check:release: no placeholders left.');
    process.exit(0);
  }
  throw err;
}
console.error('check:release: replace the OWNER placeholder with the real GitHub owner in:\n');
console.error(out.trimEnd());
process.exit(1);
