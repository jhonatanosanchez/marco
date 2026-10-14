// Rotación de tarjetas (fork fsrhome) con reloj falso: cuándo sale cada una, pausas y "Mostrar ahora".
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { loadWebModules } from './webModules.js';

const [rot] = await loadWebModules('/web/display/cardsRotation.ts');
const MIN = 60_000;

function setup(items = [{ id: 'a' }, { id: 'b' }], everyMin = 20) {
  const shown = [];
  const st = { paused: false, blocked: false };
  const r = new rot.CardRotation({ paused: () => st.paused, blocked: () => st.blocked, show: (x) => shown.push(x.id) });
  r.reset(items, everyMin);
  return { r, shown, st };
}

test('primera a los 2 min; luego cada everyMin en orden y da la vuelta', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { shown } = setup();
    mock.timers.tick(2 * MIN - 1);
    assert.deepEqual(shown, []);
    mock.timers.tick(1);
    assert.deepEqual(shown, ['a']);
    mock.timers.tick(20 * MIN);
    assert.deepEqual(shown, ['a', 'b']);
    mock.timers.tick(20 * MIN);
    assert.deepEqual(shown, ['a', 'b', 'a']);
  } finally {
    mock.timers.reset();
  }
});

test('en pausa la vuelta se salta sin acumular; bloqueada (vista previa u hoja abierta) igual', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { shown, st } = setup();
    st.paused = true;
    mock.timers.tick(2 * MIN + 40 * MIN);
    assert.deepEqual(shown, []);
    st.paused = false;
    st.blocked = true;
    mock.timers.tick(20 * MIN);
    assert.deepEqual(shown, []);
    st.blocked = false;
    mock.timers.tick(20 * MIN);
    assert.deepEqual(shown, ['a']);
  } finally {
    mock.timers.reset();
  }
});

test('showNow: esa tarjeta ya y la cuenta vuelve a empezar; en pausa o desconocida no', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { r, shown, st } = setup();
    mock.timers.tick(2 * MIN);
    assert.deepEqual(shown, ['a']);
    mock.timers.tick(10 * MIN);
    assert.equal(r.showNow('b'), true);
    assert.deepEqual(shown, ['a', 'b']);
    mock.timers.tick(20 * MIN - 1);
    assert.equal(shown.length, 2);
    mock.timers.tick(1);
    assert.deepEqual(shown, ['a', 'b', 'a']);
    assert.equal(r.showNow('zzz'), false);
    st.paused = true;
    assert.equal(r.showNow('a'), false);
    assert.equal(shown.length, 3);
  } finally {
    mock.timers.reset();
  }
});

test('reset reinicia la cuenta; sin tarjetas o tras stop no sale nada', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { r, shown } = setup();
    mock.timers.tick(MIN);
    r.reset([{ id: 'c' }], 10);
    mock.timers.tick(2 * MIN - 1);
    assert.deepEqual(shown, []);
    mock.timers.tick(1);
    assert.deepEqual(shown, ['c']);
    r.stop();
    mock.timers.tick(60 * MIN);
    assert.deepEqual(shown, ['c']);
    r.reset([], 20);
    mock.timers.tick(60 * MIN);
    assert.deepEqual(shown, ['c']);
  } finally {
    mock.timers.reset();
  }
});
