import type { Lang } from '../shared/types';
import { EN, PT } from './i18n-dict';
import { SINGULAR } from './i18n-plural';
import { LANGS, LOCALES } from '../shared/i18n';
import { NL, NL_SINGULAR } from './i18n-dict-nl';
import { DA, DA_SINGULAR } from './i18n-dict-da';
import { DA_FAMILY, DA_SINGULAR_FAMILY, NL_FAMILY, NL_SINGULAR_FAMILY } from './i18n-dict-family';

/**
 * Spanish is the source language: t() takes the Spanish string as key and returns the
 * English/Portuguese/Dutch/Danish translation when available. A Dutch or Danish key that is missing falls back
 * to English; English and Portuguese fall back to Spanish.
 * `{name}` placeholders are interpolated from `vars`.
 */
let current: Lang = 'es';

const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

/** Dutch and Danish rows (admin + family) and their singular forms. */
const MORE: Partial<Record<Lang, { rows: Record<string, string>[]; one: Record<string, string>[] }>> = {
  nl: { rows: [NL, NL_FAMILY], one: [NL_SINGULAR, NL_SINGULAR_FAMILY] },
  da: { rows: [DA, DA_FAMILY], one: [DA_SINGULAR, DA_SINGULAR_FAMILY] },
};

const LS_KEY = 'calendar-admin.lang';

export function initialLang(): Lang {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (isLang(v)) return v;
  } catch {
    /* ignore */
  }
  // First visit: follow the browser language (English fallback); the user can switch in the sidebar (remembered per browser).
  return browserLang();
}

/** First of the browser's languages that the admin speaks, else English. */
export function browserLang(langs: readonly string[] | undefined = typeof navigator === 'undefined' ? undefined : navigator.languages ?? [navigator.language]): Lang {
  try {
    for (const l of langs ?? []) {
      const base = String(l).slice(0, 2).toLowerCase();
      if (isLang(base)) return base;
    }
  } catch {
    /* ignore */
  }
  return 'en';
}

export function setLang(l: Lang) {
  current = l;
  document.documentElement.lang = l;
  try {
    localStorage.setItem(LS_KEY, l);
  } catch {
    /* ignore */
  }
}

export const getLang = () => current;

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = key;
  const isOne = !!vars && Number(vars.n) === 1;
  const more = MORE[current];
  if (more) {
    const pick = (list: Record<string, string>[]) => list[0][key] ?? list[1][key];
    s = (isOne ? pick(more.one) ?? (SINGULAR[key] ? SINGULAR[key][1] : undefined) : undefined) ?? pick(more.rows) ?? EN[key] ?? key;
  } else {
    const one = isOne ? SINGULAR[key] : undefined;
    if (one) s = one[current === 'en' ? 1 : current === 'pt' ? 2 : 0];
    else if (current === 'en') s = EN[key] ?? key;
    else if (current === 'pt') s = PT[key] ?? key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  return s;
}

export const locale = () => LOCALES[current];

export function relTime(iso: string | number | null | undefined): string {
  if (iso == null || iso === '') return '–';
  const ts = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(ts)) return '–';
  const diff = (ts - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 45) return rtf.format(Math.round(diff), 'second');
  if (abs < 45 * 60) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 22 * 3600) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '–';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}s`;
}

/** "1 pantalla" / "3 pantallas" */
export const nScreens = (n: number) => (n === 1 ? t('1 pantalla') : t('{n} pantallas', { n }));
