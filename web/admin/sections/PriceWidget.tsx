// The electricity price widget's settings (Widgets section, type 'prices'): zone (grouped by country, the sources
// it uses), view, unit and currency, what the household pays on top (surcharge before VAT, VAT), the test button and
// the optional ENTSO-E token. The screens get the prices from this server (server/prices.js).
import { useEffect, useState } from 'preact/hooks';
import type { PriceWidgetOptions, TestPricesResponse, WeatherKeyStatus, WidgetDef } from '../../shared/types';
import {
  DKK_PER_EUR, finalPrice, hourly, levelLimits, levelOf, localMidnight, MAX_SURCHARGE, MAX_VAT, MIN_SURCHARGE, PRICE_SOURCES, PRICE_ZONES, priceUnit,
  priceZone, slotAt, widgetCurrency, zoneForTimeZone, zoneSources,
} from '../../../server/core/pricesCore.js';
import { api, ApiError } from '../api';
import { toast } from '../components/feedback';
import { Icon } from '../components/icons';
import { Button, Field, NumberInput, Segmented, Select, TextInput } from '../components/ui';
import { locale, t } from '../i18n';
import { edition } from '../caps';

/** Options of a new price widget: the zone of the household's time zone. */
export const newPriceOptions = (tz: string): PriceWidgetOptions => ({
  zone: zoneForTimeZone(tz), view: 'auto', unit: 'main', currency: 'auto', surcharge: 0, vat: 0, windowHours: 3, resolution: 'hour',
});

const ERROR_TEXT: Record<string, string> = {
  invalid_zone: 'Elige una zona.',
  no_data: 'La fuente aún no tiene precios para hoy. Prueba en unos minutos.',
  no_source: 'Esta zona no tiene una fuente gratuita. Añade una clave de ENTSO-E en Más opciones.',
  rate_limited: 'La fuente pide esperar un poco entre consultas. Prueba en un minuto.',
  timeout: 'La fuente no respondió a tiempo.',
  fetch_failed: 'No se pudo conectar con la fuente de precios.',
  http_denied: 'La fuente rechazó la consulta. Revisa la clave de ENTSO-E.',
  http_error: 'La fuente respondió con un error.',
  bad_response: 'La fuente envió una respuesta que no se puede leer.',
  not_configured: 'Falta la clave de ENTSO-E.',
};

const VIEW_HINT: Record<string, string> = {
  auto: 'En una esquina pequeña o mediana, el precio de ahora. En una grande o en la columna lateral, también la gráfica. A pantalla completa, todo.',
  chart: 'Barras de hoy desde las 00:00, de barato a caro, con la hora actual marcada. Mañana se añade cuando se publica, hacia las 13:00.',
  now: 'El precio de ahora en grande, si es barato, normal o caro, y hacia dónde va la próxima hora.',
  cheap: 'Las franjas más baratas que quedan por delante, por ejemplo de 02:00 a 05:00.',
};

/** A surcharge per kWh from one currency to another (the krone is pegged to the euro), within the allowed range. */
export function convertSurcharge(v: number, from: string, to: string): number {
  if (from === to || !v) return v;
  const x = from === 'DKK' && to === 'EUR' ? v / DKK_PER_EUR : from === 'EUR' && to === 'DKK' ? v * DKK_PER_EUR : v;
  // euros to 4 decimals, kroner to 3: switching back and forth gives the number typed
  const f = to === 'EUR' ? 10000 : 1000;
  return Math.min(MAX_SURCHARGE, Math.max(MIN_SURCHARGE, Math.round(x * f) / f));
}

/** Country name in the panel's language. */
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames([locale()], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Zone choices grouped by country, countries in alphabetical order. */
function zoneOptions() {
  const rows: { value: string; label: string; group: string }[] = [];
  for (const z of PRICE_ZONES) {
    for (const c of z.countries) {
      const country = countryName(c);
      const label = z.id === 'ES-PVPC'
        ? t('PVPC (tarifa regulada)')
        : z.id === 'ES' ? t('Mercado mayorista') : z.area ? `${z.id} · ${z.area}` : `${country} (${z.id})`;
      rows.push({ value: `${z.id}`, label, group: country });
    }
  }
  const coll = new Intl.Collator(locale());
  return rows.sort((a, b) => coll.compare(a.group, b.group) || coll.compare(a.label, b.label));
}

function PriceTest({ o, res }: { o: PriceWidgetOptions; res: TestPricesResponse }) {
  if (!res.ok) {
    return (
      <div class="test-result is-err">
        <span>
          <Icon name="alert" size={14} /> {t(ERROR_TEXT[res.error] ?? 'No se pudo consultar el precio.')}
        </span>
      </div>
    );
  }
  const now = Date.now();
  const currency = widgetCurrency(res.zone, o.currency) === 'EUR' ? 'EUR' : res.currency;
  const unit = priceUnit(currency, o.unit);
  const fmt = new Intl.NumberFormat(locale(), { minimumFractionDigits: unit.decimals, maximumFractionDigits: unit.decimals });
  const slots = res.slots.map(([ts, m, eur, loc]) => ({ t: ts * 1000, m, eur, loc }));
  const perMwh = (s: { eur: number; loc?: number }) => (currency !== 'EUR' && s.loc != null ? s.loc : s.eur);
  const cur = slotAt(slots, now);
  const priced = slots.map((s) => ({ t: s.t, m: s.m, p: finalPrice(perMwh(s), o) * unit.factor }));
  const hours = hourly(priced);
  const tz = priceZone(res.zone)?.tz ?? 'Europe/Brussels';
  const hour = slotAt(hours, now);
  const today = hours.filter((h) => h.t >= localMidnight(now, tz) && h.t < localMidnight(now, tz, 1)).map((h) => h.p);
  const lvl = hour ? levelOf(hour.p, levelLimits(today)) : 'mid';
  const tomorrow = slots.some((s) => s.t >= localMidnight(now, tz, 1) + 12 * 3600_000);
  const market = cur ? (perMwh(cur) / 1000) * unit.factor : null;
  const quarter = slots.length > 1 && slots[1].t - slots[0].t === 15 * 60_000;
  return (
    <div class="widget-test">
      <div class={`test-result ${res.stale ? 'is-warn' : 'is-ok'}`}>
        <span>
          <Icon name={res.stale ? 'alert' : 'check'} size={14} />{' '}
          {hour ? (
            <>
              {t('Ahora')}: <strong>{fmt.format(hour.p)} {unit.label}</strong> ({t(lvl === 'cheap' ? 'barato' : lvl === 'high' ? 'caro' : 'normal')})
            </>
          ) : (
            t('Sin precio para esta hora.')
          )}
          {' · '}
          {t('Fuente')}: {PRICE_SOURCES[res.source ?? '']?.name ?? res.credit}
        </span>
      </div>
      <p class="muted small">
        {market !== null && (
          <>
            {t('Mercado {p}', { p: `${fmt.format(market)} ${unit.label}` })}
            {o.surcharge ? ` + ${t('recargo {p}', { p: fmt.format(o.surcharge * unit.factor) })}` : ''}
            {o.vat ? ` + ${t('IVA {n} %', { n: o.vat })}` : ''}
            {'. '}
          </>
        )}
        {quarter ? t('Precios cada 15 minutos; la pantalla muestra la media de cada hora.') + ' ' : ''}
        {tomorrow ? t('Los de mañana ya están publicados.') : t('Los de mañana aún no están publicados.')}
        {res.converted ? ` ${t('Convertido de euros: esta fuente no da coronas.')}` : ''}
        {res.stale ? ` ${t('Son los últimos precios guardados: la fuente no responde.')}` : ''}
      </p>
    </div>
  );
}

/** ENTSO-E token: write-only, like the weather key. */
function EntsoeToken({ st, setSt }: { st: WeatherKeyStatus | null; setSt: (s: WeatherKeyStatus) => void }) {
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (v: string) => {
    setSaving(true);
    try {
      setSt(await api.setPricesToken(v));
      setEdit(false);
      setValue('');
      toast(v ? t('Clave guardada') : t('Clave quitada'));
    } catch (e) {
      toast((e as ApiError).status === 400 ? t('ENTSO-E no acepta esta clave. Cópiala de nuevo desde tu cuenta.') : t('No se pudo guardar la clave.'), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Field
      label={t('Clave de ENTSO-E (opcional)')}
      hint={
        <>
          {t('Para zonas sin fuente gratuita, o como respaldo. Pídela gratis en')}{' '}
          <a href="https://transparency.entsoe.eu/" target="_blank" rel="noopener noreferrer">
            transparency.entsoe.eu
          </a>
          . {t('Se guarda solo en el servidor y nunca se vuelve a mostrar.')}
        </>
      }
    >
      {st?.set && !edit ? (
        <div class="search-row">
          <span class="wx-key-saved">
            <Icon name="check" size={14} /> {t('Clave guardada')} <span class="mono muted">…{st.hint}</span>
          </span>
          <Button onClick={() => setEdit(true)}>{t('Cambiar')}</Button>
          <Button variant="danger" loading={saving} onClick={() => save('')}>
            {t('Quitar')}
          </Button>
        </div>
      ) : (
        <form
          class="search-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) void save(value.trim());
          }}
        >
          <TextInput mono value={value} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" onValue={setValue} />
          <Button type="submit" loading={saving} disabled={!value.trim()}>
            {t('Guardar')}
          </Button>
        </form>
      )}
    </Field>
  );
}

/** `part`: the main settings, or what "Más opciones" opens (chart bars, ENTSO-E token). */
export function PriceWidgetFields({ w, errors, upd, part }: {
  w: WidgetDef; errors: Record<string, string>; upd: (fn: (x: WidgetDef) => void) => void; part: 'main' | 'more';
}) {
  const o = w.options.prices!;
  const set = (fn: (p: PriceWidgetOptions) => void) => upd((x) => {
    if (x.options.prices) fn(x.options.prices);
  });
  /** A zone or currency change that changes the currency shown: the surcharge keeps its value in the new currency. */
  const setMoney = (fn: (p: PriceWidgetOptions) => void) => {
    const before = widgetCurrency(o.zone, o.currency);
    const next = { ...o };
    fn(next);
    const after = widgetCurrency(next.zone, next.currency);
    set((p) => {
      fn(p);
      p.surcharge = convertSurcharge(p.surcharge, before, after);
    });
    if (after !== before && o.surcharge) toast(t('El recargo se ha pasado a {u} con el cambio de moneda.', { u: priceUnit(after, 'main').label }));
  };
  const [test, setTest] = useState<{ loading: boolean; zone?: string; res?: TestPricesResponse }>({ loading: false });
  const [token, setToken] = useState<WeatherKeyStatus | null>(null);
  useEffect(() => {
    api.pricesToken().then(setToken).catch(() => setToken(null));
  }, []);
  const tokenSet = !!token?.set;
  const zone = priceZone(o.zone);
  const currency = widgetCurrency(o.zone, o.currency);
  const unitMain = priceUnit(currency, 'main');
  const unitSub = priceUnit(currency, 'sub');
  // Marco Cloud serves many households: the zones published for private use only are not offered there
  const sources = zone ? zoneSources(zone, { privateUse: edition() !== 'cloud', token: tokenSet }) : [];
  const run = async () => {
    setTest({ loading: true, zone: o.zone });
    try {
      setTest({ loading: false, zone: o.zone, res: await api.testPrices(o.zone) });
    } catch (e) {
      setTest({ loading: false, zone: o.zone, res: { ok: false, error: (e as ApiError).message } });
    }
  };
  const res = test.zone === o.zone ? test.res : undefined;
  const err = (k: string) => (errors[`wdg.${w.id}.${k}`] ? t(errors[`wdg.${w.id}.${k}`]) : undefined);
  if (part === 'more') {
    return (
      <div class="stack">
        <Field label={t('Barras de la gráfica')} hint={t('Muchas zonas publican un precio cada 15 minutos. Por hora se ve más claro desde lejos.')}>
          <Segmented
            value={o.resolution}
            options={[
              { value: 'hour', label: t('Por hora') },
              { value: 'quarter', label: t('Cada 15 minutos') },
            ]}
            onChange={(v) => set((p) => void (p.resolution = v))}
          />
        </Field>
        <EntsoeToken st={token} setSt={setToken} />
      </div>
    );
  }
  return (
    <>
      <Field
        label={t('Zona')}
        error={err('zone')}
        hint={
          sources.length
            ? `${t('Fuente: {a}.', { a: PRICE_SOURCES[sources[0]].name })}${sources.length > 1 ? ` ${t('Si falla: {b}.', { b: sources.slice(1).map((s) => PRICE_SOURCES[s].name).join(', ') })}` : ''}`
            : t('Esta zona no tiene una fuente gratuita. Añade una clave de ENTSO-E en Más opciones.')
        }
      >
        <div class="search-row">
          <Select value={o.zone} options={zoneOptions()} onChange={(v) => setMoney((p) => void (p.zone = v))} error={!!err('zone')} />
          <Button size="sm" icon="play" disabled={!zone} loading={test.loading} onClick={run}>
            {t('Probar')}
          </Button>
        </div>
      </Field>
      {res && <PriceTest o={o} res={res} />}
      <Field label={t('Vista')} hint={t(VIEW_HINT[o.view])}>
        <Segmented
          full
          value={o.view}
          options={[
            { value: 'auto', label: t('Automática') },
            { value: 'chart', label: t('Gráfica 24 h') },
            { value: 'now', label: t('Precio ahora') },
            { value: 'cheap', label: t('Franjas baratas') },
          ]}
          onChange={(v) => set((p) => void (p.view = v))}
        />
      </Field>
      <div class="grid grid--2">
        <Field label={t('Recargo fijo por kWh')} error={err('surcharge')} hint={t('Peajes, impuestos y el margen de tu compañía, sin IVA. Déjalo en 0 para ver el precio del mercado.')}>
          <NumberInput value={o.surcharge} min={MIN_SURCHARGE} max={MAX_SURCHARGE} step={0.01} suffix={unitMain.label} error={!!err('surcharge')} onValue={(v) => set((p) => void (p.surcharge = v))} />
        </Field>
        <Field label={t('IVA')} error={err('vat')} hint={t('Se aplica al precio con el recargo.')}>
          <NumberInput value={o.vat} min={0} max={MAX_VAT} step={1} suffix="%" error={!!err('vat')} onValue={(v) => set((p) => void (p.vat = v))} />
        </Field>
      </div>
      <div class="grid grid--2">
        <Field label={t('Unidad')}>
          <Segmented
            full
            value={o.unit}
            options={[
              { value: 'main', label: unitMain.label },
              { value: 'sub', label: unitSub.label },
            ]}
            onChange={(v) => set((p) => void (p.unit = v))}
          />
        </Field>
        <Field label={t('Franjas baratas de')}>
          <Select
            value={o.windowHours}
            options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: t('{n} h', { n }) }))}
            onChange={(v) => set((p) => void (p.windowHours = v))}
          />
        </Field>
      </div>
      {zone?.currency !== 'EUR' && zone && (
        <Field label={t('Moneda')}>
          <Segmented
            value={o.currency}
            options={[
              { value: 'auto', label: t('Coronas danesas (DKK)') },
              { value: 'EUR', label: t('Euros') },
            ]}
            onChange={(v) => setMoney((p) => void (p.currency = v))}
          />
        </Field>
      )}
    </>
  );
}
