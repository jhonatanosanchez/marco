// Default icon rules (same list as server/defaults.js) + client-side resolver (used by the mock dataset and the admin preview).
import type { IconRule, SourceKind } from './types';

export const DEFAULT_ICON_RULES: IconRule[] = [
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

export const KIND_EMOJI: Record<SourceKind, string | null> = {
  generic: null,
  airbnb: '🏠',
  birthdays: '🎂',
  holidays: '🎉',
};

/** Lowercase + strip diacritics. */
export function normalizeText(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** First matching rule (case/accent-insensitive substring on title + description). */
export function matchIconRule(rules: IconRule[], title: string, description = ''): IconRule | null {
  const hay = normalizeText(`${title} ${description}`);
  for (const r of rules) {
    for (const m of r.match || []) {
      const n = normalizeText(m).trim();
      if (n && hay.includes(n)) return r;
    }
  }
  return null;
}

/** Emoji priority: iconRule > source.emoji > kind default > none. Color: iconRule.color > source.color. */
export function resolveEventStyle(
  rules: IconRule[],
  ev: { title: string; description?: string | null },
  source: { emoji?: string | null; color: string; kind: SourceKind },
): { emoji: string | null; color: string } {
  const r = matchIconRule(rules, ev.title, ev.description || '');
  return {
    emoji: r?.emoji || source.emoji || KIND_EMOJI[source.kind] || null,
    color: r?.color || source.color,
  };
}

/** A palette of pleasant event colours (used by the admin colour picker presets). */
export const EVENT_COLORS = [
  '#ff5a4e', '#ff9f1c', '#ffd23f', '#2ec4b6', '#3a86ff', '#8338ec',
  '#ff006e', '#06d6a0', '#4cc9f0', '#f15bb5', '#9b5de5', '#a7c957',
];
