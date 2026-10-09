// Server-side strings (weather descriptions, Airbnb titles, wind labels). Default language: en.
export const LANGS = ['es', 'en', 'pt'];
export const lang = (l) => (LANGS.includes(l) ? l : 'en');

// WMO weather interpretation codes (Open-Meteo).
const WMO = {
  0: ['Despejado', 'Clear sky', 'Céu limpo'],
  1: ['Mayormente despejado', 'Mainly clear', 'Céu pouco nublado'],
  2: ['Parcialmente nublado', 'Partly cloudy', 'Parcialmente nublado'],
  3: ['Nublado', 'Overcast', 'Encoberto'],
  45: ['Niebla', 'Fog', 'Nevoeiro'],
  48: ['Niebla con escarcha', 'Depositing rime fog', 'Nevoeiro com geada'],
  51: ['Llovizna ligera', 'Light drizzle', 'Chuvisco fraco'],
  53: ['Llovizna', 'Drizzle', 'Chuvisco'],
  55: ['Llovizna intensa', 'Dense drizzle', 'Chuvisco forte'],
  56: ['Llovizna helada', 'Freezing drizzle', 'Chuvisco gelado'],
  57: ['Llovizna helada intensa', 'Dense freezing drizzle', 'Chuvisco gelado forte'],
  61: ['Lluvia ligera', 'Light rain', 'Chuva fraca'],
  63: ['Lluvia', 'Rain', 'Chuva'],
  65: ['Lluvia intensa', 'Heavy rain', 'Chuva forte'],
  66: ['Lluvia helada', 'Freezing rain', 'Chuva gelada'],
  67: ['Lluvia helada intensa', 'Heavy freezing rain', 'Chuva gelada forte'],
  71: ['Nevada ligera', 'Light snow', 'Neve fraca'],
  73: ['Nevada', 'Snow', 'Neve'],
  75: ['Nevada intensa', 'Heavy snow', 'Neve forte'],
  77: ['Granizo fino', 'Snow grains', 'Grãos de neve'],
  80: ['Chubascos ligeros', 'Light showers', 'Aguaceiros fracos'],
  81: ['Chubascos', 'Showers', 'Aguaceiros'],
  82: ['Chubascos fuertes', 'Violent showers', 'Aguaceiros fortes'],
  85: ['Chubascos de nieve', 'Snow showers', 'Aguaceiros de neve'],
  86: ['Chubascos de nieve fuertes', 'Heavy snow showers', 'Aguaceiros de neve fortes'],
  95: ['Tormenta', 'Thunderstorm', 'Trovoada'],
  96: ['Tormenta con granizo', 'Thunderstorm with hail', 'Trovoada com granizo'],
  99: ['Tormenta con granizo fuerte', 'Thunderstorm with heavy hail', 'Trovoada com granizo forte'],
};

export function wmoDescription(code, l) {
  const row = WMO[code];
  if (!row) return '';
  return row[LANGS.indexOf(lang(l))];
}

const DIRS = {
  es: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  pt: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
};

export function windDirLabel(deg, l) {
  if (deg == null || Number.isNaN(+deg)) return '';
  const i = Math.round((((+deg % 360) + 360) % 360) / 45) % 8;
  return DIRS[lang(l)][i];
}

const STRINGS = {
  reservation: { es: 'Reserva', en: 'Reservation', pt: 'Reserva' },
  blocked: { es: 'No disponible', en: 'Not available', pt: 'Indisponível' },
  untitled: { es: '(Sin título)', en: '(No title)', pt: '(Sem título)' },
};

export function t(key, l) {
  return STRINGS[key]?.[lang(l)] ?? key;
}

/** First supported language of an Accept-Language header (default en). */
export function langFromHeader(header) {
  for (const part of String(header || '').split(',')) {
    const base = part.trim().slice(0, 2).toLowerCase();
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

/** Language of an admin request: explicit ?lang= / body.lang, else Accept-Language. */
export const requestLang = (req) => {
  const explicit = req?.query?.lang ?? req?.body?.lang;
  return LANGS.includes(explicit) ? explicit : langFromHeader(req?.get?.('accept-language'));
};

// Import-preview summaries (server/backups.js). Nouns: [one, many, grammatical gender ('f'|'m')].
const NOUNS = {
  screen: { es: ['pantalla', 'pantallas', 'f'], en: ['screen', 'screens'], pt: ['ecrã', 'ecrãs', 'm'] },
  source: { es: ['fuente', 'fuentes', 'f'], en: ['source', 'sources'], pt: ['fonte', 'fontes', 'f'] },
  feed: { es: ['feed', 'feeds', 'm'], en: ['feed', 'feeds'], pt: ['feed', 'feeds', 'm'] },
  item: { es: ['elemento', 'elementos', 'm'], en: ['item', 'items'], pt: ['elemento', 'elementos', 'm'] },
  iconRule: { es: ['regla de iconos', 'reglas de iconos', 'f'], en: ['icon rule', 'icon rules'], pt: ['regra de ícones', 'regras de ícones', 'f'] },
};
const SUMMARY = {
  modified: { es: 'modificado', en: 'modified', pt: 'modificado' },
  unchanged: { es: 'sin cambios', en: 'unchanged', pt: 'sem alterações' },
  settingsModified: { es: 'ajustes modificados', en: 'settings modified', pt: 'definições modificadas' },
};

/** "3 pantallas" / "1 screen" */
export function countNoun(n, noun, l) {
  const [one, many] = NOUNS[noun][lang(l)];
  return `${n} ${n === 1 ? one : many}`;
}

/** "1 modificada" / "2 modified" / "2 modificados" (agrees with the noun's gender in es/pt). */
export function countChanged(n, noun, l) {
  const L = lang(l);
  if (L === 'en') return `${n} modified`;
  const g = NOUNS[noun][L][2] === 'f' ? 'a' : 'o';
  return `${n} modificad${g}${n === 1 ? '' : 's'}`;
}

export const summaryWord = (key, l) => SUMMARY[key][lang(l)];
