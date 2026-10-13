// The widget preview of the Widgets page (web/admin/widgetPreview.ts, WidgetPreviewPanel.tsx; the display's
// ?widgetOnly=1 mode) and the room the side column keeps for a price card (web/display/widgets/prices.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// a namespace import: Node 20 has no registerHooks, and a named import of it would fail before any test runs
import * as nodeModule from 'node:module';

// The admin's own imports have no extension (Vite resolves them): add ".ts" for those under web/.
nodeModule.registerHooks?.({
  resolve(specifier, context, next) {
    if (/^\.\.?\/[^.]*$/.test(specifier) && context.parentURL?.includes('/web/')) {
      try { return next(`${specifier}.ts`, context); } catch { /* fall through */ }
    }
    return next(specifier, context);
  },
});

let wp = null;
try {
  wp = await import('../../web/admin/widgetPreview.ts');
} catch {
  wp = null;
}
const ts = { skip: wp ? false : 'TypeScript imports need Node >= 22.18' };
const read = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

const screen = (id, preset, widgets = [], widgetId = null) => ({ id, name: id, layout: { preset, widgetId }, widgets });
const widget = (id, type, view = 'auto') => ({ id, type, name: id, options: { url: '', refreshSec: 0, fit: 'contain', bust: false, ...(type === 'prices' ? { prices: { zone: 'PT', view } } : {}) } });

test('widget preview: it starts where the screen has the widget, else a medium corner (prices: the side column)', ts, () => {
  const cfg = {
    screens: [screen('s1', 'bigCalendar', [{ widgetId: 'w_img', place: 'corner', corner: 'tl', size: 's' }]), screen('s2', 'widget', [], 'w_img')],
    widgets: [widget('w_img', 'image'), widget('w_web', 'web'), widget('w_pr', 'prices'), widget('w_next', 'prices', 'next')],
  };
  assert.deepEqual(wp.widgetPreviewSpot(cfg, 's1', cfg.widgets[0]), { place: 'corner', size: 's', corner: 'tl' });
  assert.deepEqual(wp.widgetPreviewSpot(cfg, 's2', cfg.widgets[0]), { place: 'full', size: 'l', corner: 'br' });
  assert.deepEqual(wp.widgetPreviewSpot(cfg, 's1', cfg.widgets[1]), { place: 'corner', size: 'm', corner: 'br' });
  assert.deepEqual(wp.widgetPreviewSpot(cfg, 's1', cfg.widgets[2]), { place: 'side', size: 'm', corner: 'br' });
  // the list of the next 24 hours needs a large card
  assert.deepEqual(wp.widgetPreviewSpot(cfg, 's1', cfg.widgets[3]), { place: 'side', size: 'l', corner: 'br' });
});

test('widget preview: a copy of the draft with only that widget, on a layout with a side column', ts, () => {
  const cfg = {
    screens: [screen('s1', 'photoFrame', [{ widgetId: 'w_a', place: 'corner', corner: 'tl', size: 's' }])],
    widgets: [widget('w_a', 'image'), widget('w_b', 'prices')],
  };
  const side = wp.widgetPreviewDraft(cfg, 's1', 'w_b', { place: 'side', size: 'l', corner: 'br' });
  assert.equal(side.screens[0].layout.preset, 'bigCalendar');
  assert.deepEqual(side.screens[0].widgets, [{ widgetId: 'w_b', place: 'side', corner: 'br', size: 'l' }]);
  const full = wp.widgetPreviewDraft(cfg, 's1', 'w_a', { place: 'full', size: 'l', corner: 'br' });
  assert.equal(full.screens[0].layout.preset, 'widget');
  assert.equal(full.screens[0].layout.widgetId, 'w_a');
  assert.deepEqual(full.screens[0].widgets, []);
  // the draft itself is never touched
  assert.equal(cfg.screens[0].layout.preset, 'photoFrame');
  assert.equal(cfg.screens[0].widgets.length, 1);
  assert.equal(wp.widgetPreviewDraft(cfg, 's1', 'w_gone', { place: 'side', size: 'm', corner: 'br' }), null);
});

test('widget preview: a card of its own under the screen preview, showing only the widget', () => {
  const app = read('web/admin/App.tsx');
  // the screen preview stays as it is; the widget card comes after it, in the side column and in the phone sheet
  assert.equal((app.match(/<WidgetPreviewPanel /g) || []).length, 2);
  assert.match(app, /widgetOnly=1/);
  const css = read('web/display/styles.css');
  assert.match(css, /html\.widget-only \.photo-area/);
  assert.match(css, /html\.widget-only \.side-mid > :not\(#uw-side\)/);
  assert.match(css, /html\.widget-only \.main > :not\(#uw-full\)/);
  const main = read('web/display/main.ts');
  assert.match(main, /if \(isWidgetOnly\) document\.documentElement\.classList\.add\('widget-only'\)/);
  assert.match(main, /type: 'marco:preview-focus', id: focusId, rect, mode, cramped/);
  assert.match(read('web/display/identity.ts'), /isWidgetOnly = isPreview && params\.get\('widgetOnly'\) === '1'/);
  for (const f of ['web/admin/WidgetPreviewPanel.tsx', 'web/admin/widgetPreview.ts', 'web/admin/i18n-dict-widgets.ts']) {
    assert.doesNotMatch(read(f), /—/, `no em dashes in ${f}`);
  }
});

test('price card in a crowded side column: the room kept for it is enough for the card at its smallest', () => {
  const prices = read('web/display/widgets/prices.ts');
  // measured on a Modern screen with font scale 1.35 (level badge and next hour line): 160 px at FLOOR with
  // rem 13.5, so the room kept must be at least (3.2 + 14.2 * 0.6) rem
  const pad = Number(prices.match(/const NOW_CARD_PAD_REM = ([\d.]+);/)[1]);
  const rem = Number(prices.match(/const NOW_CARD_REM = ([\d.]+);/)[1]);
  const floor = Number(prices.match(/const FLOOR = ([\d.]+);/)[1]);
  assert.ok((pad + rem * floor) * 13.5 >= 160, 'room kept at FLOOR');
  // and a card that the estimate would hide is tried at FLOOR first
  assert.match(prices, /card\.style\.setProperty\('--pk', String\(FLOOR\)\);\n\s*if \(k > FLOOR && card\.scrollHeight <= this\.maxH \+ 2\) return;/);
});

test('widget preview: a price view that does not fit where the preview starts is shown larger, with a note', () => {
  const panel = read('web/admin/WidgetPreviewPanel.tsx');
  // a large size first, then full screen; only while the owner has not picked a place, and after the display settled
  assert.match(panel, /setPreviewSpot\(now\.size !== 'l' \? \{ \.\.\.now, size: 'l' \} : \{ \.\.\.now, place: 'full', size: 'l' \}\)/);
  assert.match(panel, /\(pick\.spot && !grown\)/);
  assert.match(panel, /}, 1200\);/);
  assert.match(read('web/admin/i18n-dict-widgets.ts'), /necesita más sitio en esta pantalla/);
});
