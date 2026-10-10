import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { fetchErrorText } from '../apiErrors';
import { toast } from '../components/feedback';
import { Button, Callout, Field, Modal, Segmented, TextInput } from '../components/ui';
import { Icon } from '../components/icons';
import { t } from '../i18n';
import { isHttpUrl } from '../util';

type Device = 'iphone' | 'mac' | 'web';

/** Steps per device to get the public link of an iCloud calendar (Spanish keys; Apple's own UI names per language). */
const STEPS: Record<Device, string[]> = {
  iphone: [
    'Abre la app Calendario y toca «Calendarios».',
    'Toca ⓘ junto al calendario de iCloud que quieras mostrar.',
    'Activa «Calendario público» y toca «Compartir enlace».',
    'Elige «Copiar» y pega el enlace aquí abajo.',
  ],
  mac: [
    'Abre la app Calendario en el Mac.',
    'En la lista de calendarios, pasa el puntero sobre el calendario de iCloud y haz clic en el icono de compartir (o haz clic con el botón derecho y elige «Compartir calendario»).',
    'Selecciona «Calendario público».',
    'Copia la dirección que aparece (empieza por webcal://) y pégala aquí abajo.',
  ],
  web: [
    'Entra en icloud.com/calendar desde un ordenador o una tableta.',
    'Pasa el puntero sobre el calendario en la barra lateral y haz clic en el icono de compartir.',
    'Activa «Calendario público» y selecciona «Copiar».',
    'Pega el enlace aquí abajo.',
  ],
};

/** webcal:// is the same feed over HTTPS (iCloud gives webcal:// links). */
export const icloudUrl = (s: string) => s.trim().replace(/^webcal:\/\//i, 'https://');

/**
 * Apple iCloud has no API to link an account: this guide explains how to get a calendar's public link and adds it as
 * an iCal source (after testing it). The caller adds the source; the user still saves as usual.
 */
export function ICloudGuide({
  onClose,
  onAdd,
  exists,
  disabled,
  note,
}: {
  onClose: () => void;
  onAdd: (name: string, url: string) => void;
  /** a source with this URL is already in the list */
  exists: (url: string) => boolean;
  /** the list is full (plan limit) */
  disabled?: boolean;
  /** shown under the fields (the limit note) */
  note?: ComponentChildren;
}) {
  const [device, setDevice] = useState<Device>(() => (/Macintosh/.test(navigator.userAgent) && !('ontouchend' in document) ? 'mac' : 'iphone'));
  const [url, setUrl] = useState('');
  const [name, setName] = useState('iCloud');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** the test failed once for this URL: the button adds it anyway */
  const [failed, setFailed] = useState(false);
  const u = icloudUrl(url);
  const valid = !!u && isHttpUrl(u);

  const add = async () => {
    if (!valid) return setError(t('URL no válida: debe empezar por https://, http:// o webcal://'));
    if (exists(u)) return setError(t('Ese calendario ya está en la lista.'));
    if (!failed) {
      setBusy(true);
      try {
        const res = await api.testIcs(u);
        if (!res.ok) {
          setError(fetchErrorText(res.error) || t('No se pudo leer el calendario'));
          setFailed(true);
          return;
        }
      } catch (e) {
        setError((e as ApiError).message || t('No se pudo leer el calendario'));
        setFailed(true);
        return;
      } finally {
        setBusy(false);
      }
    }
    onAdd(name.trim() || 'iCloud', u);
    toast(t('Calendario añadido. Guarda para aplicar los cambios.'));
    onClose();
  };

  return (
    <Modal
      title={t('Calendario de Apple iCloud')}
      icon="apple"
      size="sm"
      autoFocus={false}
      dirty={!!url.trim()}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancelar')}
          </Button>
          <Button variant="primary" icon="plus" loading={busy} disabled={disabled || !url.trim()} onClick={add}>
            {failed ? t('Añadir de todos modos') : t('Añadir calendario')}
          </Button>
        </>
      }
    >
      <div class="stack icloud-guide">
        <p class="muted">{t('Para mostrar un calendario de iCloud hace falta su enlace público. Consíguelo así:')}</p>
        <Segmented
          full
          value={device}
          options={[
            { value: 'iphone', label: t('iPhone o iPad') },
            { value: 'mac', label: 'Mac' },
            { value: 'web', label: 'iCloud.com' },
          ]}
          onChange={setDevice}
        />
        <ol class="howto">
          {STEPS[device].map((s) => (
            <li key={s}>{t(s)}</li>
          ))}
        </ol>
        <Callout kind="info">{t('Cualquiera que tenga el enlace puede ver el calendario, pero es largo e imposible de adivinar. Los cambios que hagas en iCloud llegan a Marco en unos minutos.')}</Callout>
        <Field label={t('Enlace del calendario')} error={error || undefined}>
          <TextInput
            mono
            value={url}
            placeholder="webcal://p…-caldav.icloud.com/published/…"
            inputMode="url"
            autocomplete="off"
            spellcheck={false}
            prefix={<Icon name="link" size={14} />}
            onValue={(v) => {
              setUrl(v);
              setError('');
              setFailed(false);
            }}
          />
        </Field>
        <Field label={t('Nombre')}>
          <TextInput value={name} placeholder="iCloud" onValue={setName} />
        </Field>
        {note}
      </div>
    </Modal>
  );
}
