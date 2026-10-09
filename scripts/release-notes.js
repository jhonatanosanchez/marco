#!/usr/bin/env node
// Prints the CHANGELOG.md section of one version (the GitHub release notes):  node scripts/release-notes.js 0.3.0
import fs from 'node:fs';

const version = String(process.argv[2] || '').replace(/^v/, '');
if (!version) {
  console.error('usage: node scripts/release-notes.js <version>');
  process.exit(2);
}
const lines = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split('\n');
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start < 0) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
if (end < 0) end = lines.length;
// Drop link reference definitions ([0.3.0]: https://...) at the end of the file.
const body = lines.slice(start + 1, end).filter((l) => !/^\[[^\]]+\]: /.test(l)).join('\n').trim();
const install = [
  '',
  '### Install or update',
  '',
  '```sh',
  'curl -fsSL https://marcohome.app/install | bash',
  '```',
  '',
  'Already installed with the one-line installer: `marco update`. Docker: `git pull && docker compose up -d --build`.',
  `The tarball \`marco-${version}.tar.gz\` is what the installer downloads; its SHA-256 is in the \`.sha256\` file next to it.`,
];
process.stdout.write(`${body}\n${install.join('\n')}\n`);
