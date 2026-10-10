// Changing the time zone in Date & time re-parses ICS floating times (no TZID) in the new zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'BEGIN:VEVENT', 'UID:float-1', 'DTSTAMP:20261001T000000Z',
  'DTSTART:20261012T100000', 'DTEND:20261012T110000', 'SUMMARY:Floating', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');

test('a new time zone re-parses floating ICS times and rebuilds the event list', async () => {
  const prevTz = process.env.TZ;
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/calendar' }); res.end(ICS); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-tz-'));
  try {
    process.env.TZ = 'UTC';
    const store = await import('../store.js');
    store.initStore(dir);
    const { getEvents, invalidateIcsParsing, refreshSource } = await import('../calendars.js');
    store.updateConfig((c) => {
      c.datetime.timezone = 'Europe/Lisbon';
      c.localEvents.items = [];
      c.birthdays.items = [];
      c.calendar.sources = [{ id: 'c_float', type: 'ics', name: 'Float', url: `http://127.0.0.1:${srv.address().port}/f.ics`,
        enabled: true, refreshMin: 60, color: '#123456', emoji: '', kind: 'generic' }];
    });
    const startOf = async () => (await getEvents({ from: '2026-10-11', to: '2026-10-13' })).events.find((e) => e.title === 'Floating')?.start;
    const before = await startOf();
    assert.match(before, /T11:00/, 'parsed in UTC, shown in Lisbon (UTC+1)');
    process.env.TZ = 'Europe/Lisbon';
    invalidateIcsParsing();
    // a list built before the re-parse finishes must not stick
    await startOf();
    await refreshSource(store.getConfig().calendar.sources[0]);
    assert.match(await startOf(), /T10:00/);
  } finally {
    if (prevTz === undefined) delete process.env.TZ; else process.env.TZ = prevTz;
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
