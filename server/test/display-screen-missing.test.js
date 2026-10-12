// The display's "Screen not found" page (web/display/widgets/screenMissing.ts): shown for 404 screen_not_found,
// neutral text only (no slug, no list of screens), retries every minute and reloads once the screen exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWebModules } from './webModules.js';

/** Minimal DOM: one root element appended to the body. */
function fakeDom() {
  const classes = new Set();
  const made = [];
  const el = () => {
    const e = {
      id: '', attrs: {}, innerHTML: '', text: { textContent: '' },
      setAttribute(k, v) { this.attrs[k] = v; },
      querySelector(sel) { return sel === '.sm-text' ? this.text : null; },
    };
    made.push(e);
    return e;
  };
  return {
    made,
    classes,
    document: {
      documentElement: { classList: { add: (...c) => c.forEach((x) => classes.add(x)) } },
      body: { appendChild: (e) => e },
      createElement: el,
    },
  };
}

test('screen not found: neutral text in es/en/pt, no slug, retries every 60 s and reloads when the screen exists', async () => {
  const saved = { location: globalThis.location, document: globalThis.document, localStorage: globalThis.localStorage, setInterval: globalThis.setInterval };
  const dom = fakeDom();
  let reloads = 0;
  const timers = [];
  Object.defineProperty(globalThis, 'location', {
    value: { href: 'http://x/?screen=secret-room', origin: 'http://x', pathname: '/', search: '?screen=secret-room', reload: () => { reloads++; } },
    configurable: true, writable: true,
  });
  Object.defineProperty(globalThis, 'document', { value: dom.document, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: { length: 0, key: () => null, removeItem() {} }, configurable: true, writable: true });
  globalThis.setInterval = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  try {
    const [i18n, sm] = await loadWebModules('/web/shared/i18n.ts', '/web/display/widgets/screenMissing.ts');
    assert.equal(i18n.t('es', 'screenNotFound'), 'Pantalla no encontrada');
    assert.equal(i18n.t('en', 'screenNotFound'), 'Screen not found');
    assert.equal(i18n.t('pt', 'screenNotFound'), 'Ecrã não encontrado');
    let answer = false;
    let probes = 0;
    sm.showScreenMissing('en', async () => { probes++; return answer; });
    const root = dom.made[0];
    assert.equal(root.id, 'screen-missing');
    assert.equal(root.text.textContent, 'Screen not found');
    assert.ok(!root.innerHTML.includes('secret-room'));
    assert.ok(dom.classes.has('screen-missing'));
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 60_000);
    await timers[0].fn();
    assert.equal(probes, 1);
    assert.equal(reloads, 0);
    answer = true;
    await timers[0].fn();
    assert.equal(reloads, 1);
    // shown again (another 404): same page, one timer
    sm.showScreenMissing('es', async () => false);
    assert.equal(root.text.textContent, 'Pantalla no encontrada');
    assert.equal(timers.length, 1);
    // the bare address from another machine: same page, asks for a screen's link (no slug, no list)
    assert.equal(i18n.t('es', 'screenNotChosen'), 'Abre el enlace de una pantalla');
    assert.equal(i18n.t('en', 'screenNotChosen'), 'Open a screen\'s link');
    assert.equal(i18n.t('pt', 'screenNotChosen'), 'Abra a ligação de um ecrã');
    sm.showScreenMissing('pt', async () => false, { bare: true });
    assert.equal(root.text.textContent, 'Abra a ligação de um ecrã');
    assert.equal(timers.length, 1);
  } finally {
    globalThis.setInterval = saved.setInterval;
    for (const k of ['location', 'document', 'localStorage']) Object.defineProperty(globalThis, k, { value: saved[k], configurable: true, writable: true });
  }
});
