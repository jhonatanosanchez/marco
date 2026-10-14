// Cámaras Frigate (fork fsrhome): activar, direcciones internas, nombres, zonas, estado y "Probar alerta".
import { useEffect, useState } from 'preact/hooks';
import type { CamerasStatus } from '../../shared/types';
import { api, ApiError } from '../api';
import { toast } from '../components/feedback';
import { Button, Callout, Card, Field, PageHeader, Segmented, TextInput, ToggleRow } from '../components/ui';
import { t } from '../i18n';
import { parseZones } from '../camerasZones';
import type { SectionProps } from './common';

const ago = (iso: string | null): string => {
  if (!iso) return '—';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
};

export function CamerasSection({ cfg, set, errors }: SectionProps) {
  const f = cfg.frigate;
  const [st, setSt] = useState<CamerasStatus | null>(null);
  const [cam, setCam] = useState(f.cameras[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  // texto libre mientras se escribe (si no, la coma se borra en cada tecla); se separa al salir del campo
  const [zonesText, setZonesText] = useState(f.zones.join(', '));
  useEffect(() => setZonesText(f.zones.join(', ')), [f.zones.join(',')]);
  useEffect(() => {
    let alive = true;
    const load = () => api.camerasStatus().then((s) => alive && setSt(s)).catch(() => {});
    load();
    const id = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const test = async () => {
    setBusy(true);
    try {
      const r = await api.cameraTestAlert(cam);
      toast(r.screens.length ? t('Alerta enviada a {n} pantallas', { n: r.delivered }) : t('Ninguna pantalla tiene alertas de persona'));
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title={t('Cámaras')} desc={t('Cámaras de Frigate en tus pantallas: cuadrícula en vivo, vista a pantalla completa al tocar y alerta cuando llega una persona.')} />
      <Card id="cams-main" title="Frigate" icon="eye">
        <ToggleRow label={t('Activar cámaras')} checked={f.enabled} onChange={(v) => set((d) => void (d.frigate.enabled = v))} />
        <div class={`grid grid--2 ${f.enabled ? '' : 'is-disabled'}`}>
          <Field label={t('Dirección de Frigate')} error={errors['frigate.url']}>
            <TextInput value={f.url} onValue={(v) => set((d) => void (d.frigate.url = v))} />
          </Field>
          <Field label={t('Dirección de go2rtc')} error={errors['frigate.go2rtcUrl']}>
            <TextInput value={f.go2rtcUrl} onValue={(v) => set((d) => void (d.frigate.go2rtcUrl = v))} />
          </Field>
        </div>
        <div class={`grid grid--2 ${f.enabled ? '' : 'is-disabled'}`}>
          {f.cameras.map((c, i) => (
            <Field key={c.id} label={c.id} error={errors[`frigate.cameras[${i}].name`]}>
              <TextInput value={c.name} maxLength={40} onValue={(v) => set((d) => void (d.frigate.cameras[i].name = v))} />
            </Field>
          ))}
        </div>
        <Field label={t('Zonas (separadas por comas)')} hint={t('Solo se avisa de lo que entra a estas zonas.')} error={errors['frigate.zones']}>
          <TextInput value={zonesText} onValue={setZonesText} onBlur={() => set((d) => void (d.frigate.zones = parseZones(zonesText)))} />
        </Field>
        {f.enabled && st && (
          <Callout kind={st.lastError ? 'error' : 'ok'}>
            {st.lastError ? t('Frigate sin respuesta') : `${t('Frigate responde')} · ${t('Último evento hace {ago}', { ago: ago(st.lastEventAt) })}`}
          </Callout>
        )}
        {f.enabled && f.cameras.length > 0 && (
          <div class="row-actions">
            <Segmented value={cam} options={f.cameras.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => setCam(v)} />
            <Button onClick={test} loading={busy}>{t('Probar alerta')}</Button>
          </div>
        )}
      </Card>
    </>
  );
}
