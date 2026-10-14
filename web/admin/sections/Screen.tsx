import { useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { toast } from '../components/feedback';
import { GoogleG, Icon } from '../components/icons';
import { PrivateLinkCard } from '../components/DisplayAccess';
import { Button, Callout, Card, Chips, Field, PageHeader, Segmented, Select, Slider, Textarea, TextInput, ToggleRow } from '../components/ui';
import { LANG_NAMES, LANGS } from '../../shared/i18n';
import { has, limit, offers } from '../caps';
import { locale, t } from '../i18n';
import { cssBytes, EMAIL_RE } from '../util';
import { MIN_PASSWORD, passwordProblem } from '../../shared/password';
import { ECHO_DEFAULTS } from '../../shared/echo';
import type { SectionProps } from './common';
import { PrivacyCard } from './Privacy';
import { TwoFactorCard } from '../components/TwoFactor';

const kb = (n: number) => (Math.round((n / 1024) * 10) / 10).toLocaleString(locale());

export function ScreenSection({ cfg, set, errors, screenId, saved, go }: SectionProps) {
  const s = cfg.screen;
  const cssMax = limit('customCssBytes');
  const nm = s.nightMode;
  const ec = s.echo ?? ECHO_DEFAULTS;
  // configs viejas pueden no traer screen.echo: se completa con los defaults al editar
  const setEcho = (patch: Partial<typeof ec>) => set((d) => void (d.screen.echo = { ...ec, ...d.screen.echo, ...patch }));
  return (
    <>
      <PageHeader scope="screen" title={t('Ajustes de la pantalla')} desc={t('Nombre, idioma, apariencia y modo noche de la pantalla.')} />
      <Card id="scr-general" scope="screen" title={t('General')} icon="monitor">
        <div class="grid grid--2">
          <Field label={t('Nombre de la pantalla')} error={errors['screen.name']}>
            <TextInput value={s.name} error={!!errors['screen.name']} onValue={(v) => set((d) => void (d.screen.name = v))} />
          </Field>
          <Field label={t('Idioma de la pantalla')}>
            <Select
              value={s.language}
              options={LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))}
              onChange={(v) => set((d) => void (d.screen.language = v))}
            />
          </Field>
          <Field label={t('Orientación')}>
            <Segmented
              full
              value={s.orientation}
              options={[
                { value: 'auto', label: t('Auto') },
                { value: 'landscape', label: t('Horizontal') },
                { value: 'portrait', label: t('Vertical') },
              ]}
              onChange={(v) => set((d) => void (d.screen.orientation = v))}
            />
          </Field>
          <Field label={t('Tamaño de letra')} error={errors['screen.fontScale']}>
            <Slider value={s.fontScale} min={0.7} max={1.6} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set((d) => void (d.screen.fontScale = v))} />
          </Field>
        </div>
      </Card>
      <PrivateLinkCard screenId={screenId} saved={saved} mode={saved.security?.displayAccess ?? 'open'} go={go} />
      <Card id="scr-night" scope="screen" title={t('Modo noche')} icon="moon" desc={t('Atenúa la pantalla durante la noche.')}>
        <ToggleRow label={t('Activar modo noche')} checked={nm.enabled} onChange={(v) => set((d) => void (d.screen.nightMode.enabled = v))} />
        <div class={`grid grid--3 ${nm.enabled ? '' : 'is-disabled'}`}>
          <Field label={t('Desde')} error={errors['screen.nightMode.from']}>
            <input class={`input ${errors['screen.nightMode.from'] ? 'is-invalid' : ''}`} type="time" value={nm.from} onInput={(e) => set((d) => void (d.screen.nightMode.from = e.currentTarget.value))} />
          </Field>
          <Field label={t('Hasta')} error={errors['screen.nightMode.to']}>
            <input class={`input ${errors['screen.nightMode.to'] ? 'is-invalid' : ''}`} type="time" value={nm.to} onInput={(e) => set((d) => void (d.screen.nightMode.to = e.currentTarget.value))} />
          </Field>
          <Field label={t('Brillo nocturno')}>
            <Slider value={nm.dim} min={0.05} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set((d) => void (d.screen.nightMode.dim = v))} />
          </Field>
        </div>
      </Card>
      <Card id="scr-echo" scope="screen" title={t('Echo Show')} icon="monitor" desc={t('Para pantallas Echo Show en Silk: mantiene la página abierta, pide pantalla completa al tocar y cierra fuera de horario.')}>
        <ToggleRow label={t('Activar modo Echo Show')} checked={ec.enabled} onChange={(v) => setEcho({ enabled: v })} />
        <div class={`grid grid--3 ${ec.enabled ? '' : 'is-disabled'}`}>
          <Field label={t('Mantener viva')}>
            <Segmented
              full
              value={ec.keepAlive}
              options={[
                { value: 'mp3', label: t('Audio mudo (mp3)') },
                { value: 'off', label: t('Apagado') },
              ]}
              onChange={(v) => setEcho({ keepAlive: v === 'off' ? 'off' : 'mp3' })}
            />
          </Field>
          <Field label={t('Abre a las')} error={errors['screen.echo.openFrom']}>
            <input class={`input ${errors['screen.echo.openFrom'] ? 'is-invalid' : ''}`} type="time" value={ec.openFrom} onInput={(e) => setEcho({ openFrom: e.currentTarget.value })} />
          </Field>
          <Field label={t('Cierra a las')} error={errors['screen.echo.openTo']}>
            <input class={`input ${errors['screen.echo.openTo'] ? 'is-invalid' : ''}`} type="time" value={ec.openTo} onInput={(e) => setEcho({ openTo: e.currentTarget.value })} />
          </Field>
        </div>
        <div class={ec.enabled ? '' : 'is-disabled'}>
          <ToggleRow label={t('Pantalla completa al tocar')} checked={ec.fullscreenOnTap} onChange={(v) => setEcho({ fullscreenOnTap: v })} />
          <ToggleRow label={t('Pasar a modo ligero si va lenta')} checked={ec.fpsGuard} onChange={(v) => setEcho({ fpsGuard: v })} />
        </div>
        <ToggleRow
          label={t('Alertas de persona')}
          hint={t('Abre la cámara a pantalla completa cuando Frigate ve a una persona en una zona.')}
          checked={s.cameras?.personAlerts ?? true}
          onChange={(v) => set((d) => void (d.screen.cameras = { personAlerts: v }))}
        />
      </Card>
      {has('privacy') && <PrivacyCard cfg={cfg} set={set} errors={errors} go={go} />}
      {has('customCss') && (
        <Card id="scr-css" scope="screen" title={t('CSS personalizado')} icon="wand" desc={t('Para usuarios avanzados: se inyecta en la pantalla.')}>
          <Field error={errors['screen.customCss']} hint={cssMax != null ? t('{used} de {max} KB', { used: kb(cssBytes(s.customCss)), max: kb(cssMax) }) : undefined}>
            <Textarea mono rows={6} value={s.customCss} placeholder={'.clock { letter-spacing: -0.02em; }'} onValue={(v) => set((d) => void (d.screen.customCss = v))} />
          </Field>
        </Card>
      )}
    </>
  );
}

export function SecuritySection({ cfg, set, errors, me, saved, go }: SectionProps) {
  const a = cfg.auth;
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [rep, setRep] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = next ? passwordProblem(next) : null;
  const problemText = problem === 'too_short' ? t('Mínimo {n} caracteres', { n: MIN_PASSWORD }) : problem === 'too_common' ? t('Demasiado común o sencilla') : problem === 'too_long' ? t('Máximo 200 caracteres') : '';
  const pwErr = problemText || (rep && rep !== next ? t('Las contraseñas no coinciden') : '');
  const change = async (e: Event) => {
    e.preventDefault();
    if (pwErr || !next || !cur) return;
    setBusy(true);
    try {
      await api.changePassword(cur, next);
      toast(t('Contraseña actualizada'));
      if (me.mustChangePassword) location.reload();
      setCur('');
      setNext('');
      setRep('');
    } catch (err) {
      const ae = err as ApiError;
      const code = (ae.body as any)?.code as string | undefined;
      toast(ae.status === 400 && code ? (code === 'too_common' ? t('Demasiado común o sencilla') : t('Mínimo {n} caracteres', { n: MIN_PASSWORD })) : [400, 401, 403].includes(ae.status) ? t('La contraseña actual no es correcta') : ae.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const emailErr = Object.keys(errors).find((k) => k.startsWith('auth.allowedGoogleEmails'));
  const pwOn = has('passwordLogin');
  const googleOn = offers('googleLogin');
  return (
    <>
      <PageHeader title={t('Seguridad')} desc={t('Quién puede entrar en este panel.')} />
      {me.user && (
        <Card>
          <div class="who">
            {me.user.picture ? <img class="avatar avatar--lg" src={me.user.picture} alt="" referrerpolicy="no-referrer" /> : <span class="avatar avatar--lg avatar--letter">{(me.user.name || me.user.email || 'A')[0].toUpperCase()}</span>}
            <div>
              <strong>{me.user.name || me.user.email}</strong>
              <div class="muted small">
                {me.user.email} · {me.user.method === 'google' ? t('sesión con Google') : me.user.method === 'account' ? t('sesión con tu cuenta') : t('sesión con contraseña')}
              </div>
            </div>
          </div>
        </Card>
      )}
      {has('openDisplayAccess') && (
        <DisplayAccessCard mode={cfg.security?.displayAccess ?? 'open'} savedMode={saved.security?.displayAccess ?? 'open'} onChange={(v) => set((d) => void (d.security = { ...(d.security ?? {}), displayAccess: v }))} go={go} />
      )}
      {googleOn && (
        <Card id="sec-google" title={t('Inicio de sesión con Google')} icon="google">
          {!me.googleConfigured && <Callout kind="warn">{t('Google no está configurado en el servidor (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).')}</Callout>}
          <Field
            label={t('Emails de Google permitidos')}
            error={emailErr ? errors[emailErr] : undefined}
            hint={t('Si la lista está vacía, el primer inicio con Google mientras tienes sesión con contraseña se añade automáticamente.')}
          >
            <Chips values={a.allowedGoogleEmails} placeholder="name@example.com" validate={(v) => EMAIL_RE.test(v)} onChange={(v) => set((d) => void (d.auth.allowedGoogleEmails = v))} />
          </Field>
          {me.googleConfigured && (
            <a class="btn btn--default" href="/auth/google/login">
              <GoogleG size={16} />
              <span>{t('Vincular mi cuenta de Google para entrar')}</span>
            </a>
          )}
        </Card>
      )}
      {pwOn && (
        <Card id="sec-password" title={t('Contraseña')} icon="key">
          {me.mustChangePassword && (
            <Callout kind="warn">{t('Estás usando la contraseña inicial. Cámbiala: hasta entonces solo se acepta desde tu red local.')}</Callout>
          )}
          {!me.mustChangePassword && me.passwordFromEnv && (
            <Callout>{t('La contraseña viene de ADMIN_PASSWORD (instalación sin asistente). Te recomendamos cambiarla aquí: después ya no se usará la del .env.')}</Callout>
          )}
          <ToggleRow
            label={t('Permitir entrar con contraseña')}
            hint={errors['auth.passwordLoginEnabled'] ? <span class="err-text">{t(errors['auth.passwordLoginEnabled'])}</span> : undefined}
            checked={a.passwordLoginEnabled}
            onChange={(v) => set((d) => void (d.auth.passwordLoginEnabled = v))}
          />
          <form class="pw-form" onSubmit={change}>
            <input type="text" name="username" autocomplete="username" value="admin" hidden readOnly />
            <Field label={t('Contraseña actual')}>
              <input class="input" type="password" autocomplete="current-password" value={cur} onInput={(e) => setCur(e.currentTarget.value)} />
            </Field>
            <div class="grid grid--2">
              <Field label={t('Nueva contraseña')} error={problemText || undefined} hint={t('Mínimo {n} caracteres; nada obvio.', { n: MIN_PASSWORD })}>
                <input class="input" type="password" autocomplete="new-password" value={next} onInput={(e) => setNext(e.currentTarget.value)} />
              </Field>
              <Field label={t('Repetir contraseña')} error={rep && rep !== next ? t('Las contraseñas no coinciden') : undefined}>
                <input class="input" type="password" autocomplete="new-password" value={rep} onInput={(e) => setRep(e.currentTarget.value)} />
              </Field>
            </div>
            <div>
              <Button type="submit" variant="primary" icon="shield" loading={busy} disabled={!!pwErr || !cur || !next || rep !== next}>
                {t('Cambiar contraseña')}
              </Button>
            </div>
          </form>
        </Card>
      )}
      {has('twoFactor') && me.user && <TwoFactorCard me={me} />}
      {(pwOn || googleOn) && (
        <Card id="sec-sessions" title={t('Sesiones')} icon="shield">
          <p class="muted small">{t('Cierra la sesión en todos los navegadores y dispositivos (también en este). Cambiar la contraseña cierra las demás sesiones automáticamente.')}</p>
          <div>
            <Button
              variant="default"
              icon="logout"
              onClick={async () => {
                try {
                  await api.logoutAll();
                } catch {
                  /* ignore */
                }
                location.reload();
              }}
            >
              {t('Cerrar sesión en todos los dispositivos')}
            </Button>
          </div>
        </Card>
      )}
      <Callout>
        {t('Las URLs de los calendarios, los tokens y las claves de las pantallas nunca se envían a otras pantallas ni aparecen en el registro de actividad.')}
      </Callout>
    </>
  );
}

function DisplayAccessCard({ mode, savedMode, onChange, go }: { mode: 'private' | 'open'; savedMode: 'private' | 'open'; onChange: (v: 'private' | 'open') => void; go: (r: string) => void }) {
  const opts: { v: 'private' | 'open'; icon: 'key' | 'wifi'; title: string; body: string; badge?: string }[] = [
    {
      v: 'private',
      icon: 'key',
      title: t('Privado'),
      badge: t('Recomendado'),
      body: t('Cada pantalla entra con su enlace privado (/d/…) o vinculándola con un código. Sin clave no se ve nada: seguro en redes compartidas o si Marco es accesible desde Internet.'),
    },
    {
      v: 'open',
      icon: 'wifi',
      title: t('Abierto (red local)'),
      body: t('Como antes de la versión 0.3: cualquiera que llegue a la dirección del servidor ve el calendario sin clave. Úsalo solo en una red doméstica de confianza.'),
    },
  ];
  return (
    <Card id="sec-display" title={t('Acceso a las pantallas')} icon="monitor" desc={t('Quién puede ver el calendario familiar en una pantalla.')}>
      <div class="access-mode" role="radiogroup" aria-label={t('Acceso a las pantallas')}>
        {opts.map((o) => (
          <button type="button" role="radio" aria-checked={mode === o.v} class={`access-mode__opt ${mode === o.v ? 'is-active' : ''}`} onClick={() => onChange(o.v)}>
            <Icon name={o.icon} size={18} />
            <div>
              <strong>
                {o.title}
                {o.badge && <span class="badge badge--soft">{o.badge}</span>}
              </strong>
              <p>{o.body}</p>
            </div>
          </button>
        ))}
      </div>
      {mode === 'open' && savedMode === 'open' && (
        <Callout kind="warn">{t('Las pantallas están en modo abierto: cualquiera que llegue a este servidor puede ver el calendario sin clave. Recomendado: enlaces privados y vinculación.')}</Callout>
      )}
      {mode === 'private' && savedMode === 'open' && (
        <Callout kind="warn">
          {t('Al guardar, las pantallas que ahora entran sin clave mostrarán un código de vinculación. Abre en cada una su enlace privado (Pantalla → Ajustes) o vincúlala desde Pantallas conectadas. En un kiosco Raspberry Pi pon el enlace privado en KIOSK_URL (~/.config/marco/kiosk.env): allí la vinculación se pierde al reiniciarse.')}
        </Callout>
      )}
      {mode === 'open' && savedMode === 'private' && (
        <Callout kind="warn">{t('Al guardar, cualquiera que llegue a la dirección del servidor podrá ver el calendario sin clave. Las pantallas que muestran un código de vinculación vuelven solas en menos de un minuto.')}</Callout>
      )}
      <p class="muted small">
        {t('Los enlaces privados están en Pantalla → Ajustes; los dispositivos vinculados, en Pantallas conectadas.')}{' '}
        <button type="button" class="link-btn" onClick={() => go('screen/scr-link')}>
          {t('Ver el enlace de esta pantalla')}
        </button>
      </p>
    </Card>
  );
}
