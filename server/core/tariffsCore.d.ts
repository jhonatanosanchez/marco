// Types for the parts of tariffsCore.js the browser uses (display 'prices' widget, admin Widgets).
import type { PriceBands, PriceWidgetOptions } from '../../web/shared/types';

export interface GridCompany { id: string; name: string; zone: string; gln: string; codes: string[] }
export interface PriceParts { market: number; grid: number; net: number; tax: number; band: number; extra: number; vat: number; total: number }
export interface TariffAdd { add: number; band: number; grid: number; net: number; tax: number; est: boolean }

export const DATAHUB_CREDIT: string;
export const DK_GRID_COMPANIES: GridCompany[];
export const GRID_IDS: string[];
export const GRID_ZONES: string[];
export const TARIFF_MODES: readonly string[];
export const BANDS_EXCLUDED_ZONES: string[];
export const MAX_BANDS: number;
export const MAX_BAND_PRICE: number;
export const MIN_BAND_PRICE: number;
export const BAND_NAME_MAX: number;
export const HOLIDAY_SETS: readonly string[];
export const ES_NATIONAL_HOLIDAYS: string[];
export const BAND_PRESETS: Record<string, { names: string[]; weekday: number[]; weekend: number[] | null; holidays: string }>;
export const BAND_PRESET_IDS: string[];
export function gridCompany(id: string): GridCompany | null;
export function datahubRequests(company: string | GridCompany, now: number): { company: { code: string; url: string }[]; energinet: { url: string } };
/** A DatahubPricelist tariff record (naive Danish wall-clock ms; `to` Infinity when open-ended). */
export interface TariffRecord { gln: string; code: string; from: number; to: number; daily: boolean; prices: number[]; unknown?: boolean }
/** One hour of a company's tariffs, DKK/kWh before VAT; null parts are unknown that hour. */
export interface GridHour { t: number; grid: number | null; net: number | null; tax: number | null; est: boolean }
export const DATAHUB_TZ: string;
export const ENERGINET_GLN: string;
export const ENERGINET_CODES: { transmission: string; system: string; tax: string };
export const CARRY_FORWARD_MS: number;
export class TariffParseError extends Error { code: string }
export function parseDatahub(body: unknown): TariffRecord[];
export function chargeAt(records: TariffRecord[], gln: string, code: string, at: number): { value: number; estimated: boolean } | null;
export function gridHours(company: string | GridCompany, companyRecords: TariffRecord[], energinetRecords: TariffRecord[], from: number, to: number): GridHour[];
export function tariffMode(o: Partial<PriceWidgetOptions> | null | undefined): 'none' | 'grid' | 'bands';
export function emptyBands(): PriceBands;
export function presetBands(id: string, prev?: PriceBands | null): PriceBands;
export function isHoliday(set: string, mo: number, d: number): boolean;
export function bandIndexAt(bands: PriceBands, ms: number, tz: string): number;
export function bandPriceAt(bands: PriceBands, ms: number, tz: string): number;
export function priceParts(market: number, o?: { grid?: number; net?: number; tax?: number; band?: number; extra?: number; vat?: number }): PriceParts;
export function tariffAdder(
  o: PriceWidgetOptions,
  opts: { gridList?: [number, number, number, number, number][] | null; tz: string; currency?: string; dkkPerEur?: number },
): ((t: number) => TariffAdd | null) | null;
