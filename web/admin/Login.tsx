import { useState } from 'preact/hooks';
import type { AuthMeResponse } from '../shared/types';
import { api, ApiError } from './api';
import { GoogleG, Icon } from './components/icons';
import { t } from './i18n';

export function Login({ me, onDone, initialError }: { me: AuthMeResponse; onDone: () => void; initialError?: string }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(initialError ?? '');
  const [shake, setShake] = useState(0);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    setErr('');
    try {
      await api.login(pw);
      onDone();
    } catch (e2) {
      const ae = e2 as ApiError;
      if (ae.status === 409) return location.reload(); // the install has no password yet → setup wizard
      setErr(ae.status === 401 ? t('Contraseña incorrecta') : ae.status === 429 ? t('Demasiados intentos. Espera un momento.') : ae.status === 403 && /default password/.test(ae.message) ? t('La contraseña inicial solo funciona desde tu red local. Cámbiala desde la red local primero.') : ae.message === 'network' ? t('No se puede conectar con el servidor') : ae.message);
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const now = new Date();
  return (
    <div class="login">
      <div class="login__bg" aria-hidden="true">
        <span class="blob blob--a" />
        <span class="blob blob--b" />
        <span class="blob blob--c" />
      </div>
      <div class={`login__card ${shake ? 'shake' : ''}`} key={shake}>
        <div class="login__logo">
          <div class="cal-badge">
            <span class="cal-badge__m">{now.toLocaleDateString(undefined, { month: 'short' }).replace('.', '')}</span>
            <span class="cal-badge__d">{now.getDate()}</span>
          </div>
        </div>
        <h1>{t('Panel de la pantalla')}</h1>
        <p class="muted">{t('Gestiona calendarios, fotos, tiempo y todo lo que se ve en casa.')}</p>
        {me.passwordLoginEnabled && (
          <form onSubmit={submit} class="login__form">
            <input type="text" name="username" autocomplete="username" value="admin" hidden readOnly />
            <div class="input-group input-group--lg">
              <span class="input-group__addon">
                <Icon name="key" size={16} />
              </span>
              <input
                class="input"
                type={(show ? 'text' : 'password') as 'password'}
                autocomplete="current-password"
                placeholder={t('Contraseña')}
                value={pw}
                autoFocus
                onInput={(e) => setPw(e.currentTarget.value)}
              />
              <button type="button" class="input-group__btn" onClick={() => setShow(!show)} aria-label={t('Mostrar')}>
                <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
              </button>
            </div>
            <button type="submit" class={`btn btn--primary btn--block btn--lg ${busy ? 'is-loading' : ''}`} disabled={busy || !pw}>
              {busy ? <span class="spinner" /> : null}
              <span>{t('Entrar')}</span>
            </button>
          </form>
        )}
        {me.passwordLoginEnabled && me.googleConfigured && (
          <div class="divider">
            <span>{t('o')}</span>
          </div>
        )}
        {me.googleConfigured && (
          <a class="btn btn--google btn--block btn--lg" href="/auth/google/login">
            <GoogleG size={18} />
            <span>{t('Entrar con Google')}</span>
          </a>
        )}
        {!me.passwordLoginEnabled && !me.googleConfigured && <div class="callout callout--warn">{t('No hay ningún método de acceso habilitado. Revisa la configuración del servidor.')}</div>}
        {err && (
          <div class="login__err" role="alert">
            <Icon name="alert" size={14} /> {err}
          </div>
        )}
      </div>
      <a class="login__screen-link" href="/">
        <Icon name="monitor" size={14} /> {t('Ver la pantalla')}
      </a>
    </div>
  );
}
