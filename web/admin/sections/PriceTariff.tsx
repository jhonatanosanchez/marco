// What a price widget adds to the market price per hour (server/tariffsCore.js): a Danish grid company's tariffs
// (picked from a searchable list, only for DK1 and DK2) or time bands typed by the household (Spain 2.0TD as a
// one-tap preset that fills the hours, the prices left to edit). PVPC already includes the tolls: no bands there.
import { useState } from 'preact/hooks';
import type { PriceBands, PriceWidgetOptions } from '../../shared/types';
import {
  BANDS_EXCLUDED_ZONES, DK_GRID_COMPANIES, emptyBands, GRID_ZONES, gridCompany, MAX_BAND_PRICE, MAX_BANDS, MIN_BAND_PRICE, presetBands,
} from '../../../server/core/tariffsCore.js';
import { priceUnit, widgetCurrency } from '../../../server/core/pricesCore.js';
import { toast } from '../components/feedback';
import { Icon } from '../components/icons';
import { Button, Field, NumberInput, SearchInput, Segmented, Select, TextInput, ToggleRow } from '../components/ui';
import { locale, t } from '../i18n';

/**
 * Band colours in the editor: orange, yellow, blue and dark slate, apart in lightness too. Colour is never the only
 * cue: every hour also carries its band's mark (bandMarks).
 */
export const BAND_COLORS = ['#f0761f', '#e9b308', '#2f8fe8', '#475569'];
/** Text on each band colour (dark on the yellow). */
export const BAND_INK = ['#fff', '#1c1c1e', '#fff', '#fff'];

/** A short mark per band: the names' initials when they differ (P, L, V), the band numbers otherwise. */
export function bandMarks(names: string[]): string[] {
  const ini = names.map((n) => n.trim().charAt(0).toLocaleUpperCase());
  return ini.every((c) => c) && new Set(ini).size === ini.length ? ini : names.map((_, i) => String(i + 1));
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[øØ]/g, 'o').replace(/[æÆ]/g, 'ae').toLowerCase();

/** The grid company list: a search box and the companies of the zone first, the other Danish zone after. */
function GridPicker({ o, onPick, error }: { o: PriceWidgetOptions; onPick: (id: string) => void; error?: string }) {
  const [q, setQ] = useState('');
  const coll = new Intl.Collator(locale());
  const match = (n: string) => !q.trim() || fold(n).includes(fold(q.trim()));
  const groups = [o.zone, ...GRID_ZONES.filter((z) => z !== o.zone)].map((z) => ({
    zone: z,
    list: DK_GRID_COMPANIES.filter((c) => c.zone === z && match(c.name)).sort((a, b) => coll.compare(a.name, b.name)),
  }));
  const none = groups.every((g) => !g.list.length);
  return (
    <div class={`grid-picker ${error ? 'is-invalid' : ''}`}>
      <SearchInput value={q} onValue={setQ} placeholder={t('Buscar compañía')} />
      <div class="grid-picker__list" role="radiogroup" aria-label={t('Compañía de red')}>
        {groups.map((g) =>
          g.list.length ? (
            <div class="grid-picker__group" key={g.zone}>
              <div class="grid-picker__head">{g.zone === o.zone ? t('En tu zona ({z})', { z: g.zone }) : t('Zona {z}', { z: g.zone })}</div>
              {g.list.map((c) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={o.grid === c.id}
                  class={`grid-picker__item ${o.grid === c.id ? 'is-on' : ''}`}
                  onClick={() => onPick(c.id)}
                >
                  <span class="grid-picker__dot" aria-hidden="true" />
                  <span class="grid-picker__name">{c.name}</span>
                  {g.zone !== o.zone && <span class="muted small">{c.zone}</span>}
                </button>
              ))}
            </div>
          ) : null,
        )}
        {none && <p class="muted small grid-picker__none">{t('Ninguna compañía con ese nombre.')}</p>}
      </div>
    </div>
  );
}

/** Hours of one band as "10-14, 18-22". */
export function bandRanges(hours: number[], i: number): string {
  const out: string[] = [];
  let start = -1;
  for (let h = 0; h <= 24; h++) {
    const on = h < 24 && hours[h] === i;
    if (on && start < 0) start = h;
    if (!on && start >= 0) {
      out.push(`${start}-${h}`);
      start = -1;
    }
  }
  return out.join(', ');
}

/** 24 hour cells; a tap moves the hour to the next band. */
function HourStrip({ label, hours, n, names, onChange }: { label: string; hours: number[]; n: number; names: string[]; onChange: (h: number[]) => void }) {
  const marks = bandMarks(names);
  return (
    <div class="band-strip">
      <div class="band-strip__label">{label}</div>
      <div class="band-strip__cells" role="group" aria-label={label}>
        {hours.map((b, h) => (
          <button
            type="button"
            class="band-cell"
            style={{ '--band': BAND_COLORS[b], '--band-ink': BAND_INK[b] } as any}
            title={`${String(h).padStart(2, '0')}:00 · ${names[b]}`}
            aria-label={`${String(h).padStart(2, '0')}:00, ${names[b]}`}
            onClick={() => {
              const next = [...hours];
              next[h] = (b + 1) % n;
              onChange(next);
            }}
          >
            <span>{h}</span>
            <small aria-hidden="true">{marks[b]}</small>
          </button>
        ))}
      </div>
      <div class="band-strip__sum muted small">
        {names.map((name, i) => {
          const r = bandRanges(hours, i);
          return r ? (
            <span key={i}>
              <i class="band-dot" style={{ background: BAND_COLORS[i], color: BAND_INK[i] }} aria-hidden="true">
                {marks[i]}
              </i>
              {name} {r}
            </span>
          ) : null;
        })}
      </div>
    </div>
  );
}

function BandsEditor({ o, set, err }: { o: PriceWidgetOptions; set: (fn: (p: PriceWidgetOptions) => void) => void; err: (k: string) => string | undefined }) {
  const b = o.bands ?? emptyBands();
  const unit = priceUnit(widgetCurrency(o.zone, o.currency), 'main');
  const names = b.list.map((x, i) => x.name.trim() || t('Tramo {n}', { n: i + 1 }));
  const marks = bandMarks(names);
  const setB = (fn: (x: PriceBands) => void) => set((p) => {
    p.bands ??= emptyBands();
    fn(p.bands);
  });
  return (
    <div class="bands">
      <Field label={t('Partir de')} hint={t('Rellena las horas; los precios los pones tú, como vienen en tu factura (sin IVA).')}>
        <div class="search-row bands__presets">
          <Button size="sm" variant={b.preset === 'es-20td' ? 'primary' : undefined} onClick={() => setB((x) => Object.assign(x, presetBands('es-20td', x)))}>
            {t('España 2.0TD')}
          </Button>
          <Button size="sm" variant={b.preset === 'es-20td-cm' ? 'primary' : undefined} onClick={() => setB((x) => Object.assign(x, presetBands('es-20td-cm', x)))}>
            {t('Ceuta y Melilla 2.0TD')}
          </Button>
          <Button size="sm" onClick={() => setB((x) => Object.assign(x, emptyBands()))}>
            {t('Vacío')}
          </Button>
        </div>
      </Field>
      <div class="bands__list">
        {b.list.map((x, i) => (
          <div class="band-row" key={i}>
            <span class="band-row__swatch" style={{ background: BAND_COLORS[i], color: BAND_INK[i] }} aria-hidden="true">
              {marks[i]}
            </span>
            <TextInput value={x.name} maxLength={24} placeholder={t('Tramo {n}', { n: i + 1 })} onValue={(v) => setB((y) => void (y.list[i].name = v))} />
            <NumberInput
              value={x.price}
              min={MIN_BAND_PRICE}
              max={MAX_BAND_PRICE}
              step={0.001}
              suffix={unit.label}
              error={!!err(`bands.${i}.price`)}
              onValue={(v) => setB((y) => void (y.list[i].price = v))}
            />
            <button
              type="button"
              class="icon-btn icon-btn--danger"
              disabled={b.list.length <= 1}
              aria-label={t('Quitar tramo')}
              onClick={() => setB((y) => {
                y.list.splice(i, 1);
                // hours of the removed band go to the first one, the later ones move down
                const fix = (hs: number[]) => hs.map((h) => (h === i ? 0 : h > i ? h - 1 : h));
                y.weekday = fix(y.weekday);
                if (y.weekend) y.weekend = fix(y.weekend);
                y.preset = '';
              })}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
        {b.list.length < MAX_BANDS && (
          <div>
            <Button size="sm" icon="plus" onClick={() => setB((y) => void y.list.push({ name: '', price: 0 }))}>
              {t('Añadir tramo')}
            </Button>
          </div>
        )}
      </div>
      <p class="muted small">{t('Toca una hora para pasarla al tramo siguiente.')}</p>
      <HourStrip
        label={b.weekend ? t('De lunes a viernes') : t('Todos los días')}
        hours={b.weekday}
        n={b.list.length}
        names={names}
        onChange={(h) => setB((y) => void ((y.weekday = h), (y.preset = '')))}
      />
      <ToggleRow
        label={t('Otras horas los fines de semana')}
        hint={t('Por ejemplo, todo el día en el tramo más barato.')}
        checked={!!b.weekend}
        onChange={(v) => setB((y) => void ((y.weekend = v ? new Array(24).fill(b.list.length - 1) : null), (y.preset = '')))}
      />
      {b.weekend && (
        <>
          <HourStrip
            label={b.holidays === 'none' ? t('Sábados y domingos') : t('Sábados, domingos y festivos')}
            hours={b.weekend}
            n={b.list.length}
            names={names}
            onChange={(h) => setB((y) => void ((y.weekend = h), (y.preset = '')))}
          />
          <Field label={t('Festivos')} hint={b.holidays === 'ES' ? t('1 y 6 de enero, 1 de mayo, 15 de agosto, 12 de octubre, 1 de noviembre, 6, 8 y 25 de diciembre. No cuentan los autonómicos ni los locales.') : undefined}>
            <Select
              value={b.holidays}
              options={[
                { value: 'none', label: t('Ninguno') },
                { value: 'ES', label: t('Festivos nacionales de España') },
              ]}
              onChange={(v) => setB((y) => void (y.holidays = v))}
            />
          </Field>
        </>
      )}
      {err('bands') && <p class="field__error">{t(err('bands')!)}</p>}
    </div>
  );
}

/** The tariff part of the price widget's settings. */
export function PriceTariffFields({ o, set, err }: { o: PriceWidgetOptions; set: (fn: (p: PriceWidgetOptions) => void) => void; err: (k: string) => string | undefined }) {
  const dk = GRID_ZONES.includes(o.zone);
  const noBands = BANDS_EXCLUDED_ZONES.includes(o.zone);
  const tariff = o.tariff ?? 'none';
  const company = o.grid ? gridCompany(o.grid) : null;
  const pick = (id: string) => {
    const c = gridCompany(id);
    if (!c) return;
    set((p) => {
      p.grid = id;
      p.tariff = 'grid';
      // a company of the other zone: its zone is the household's
      if (c.zone !== p.zone) p.zone = c.zone;
      if (!p.vat) p.vat = 25;
    });
    if (c.zone !== o.zone) toast(t('Zona cambiada a {z}, la de {c}.', { z: c.zone, c: c.name }));
    else if (!o.vat) toast(t('IVA puesto en 25 %, el de Dinamarca.'));
  };
  const choose = (v: 'none' | 'grid' | 'bands') => set((p) => {
    p.tariff = v;
    if (v === 'bands') p.bands ??= emptyBands();
  });
  const options = [
    { value: 'none' as const, label: t('Ninguna') },
    ...(dk ? [{ value: 'grid' as const, label: t('Compañía de red') }] : []),
    { value: 'bands' as const, label: t('Tramos horarios'), off: noBands, title: noBands ? t('El PVPC ya incluye los peajes.') : undefined },
  ];
  return (
    <>
      <Field
        label={t('Tarifa de acceso')}
        hint={
          noBands
            ? t('El PVPC ya incluye peajes y cargos: no se suman tramos para no contarlos dos veces.')
            : tariff === 'grid'
              ? t('Marco suma cada hora la tarifa de tu compañía de red, las de Energinet y el impuesto de la electricidad (elafgift), de Energinet DataHub. El IVA va abajo.')
              : tariff === 'bands'
                ? t('Un precio por kWh para cada tramo, sin IVA. Se suma al del mercado en sus horas.')
                : dk
                  ? t('Elige tu compañía de red (netselskab) para ver lo que pagas de verdad cada hora.')
                  : t('Con tramos horarios, el precio incluye los peajes que cambian según la hora.')
        }
      >
        <div class="view-seg">
          <Segmented full value={noBands ? 'none' : tariff} options={options} onChange={choose} />
        </div>
        <div class="view-sel">
          <Select value={noBands ? 'none' : tariff} options={options.filter((x) => !x.off)} onChange={choose} />
        </div>
      </Field>
      {tariff === 'grid' && dk && (
        <Field label={t('Compañía de red')} error={err('grid')} hint={company ? t('Elegida: {c}.', { c: company.name }) : t('Viene en tu factura de la luz.')}>
          <GridPicker o={o} onPick={pick} error={err('grid')} />
        </Field>
      )}
      {tariff === 'bands' && !noBands && <BandsEditor o={o} set={set} err={err} />}
    </>
  );
}
