// Tarjetas de Entreno (fork fsrhome): reglas puras sobre running-coach y garmin-stats, portadas de echo-reloj
// (html/js/running.js). Spec: homelab-docs/specs/2026-10-13-marco-tarjetas-entreno-design.md

export const CARD_PREFIX = 'k_';
export const CARD_ID_RE = /^k_[a-z0-9]{1,40}$/;
export const CARD_TYPES = ['training'];
/** 'coach': plan del coach + Garmin; 'garmin': solo Garmin (sin plan) */
export const TRAINING_SOURCES = ['coach', 'garmin'];
export const MAX_CARDS = 12;
export const TRAINING_DEFAULTS = Object.freeze({ garminUrl: 'http://garmin-stats:4400', coachUrl: 'http://running-coach:4300' });
