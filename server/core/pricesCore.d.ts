// Types for the parts of pricesCore.js the browser uses (display 'prices' widget, admin Widgets).
export interface PriceSourceInfo { name: string; credit: string; url: string; token?: boolean }
export interface PriceZone {
  id: string;
  countries: string[];
  area: string;
  tz: string;
  eic: string;
  currency: string;
  ec?: string;
  ecOpen?: boolean;
  eds?: string;
  elering?: string;
  awattar?: string;
  omie?: string;
  ree?: string;
  spothinta?: string;
}
export interface Slot { t: number; m: number; eur: number; loc?: number }
export interface PricedSlot { t: number; m: number; p: number }
export interface CheapWindow { t: number; end: number; p: number }
export interface LevelLimits { low: number; high: number }

export const PRICE_SOURCES: Record<string, PriceSourceInfo>;
export const PRICE_ZONES: PriceZone[];
export const PRICE_ZONE_IDS: string[];
export const PRICE_VIEWS: readonly string[];
export const PRICE_UNITS: readonly string[];
export const PRICE_RESOLUTIONS: readonly string[];
export const MAX_VAT: number;
export const MIN_SURCHARGE: number;
export const MAX_SURCHARGE: number;
export const DKK_PER_EUR: number;
export function priceZone(id: string): PriceZone | null;
export function zoneForTimeZone(tz: string): string;
export function zoneSources(zone: string | PriceZone, opts?: { privateUse?: boolean; token?: boolean }): string[];
export function wallClock(ms: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number; s: number };
export function tzOffset(ms: number, tz: string): number;
export function localMidnight(ms: number, tz: string, days?: number): number;
export function localTime(ms: number, tz: string, hh: number, mm: number, days?: number): number;
export function localDay(ms: number, tz: string): string;
export function localHM(ms: number, tz: string): string;
export function finalPrice(perMwh: number, opts?: { surcharge?: number; vat?: number }): number;
export function widgetCurrency(zone: string | PriceZone, opt?: string): string;
export function pricedSlots(slots: Slot[], opts?: { currency?: string; surcharge?: number; vat?: number; add?: ((t: number) => { add: number } | null) | null }): PricedSlot[];
export function hourly(slots: PricedSlot[]): PricedSlot[];
export function slotAt<T extends { t: number; m: number }>(slots: T[], now: number): T | null;
export function levelLimits(prices: number[]): LevelLimits;
export function levelOf(p: number, limits: LevelLimits): 'cheap' | 'mid' | 'high';
export function cheapestWindows(hourSlots: PricedSlot[], now: number, hours?: number, count?: number): CheapWindow[];
export function trend(a: number, b: number): 'up' | 'down' | 'flat';
export function priceUnit(currency: string, unit?: string): { label: string; factor: number; decimals: number };

// Server side (self-hosted server/prices.js and Marco Cloud): one refresh round with the caller's own network.
export interface PriceRequest { url: string; optional?: boolean; secret?: boolean; day?: string }
export interface PriceEntry {
  slots: Slot[];
  source: string | null;
  converted: boolean;
  fetchedAt: number;
  nextAt: number;
  fails: number;
  error: string | null;
}
export type PriceCall = (source: string, req: PriceRequest) => Promise<{ status: number; text: string }>;
export interface PricesAnswer {
  zone: string;
  currency: string;
  converted: boolean;
  source: string | null;
  credit: string;
  fetchedAt: string;
  stale: boolean;
  error: string | null;
  slots: number[][];
}
export class PricesError extends Error {
  code: string;
  constructor(code: string, message?: string);
}
export class PriceParseError extends Error {
  code: string;
}
export const STALE_AFTER_MS: number;
export const ENTSOE_TOKEN_RE: RegExp;
export function fetchWindow(zone: string | PriceZone, now: number): { from: number; to: number; tz: string };
export function sourceRequests(source: string, zone: string | PriceZone, win: { from: number; to: number }, opts?: { token?: string }): PriceRequest[];
export function parseSource(source: string, body: string, zone: string | PriceZone): Slot[];
export function nextRefreshAt(slots: Slot[], zone: string | PriceZone, now: number): number;
export function failureBackoff(n: number): number;
export function retryAfterMs(v: string | null | undefined, now?: number): number | null;
export function fromSource(source: string, zone: PriceZone, now: number, opts: { call: PriceCall; token?: string }): Promise<Slot[]>;
export function refreshZone(
  zoneId: string,
  prev: PriceEntry | null | undefined,
  opts: { now: number; call: PriceCall; token?: string; privateUse?: boolean; log?: (m: string) => void },
): Promise<PriceEntry>;
export function refreshDue(e: PriceEntry | null | undefined, now: number, force?: boolean): boolean;
export function pricesResponse(zoneId: string, e: PriceEntry | null | undefined, now: number): PricesAnswer;
export function entsoeTokenStatus(token: string | null | undefined): { set: boolean; hint: string };
export function checkEntsoeToken(token: string, opts: { now: number; call: PriceCall }): Promise<boolean | null>;
