// Tarjetas (fork fsrhome): crear, nombrar, encender o apagar, fuente y direcciones, borrar y "Mostrar ahora".
// Cada pantalla elige cuáles muestra en Diseño (ScreenCardsCard en Layout.tsx).
import { useEffect, useState } from 'preact/hooks';
import type { AgesOptions, CardDef, CardsStatus, HomelabOptions, ImmichAlbum, StoredConfig, TrainingOptions, TrainingSource } from '../../shared/types';
import { api, ApiError } from '../api';
import { toast } from '../components/feedback';
import { Button, Card, Field, PageHeader, Segmented, Select, TextInput, ToggleRow } from '../components/ui';
import { t } from '../i18n';
import { uid } from '../util';
import type { SectionProps } from './common';

/** fuentes por defecto: plan del coach + el Garmin de la casa, o solo Garmin (el de Andrea) */
const PRESETS: Record<TrainingSource, TrainingOptions> = {
  coach: { source: 'coach', garminUrl: 'http://garmin-stats:4400', coachUrl: 'http://running-coach:4300' },
  garmin: { source: 'garmin', garminUrl: 'http://garmin-andrea:4400', coachUrl: '' },
};

const newCard = (source: TrainingSource): CardDef => ({ id: uid('k'), type: 'training', name: 'Entreno', enabled: true, options: { training: { ...PRESETS[source] } } });

const newAges = (albumId: string): CardDef => ({
  id: uid('k'), type: 'ages', name: 'A esta edad', enabled: true,
  options: { ages: { person: 'Arantza', birthDate: '2020-06-22', albumId, everyMin: 15 } },
});

const newMoney = (): CardDef => ({ id: uid('k'), type: 'money', name: 'Dinero', enabled: true, options: { money: {} } });
const newOrg = (): CardDef => ({ id: uid('k'), type: 'org', name: 'Organización', enabled: true, options: { org: { everyMin: 30 } } });
const newHomelab = (): CardDef => ({
  id: uid('k'), type: 'homelab', name: 'Homelab', enabled: true,
  options: { homelab: { everyMin: 10, zones: ['pipol', 'pipol2', 'Entrada', 'mi-patio'] } },
});

/** Borra la tarjeta y la quita de todas las pantallas. */
export function pruneCard(d: StoredConfig, id: string) {
  d.cards = { items: (d.cards?.items ?? []).filter((k) => k.id !== id) };
  for (const s of d.screens) if (s.screen.cards) s.screen.cards.items = s.screen.cards.items.filter((x) => x !== id);
}

export function CardsSection({ cfg, set, setFull, full, errors }: SectionProps) {
  const items = cfg.cards?.items ?? [];
  const [busy, setBusy] = useState('');
  const upd = (i: number, fn: (k: CardDef) => void) =>
    set((d) => {
      const k = d.cards?.items[i];
      if (k) fn(k);
    });
  const [albums, setAlbums] = useState<ImmichAlbum[]>([]);
  useEffect(() => { api.immichAlbums().then(setAlbums, () => setAlbums([])); }, []);
  // ¿tiene el servidor el token de gastos? (solo un booleano; null mientras carga o si falla)
  const [status, setStatus] = useState<CardsStatus | null>(null);
  useEffect(() => { api.cardsStatus().then(setStatus, () => setStatus(null)); }, []);
  // el álbum por defecto: el primero que ya usa el fondo de alguna pantalla
  const firstAlbum = full.screens.flatMap((s) => s.background?.immich?.albumIds ?? [])[0] ?? '';
  const updAges = (i: number, fn: (a: AgesOptions) => void) => upd(i, (k) => { if (k.options.ages) fn(k.options.ages); });
  const updHomelab = (i: number, fn: (h: HomelabOptions) => void) => upd(i, (k) => { if (k.options.homelab) fn(k.options.homelab); });
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
          <Button onClick={() => set((d) => void (d.cards = { items: [...(d.cards?.items ?? []), newAges(firstAlbum)] }))}>{t('A esta edad')}</Button>
          <Button onClick={() => set((d) => void (d.cards = { items: [...(d.cards?.items ?? []), newMoney()] }))}>{t('Dinero')}</Button>
          <Button onClick={() => set((d) => void (d.cards = { items: [...(d.cards?.items ?? []), newHomelab()] }))}>{t('Homelab')}</Button>
          <Button onClick={() => set((d) => void (d.cards = { items: [...(d.cards?.items ?? []), newOrg()] }))}>{t('Organización')}</Button>
        </div>
      </Card>
      {items.map((k, i) => {
        if (k.type === 'org') {
          const og = k.options.org!;
          return (
            <Card key={k.id} id={`card-${k.id}`} title={k.name || t('Organización')} icon="tag" desc={t('Propuestas de Rocky y sus líderes. Sale solo si hay pendientes; aprobar pide un «sí» por WhatsApp. No sale en modo privado.')}>
              <ToggleRow label={t('Tarjeta activa')} checked={k.enabled} onChange={(v) => upd(i, (x) => void (x.enabled = v))} />
              <Field label={t('Nombre de la tarjeta')} error={errors[`cards.items[${i}].name`]}>
                <TextInput value={k.name} maxLength={60} onValue={(v) => upd(i, (x) => void (x.name = v))} />
              </Field>
              <Field label={t('Repetir cada (min)')} error={errors[`cards.items[${i}].options.org.everyMin`]}>
                <Segmented value={String(og.everyMin)} options={[15, 30, 60, 120].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => upd(i, (x) => { if (x.options.org) x.options.org.everyMin = Number(v); })} />
              </Field>
              <div class="row-actions">
                <Button onClick={() => show(k.id)} loading={busy === k.id} disabled={!k.enabled}>{t('Mostrar ahora')}</Button>
                <Button variant="danger" onClick={() => setFull((d) => pruneCard(d, k.id))}>{t('Borrar tarjeta')}</Button>
              </div>
            </Card>
          );
        }
        if (k.type === 'homelab') {
          const hl = k.options.homelab!;
          return (
            <Card key={k.id} id={`card-${k.id}`} title={k.name || t('Homelab')} icon="tag" desc={t('El estado del servidor. Sale solo cuando hay algo: aviso, alerta o sin datos. De 5 a 8 a.m. resume la noche.')}>
              <ToggleRow label={t('Tarjeta activa')} checked={k.enabled} onChange={(v) => upd(i, (x) => void (x.enabled = v))} />
              <Field label={t('Nombre de la tarjeta')} error={errors[`cards.items[${i}].name`]}>
                <TextInput value={k.name} maxLength={60} onValue={(v) => upd(i, (x) => void (x.name = v))} />
              </Field>
              <Field label={t('Repetir cada (min)')} error={errors[`cards.items[${i}].options.homelab.everyMin`]}>
                <Segmented value={String(hl.everyMin)} options={[5, 10, 15, 30, 60].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => updHomelab(i, (h) => void (h.everyMin = Number(v)))} />
              </Field>
              <Field label={t('Zonas de cámaras para "Anoche"')} hint={t('Nombres de zonas de Frigate separados por comas.')} error={errors[`cards.items[${i}].options.homelab.zones`]}>
                <TextInput value={hl.zones.join(', ')} maxLength={400} onValue={(v) => updHomelab(i, (h) => void (h.zones = v.split(',').map((z) => z.trim())))} />
              </Field>
              <div class="row-actions">
                <Button onClick={() => show(k.id)} loading={busy === k.id} disabled={!k.enabled}>{t('Mostrar ahora')}</Button>
                <Button variant="danger" onClick={() => setFull((d) => pruneCard(d, k.id))}>{t('Borrar tarjeta')}</Button>
              </div>
            </Card>
          );
        }
        if (k.type === 'money') {
          return (
            <Card key={k.id} id={`card-${k.id}`} title={k.name || t('Dinero')} icon="tag" desc={t('El ritmo de la quincena, sin montos. Tocar la hoja muestra las cifras 30 s.')}>
              <ToggleRow label={t('Tarjeta activa')} checked={k.enabled} onChange={(v) => upd(i, (x) => void (x.enabled = v))} />
              <Field label={t('Nombre de la tarjeta')} error={errors[`cards.items[${i}].name`]}>
                <TextInput value={k.name} maxLength={60} onValue={(v) => upd(i, (x) => void (x.name = v))} />
              </Field>
              <p class="muted small">{t('Los montos solo se ven 30 s al tocar la hoja. No sale en modo privado.')}</p>
              {status && !status.moneyToken && <p class="field__error">{t('Falta el token de gastos en el servidor (GASTOS_ECHO_TOKEN).')}</p>}
              <div class="row-actions">
                <Button onClick={() => show(k.id)} loading={busy === k.id} disabled={!k.enabled}>{t('Mostrar ahora')}</Button>
                <Button variant="danger" onClick={() => setFull((d) => pruneCard(d, k.id))}>{t('Borrar tarjeta')}</Button>
              </div>
            </Card>
          );
        }
        if (k.type === 'ages') {
          const ag = k.options.ages!;
          return (
          <Card key={k.id} id={`card-${k.id}`} title={k.name || t('A esta edad')} icon="image" desc={t('Fotos de cada año a la misma edad que hoy, a pantalla completa.')}>
            <ToggleRow label={t('Tarjeta activa')} checked={k.enabled} onChange={(v) => upd(i, (x) => void (x.enabled = v))} />
            <div class="grid grid--2">
              <Field label={t('Nombre de la tarjeta')} error={errors[`cards.items[${i}].name`]}>
                <TextInput value={k.name} maxLength={60} onValue={(v) => upd(i, (x) => void (x.name = v))} />
              </Field>
              <Field label={t('Persona en Immich')} error={errors[`cards.items[${i}].options.ages.person`]}>
                <TextInput value={ag.person} maxLength={40} onValue={(v) => updAges(i, (a) => void (a.person = v))} />
              </Field>
              <Field label={t('Fecha de nacimiento')} error={errors[`cards.items[${i}].options.ages.birthDate`]}>
                <TextInput type="date" value={ag.birthDate} onValue={(v) => updAges(i, (a) => void (a.birthDate = v))} />
              </Field>
              <Field label={t('Álbum de Immich')} error={errors[`cards.items[${i}].options.ages.albumId`]}>
                <Select
                  value={ag.albumId}
                  options={[{ value: '', label: t('Elige un álbum') }, ...albums.map((al) => ({ value: al.id, label: `${al.name} (${al.count})` }))]}
                  onChange={(v) => updAges(i, (a) => void (a.albumId = String(v)))}
                />
              </Field>
            </div>
            <Field label={t('Cada cuánto (minutos)')}>
              <Segmented value={String(ag.everyMin)} options={[10, 15, 30, 60].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => updAges(i, (a) => void (a.everyMin = Number(v)))} />
            </Field>
            <div class="row-actions">
              <Button onClick={() => show(k.id)} loading={busy === k.id} disabled={!k.enabled}>{t('Mostrar ahora')}</Button>
              <Button variant="danger" onClick={() => setFull((d) => pruneCard(d, k.id))}>{t('Borrar tarjeta')}</Button>
            </div>
          </Card>
          );
        }
        const tr = k.options.training!;
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
                  onChange={(v) => upd(i, (x) => void (x.options.training = { ...PRESETS[v as TrainingSource], garminUrl: x.options.training!.garminUrl }))}
                />
              </Field>
            </div>
            <div class="grid grid--2">
              <Field label={t('Dirección de Garmin Stats')} error={errors[`cards.items[${i}].options.training.garminUrl`]}>
                <TextInput value={tr.garminUrl} onValue={(v) => upd(i, (x) => void (x.options.training!.garminUrl = v))} />
              </Field>
              {tr.source === 'coach' && (
                <Field label={t('Dirección del coach')} error={errors[`cards.items[${i}].options.training.coachUrl`]}>
                  <TextInput value={tr.coachUrl} onValue={(v) => upd(i, (x) => void (x.options.training!.coachUrl = v))} />
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
