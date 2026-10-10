import { useState } from 'preact/hooks';
import { HaEntityPicker } from '../components/HaEntityPicker';
import { Icon } from '../components/icons';
import { Button, Callout, Card, Field, NumberInput, PageHeader, Segmented, TextInput, ToggleRow } from '../components/ui';
import { ScopeBadge } from '../components/ui';
import type { GeocodeResult } from '../../shared/types';
import { api, ApiError } from '../api';
import { toast } from '../components/feedback';
import { has } from '../caps';
import { getLang, t } from '../i18n';
import type { SectionProps } from './common';

export function WeatherSection({ cfg, set, errors }: SectionProps) {
  const w = cfg.weather;
  const haOffered = has('homeassistant');
  const haOn = haOffered && cfg.homeassistant.enabled;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = async (e?: Event) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      // Through this server (GET /api/admin/geocode), so the browser only talks to its own server.
      const j = await api.geocode(q.trim(), getLang());
      setResults(j.results ?? []);
    } catch (e) {
      setResults([]);
      if ((e as ApiError).status === 429) toast(t('Demasiadas búsquedas seguidas. Espera unos minutos.'), 'error');
      else toast(t('No se pudo buscar (¿sin conexión a Internet?). Inténtalo de nuevo.'), 'error');
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <PageHeader title={t('Tiempo')} desc={t('Previsión en °C y km/h, humedad y viento. Open-Meteo no necesita clave.')} />
      <Card id="wx-main" title={t('Tiempo')} icon="cloud">
        <ToggleRow label={<>{t('Mostrar el tiempo')} <ScopeBadge scope="screen" /></>} checked={w.enabled} onChange={(v) => set((d) => void (d.weather.enabled = v))} />
        <div class={`stack ${w.enabled ? '' : 'is-disabled'}`}>
          {(haOffered || w.provider === 'homeassistant') && (
            <>
              <Field label={<>{t('Fuente de datos')} <ScopeBadge scope="global" /></>}>
                <Segmented
                  full
                  value={w.provider}
                  options={[
                    { value: 'open-meteo', label: 'Open-Meteo', icon: 'globe' },
                    { value: 'homeassistant', label: 'Home Assistant', icon: 'home' },
                  ]}
                  onChange={(v) => set((d) => void (d.weather.provider = v))}
                />
              </Field>
              {w.provider === 'homeassistant' && !haOffered && <Callout kind="warn">{t('{name} no está disponible aquí. Elige otra opción.', { name: 'Home Assistant' })}</Callout>}
              {w.provider === 'homeassistant' && haOffered && !haOn && (
                <Callout kind="warn">
                  {t('Activa y configura Home Assistant en')} <a href="#/homeassistant">Home Assistant</a>.
                </Callout>
              )}
            </>
          )}
          <Field label={t('Ubicación')} hint={t('Busca una ciudad para rellenar las coordenadas.')}>
            <form class="search-row" onSubmit={search}>
              <TextInput value={q} onValue={setQ} placeholder={t('Buscar ciudad…')} prefix={<Icon name="search" size={14} />} />
              <Button type="submit" loading={searching}>
                {t('Buscar')}
              </Button>
            </form>
            {results && (
              <div class="geo-results">
                {results.length === 0 && <div class="muted small">{t('Sin resultados')}</div>}
                {results.map((r) => (
                  <button
                    type="button"
                    class="geo-result"
                    onClick={() => {
                      set((d) => {
                        d.weather.lat = Math.round(r.lat * 1000) / 1000;
                        d.weather.lon = Math.round(r.lon * 1000) / 1000;
                        d.weather.locationName = [r.name, r.admin1].filter(Boolean).join(', ');
                      });
                      setResults(null);
                      setQ('');
                    }}
                  >
                    <Icon name="pin" size={14} />
                    <span>
                      <strong>{r.name}</strong> <span class="muted">{[r.admin1, r.country].filter(Boolean).join(', ')}</span>
                    </span>
                    <span class="mono small muted">
                      {r.lat.toFixed(3)}, {r.lon.toFixed(3)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Field>
          <div class="grid grid--3">
            <Field label={t('Nombre visible')}>
              <TextInput value={w.locationName} onValue={(v) => set((d) => void (d.weather.locationName = v))} />
            </Field>
            <Field label={t('Latitud')} error={errors['weather.lat']}>
              <NumberInput value={w.lat} step={0.001} min={-90} max={90} error={!!errors['weather.lat']} onValue={(v) => set((d) => void (d.weather.lat = v))} />
            </Field>
            <Field label={t('Longitud')} error={errors['weather.lon']}>
              <NumberInput value={w.lon} step={0.001} min={-180} max={180} error={!!errors['weather.lon']} onValue={(v) => set((d) => void (d.weather.lon = v))} />
            </Field>
          </div>
          <div class="grid grid--2">
            <Field label={t('Unidades')}>
              <Segmented
                full
                value={w.units}
                options={[
                  { value: 'metric', label: '°C · km/h' },
                  { value: 'imperial', label: '°F · mph' },
                ]}
                onChange={(v) => set((d) => void (d.weather.units = v))}
              />
            </Field>
            <Field label={<>{t('Previsión extendida')} <ScopeBadge scope="screen" /></>}>
              <Segmented
                full
                value={w.forecastDays}
                options={[1, 3, 4, 5, 7].map((n) => ({ value: n, label: `${n} d`, title: t('{n} días', { n }) }))}
                onChange={(v) => set((d) => void (d.weather.forecastDays = v))}
              />
            </Field>
          </div>
          <ToggleRow icon="🕐" label={t('Previsión por horas')} hint={t('Próximas 8 horas')} checked={w.showHourly} onChange={(v) => set((d) => void (d.weather.showHourly = v))} />
          <ToggleRow icon="☔" label={t('Probabilidad de lluvia')} checked={w.showPrecipChance} onChange={(v) => set((d) => void (d.weather.showPrecipChance = v))} />
        </div>
      </Card>
      {haOffered && (
        <Card id="wx-ha" scope="global" title={t('Datos de Home Assistant')} icon="home" desc={t('Opcional: usa tu estación meteorológica y sensores interiores.')} muted={!haOn}>
          <div class="grid grid--3">
            <Field label={t('Entidad del tiempo')} error={errors['weather.haWeatherEntity']}>
              <HaEntityPicker domain="weather" enabled={haOn} value={w.haWeatherEntity} error={!!errors['weather.haWeatherEntity']} onChange={(v) => set((d) => void (d.weather.haWeatherEntity = v))} />
            </Field>
            <Field label={t('Temperatura interior')}>
              <HaEntityPicker
                domain="sensor"
                enabled={haOn}
                value={w.haIndoorTempEntity}
                filter={(e) => !e.unit || /°|c|f/i.test(e.unit)}
                onChange={(v) => set((d) => void (d.weather.haIndoorTempEntity = v))}
              />
            </Field>
            <Field label={t('Humedad interior')}>
              <HaEntityPicker
                domain="sensor"
                enabled={haOn}
                value={w.haIndoorHumidityEntity}
                filter={(e) => !e.unit || e.unit === '%'}
                onChange={(v) => set((d) => void (d.weather.haIndoorHumidityEntity = v))}
              />
            </Field>
          </div>
        </Card>
      )}
    </>
  );
}
