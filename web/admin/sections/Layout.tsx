import type { LayoutPreset } from '../../shared/types';
import { Card, Field, PageHeader, Segmented, Slider } from '../components/ui';
import { t } from '../i18n';
import type { SectionProps } from './common';

export const PRESETS: { id: LayoutPreset; name: string; desc: string }[] = [
  { id: 'bigCalendar', name: 'Calendario grande', desc: 'Mes completo a pantalla grande con reloj, tiempo y noticias en una columna lateral.' },
  { id: 'leftRight', name: 'Izquierda / Derecha', desc: 'Foto a un lado; reloj, tiempo y agenda al otro. Ideal para pantallas horizontales.' },
  { id: 'topBottom', name: 'Arriba / Abajo', desc: 'Reloj y tiempo arriba, calendario abajo. Perfecto para pantallas verticales o tablets.' },
  { id: 'bigTime', name: 'Hora grande', desc: 'Reloj protagonista sobre la foto, con la agenda de hoy y mañana.' },
  { id: 'agenda', name: 'Agenda', desc: 'Lista de próximos eventos agrupados por día, legible desde lejos (móvil / tablet).' },
];

/** Tiny schematic drawing of each layout preset. */
export function Schematic({ id, side }: { id: LayoutPreset; side: 'left' | 'right' }) {
  const accent = 'var(--accent)';
  const block = 'var(--schem-block)';
  const photo = `url(#ph-${id})`;
  const L = side === 'left';
  const cells = (x: number, y: number, w: number, h: number, cols: number, rows: number) => {
    const out = [];
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        out.push(<rect x={x + c * cw + 0.6} y={y + r * ch + 0.6} width={cw - 1.2} height={ch - 1.2} rx={1} fill={block} opacity={r === 1 && c === 3 ? 1 : 0.55} />);
    return out;
  };
  return (
    <svg viewBox="0 0 160 90" class="schematic" aria-hidden="true">
      <defs>
        <linearGradient id={`ph-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#2b3d63" />
          <stop offset="0.55" stop-color="#7a4b63" />
          <stop offset="1" stop-color="#d0875e" />
        </linearGradient>
      </defs>
      <rect width="160" height="90" rx="6" fill={photo} />
      <path d="M0 70 L40 48 L70 62 L105 40 L160 66 L160 90 L0 90 Z" fill="#000" opacity=".28" />
      {id === 'bigCalendar' && (
        <g>
          <rect x={L ? 6 : 108} y="6" width="46" height="78" rx="4" fill={block} opacity="0.9" />
          <rect x={L ? 11 : 113} y="12" width="30" height="8" rx="2" fill={accent} />
          <rect x={L ? 11 : 113} y="25" width="20" height="4" rx="2" fill="var(--schem-line)" />
          <rect x={L ? 11 : 113} y="40" width="36" height="14" rx="3" fill="var(--schem-line)" opacity=".5" />
          {cells(L ? 56 : 6, 6, 98, 78, 7, 5)}
          <rect x={(L ? 56 : 6) + 3 * 14 + 1} y={6 + 15.6 + 1} width="12" height="13.6" rx="1.5" fill="none" stroke={accent} stroke-width="1.4" />
        </g>
      )}
      {id === 'leftRight' && (
        <g>
          <rect x={L ? 6 : 82} y="6" width="72" height="78" rx="4" fill={block} opacity="0.9" />
          <rect x={L ? 12 : 88} y="13" width="40" height="11" rx="2" fill={accent} />
          <rect x={L ? 12 : 88} y="29" width="26" height="4" rx="2" fill="var(--schem-line)" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect x={L ? 12 : 88} y={42 + i * 8} width={56 - (i % 2) * 14} height="5" rx="2" fill="var(--schem-line)" opacity=".55" />
          ))}
        </g>
      )}
      {id === 'topBottom' && (
        <g>
          <rect x="6" y="6" width="148" height="24" rx="4" fill={block} opacity="0.9" />
          <rect x="12" y="11" width="38" height="14" rx="2" fill={accent} />
          <rect x="112" y="12" width="36" height="12" rx="3" fill="var(--schem-line)" opacity=".5" />
          {cells(6, 34, 148, 50, 7, 3)}
        </g>
      )}
      {id === 'bigTime' && (
        <g>
          <rect x="40" y="22" width="80" height="26" rx="4" fill={accent} />
          <rect x="58" y="53" width="44" height="4" rx="2" fill="var(--schem-line)" />
          <rect x="6" y="66" width="148" height="18" rx="4" fill={block} opacity="0.9" />
          {[0, 1, 2].map((i) => (
            <rect x={12 + i * 48} y="71" width="40" height="8" rx="2" fill="var(--schem-line)" opacity=".55" />
          ))}
        </g>
      )}
      {id === 'agenda' && (
        <g>
          <rect x="6" y="6" width="148" height="16" rx="4" fill={block} opacity="0.9" />
          <rect x="12" y="10" width="30" height="8" rx="2" fill={accent} />
          {[0, 1, 2, 3].map((i) => (
            <g>
              <rect x="6" y={26 + i * 15} width="148" height="12" rx="3" fill={block} opacity=".7" />
              <rect x="10" y={29 + i * 15} width="3" height="6" rx="1" fill={accent} />
              <rect x="18" y={30 + i * 15} width={70 - i * 9} height="4" rx="2" fill="var(--schem-line)" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

export function LayoutSection({ cfg, set }: SectionProps) {
  const l = cfg.layout;
  const hasSide = l.preset === 'bigCalendar' || l.preset === 'leftRight';
  return (
    <>
      <PageHeader title={t('Diseño')} scope="screen" desc={t('Elige cómo se distribuyen los elementos en la pantalla.')} />
      <div class="preset-grid" id="layout-presets">
        {PRESETS.map((p) => (
          <button
            type="button"
            class={`preset ${l.preset === p.id ? 'is-active' : ''}`}
            onClick={() => set((d) => void (d.layout.preset = p.id))}
            aria-pressed={l.preset === p.id}
          >
            <Schematic id={p.id} side={l.sidePanel} />
            <div class="preset__text">
              <div class="preset__name">
                <span class="radio-dot" />
                {t(p.name)}
              </div>
              <p>{t(p.desc)}</p>
            </div>
          </button>
        ))}
      </div>
      <Card id="layout-side" scope="screen" title={t('Panel lateral')} icon="layout" desc={t('Solo para los diseños con columna lateral.')} muted={!hasSide}>
        <div class="grid grid--2">
          <Field label={t('Posición')}>
            <Segmented
              value={l.sidePanel}
              disabled={!hasSide}
              options={[
                { value: 'left', label: t('Izquierda') },
                { value: 'right', label: t('Derecha') },
              ]}
              onChange={(v) => set((d) => void (d.layout.sidePanel = v))}
            />
          </Field>
          <Field label={t('Anchura')}>
            <Slider
              value={l.sideWidth}
              min={0.22}
              max={0.5}
              step={0.01}
              disabled={!hasSide}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => set((d) => void (d.layout.sideWidth = v))}
            />
          </Field>
        </div>
      </Card>
    </>
  );
}
