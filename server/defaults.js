// Default configuration (created on first run, and used to back-fill missing keys on load).
export const DEFAULT_ICON_RULES = [
  { id: 'r_birthday', match: ['cumple', 'birthday', 'aniversário', 'aniversario', 'faz anos'], emoji: '🎂', color: null },
  { id: 'r_checkout', match: ['check-out', 'checkout', 'check out', 'salida huésped'], emoji: '🧳', color: null },
  { id: 'r_airbnb', match: ['airbnb', 'booking', 'reserva', 'reservation', 'reserved', 'check-in', 'checkin', 'hóspede', 'huésped'], emoji: '🏠', color: null },
  { id: 'r_flight', match: ['vuelo', 'flight', 'voo', 'aeropuerto', 'airport', 'aeroporto'], emoji: '✈️', color: null },
  { id: 'r_doctor', match: ['médico', 'medico', 'doctor', 'dentista', 'dentist', 'consulta', 'hospital', 'clínica'], emoji: '🩺', color: null },
  { id: 'r_school', match: ['colegio', 'escuela', 'school', 'escola', 'guardería', 'creche'], emoji: '🎒', color: null },
  { id: 'r_sport', match: ['fútbol', 'futbol', 'futebol', 'football', 'gym', 'ginásio', 'gimnasio', 'padel', 'pádel', 'tenis', 'ténis', 'tennis', 'deporte', 'desporto', 'sport', 'running', 'yoga'], emoji: '🏃', color: null },
  { id: 'r_dinner', match: ['cena', 'cenar', 'dinner', 'jantar', 'restaurante', 'restaurant', 'almuerzo', 'almoço', 'lunch'], emoji: '🍽️', color: null },
  { id: 'r_meeting', match: ['reunión', 'reunion', 'meeting', 'call', 'reunião', 'zoom', 'teams'], emoji: '💼', color: null },
  // Public holidays before vacations: Google holiday feeds carry "Public holiday" in the description.
  { id: 'r_holiday', match: ['festivo', 'feriado', 'public holiday', 'bank holiday'], emoji: '🎉', color: null },
  { id: 'r_vacation', match: ['vacaciones', 'holiday', 'férias', 'vacation'], emoji: '🏖️', color: null },
  { id: 'r_wedding', match: ['boda', 'wedding', 'casamento'], emoji: '💍', color: null },
  { id: 'r_shopping', match: ['compra', 'shopping', 'mercado', 'supermercado'], emoji: '🛒', color: null },
  { id: 'r_car', match: ['coche', 'car', 'taller', 'itv', 'inspeção', 'inspección', 'oficina auto', 'carro'], emoji: '🚗', color: null },
  { id: 'r_bill', match: ['pago', 'factura', 'fatura', 'bill', 'recibo', 'pagamento'], emoji: '💶', color: null },
  { id: 'r_vet', match: ['veterinario', 'veterinário', 'vet'], emoji: '🐾', color: null },
  { id: 'r_cinema', match: ['cine', 'cinema', 'film', 'filme', 'película'], emoji: '🎬', color: null },
  { id: 'r_concert', match: ['concierto', 'concert', 'concerto', 'festival'], emoji: '🎵', color: null },
];

export const DEFAULT_SOURCES = [
  // A public example feed only. Add your own calendars (Google, iCal, vacation-rental feeds…) in the admin panel.
  {
    id: 'c_holidays', type: 'ics', name: 'Public holidays',
    url: 'https://calendar.google.com/calendar/ical/en.portuguese%23holiday%40group.v.calendar.google.com/public/basic.ics',
    color: '#f4a261', emoji: '🎉', kind: 'holidays', enabled: true, refreshMin: 360, insecureTls: false,
  },
];

// ---- Config schema v2 (multi-screen). See docs/ARCHITECTURE.md. ----
export const CONFIG_VERSION = 2;

/** Built-in pseudo-source ids (F2). User sources can never take these ids. */
export const LOCAL_SOURCE_ID = 'local';
export const BIRTHDAYS_SOURCE_ID = 'birthdays';
export const RESERVED_SOURCE_IDS = [LOCAL_SOURCE_ID, BIRTHDAYS_SOURCE_ID];

/** Per-screen part of the keys that are split between global and per-screen ("merged sections"). */
export const SCREEN_SPLIT_KEYS = {
  calendar: ['enabled', 'view', 'weeks', 'weekStart', 'showLocation', 'showEndTime', 'showDayXofY', 'showLegend', 'hidePast', 'maxEventsPerDay', 'sourceIds'],
  datetime: ['enabled', 'clock', 'format24', 'showSeconds', 'showAmPm', 'dateFormat'],
  weather: ['enabled', 'forecastDays', 'showHourly', 'showPrecipChance'],
  news: ['enabled', 'rotateSec'],
  todo: ['enabled'],
  countdowns: ['enabled', 'max'],
};
/** Keys that only exist per screen (whole object lives in the screen profile). */
export const SCREEN_ONLY_KEYS = ['screen', 'layout', 'background', 'message', 'alerts'];

/** A complete screen profile with default values (screen.name lives in profile.name). */
export function defaultScreenProfile({ id = 's_main', slug = 'living-room', name = 'Living room' } = {}) {
  return structuredClone({
    id, slug, name,
    screen: {
      language: 'en', fontScale: 1.0, theme: 'dark', accent: '#ff5a4e', orientation: 'auto', customCss: '',
      nightMode: { enabled: false, from: '23:00', to: '07:00', dim: 0.35 },
    },
    layout: { preset: 'bigCalendar', sidePanel: 'left', sideWidth: 0.36 },
    background: {
      enabled: true, source: 'stock', stockTopic: 'nature', order: 'random', intervalSec: 120, brightness: 0.85, showMeta: false,
      cover: true, transition: 'webgl', ambient: 'aurora',
      panelBlur: 18, panelShade: 0.5,
    },
    calendar: {
      enabled: true, view: 'month', weeks: 5, weekStart: 1, showLocation: false, showEndTime: false,
      showDayXofY: true, showLegend: true, hidePast: false, maxEventsPerDay: 4,
      sourceIds: null, // null = every enabled source (incl. local + birthdays); array = only these ids
    },
    datetime: { enabled: true, clock: 'digital', format24: true, showSeconds: true, showAmPm: false, dateFormat: 'weekday_d_month' },
    weather: { enabled: true, forecastDays: 5, showHourly: true, showPrecipChance: true },
    news: { enabled: true, rotateSec: 15 },
    todo: { enabled: false },
    message: { enabled: false, text: '', emoji: '💬' },
    countdowns: { enabled: true, max: 4 },
    alerts: { enabled: true, sound: true, volume: 0.6 },
  });
}

export function defaultConfig() {
  return structuredClone({
    version: CONFIG_VERSION,
    revision: 1,
    defaultScreen: 's_main',
    screens: [defaultScreenProfile()],
    // ---- global sections ----
    calendar: { sources: DEFAULT_SOURCES, iconRules: DEFAULT_ICON_RULES },
    datetime: { timezone: 'Europe/Lisbon' },
    weather: {
      provider: 'open-meteo', locationName: 'Lisbon, Portugal', lat: 38.7223, lon: -9.1393, units: 'metric',
      haWeatherEntity: '', haIndoorTempEntity: '', haIndoorHumidityEntity: '',
    },
    news: {
      feeds: [{ id: 'n1', name: 'BBC News – World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', enabled: true }],
      maxItems: 30,
    },
    todo: { items: [] },
    localEvents: { enabled: true, name: 'Family', color: '#e76f51', emoji: '', items: [] },
    birthdays: { enabled: true, name: 'Birthdays', color: '#ff6f91', emoji: '🎂', showAge: true, items: [] },
    eventRules: { items: [] },
    countdowns: { items: [], includeBirthdays: true, birthdayDays: 30, includeFlagged: true, horizonDays: 365 },
    schedules: { items: [] },
    homeassistant: { enabled: false, url: 'http://homeassistant.local:8123' },
    auth: { allowedGoogleEmails: [], passwordLoginEnabled: true },
  });
}
