#!/usr/bin/env node
// Turns two-step sign-in off for the admin, for when the phone with the authenticator app and the recovery codes
// are both lost. Run it on the server with Marco stopped (a running server keeps its own copy of the secrets and
// would write it back):
//
//   npm run disable-2fa                     (DATA_DIR from the environment or .env, default ./data)
//   node server/disable-2fa.js --data-dir /path/to/data
//   docker compose run --rm marco npm run disable-2fa      (with the container stopped)
//
// It only removes the two-step settings from secrets.json and notes it in the activity log: the password, the
// sessions and everything else stay as they are. Whoever can run this already controls the server and its files.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function dataDir(argv) {
  const i = argv.indexOf('--data-dir');
  if (i >= 0 && argv[i + 1]) return path.resolve(argv[i + 1]);
  return path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
}

export function disableTwoFactorFile(dir) {
  const file = path.join(dir, 'secrets.json');
  let secrets;
  try {
    secrets = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { ok: false, message: `cannot read ${file}: ${err.message}` };
  }
  if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) return { ok: false, message: `${file} is not a JSON object` };
  if (!secrets.twoFactor && !secrets.twoFactorSetup) return { ok: true, changed: false, message: 'Two-step sign-in is already off.' };
  delete secrets.twoFactor;
  delete secrets.twoFactorSetup;
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  // Same line format as server/activity.js, so the admin shows it in Activity.
  const entry = {
    id: `${Date.now().toString(36)}000${crypto.randomBytes(1).toString('hex')}`,
    ts: new Date().toISOString(),
    type: 'auth.2fa_disabled',
    level: 'warn',
    actor: 'system',
    ip: null,
    data: { via: 'command line' },
  };
  try { fs.appendFileSync(path.join(dir, 'activity.jsonl'), `${JSON.stringify(entry)}\n`); } catch { /* the log is optional */ }
  return { ok: true, changed: true, message: 'Two-step sign-in is off. Start Marco again and sign in with the password only.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = dataDir(process.argv.slice(2));
  const r = disableTwoFactorFile(dir);
  console[r.ok ? 'log' : 'error'](`[disable-2fa] ${r.message}`);
  if (r.ok && r.changed) console.log(`[disable-2fa] data folder: ${dir}`);
  process.exit(r.ok ? 0 : 1);
}
