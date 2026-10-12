import type { Lang } from '../shared/types';
import { ROWS_FAMILY, SINGULAR_FAMILY } from '../admin/i18n-dict-family';

/**
 * The family page's texts: only the Familia rows (keeps the page small). Same rules as the admin's t():
 * the Spanish string is the key, `{name}` placeholders come from `vars`, and vars.n === 1 picks the singular form.
 */
const EN: Record<string, string> = {};
const PT: Record<string, string> = {};
for (const [es, en, pt] of ROWS_FAMILY) {
  if (!(es in EN)) EN[es] = en;
  if (!(es in PT)) PT[es] = pt;
}

let current: Lang = 'es';
const LS_LANG = 'marco.family.lang';

/** The household language the page used last time, else the browser's, else Spanish. */
export function initialLang(): Lang {
  try {
    const v = localStorage.getItem(LS_LANG);
    if (v === 'es' || v === 'en' || v === 'pt') return v;
  } catch {
    /* ignore */
  }
  try {
    for (const l of navigator.languages ?? [navigator.language]) {
      const base = String(l).slice(0, 2).toLowerCase();
      if (base === 'es' || base === 'en' || base === 'pt') return base;
    }
  } catch {
    /* ignore */
  }
  return 'es';
}

export function setLang(l: Lang) {
  if (l !== 'es' && l !== 'en' && l !== 'pt') return;
  current = l;
  document.documentElement.lang = l;
  try {
    localStorage.setItem(LS_LANG, l);
  } catch {
    /* ignore */
  }
}

export const getLang = () => current;

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = key;
  const one = vars && Number(vars.n) === 1 ? SINGULAR_FAMILY[key] : undefined;
  if (one) s = one[current === 'en' ? 1 : current === 'pt' ? 2 : 0];
  else if (current === 'en') s = EN[key] ?? key;
  else if (current === 'pt') s = PT[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  return s;
}

const LOCALE: Record<Lang, string> = { es: 'es-ES', en: 'en-GB', pt: 'pt-PT' };
export const locale = () => LOCALE[current];
