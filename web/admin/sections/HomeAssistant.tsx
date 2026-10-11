import { useState } from 'preact/hooks';
import type { TestHomeAssistantResponse } from '../../shared/types';
import { api, ApiError } from '../api';
import { fetchErrorText } from '../apiErrors';
import { toast } from '../components/feedback';
import { HaEntityPicker, invalidateHaEntities } from '../components/HaEntityPicker';
import { Icon } from '../components/icons';
import { ScreenTargets } from '../components/AnnounceForm';
import { Button, Callout, Card, Field, NumberInput, PageHeader, TextInput, ToggleRow } from '../components/ui';
import { has } from '../caps';
import { t } from '../i18n';
import { withPollNote } from '../liveNote';
import type { SectionProps } from './common';

export function HomeAssistantSection(props: SectionProps) {
  return (
    <>
      <HomeAssistantMain {...props} />
      {has('doorbell') && <DoorbellCard {...props} />}
    </>
  );
}

function HomeAssistantMain({ cfg, set, errors }: SectionProps) {
  const ha = cfg.homeassistant;
  const w = cfg.weather;
  const [token, setToken] = useState('');
  const [show, setShow] = useState(false);
  const [savingTok, setSavingTok] = useState(false);
  const [test, setTest] = useState<{ loading: boolean; res?: TestHomeAssistantResponse }>({ loading: false });
  const [reloadKey, setReloadKey] = useState(0);

  const saveToken = async () => {
    setSavingTok(true);
    try {
      await api.setHaToken(token.trim());
      toast(t('Token guardado'));
      setToken('');
      invalidateHaEntities();
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setSavingTok(false);
    }
  };
  const runTest = async () => {
    setTest({ loading: true });
    try {
      setTest({ loading: false, res: await api.testHomeAssistant(ha.url.trim(), token.trim() || undefined) });
    } catch (e) {
      setTest({ loading: false, res: { ok: false, error: (e as ApiError).message } });
    }
  };

  return (
    <>
      <PageHeader title="Home Assistant" desc={t('Usa sensores de tu casa (temperatura y humedad interior, estación meteorológica).')} />
      <Card id="ha-conn" title={t('Conexión')} icon="home">
        <ToggleRow label={t('Activar Home Assistant')} checked={ha.enabled} onChange={(v) => set((d) => void (d.homeassistant.enabled = v))} />
        <div class={`stack ${ha.enabled ? '' : 'is-disabled'}`}>
          <Field label="URL" error={errors['homeassistant.url']} hint={t('Dirección local, p. ej. http://homeassistant.local:8123')}>
            <TextInput mono value={ha.url} error={!!errors['homeassistant.url']} placeholder="http://homeassistant.local:8123" onValue={(v) => set((d) => void (d.homeassistant.url = v))} prefix={<Icon name="link" size={14} />} />
          </Field>
          <Field
            label={t('Token de acceso de larga duración')}
            hint={t('Créalo en Home Assistant → tu perfil → Seguridad → Tokens de acceso de larga duración. Se guarda solo en el servidor y nunca se vuelve a mostrar.')}
          >
            <div class="search-row">
              <div class="input-group">
                <span class="input-group__addon">
                  <Icon name="key" size={14} />
                </span>
                <input
                  class="input input--mono"
                  type={(show ? 'text' : 'password') as 'password'}
                  value={token}
                  autocomplete="off"
                  placeholder={t('•••••••• (sin cambios)')}
                  onInput={(e) => setToken(e.currentTarget.value)}
                />
                <button type="button" class="input-group__btn" onClick={() => setShow(!show)} aria-label={t('Mostrar')}>
                  <Icon name={show ? 'eyeOff' : 'eye'} size={15} />
                </button>
              </div>
              <Button variant="primary" disabled={!token.trim()} loading={savingTok} onClick={saveToken}>
                {t('Guardar token')}
              </Button>
            </div>
          </Field>
          <div class="row-actions">
            <Button icon="play" loading={test.loading} onClick={runTest} disabled={!ha.url}>
              {t('Probar conexión')}
            </Button>
            {test.res &&
              (test.res.ok ? (
                <span class="ok-text">
                  <Icon name="check" size={15} /> {t('Conectado')} {test.res.version && `· Home Assistant ${test.res.version}`}
                </span>
              ) : (
                <span class="err-text">
                  <Icon name="alert" size={15} /> {fetchErrorText(test.res.error) || t('No se pudo conectar')}
                </span>
              ))}
          </div>
          <Callout>{t('Recuerda guardar la configuración (barra inferior) tras cambiar la URL o activar la integración.')}</Callout>
        </div>
      </Card>
      <Card
        title={t('Entidades')}
        icon="activity"
        muted={!ha.enabled}
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon="refresh"
            disabled={!ha.enabled}
            onClick={() => {
              invalidateHaEntities();
              setReloadKey((k) => k + 1);
            }}
          >
            {t('Recargar')}
          </Button>
        }
      >
        <div class="grid grid--3">
          <Field label={t('Tiempo (weather.*)')} error={errors['weather.haWeatherEntity']}>
            <HaEntityPicker domain="weather" enabled={ha.enabled} reloadKey={reloadKey} value={w.haWeatherEntity} onChange={(v) => set((d) => void (d.weather.haWeatherEntity = v))} />
          </Field>
          <Field label={t('Temperatura interior')}>
            <HaEntityPicker
              domain="sensor"
              enabled={ha.enabled}
              reloadKey={reloadKey}
              value={w.haIndoorTempEntity}
              filter={(e) => !e.unit || /°|c|f/i.test(e.unit)}
              onChange={(v) => set((d) => void (d.weather.haIndoorTempEntity = v))}
            />
          </Field>
          <Field label={t('Humedad interior')}>
            <HaEntityPicker
              domain="sensor"
              enabled={ha.enabled}
              reloadKey={reloadKey}
              value={w.haIndoorHumidityEntity}
              filter={(e) => !e.unit || e.unit === '%'}
              onChange={(v) => set((d) => void (d.weather.haIndoorHumidityEntity = v))}
            />
          </Field>
        </div>
      </Card>
    </>
  );
}

/** Doorbell camera: which camera, how long, which screens, sound, and a test button that rings with these values. */
function DoorbellCard({ cfg, set, errors, full }: SectionProps) {
  const ha = cfg.homeassistant;
  const db = ha.doorbell ?? { camera: '', seconds: 60, screenIds: [], sound: true };
  const [busy, setBusy] = useState<'' | 'ring' | 'dismiss'>('');
  const upd = (fn: (d: typeof db) => void) => set((d) => {
    d.homeassistant.doorbell ??= { camera: '', seconds: 60, screenIds: [], sound: true };
    fn(d.homeassistant.doorbell);
  });
  const run = async (action: 'ring' | 'dismiss') => {
    setBusy(action);
    try {
      const secs = Math.min(300, Math.max(10, Math.round(Number(db.seconds) || 60)));
      const r = await api.doorbell(
        action === 'ring'
          ? { action, seconds: secs, sound: db.sound, screens: db.screenIds, ...(db.camera ? { camera: db.camera } : {}) }
          : { action },
      );
      if (action === 'dismiss') toast(t('Timbre quitado de las pantallas'));
      else toast(r.delivered ? withPollNote(t('Timbre enviado a {n} pantallas', { n: r.delivered })) : t('Timbre enviado, pero no hay ninguna pantalla conectada'), r.delivered ? 'ok' : 'info');
    } catch (e) {
      toast(fetchErrorText((e as ApiError).message) || t('No se pudo enviar'), 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <Card id="ha-doorbell" title={t('Timbre y cámara')} icon="bell">
      <p class="muted small">
        {t('Cuando llaman a la puerta, Home Assistant avisa a Marco y las pantallas muestran la cámara a pantalla completa durante unos segundos, con sonido de timbre. También despierta las pantallas en modo noche mientras dura.')}
      </p>
      <div class="grid grid--2">
        <Field label={t('Cámara (camera.*)')} error={errors['homeassistant.doorbell.camera']} hint={!ha.enabled ? undefined : t('Sin cámara, las pantallas muestran solo el aviso.')}>
          <HaEntityPicker domain="camera" enabled={ha.enabled} value={db.camera} error={!!errors['homeassistant.doorbell.camera']} onChange={(v) => upd((d) => void (d.camera = v))} />
        </Field>
        <Field label={t('Tiempo en pantalla')} error={errors['homeassistant.doorbell.seconds']} hint={t('Entre 10 y 300 segundos. Si vuelven a llamar, se alarga.')}>
          <NumberInput value={db.seconds} min={10} max={300} suffix="s" error={!!errors['homeassistant.doorbell.seconds']} onValue={(v) => upd((d) => void (d.seconds = v))} />
        </Field>
      </div>
      <Field label={t('Pantallas')}>
        <ScreenTargets screens={full.screens} value={db.screenIds} onChange={(v) => upd((d) => void (d.screenIds = v))} />
      </Field>
      <ToggleRow label={t('Sonido de timbre')} checked={db.sound} onChange={(v) => upd((d) => void (d.sound = v))} />
      <div class="row-actions">
        <Button icon="play" loading={busy === 'ring'} disabled={!!busy} onClick={() => run('ring')}>
          {t('Probar')}
        </Button>
        <Button variant="ghost" icon="x" loading={busy === 'dismiss'} disabled={!!busy} onClick={() => run('dismiss')}>
          {t('Quitar de las pantallas')}
        </Button>
      </div>
      <Callout>
        {t('Desde Home Assistant: POST /api/hooks/doorbell con un token de API («API y webhooks»). El ejemplo completo está en docs/API.md. La imagen pasa por este servidor: el token de Home Assistant nunca llega a las pantallas y no se guarda ninguna imagen.')}
      </Callout>
    </Card>
  );
}
