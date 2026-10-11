// Built-in realistic demo dataset (used with ?demo=1 or when /api is unreachable in dev).
// Everything is generated relative to "today" so screenshots always look populated.
import type {
  AlertStyle, Announcement, CalEvent, CountdownItem, CountdownsResponse, DisplayConfig, EventsResponse, NewsResponse,
  PhotosResponse, PublicCalendarSource, SourceKind, WeatherResponse,
} from '../shared/types';
import { DEFAULT_ICON_RULES, resolveEventStyle } from '../shared/emoji';
import { addDays, dateKeyInTz, keyToUTC, pad2, startOfWeek, zonedParts } from '../shared/i18n';
import { DEFAULT_CONFIG, deepMerge } from './defaults';

// The demo runs in Lisbon unless ?tz= names another IANA zone (the website passes the visitor's own zone).
const TZ = (() => {
  const tz = new URLSearchParams(location.search).get('tz');
  if (!tz) return 'Europe/Lisbon';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'Europe/Lisbon';
  }
})();

// Demo text follows ?lang=en|es|pt (English by default).
const DEMO_LANG = (() => {
  const l = new URLSearchParams(location.search).get('lang');
  return l === 'es' || l === 'pt' ? l : 'en';
})();
/** ?empty=1: no events, no countdowns, no to-dos (empty states). */
const EMPTY = new URLSearchParams(location.search).get('empty') === '1';
/** ?busy=1: a day with more events than fit, and long titles (to see the sliding titles and the busy-day pages). */
const BUSY_Q = new URLSearchParams(location.search).get('busy');
/** ?busy=2: the same, plus a whole month packed with events (compact busy days). */
const BUSY_MONTH = BUSY_Q === '2';
const BUSY = BUSY_Q === '1' || BUSY_MONTH;
/** Pick the demo string for the current language: L('English', 'Español', 'Português'). */
const L = (en: string, es: string, pt: string) => (DEMO_LANG === 'es' ? es : DEMO_LANG === 'pt' ? pt : en);

export const MOCK_SOURCES: PublicCalendarSource[] = [
  { id: 'c_fam', name: L('Family', 'Familia', 'Família'), color: '#4c8dff', emoji: '', kind: 'generic' },
  { id: 'c_kids', name: L('Lucía & Mateo', 'Lucía y Mateo', 'Lucía e Mateo'), color: '#ff9f1c', emoji: '', kind: 'generic' },
  { id: 'c_bday', name: L('Birthdays', 'Cumpleaños', 'Aniversários'), color: '#f15bb5', emoji: '🎂', kind: 'birthdays' },
  { id: 'c_rent', name: L('Beach house', 'Casa de la playa', 'Casa da praia'), color: '#2ec4b6', emoji: '🏠', kind: 'airbnb' },
  { id: 'c_hol', name: L('Public holidays', 'Festivos', 'Feriados'), color: '#ffd23f', emoji: '🎉', kind: 'holidays' },
  { id: 'c_work', name: L('Work', 'Trabajo', 'Trabalho'), color: '#9b5de5', emoji: '', kind: 'generic' },
];

export function mockConfig(): DisplayConfig {
  const q = new URLSearchParams(location.search);
  return deepMerge(DEFAULT_CONFIG, {
    revision: 1,
    screenId: 's_main',
    slug: 'living-room',
    screen: { name: L('Living room', 'Salón', 'Sala'), language: DEMO_LANG, style: 'modern' },
    weather: { locationName: L('Lisbon, Portugal', 'Lisboa, Portugal', 'Lisboa, Portugal') },
    // ?photos=0 → no background photo
    ...(q.get('photos') === '0' ? { background: { enabled: false } } : {}),
    datetime: { timezone: TZ },
    countdowns: { enabled: q.get('countdowns') !== '0', max: Number(q.get('cdmax')) || 4 },
    // ?sched=1 → a scheduled message whose window is open right now
    schedules: q.get('sched') === '1'
      ? [{
          id: 'm_demo', enabled: true, title: L('Take out the bins', 'Sacar la basura', 'Pôr o lixo na rua'),
          body: L('Recycling & organic', 'Orgánico y envases', 'Reciclagem e orgânico'), emoji: '🗑️', style: 'warning',
          days: [], from: '00:00', to: '23:59', startDate: null, endDate: null, sound: false,
        }]
      : [],
    // the demo is a new screen: compact busy days on (?compact=0 shows the grid without them)
    calendar: { sources: MOCK_SOURCES, iconRules: DEFAULT_ICON_RULES, compactBusyDays: true },
    todo: {
      enabled: q.get('todo') === '1',
      items: EMPTY ? [] : [
        { id: 't1', text: L('Buy batteries for the remote', 'Comprar pilas para el mando', 'Comprar pilhas para o comando'), done: false },
        { id: 't2', text: L('Call the plumber', 'Llamar al fontanero', 'Ligar ao canalizador'), done: true },
        { id: 't3', text: L('Fresh sheets for the beach house', 'Sábanas limpias para la casa de la playa', 'Lençóis lavados para a casa da praia'), done: false },
      ],
    },
    message: { enabled: q.get('msg') === '1', text: L('Have a great weekend, everyone!', '¡Buen fin de semana, familia!', 'Bom fim de semana, família!'), emoji: '💛' },
  });
}

/** ISO string with offset for a wall-clock time in TZ. */
function isoAt(key: string, hh: number, mm: number): string {
  const [y, m, d] = key.split('-').map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), TZ);
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(y, m - 1, d, hh, mm) - wall;
  }
  const p = zonedParts(new Date(guess), TZ);
  const off = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess) / 60000);
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${key}T${pad2(hh)}:${pad2(mm)}:00${sign}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
}

let seq = 0;
function ev(
  sourceId: string, title: string, startKey: string,
  opts: { at?: [number, number]; dur?: number; endKey?: string; location?: string; age?: number } = {},
): CalEvent {
  const src = MOCK_SOURCES.find((s) => s.id === sourceId)!;
  const style = resolveEventStyle(DEFAULT_ICON_RULES, { title }, { emoji: src.emoji, color: src.color, kind: src.kind });
  const allDay = !opts.at;
  let start: string;
  let end: string;
  if (allDay) {
    start = startKey;
    end = opts.endKey ?? addDays(startKey, 1);
  } else {
    const [h, m] = opts.at!;
    start = isoAt(startKey, h, m);
    const endMs = new Date(start).getTime() + (opts.dur ?? 60) * 60000;
    end = opts.endKey ? isoAt(opts.endKey, 11, 0) : new Date(endMs).toISOString();
  }
  const multiDay = allDay ? diff(start, end) > 1 : dateKeyInTz(new Date(new Date(end).getTime() - 1), TZ) !== startKey;
  return {
    id: `mock_${++seq}_${startKey}`,
    sourceId, title, start, end, allDay, location: opts.location ?? null,
    color: style.color, emoji: style.emoji, kind: src.kind as SourceKind, multiDay,
    ...(opts.age !== undefined ? { age: opts.age } : {}),
  };
}

function diff(a: string, b: string) {
  return Math.round((keyToUTC(b).getTime() - keyToUTC(a).getTime()) / 86400000);
}

export function mockEvents(now = new Date()): EventsResponse {
  seq = 0;
  const T = dateKeyInTz(now, TZ);
  const W = startOfWeek(T, 1);
  const D = (n: number) => addDays(T, n);
  const out: CalEvent[] = [];
  const year = +T.slice(0, 4);

  // Public holidays in range (this year + next).
  const hol: [string, string, string, string][] = [
    ['10-05', 'Republic Day', 'Día de la República', 'Implantação da República'],
    ['11-01', "All Saints' Day", 'Todos los Santos', 'Dia de Todos os Santos'],
    ['12-01', 'Restoration of Independence', 'Restauración de la Independencia', 'Restauração da Independência'],
    ['12-08', 'Immaculate Conception', 'Inmaculada Concepción', 'Imaculada Conceição'],
    ['12-25', 'Christmas Day', 'Navidad', 'Natal'], ['01-01', "New Year's Day", 'Año Nuevo', 'Ano Novo'],
    ['04-25', 'Freedom Day', 'Día de la Libertad', 'Dia da Liberdade'],
    ['06-10', 'Portugal Day', 'Día de Portugal', 'Dia de Portugal'], ['08-15', 'Assumption Day', 'Asunción', 'Assunção de Nossa Senhora'],
  ];
  for (const y of [year, year + 1]) for (const [md, en, es, pt] of hol) out.push(ev('c_hol', L(en, es, pt), `${y}-${md}`));

  // Birthdays (age shown as "🎂 Grandma Isabel (72)")
  out.push(ev('c_bday', 'Elena', T, { age: 39 }));
  out.push(ev('c_bday', L('Grandpa Luis', 'Abuelo Luis', 'Avô Luis'), D(9), { age: 81 }));
  out.push(ev('c_bday', 'Mateo', D(16), { age: 7 }));
  out.push(ev('c_bday', L('Grandma Isabel', 'Abuela Isabel', 'Avó Isabel'), D(25), { age: 72 }));
  out.push(ev('c_bday', 'Lucía', D(33), { age: 10 }));

  // Vacation-rental stays (all-day, end = checkout date). Guests as icons: 🧑🏻 adults, 🧒🏻 children, 👶🏻 babies, 🐶 pets.
  out.push(ev('c_rent', 'Sophie Martin · 🧑🏻🧑🏻', D(-3), { endKey: D(1) }));
  out.push(ev('c_rent', 'João Pereira · 🧑🏻🧑🏻 🧒🏻🧒🏻 🐶', D(1), { endKey: D(5) }));
  out.push(ev('c_rent', 'Emma & Lukas · 🧑🏻🧑🏻', D(7), { endKey: D(10) }));
  out.push(ev('c_rent', L('The Duboises', 'Familia Dubois', 'Família Dubois') + ' · 🧑🏻🧑🏻 🧒🏻 👶🏻', D(13), { endKey: D(17) }));
  out.push(ev('c_rent', 'Marco Rossi · 🧑🏻', D(19), { endKey: D(23) }));
  out.push(ev('c_rent', 'Hannah K. · 🧑🏻🧑🏻🧑🏻 🐶', D(26), { endKey: D(29) }));

  // Recurring family stuff across the visible grid
  for (let i = -7; i < 42; i++) {
    const k = addDays(W, i);
    const wd = keyToUTC(k).getUTCDay();
    if (wd === 2 || wd === 4) out.push(ev('c_kids', L('Football practice', 'Entreno de fútbol', 'Treino de futebol'), k, { at: [18, 0], dur: 75, location: L('Sports ground', 'Campo municipal', 'Campo municipal') }));
    if (wd === 3) out.push(ev('c_fam', L('Padel with Rui', 'Pádel con Rui', 'Padel com o Rui'), k, { at: [19, 30], dur: 90 }));
    if (wd === 6) out.push(ev('c_fam', L('Farmers market', 'Mercado del sábado', 'Mercado de sábado'), k, { at: [10, 0], dur: 120 }));
    if (wd === 1) out.push(ev('c_work', L('Weekly meeting', 'Reunión semanal', 'Reunião semanal'), k, { at: [9, 30], dur: 60 }));
    if (wd === 5 && i % 14 === 4) out.push(ev('c_kids', L('School trip', 'Excursión del colegio', 'Visita de estudo'), k));
  }

  // One-offs
  out.push(ev('c_fam', L('Dentist – Lucía', 'Dentista – Lucía', 'Dentista – Lucía'), T, { at: [17, 30], dur: 45, location: L('Smile Clinic', 'Clínica Sonrisa', 'Clínica Sorriso') }));
  out.push(ev('c_work', L('Client call', 'Llamada con cliente', 'Call com cliente'), T, { at: [11, 0], dur: 30 }));
  out.push(ev('c_fam', L('Dinner with Ana & Pedro', 'Cena con Ana y Pedro', 'Jantar com Ana e Pedro'), D(1), { at: [21, 0], dur: 150, location: L('Seaside restaurant', 'Restaurante del puerto', 'Restaurante do porto') }));
  out.push(ev('c_fam', L('Vet – Luna', 'Veterinario – Luna', 'Veterinário – Luna'), D(3), { at: [16, 15], dur: 30 }));
  out.push(ev('c_fam', L('Pay electricity bill', 'Pagar factura de la luz', 'Pagar fatura da luz'), D(4)));
  out.push(ev('c_fam', L('Car service', 'Revisión del coche', 'Revisão do carro'), D(6), { at: [8, 45], dur: 60 }));
  out.push(ev('c_fam', L('Cinema night', 'Noche de cine', 'Noite de cinema'), D(8), { at: [21, 30], dur: 150 }));
  out.push(ev('c_work', L('Flight to Madrid', 'Vuelo a Madrid', 'Voo para Madrid'), D(12), { at: [7, 40], dur: 80 }));
  out.push(ev('c_fam', L('Concert in the park', 'Concierto en el parque', 'Concerto no parque'), D(15), { at: [21, 0], dur: 120 }));
  out.push(ev('c_fam', L('Vacation in the Algarve', 'Vacaciones en el Algarve', 'Férias no Algarve'), D(18), { endKey: D(22) }));
  out.push(ev('c_fam', L("Inês & Duarte's wedding", 'Boda de Inês y Duarte', 'Casamento da Inês e do Duarte'), D(20), { at: [16, 0], dur: 480 }));
  out.push(ev('c_fam', L('Weekly grocery shopping', 'Compra semanal del súper', 'Compras da semana'), D(-2), { at: [18, 30], dur: 60 }));
  out.push(ev('c_kids', L('Pediatrician – Mateo', 'Pediatra – Mateo', 'Pediatra – Mateo'), D(-1), { at: [10, 0], dur: 30 }));
  out.push(ev('c_kids', L('Swimming lesson', 'Clase de natación', 'Aula de natação'), D(2), { at: [17, 0], dur: 45 }));
  out.push(ev('c_kids', L('School play', 'Función del colegio', 'Teatro da escola'), D(10), { at: [18, 30], dur: 90 }));

  if (BUSY) {
    out.push(ev('c_fam', L('Grandparents visiting from Porto for the long weekend', 'Los abuelos vienen de Oporto a pasar el puente', 'Os avós vêm do Porto passar o fim de semana prolongado'), D(1), { endKey: D(4) }));
    out.push(ev('c_kids', L('Bring the signed permission slip for the science museum trip', 'Llevar firmada la autorización para la excursión al museo de la ciencia', 'Levar assinada a autorização para a visita ao museu da ciência'), T));
    out.push(ev('c_work', L('Quarterly planning workshop with the whole design and product team', 'Taller de planificación trimestral con todo el equipo de diseño y producto', 'Workshop de planeamento trimestral com toda a equipa de design e produto'), T, { at: [14, 0], dur: 90 }));
    const busy: [string, string, string, number, number, string][] = [
      ['Breakfast with Marta', 'Desayuno con Marta', 'Pequeno-almoço com a Marta', 8, 0, 'c_fam'],
      ['Drop the kids at school', 'Llevar a los niños al colegio', 'Levar os miúdos à escola', 8, 45, 'c_kids'],
      ['Budget review', 'Revisión del presupuesto', 'Revisão do orçamento', 10, 0, 'c_work'],
      ['Haircut', 'Peluquería', 'Cabeleireiro', 12, 30, 'c_fam'],
      ['Lunch with the new team', 'Comida con el equipo nuevo', 'Almoço com a equipa nova', 13, 30, 'c_work'],
      ['Piano lesson', 'Clase de piano', 'Aula de piano', 16, 0, 'c_kids'],
      ['Pick up the parcel', 'Recoger el paquete', 'Levantar a encomenda', 17, 15, 'c_fam'],
      ['Parents association meeting', 'Reunión del AMPA', 'Reunião da associação de pais', 18, 30, 'c_kids'],
      ['Call grandma', 'Llamar a la abuela', 'Ligar à avó', 20, 0, 'c_fam'],
    ];
    for (const [en, es, pt, h, m, src] of busy) out.push(ev(src, L(en, es, pt), D(2), { at: [h, m], dur: 45 }));
    // the next event, in about 25 minutes, with a title too long for the side panel's pill and for its day cell
    const soon = new Date(now.getTime() + 25 * 60000);
    const sp = zonedParts(soon, TZ);
    out.push(ev('c_work', L(
      'Website update review with the agency and the whole content team before launch',
      'Revisión de la actualización de la web con la agencia y todo el equipo de contenidos antes del lanzamiento',
      'Revisão da atualização do site com a agência e toda a equipa de conteúdos antes do lançamento',
    ), dateKeyInTz(soon, TZ), { at: [sp.hour, sp.minute], dur: Math.max(5, Math.min(60, 1439 - sp.hour * 60 - sp.minute)) }));
    // a long timed event alone on its day (the first free day from next week on): it may use the whole free height
    // of the cell
    const busyKey = (k: string) => out.some((e) => (e.allDay ? e.start <= k && k < e.end : dateKeyInTz(new Date(e.start), TZ) === k));
    let free = D(5);
    for (let i = 5; i < 30 && busyKey(D(i)); i++) free = D(i + 1);
    out.push(ev('c_fam', L(
      'Late flight back from the conference in Lyon with a connection in Barcelona, pick up the car at the long-stay car park',
      'Vuelo de vuelta de la conferencia de Lyon con escala en Barcelona, recoger el coche en el aparcamiento de larga estancia',
      'Voo de regresso da conferência em Lyon com escala em Barcelona, levantar o carro no parque de longa duração',
    ), free, { at: [21, 45], dur: 60 }));
  }

  // ?busy=2: a whole month as packed as a big family's (most days 4 to 10 events), for the compact busy days
  if (BUSY_MONTH) {
    const pool: [string, string, string, number, number, string][] = [
      ['Swim club', 'Club de natación', 'Clube de natação', 7, 30, 'c_kids'],
      ['School run', 'Llevar al cole', 'Levar à escola', 8, 15, 'c_kids'],
      ['Team stand-up', 'Daily del equipo', 'Daily da equipa', 9, 0, 'c_work'],
      ['Grocery delivery', 'Entrega del súper', 'Entrega do supermercado', 10, 30, 'c_fam'],
      ['Physio', 'Fisio', 'Fisioterapia', 11, 0, 'c_fam'],
      ['Lunch with Ana', 'Comida con Ana', 'Almoço com a Ana', 12, 30, 'c_fam'],
      ['Design review', 'Revisión de diseño', 'Revisão de design', 13, 30, 'c_work'],
      ['Pick up Lucía', 'Recoger a Lucía', 'Ir buscar a Lucía', 15, 0, 'c_kids'],
      ['Piano lesson', 'Clase de piano', 'Aula de piano', 16, 0, 'c_kids'],
      ['Homework club', 'Refuerzo escolar', 'Explicações', 16, 30, 'c_kids'],
      ['Ballet', 'Ballet', 'Ballet', 17, 0, 'c_kids'],
      ['Scouts', 'Scouts', 'Escuteiros', 17, 45, 'c_kids'],
      ['Gym', 'Gimnasio', 'Ginásio', 18, 30, 'c_fam'],
      ["Dinner at grandma's", 'Cena en casa de la abuela', 'Jantar em casa da avó', 19, 0, 'c_fam'],
      ['Book club', 'Club de lectura', 'Clube de leitura', 19, 30, 'c_fam'],
      ['Call with Dad', 'Llamada con papá', 'Chamada com o pai', 20, 0, 'c_fam'],
      ['Yoga', 'Yoga', 'Ioga', 20, 30, 'c_fam'],
      ['Movie night', 'Noche de pelis', 'Noite de cinema', 21, 0, 'c_fam'],
    ];
    const allDay: [string, string, string, string][] = [
      ['Pyjama day at school', 'Día del pijama en el cole', 'Dia do pijama na escola', 'c_kids'],
      ['Library books due', 'Devolver libros de la biblioteca', 'Devolver livros à biblioteca', 'c_kids'],
      ['Bin day', 'Día de sacar la basura', 'Dia do lixo', 'c_fam'],
    ];
    // events per day over five weeks from this Monday (the recurring ones above add one or two more)
    const counts = [3, 8, 5, 9, 4, 7, 2, 6, 9, 3, 8, 7, 5, 1, 8, 4, 7, 3, 9, 6, 2, 5, 8, 9, 4, 7, 3, 0, 7, 4, 8, 6, 3, 9, 4];
    counts.forEach((n, i) => {
      const k = addDays(W, i);
      const picks = new Set<number>();
      for (let j = 0; picks.size < Math.min(n, pool.length); j++) picks.add((i * 7 + j * 5) % pool.length);
      for (const p of [...picks].sort((a, b) => a - b)) {
        const [en, es, pt, h, m, src] = pool[p];
        out.push(ev(src, L(en, es, pt), k, { at: [h, m], dur: 45 }));
      }
      if (n >= 7 && i % 3 === 0) {
        const [en, es, pt, src] = allDay[i % allDay.length];
        out.push(ev(src, L(en, es, pt), k));
      }
    });
  }

  // Sort: allDay first, then start
  out.sort((a, b) => (a.allDay === b.allDay ? sortKey(a).localeCompare(sortKey(b)) : a.allDay ? -1 : 1));
  // ?empty=1 → an empty week (to check the empty states)
  if (EMPTY) out.length = 0;
  return { generatedAt: new Date().toISOString(), hash: `mock-${T}${EMPTY ? '-empty' : ''}`, events: out, errors: [] };
}

function sortKey(e: CalEvent) {
  return e.allDay ? e.start : new Date(e.start).toISOString();
}

// ?wx=clear|rain|snow|drizzle|thunder (or any WMO code) forces the current weather, e.g. for screenshots
const DEMO_WX: Record<string, [number, string]> = {
  clear: [0, L('Clear sky', 'Despejado', 'Céu limpo')],
  rain: [63, L('Rain', 'Lluvia', 'Chuva')],
  snow: [73, L('Snow', 'Nieve', 'Neve')],
  drizzle: [53, L('Drizzle', 'Llovizna', 'Chuvisco')],
  thunder: [95, L('Thunderstorm', 'Tormenta', 'Trovoada')],
};

export function mockWeather(now = new Date(), wx?: string | null): WeatherResponse {
  const w = baseWeather(now);
  if (wx && DEMO_WX[wx]) {
    [w.current.code, w.current.description] = DEMO_WX[wx];
    if (wx === 'clear') w.current.isDay = true; // sun rays need daylight
  } else if (wx && Number.isFinite(Number(wx))) w.current.code = Number(wx);
  return w;
}

function baseWeather(now: Date): WeatherResponse {
  const T = dateKeyInTz(now, TZ);
  const p = zonedParts(now, TZ);
  const hourly = [];
  const codes = [2, 2, 1, 1, 3, 61, 61, 3];
  for (let i = 1; i <= 8; i++) {
    const h = (p.hour + i) % 24;
    const k = p.hour + i >= 24 ? addDays(T, 1) : T;
    hourly.push({
      time: isoAt(k, h, 0), temp: Math.round(21 - Math.abs(15 - (p.hour + i)) * 0.6), code: codes[i - 1],
      precipChance: codes[i - 1] === 61 ? 60 : 5 + i * 2, isDay: h >= 8 && h < 19,
    });
  }
  const daily = [
    { date: T, code: 2, min: 14, max: 22, precipChance: 10, windKmh: 14 },
    { date: addDays(T, 1), code: 61, min: 13, max: 19, precipChance: 70, windKmh: 22 },
    { date: addDays(T, 2), code: 80, min: 12, max: 18, precipChance: 55, windKmh: 25 },
    { date: addDays(T, 3), code: 1, min: 12, max: 21, precipChance: 5, windKmh: 10 },
    { date: addDays(T, 4), code: 0, min: 13, max: 23, precipChance: 0, windKmh: 8 },
    { date: addDays(T, 5), code: 3, min: 14, max: 20, precipChance: 20, windKmh: 12 },
    { date: addDays(T, 6), code: 95, min: 13, max: 18, precipChance: 80, windKmh: 30 },
  ];
  return {
    updatedAt: now.toISOString(),
    locationName: L('Lisbon, Portugal', 'Lisboa, Portugal', 'Lisboa, Portugal'),
    current: {
      temp: 19.4, feelsLike: 18.6, humidity: 68, windKmh: 14, windDir: 315, windDirLabel: L('NW', 'NO', 'NO'), code: 2,
      isDay: p.hour >= 8 && p.hour < 19, description: L('Partly cloudy', 'Parcialmente nublado', 'Parcialmente nublado'), pressure: 1017, uv: 4,
    },
    today: { sunrise: isoAt(T, 7, 39), sunset: isoAt(T, 19, 7), min: 14, max: 22, precipChance: 10 },
    daily, hourly, indoor: { temp: 22.3, humidity: 54 },
    source: {
      provider: 'open-meteo', name: 'Open-Meteo', model: null, modelName: null, url: 'https://open-meteo.com/',
      licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  };
}

export function mockNews(): NewsResponse {
  const items = DEMO_LANG === 'es' ? [
    ['La ciudad amplía la red de metro con cuatro nuevas estaciones', 'Las obras de la línea circular avanzan y se prevé abrir los nuevos tramos el próximo año.'],
    ['Delfines vuelven a avistarse en el estuario', 'Los biólogos registran un aumento de avistamientos este otoño; el turismo náutico celebra una temporada récord.'],
    ['Récord de producción de energía renovable', 'En septiembre, más del 80 % de la electricidad consumida procedió de fuentes eólicas, solares e hidroeléctricas.'],
    ['La fiesta de la vendimia cierra con 200.000 visitantes', 'Música, gastronomía y vino llenaron las calles del centro histórico durante cinco días.'],
    ['La biblioteca municipal abre también los domingos', 'El nuevo horario incluye talleres gratuitos para niños y un club de lectura en inglés.'],
    ['Previsión: llega la primera lluvia del otoño', 'Se esperan chubascos a partir del sábado, con un descenso notable de las temperaturas.'],
  ] : DEMO_LANG === 'pt' ? [
    ['Cidade alarga a rede de metro com quatro novas estações', 'As obras da linha circular avançam e os novos troços devem abrir no próximo ano.'],
    ['Golfinhos voltam a ser avistados no estuário', 'Os biólogos registam mais avistamentos este outono e os passeios de barco celebram uma temporada recorde.'],
    ['Renováveis batem recorde na produção de eletricidade', 'Em setembro, mais de 80 % da eletricidade consumida veio de fontes eólica, solar e hídrica.'],
    ['Festa das vindimas fecha com 200 mil visitantes', 'Música, gastronomia e vinho encheram as ruas do centro histórico durante cinco dias.'],
    ['Biblioteca municipal passa a abrir ao domingo', 'O novo horário inclui oficinas gratuitas para crianças e um clube de leitura em inglês.'],
    ['Previsão: chegam as primeiras chuvas do outono', 'Esperam-se aguaceiros a partir de sábado, com uma descida acentuada das temperaturas.'],
  ] : [
    ['City expands metro network with four new stations', 'Work on the circular line is on schedule and the new sections are expected to open next year.'],
    ['Dolphins spotted again in the estuary', 'Biologists report more sightings this autumn as boat-tour operators celebrate a record season.'],
    ['Renewables hit a new record share of electricity', 'More than 80% of the power consumed in September came from wind, solar and hydro.'],
    ['Harvest festival closes with 200,000 visitors', 'Music, food and wine filled the streets of the old town for five days.'],
    ['Public library now opens on Sundays', 'The new schedule includes free workshops for kids and an English-language book club.'],
    ['Forecast: first autumn rain on the way', 'Showers are expected from Saturday, with a noticeable drop in temperatures.'],
  ];
  // ?busy=1: a headline too long for one line (it slides once while it shows)
  if (BUSY) {
    items.unshift([
      L('Reclaiming the space: how a small studio brings human presence back to the offices of a city that works from home',
        'Recuperar el espacio: cómo un pequeño estudio devuelve la presencia humana a las oficinas de una ciudad que trabaja desde casa',
        'Recuperar o espaço: como um pequeno estúdio devolve a presença humana aos escritórios de uma cidade que trabalha a partir de casa'),
      L('Architects and neighbours talk about what the change means for the old town.',
        'Arquitectos y vecinos hablan de lo que el cambio supone para el casco antiguo.',
        'Arquitetos e vizinhos falam do que a mudança significa para o centro histórico.'),
    ]);
  }
  return {
    updatedAt: new Date().toISOString(),
    items: items.map(([title, summary], i) => ({
      id: `n${i}`, title, summary, source: L('Demo News', 'Noticias de ejemplo', 'Notícias de exemplo'), date: new Date(Date.now() - i * 3600e3).toISOString(),
    })),
  };
}

const PICSUM: [number, string][] = [
  [1015, 'Alexey Topolyanskiy'], [1018, 'Andrew Ridley'], [1036, 'Wolfgang Lutz'], [1043, 'Christian Joudrey'],
  [1044, 'Steve Carter'], [1016, 'Philippe Wuyts'], [1039, 'Andrew Coelho'], [1050, 'Joseph Barrientos'],
  [15, 'Paul Jarvis'], [29, 'Go Wild'], [28, 'Jerry Adney'], [10, 'Paul Jarvis'], [16, 'Paul Jarvis'], [17, 'Paul Jarvis'],
];

export function mockPhotos(): PhotosResponse {
  const list = PICSUM.map(([id, author]) => ({ url: `https://picsum.photos/id/${id}/1920/1080`, author, source: 'stock' as const }));
  return { photos: list };
}

/** Countdown chips for the demo (mirrors GET /api/countdowns). */
export function mockCountdowns(now = new Date()): CountdownsResponse {
  const T = dateKeyInTz(now, TZ);
  const year = +T.slice(0, 4);
  const xmas = `${year}-12-25` >= T ? `${year}-12-25` : `${year + 1}-12-25`;
  const items: CountdownItem[] = [
    { id: 'k_today', title: 'Elena', emoji: '🎂', color: '#f15bb5', date: T, days: 0, origin: 'birthday', age: 39 },
    { id: 'k_trip', title: L('Trip to Madeira', 'Viaje a Madeira', 'Viagem à Madeira'), emoji: '✈️', color: '#4c8dff', date: addDays(T, 12), days: 12, origin: 'manual' },
    { id: 'k_luis', title: L('Grandpa Luis', 'Abuelo Luis', 'Avô Luis'), emoji: '🎂', color: '#f15bb5', date: addDays(T, 9), days: 9, origin: 'birthday', age: 81 },
    { id: 'k_party', title: L('Halloween party', 'Fiesta de Halloween', 'Festa de Halloween'), emoji: '🎃', color: '#ff9f1c', date: addDays(T, 1), days: 1, origin: 'event' },
    { id: 'k_xmas', title: L('Christmas', 'Navidad', 'Natal'), emoji: '🎄', color: '#2ec4b6', date: xmas, days: 0, origin: 'manual' },
  ];
  items.sort((a, b) => a.date.localeCompare(b.date));
  if (EMPTY) items.length = 0;
  return { generatedAt: now.toISOString(), today: T, hash: `mock-cd-${T}`, items };
}

/** ?announce=1|info|success|warning|urgent|all → sample announcements (as delivered by SSE `announce`). */
export function mockAnnouncements(which: string): Announcement[] {
  // ?announce=compact → the same samples, sent 2 min ago (already settled into corner toasts)
  const ago = which === 'compact' ? 120_000 : 0;
  const mk = (i: number, style: AlertStyle, emoji: string, title: string, body: string, dur = 600): Announcement => ({
    id: `a_demo${i}`, title, body, emoji, style, durationSec: dur, sound: false, screenIds: [],
    createdAt: new Date(Date.now() - ago - (3 - i) * 1000).toISOString(),
    expiresAt: new Date(Date.now() - ago - (3 - i) * 1000 + dur * 1000).toISOString(), via: 'hook', by: 'token:Home Assistant',
  });
  const all: Record<string, Announcement> = {
    success: mk(1, 'success', '🧺', L('The washing machine is done', 'La lavadora ha terminado', 'A máquina de lavar terminou'), L('Time to hang the laundry', 'Ya se puede tender la ropa', 'Já se pode estender a roupa')),
    info: mk(2, 'info', '📦', L('A parcel has arrived', 'Ha llegado un paquete', 'Chegou uma encomenda'), L("It's in the mailbox by the door", 'Está en el buzón de la entrada', 'Está na caixa do correio')),
    warning: mk(3, 'warning', '🌧️', L('Rain in 20 minutes', 'Va a llover en 20 minutos', 'Vai chover em 20 minutos'), L('Bring the laundry in', 'Recoged la ropa del tendedero', 'Recolham a roupa do estendal')),
    urgent: mk(3, 'urgent', '🚨', L('Garage door is open', 'Puerta del garaje abierta', 'Portão da garagem aberto'), L('It has been open for more than 15 minutes', 'Lleva abierta más de 15 minutos', 'Está aberto há mais de 15 minutos')),
  };
  if (which === 'all' || which === 'compact') return [all.info, all.warning, all.success];
  return [all[which] ?? all.success];
}
