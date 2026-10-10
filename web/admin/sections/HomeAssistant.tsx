import { useState } from 'preact/hooks';
import type { TestHomeAssistantResponse } from '../../shared/types';
import { api, ApiError } from '../api';
import { fetchErrorText } from '../apiErrors';
import { toast } from '../components/feedback';
import { HaEntityPicker, invalidateHaEntities } from '../components/HaEntityPicker';
import { Icon } from '../components/icons';
import { Button, Callout, Card, Field, PageHeader, TextInput, ToggleRow } from '../components/ui';
import { t } from '../i18n';
import type { SectionProps } from './common';

export function HomeAssistantSection({ cfg, set, errors }: SectionProps) {
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
