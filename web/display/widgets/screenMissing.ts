// "Screen not found": a display opened with ?screen=<slug> that names no screen or carousel (the server answers 404
// screen_not_found, docs/API.md). A neutral full-screen page: no clock, weather, photos or events, no list or hint of
// the screens that exist, and not even the slug that was asked for. The bare address (no ?screen=, no key) opened from
// another machine gets the same page with "Open the link of a screen" (displayAccess.js bareScreenRequest). It asks again every minute (the display has no
// stream then: /api/stream answers 404 too) and reloads once the screen exists, or once access changed (pairing).
import { logoSvg } from '../../shared/logo';
import { t } from '../../shared/i18n';
import type { Lang } from '../../shared/types';
import { clearCaches } from '../identity';

export const SCREEN_MISSING_RETRY_MS = 60_000;

let root: HTMLElement | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Show the page. `probe` resolves true when the display should start again (the config request answers now, or
 * answers 401 / 403 so the pairing screen takes over); false while the screen is still unknown or the server is down.
 * `bare`: the display was opened with no screen at all (no ?screen=, no credential).
 */
export function showScreenMissing(lang: Lang, probe: () => Promise<boolean>, { bare = false } = {}): void {
  clearCaches();
  document.documentElement.classList.add('screen-missing');
  root ??= document.body.appendChild(document.createElement('div'));
  root.id = 'screen-missing';
  root.setAttribute('role', 'alert');
  root.innerHTML = `${logoSvg('sm-logo')}<p class="sm-text"></p>`;
  (root.querySelector('.sm-text') as HTMLElement).textContent = t(lang, bare ? 'screenNotChosen' : 'screenNotFound');
  if (timer) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      if (await probe()) location.reload();
    } catch { /* still missing */ } finally {
      busy = false;
    }
  }, SCREEN_MISSING_RETRY_MS);
}
