import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DateFormat } from '../../shared/types';
import { Card, Field, PageHeader, Segmented, TextInput, ToggleRow } from '../components/ui';
import { ScopeBadge } from '../components/ui';
import { t } from '../i18n';
import type { SectionProps } from './common';

const LOC = { es: 'es-ES', en: 'en-GB', pt: 'pt-PT' } as const;

export function formatDate(d: Date, fmt: DateFormat, lang: 'es' | 'en' | 'pt', tz: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat(LOC[lang], { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).formatToParts(d);
  } catch {
    parts = new Intl.DateTimeFormat(LOC[lang], { weekday: 'long', day: 'numeric', month: 'long' }).formatToParts(d);
  }
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
  const wd = get('weekday');
  const W = wd.charAt(0).toUpperCase() + wd.slice(1);
  const day = get('day');
  const month = get('month');
  const of = lang === 'en' ? '' : ' de ';
  switch (fmt) {
    case 'weekday_month_d':
      return `${W}, ${month} ${day}`;
    case 'weekday_d_dot_month':
      return `${W} · ${day} ${month}`;
    default:
      return lang === 'en' ? `${W}, ${day} ${month}` : `${W}, ${day}${of}${month}`;
  }
}

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Analog({ now, tz }: { now: Date; tz: string }) {
  let h = now.getHours(),
    m = now.getMinutes(),
    s = now.getSeconds();
  try {
    const p = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23', timeZone: tz }).formatToParts(now);
    h = +p.find((x) => x.type === 'hour')!.value;
    m = +p.find((x) => x.type === 'minute')!.value;
    s = +p.find((x) => x.type === 'second')!.value;
  } catch {
    /* fall back to local */
  }
  const hand = (deg: number, len: number, w: number, cls: string) => (
    <line x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} stroke-width={w} class={cls} stroke-linecap="round" />
  );
  return (
    <svg viewBox="0 0 100 100" class="analog">
      <circle cx="50" cy="50" r="47" class="analog__face" />
      {Array.from({ length: 12 }, (_, i) => (
        <line x1="50" y1="7" x2="50" y2={i % 3 ? 11 : 14} transform={`rotate(${i * 30} 50 50)`} class="analog__tick" stroke-width={i % 3 ? 1.2 : 2.4} />
      ))}
      {hand((h % 12) * 30 + m / 2, 24, 4, 'analog__h')}
      {hand(m * 6 + s / 10, 34, 2.6, 'analog__m')}
      {hand(s * 6, 38, 1.2, 'analog__s')}
      <circle cx="50" cy="50" r="2.6" class="analog__pin" />
    </svg>
  );
}

export function DateTimeSection({ cfg, set, errors }: SectionProps) {
  const d = cfg.datetime;
  const now = useNow();
  const zones = useMemo(() => {
    try {
      return (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
    } catch {
      return undefined;
    }
  }, []);
  let time = '';
  try {
    time = new Intl.DateTimeFormat('en-GB', {
      hour: d.format24 ? '2-digit' : 'numeric',
      minute: '2-digit',
      second: d.showSeconds ? '2-digit' : undefined,
      hourCycle: d.format24 ? 'h23' : 'h12',
      timeZone: d.timezone || undefined,
    }).format(now);
  } catch {
    time = now.toLocaleTimeString();
  }
  if (!d.format24) {
    const ampm = /am|pm/i.exec(time)?.[0]?.toUpperCase();
    time = time.replace(/\s?(am|pm)/i, '');
    if (d.showAmPm && ampm) time += ` ${ampm}`;
  }
  const lang = cfg.screen.language;
  return (
    <>
      <PageHeader scope="screen" title={t('Fecha y hora')} desc={t('Reloj con segundos, formato de fecha y zona horaria.')} />
      <Card>
        <div class="clock-preview">
          {d.clock === 'analog' ? <Analog now={now} tz={d.timezone} /> : <div class="clock-preview__time">{time}</div>}
          <div class="clock-preview__date">{formatDate(now, d.dateFormat, lang, d.timezone)}</div>
        </div>
        <ToggleRow label={t('Mostrar fecha y hora')} checked={d.enabled} onChange={(v) => set((c) => void (c.datetime.enabled = v))} />
      </Card>
      <Card id="dt-clock" scope="screen" title={t('Reloj')} icon="clock" muted={!d.enabled}>
        <div class="grid grid--2">
          <Field label={t('Estilo')}>
            <Segmented
              full
              value={d.clock}
              options={[
                { value: 'digital', label: t('Digital') },
                { value: 'analog', label: t('Analógico') },
              ]}
              onChange={(v) => set((c) => void (c.datetime.clock = v))}
            />
          </Field>
          <Field label={t('Formato')}>
            <Segmented
              full
              value={d.format24 ? 24 : 12}
              options={[
                { value: 24, label: '24 h' },
                { value: 12, label: '12 h' },
              ]}
              onChange={(v) => set((c) => void (c.datetime.format24 = v === 24))}
            />
          </Field>
        </div>
        <ToggleRow label={t('Mostrar segundos')} checked={d.showSeconds} onChange={(v) => set((c) => void (c.datetime.showSeconds = v))} />
        <ToggleRow label={t('Mostrar AM/PM')} hint={d.format24 ? t('Solo con formato de 12 horas') : undefined} disabled={d.format24} checked={d.showAmPm} onChange={(v) => set((c) => void (c.datetime.showAmPm = v))} />
        <Field label={<>{t('Zona horaria')} <ScopeBadge scope="global" /></>} error={errors['datetime.timezone']}>
          <TextInput value={d.timezone} list="tz-list" error={!!errors['datetime.timezone']} onValue={(v) => set((c) => void (c.datetime.timezone = v))} prefix={<span>🌍</span>} />
          {zones && (
            <datalist id="tz-list">
              {zones.map((z) => (
                <option value={z} />
              ))}
            </datalist>
          )}
        </Field>
      </Card>
      <Card id="dt-format" scope="screen" title={t('Formato de fecha')} icon="calendar" muted={!d.enabled}>
        <div class="radio-list">
          {(['weekday_d_month', 'weekday_month_d', 'weekday_d_dot_month'] as DateFormat[]).map((f) => (
            <label class={`radio-card ${d.dateFormat === f ? 'is-active' : ''}`}>
              <input type="radio" name="datefmt" checked={d.dateFormat === f} onChange={() => set((c) => void (c.datetime.dateFormat = f))} />
              <span class="radio-dot" />
              <span>{formatDate(now, f, lang, d.timezone)}</span>
            </label>
          ))}
        </div>
      </Card>
    </>
  );
}
