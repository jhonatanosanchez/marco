// Default icon rules (server/core/iconRules.js, also read by server/core/defaults.js) + client-side resolver
// (used by the mock dataset and the admin preview).
import type { IconRule, SourceKind } from './types';
import RULES from '../../server/core/iconRules.js';
import { findKeyword } from '../../server/lib/keywords.js';

export const DEFAULT_ICON_RULES: IconRule[] = RULES.map((r) => ({
  id: r.id, match: r.match, emoji: r.emoji, color: null,
}));

export const KIND_EMOJI: Record<SourceKind, string | null> = {
  generic: null,
  airbnb: '🏠',
  birthdays: '🎂',
  holidays: '🎉',
};

/** First matching rule on title + description, the server's rule (short keywords match whole words only). */
export function matchIconRule(rules: IconRule[], title: string, description = ''): IconRule | null {
  return findKeyword(rules, `${title} ${description}`)?.rule ?? null;
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
