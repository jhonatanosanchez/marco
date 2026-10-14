// Tarjetas (fork fsrhome): crear, nombrar, encender o apagar, fuente y direcciones, borrar y "Mostrar ahora".
// Cada pantalla elige cuáles muestra en Diseño (ScreenCardsCard en Layout.tsx).
import { useState } from 'preact/hooks';
import type { CardDef, StoredConfig, TrainingSource } from '../../shared/types';
import { api, ApiError } from '../api';
import { toast } from '../components/feedback';
import { Button, Card, Field, PageHeader, Segmented, TextInput, ToggleRow } from '../components/ui';
import { t } from '../i18n';
import { uid } from '../util';
import type { SectionProps } from './common';

/** fuentes por defecto: plan del coach + el Garmin de la casa, o solo Garmin (el de Andrea) */
const PRESETS: Record<TrainingSource, CardDef['options']['training']> = {
  coach: { source: 'coach', garminUrl: 'http://garmin-stats:4400', coachUrl: 'http://running-coach:4300' },
  garmin: { source: 'garmin', garminUrl: 'http://garmin-andrea:4400', coachUrl: '' },
};

const newCard = (source: TrainingSource): CardDef => ({ id: uid('k'), type: 'training', name: 'Entreno', enabled: true, options: { training: { ...PRESETS[source] } } });

/** Borra la tarjeta y la quita de todas las pantallas. */
export function pruneCard(d: StoredConfig, id: string) {
  d.cards = { items: (d.cards?.items ?? []).filter((k) => k.id !== id) };
  for (const s of d.screens) if (s.screen.cards) s.screen.cards.items = s.screen.cards.items.filter((x) => x !== id);
}

export function CardsSection({ cfg, set, setFull, errors }: SectionProps) {
  const items = cfg.cards?.items ?? [];
  const [busy, setBusy] = useState('');
  const upd = (i: number, fn: (k: CardDef) => void) =>
    set((d) => {
      const k = d.cards?.items[i];
      if (k) fn(k);
    });
  const add = (source: TrainingSource) => set((d) => void (d.cards = { items: [...(d.cards?.items ?? []), newCard(source)] }));
  const show = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.cardShow(id);
      toast(r.screens.length ? t('Tarjeta enviada a {n} pantallas', { n: r.delivered }) : t('Ninguna pantalla tiene esta tarjeta'));
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <PageHeader title={t('Tarjetas')} desc={t('Información que aparece de vez en cuando en las pantallas. Cada pantalla elige cuáles muestra en Diseño.')} />
      <Card id="cards-add" title={t('Nueva tarjeta')} icon="plus">
        <div class="row-actions">
          <Button onClick={() => add('coach')}>{t('Entreno con plan del coach')}</Button>
          <Button onClick={() => add('garmin')}>{t('Entreno solo con Garmin')}</Button>
        </div>
      </Card>
      {items.map((k, i) => {
        const tr = k.options.training;
        return (
          <Card key={k.id} id={`card-${k.id}`} title={k.name || t('Entreno')} icon="activity">
            <ToggleRow label={t('Tarjeta activa')} checked={k.enabled} onChange={(v) => upd(i, (x) => void (x.enabled = v))} />
            <div class="grid grid--2">
              <Field label={t('Nombre de la tarjeta')} error={errors[`cards.items[${i}].name`]}>
                <TextInput value={k.name} maxLength={60} onValue={(v) => upd(i, (x) => void (x.name = v))} />
              </Field>
              <Field label={t('Fuente del entreno')} error={errors[`cards.items[${i}].options.training.source`]}>
                <Segmented
                  value={tr.source}
                  options={[{ value: 'coach', label: t('Coach + Garmin') }, { value: 'garmin', label: t('Solo Garmin') }]}
                  onChange={(v) => upd(i, (x) => void (x.options.training = { ...PRESETS[v as TrainingSource], garminUrl: x.options.training.garminUrl }))}
                />
              </Field>
            </div>
            <div class="grid grid--2">
              <Field label={t('Dirección de Garmin Stats')} error={errors[`cards.items[${i}].options.training.garminUrl`]}>
                <TextInput value={tr.garminUrl} onValue={(v) => upd(i, (x) => void (x.options.training.garminUrl = v))} />
              </Field>
              {tr.source === 'coach' && (
                <Field label={t('Dirección del coach')} error={errors[`cards.items[${i}].options.training.coachUrl`]}>
                  <TextInput value={tr.coachUrl} onValue={(v) => upd(i, (x) => void (x.options.training.coachUrl = v))} />
                </Field>
              )}
            </div>
            <div class="row-actions">
              <Button onClick={() => show(k.id)} loading={busy === k.id} disabled={!k.enabled}>{t('Mostrar ahora')}</Button>
              <Button variant="danger" onClick={() => setFull((d) => pruneCard(d, k.id))}>{t('Borrar tarjeta')}</Button>
            </div>
          </Card>
        );
      })}
    </>
  );
}
