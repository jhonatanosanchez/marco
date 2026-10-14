// Tarjeta Homelab (fork fsrhome): copia de 30 s / ≤ 10 min, log de transiciones, Anoche con Frigate y reenvío de silencios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHomelab, invalidateHomelab, loadNight, silenceHomelab, _resetHomelab } from '../homelab.js';
import { fakeEstadoHomelab } from './fakeEstadoHomelab.js';

const W = () => ({ veredicto: { texto: 'Todo bien', estado: 'ok' }, alertas: [{ severidad: 'aviso', titulo: 'Swap', clave: 'swap' }], silenciadas: [], noche: [], extra: 1 });
const env = (f) => ({ HOMELAB_URL: f.url, HOMELAB_SILENCE_URL: `${f.url}/api/silencios` });
const TZ = 'America/Mexico_City';

test('loadHomelab: lista cerrada; copia 30 s; caída → copia ≤ 10 min; luego null', async () => {
  const f = await fakeEstadoHomelab({ widget: W() });
  _resetHomelab();
  try {
    const t0 = Date.now();
    const a = await loadHomelab(t0, env(f));
    assert.equal(a.data.alertas[0].clave, 'swap');
    assert.equal('extra' in a.data, false);
    await loadHomelab(t0 + 20_000, env(f));
    assert.equal(f.hits.length, 1);
    f.state.down = true;
    assert.equal((await loadHomelab(t0 + 5 * 60_000, env(f))).at, t0);
    assert.equal(await loadHomelab(t0 + 11 * 60_000, env(f)), null);
  } finally {
    await f.stop();
  }
});

test('loadHomelab: forma rara cuenta como caída; dos a la vez → una petición; invalidate fuerza leer', async () => {
  const f = await fakeEstadoHomelab({ widget: W() });
  _resetHomelab();
  try {
    const t0 = Date.now();
    const [a, b] = await Promise.all([loadHomelab(t0, env(f)), loadHomelab(t0, env(f))]);
    assert.ok(a && b);
    assert.equal(f.hits.length, 1);
    invalidateHomelab();
    await loadHomelab(t0 + 1000, env(f));
    assert.equal(f.hits.length, 2);
    _resetHomelab();
    f.state.widget = { veredicto: 'ok' };
    assert.equal(await loadHomelab(t0 + 2000, env(f)), null);
  } finally {
    await f.stop();
  }
});

test('loadHomelab: registra una vez el cambio a falla (con motivo, sin URL) y la vuelta', async () => {
  const f = await fakeEstadoHomelab({ widget: W(), down: true });
  _resetHomelab();
  const warns = [];
  const infos = [];
  const [w, i] = [console.warn, console.info];
  console.warn = (...a) => warns.push(a.join(' '));
  console.info = (...a) => infos.push(a.join(' '));
  try {
    const t0 = Date.now();
    await loadHomelab(t0, env(f));
    await loadHomelab(t0 + 31_000, env(f));
    assert.equal(warns.length, 1, warns.join('\n'));
    assert.match(warns[0], /http 500/);
    assert.doesNotMatch(warns[0], /127\.0\.0\.1/);
    f.state.down = false;
    await loadHomelab(t0 + 62_000, env(f));
    assert.equal(infos.length, 1);
  } finally {
    console.warn = w;
    console.info = i;
    await f.stop();
  }
});

test('loadNight: pide personas en las zonas de la tarjeta dentro de la noche; copia 5 min; Frigate caído → null', async () => {
  const f = await fakeEstadoHomelab({ events: [
    { id: '1.1-a', camera: 'patio', label: 'person', start_time: 1 },
    { id: '1.2-b', camera: 'patio', label: 'person', start_time: 2 },
    { id: '1.3-c', camera: 'nadie', label: 'person', start_time: 3 },
  ] });
  _resetHomelab();
  try {
    const card = { id: 'k_homelab', options: { homelab: { everyMin: 10, zones: ['pipol', 'Entrada'] } } };
    const frigate = { enabled: true, url: f.url, cameras: [{ id: 'patio', name: 'Patio' }] };
    const now = Date.parse('2026-10-14T06:30:00-06:00');
    const a = await loadNight(card, frigate, now, TZ);
    assert.deepEqual(a, { personas: [{ camara: 'patio', nombre: 'Patio', n: 2 }] }); // 'nadie' no es cámara de la config
    assert.deepEqual(f.queries[0], { limit: '300', labels: 'person', zones: 'pipol,Entrada', after: String(Date.parse('2026-10-13T22:00:00-06:00') / 1000), before: String(Date.parse('2026-10-14T06:00:00-06:00') / 1000) });
    await loadNight(card, frigate, now + 60_000, TZ);
    assert.equal(f.queries.length, 1);
    assert.deepEqual(await loadNight(card, { ...frigate, enabled: false }, now, TZ), { personas: null });
    f.state.down = true;
    _resetHomelab();
    assert.deepEqual(await loadNight(card, frigate, now, TZ), { personas: null });
  } finally {
    await f.stop();
  }
});

test('silenceHomelab: reenvía JSON; 4xx → 400; caída → 502; invalida la copia', async () => {
  const f = await fakeEstadoHomelab({ widget: W() });
  _resetHomelab();
  try {
    const t0 = Date.now();
    await loadHomelab(t0, env(f));
    assert.deepEqual(await silenceHomelab({ clave: 'swap', hasta: '1d' }, env(f)), { ok: true });
    assert.deepEqual(f.bodies.at(-1), { type: 'application/json', body: JSON.stringify({ clave: 'swap', hasta: '1d' }) });
    await loadHomelab(t0 + 1000, env(f)); // la copia se tiró: vuelve a pedir
    assert.equal(f.hits.filter((h) => h === 'GET /api/widget').length, 2);
    f.state.silenceStatus = 400;
    assert.deepEqual(await silenceHomelab({ clave: 'swap', hasta: null }, env(f)), { ok: false, status: 400, error: 'rejected' });
    f.state.down = true;
    assert.deepEqual(await silenceHomelab({ clave: 'swap', hasta: null }, env(f)), { ok: false, status: 502, error: 'unavailable' });
  } finally {
    await f.stop();
  }
});
