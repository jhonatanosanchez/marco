// Two-step sign-in (server/twofactor.js): the Security card that turns it on and off, and the code step of the
// sign-in page. The QR code is drawn here (web/shared/qr.ts), the secret never leaves this browser and the server.
import { useEffect, useState } from 'preact/hooks';
import type { AuthMeResponse, TwoFactorSetup, TwoFactorStatus } from '../../shared/types';
import { api, ApiError } from '../api';
import { toast } from './feedback';
import { Icon } from './icons';
import { CopyField, Qr, copyText } from './share';
import { Button, Callout, Card, Field, Modal } from './ui';
import { relTime, t } from '../i18n';
import '../twofactor.css';

const errCode = (e: unknown) => ((e as ApiError)?.body as { code?: string } | null)?.code ?? '';

/** Text for an error answer of the settings endpoints. */
function proofError(e: unknown): string {
  const ae = e as ApiError;
  const code = errCode(e);
  if (ae.status === 429) return t('Demasiados intentos. Espera un momento.');
  if (code === 'password_incorrect') return t('Contraseña incorrecta');
  if (code === 'code_incorrect' || code === 'code_invalid') return t('El código no es correcto. Comprueba que la hora del móvil está bien y prueba con el siguiente.');
  if (code === 'reauth_required' || code === 'password_required') return t('Por seguridad, cierra la sesión y vuelve a entrar antes de cambiar esto.');
  if (code === 'expired' || code === 'no_setup') return t('La configuración ha caducado. Empieza otra vez.');
  return ae.message === 'network' ? t('No se puede conectar con el servidor') : ae.message;
}

/** "ABCD EFGH …": easier to type into an app by hand. */
const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

function RecoveryCodes({ codes }: { codes: string[] }) {
  const text = codes.join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${t('Códigos de recuperación de Marco')}\n\n${text}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marco-recovery-codes.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div class="tfa-codes">
      <Callout kind="warn">{t('Guárdalos en un sitio seguro. Cada uno sirve una sola vez para entrar si no tienes el móvil a mano. No los volverás a ver.')}</Callout>
      <ol class="tfa-codes__list">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ol>
      <div class="tfa-row">
        <Button size="sm" icon="copy" onClick={async () => { const ok = await copyText(text); toast(ok ? t('Copiado') : t('No se pudo copiar'), ok ? 'ok' : 'error'); }}>
          {t('Copiar')}
        </Button>
        <Button size="sm" icon="download" onClick={download}>
          {t('Descargar')}
        </Button>
      </div>
    </div>
  );
}

/** Password (sessions signed in with it) or a code, for turning it off and for new recovery codes. */
function ProofModal({ title, confirm, danger, canPassword, onProof, onClose }: {
  title: string;
  confirm: string;
  danger?: boolean;
  canPassword: boolean;
  onProof: (proof: { password?: string; code?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [usePw, setUsePw] = useState(canPassword);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await onProof(usePw ? { password: value } : { code: value.trim() });
    } catch (e2) {
      setErr(proofError(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} icon="shield" size="sm" onClose={onClose}>
      <form class="tfa-form" onSubmit={submit}>
        {usePw ? (
          <Field label={t('Contraseña actual')}>
            <input class="input" type="password" autocomplete="current-password" value={value} onInput={(e) => setValue(e.currentTarget.value)} />
          </Field>
        ) : (
          <Field label={t('Código de la app o de recuperación')}>
            <input class="input tfa-code-input" inputMode="numeric" autocomplete="one-time-code" spellcheck={false} maxLength={14} value={value} onInput={(e) => setValue(e.currentTarget.value)} />
          </Field>
        )}
        {err && <p class="err-text">{err}</p>}
        <div class="tfa-row">
          <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy} disabled={!value.trim()}>
            {confirm}
          </Button>
          {canPassword && (
            <button type="button" class="link-btn" onClick={() => { setUsePw(!usePw); setValue(''); setErr(''); }}>
              {usePw ? t('Usar un código en su lugar') : t('Usar la contraseña en su lugar')}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function SetupModal({ setup, onDone, onClose }: { setup: TwoFactorSetup; onDone: () => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await api.twoFactorEnable(code.trim());
      setCodes(r.recoveryCodes);
      onDone();
    } catch (e2) {
      setErr(proofError(e2));
    } finally {
      setBusy(false);
    }
  };
  if (codes) {
    return (
      <Modal title={t('Verificación en dos pasos activada')} icon="shield" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>{t('Ya los he guardado')}</Button>}>
        <p>{t('A partir de ahora, al entrar se pedirá el código de la app. Las sesiones abiertas siguen abiertas.')}</p>
        <RecoveryCodes codes={codes} />
      </Modal>
    );
  }
  return (
    <Modal title={t('Activar la verificación en dos pasos')} icon="shield" onClose={onClose} dirty={!!code}>
      <ol class="tfa-steps">
        <li>{t('Abre tu app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password, Aegis…) y añade una cuenta nueva.')}</li>
        <li>
          {t('Escanea este código QR. Si no puedes, escribe la clave a mano.')}
          <div class="tfa-qr">
            <Qr text={setup.uri} label={t('Código QR para la app de autenticación')} />
            <div class="tfa-qr__key">
              <span class="muted small">{t('Clave')}</span>
              <CopyField value={grouped(setup.secret)} />
            </div>
          </div>
        </li>
        <li>
          {t('Escribe el código de 6 cifras que muestra la app.')}
          <form class="tfa-form" onSubmit={submit}>
            <input
              class="input tfa-code-input"
              inputMode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              placeholder="123456"
              aria-label={t('Código de 6 cifras')}
              value={code}
              onInput={(e) => setCode(e.currentTarget.value)}
            />
            {err && <p class="err-text">{err}</p>}
            <div>
              <Button type="submit" variant="primary" icon="check" loading={busy} disabled={code.replace(/\D/g, '').length !== 6}>
                {t('Activar')}
              </Button>
            </div>
          </form>
        </li>
      </ol>
    </Modal>
  );
}

/** Security → Two-step sign-in. */
export function TwoFactorCard({ me }: { me: AuthMeResponse }) {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [starting, setStarting] = useState(false);
  const [ask, setAsk] = useState<'disable' | 'codes' | 'password' | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const passwordSession = me.user?.method === 'password';

  const load = async () => {
    try {
      setStatus(await api.twoFactorStatus());
      setLoadErr('');
    } catch (e) {
      setLoadErr(proofError(e));
    }
  };
  useEffect(() => void load(), []);

  const start = async (password?: string) => {
    setStarting(true);
    try {
      setSetup(await api.twoFactorSetup(password));
      setAsk(null);
    } catch (e) {
      const code = errCode(e);
      // no sign-in in the last 10 minutes: the password first (a Google session signs in again)
      if ((code === 'password_required' || code === 'password_incorrect') && passwordSession && !password) setAsk('password');
      else if (password) throw e;
      else toast(proofError(e), 'error');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Card id="sec-2fa" title={t('Verificación en dos pasos')} icon="shield" desc={t('Además de la contraseña, al entrar se pide un código de una app de autenticación del móvil.')}>
      {loadErr && <Callout kind="error">{loadErr}</Callout>}
      {!status && !loadErr && <div class="skeleton tfa-skeleton" />}
      {status && !status.enabled && (
        <div class="tfa-row">
          <span class="tfa-state">
            <Icon name="shield" size={15} /> {t('Desactivada')}
          </span>
          <Button variant="primary" icon="shield" loading={starting} onClick={() => start()}>
            {t('Activar')}
          </Button>
        </div>
      )}
      {status?.enabled && (
        <>
          <div class="tfa-row">
            <span class="tfa-state is-on">
              <Icon name="check" size={15} /> {status.enabledAt ? t('Activada {when}', { when: relTime(status.enabledAt) }) : t('Activada')}
            </span>
            <span class={`muted small ${status.recoveryLeft <= 2 ? 'err-text' : ''}`}>
              {status.recoveryLeft === 1 ? t('Queda 1 código de recuperación') : t('Quedan {n} códigos de recuperación', { n: status.recoveryLeft })}
            </span>
          </div>
          <p class="muted small">{t('Si pierdes el móvil, entra con uno de tus códigos de recuperación.')}</p>
          <div class="tfa-row">
            <Button icon="refresh" onClick={() => setAsk('codes')}>
              {t('Nuevos códigos de recuperación')}
            </Button>
            <Button variant="ghost" icon="x" onClick={() => setAsk('disable')}>
              {t('Desactivar')}
            </Button>
          </div>
        </>
      )}
      {ask === 'password' && (
        <ProofModal
          title={t('Confirma tu contraseña')}
          confirm={t('Continuar')}
          canPassword
          onProof={async (p) => start(p.password)}
          onClose={() => setAsk(null)}
        />
      )}
      {ask === 'disable' && (
        <ProofModal
          title={t('Desactivar la verificación en dos pasos')}
          confirm={t('Desactivar')}
          danger
          canPassword={passwordSession}
          onProof={async (p) => {
            await api.twoFactorDisable(p);
            setAsk(null);
            toast(t('Verificación en dos pasos desactivada'));
            load();
          }}
          onClose={() => setAsk(null)}
        />
      )}
      {ask === 'codes' && (
        <ProofModal
          title={t('Nuevos códigos de recuperación')}
          confirm={t('Crear códigos nuevos')}
          canPassword={passwordSession}
          onProof={async (p) => {
            const r = await api.twoFactorRecoveryCodes(p);
            setAsk(null);
            setNewCodes(r.recoveryCodes);
            load();
          }}
          onClose={() => setAsk(null)}
        />
      )}
      {newCodes && (
        <Modal title={t('Nuevos códigos de recuperación')} icon="shield" onClose={() => setNewCodes(null)} footer={<Button variant="primary" onClick={() => setNewCodes(null)}>{t('Ya los he guardado')}</Button>}>
          <p>{t('Los códigos anteriores ya no sirven.')}</p>
          <RecoveryCodes codes={newCodes} />
        </Modal>
      )}
      {setup && <SetupModal setup={setup} onDone={load} onClose={() => setSetup(null)} />}
    </Card>
  );
}

/**
 * The sign-in page after a correct password (or Google): the code from the app, or a recovery code. `onExpired`
 * goes back to the password (the server forgot the challenge: too slow, too many wrong codes, or a restart).
 */
export function TwoFactorStep({ onDone, onExpired, onError }: { onDone: () => void; onExpired: (msg: string) => void; onError: (msg: string) => void }) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    onError('');
    try {
      await api.login2fa(code.trim());
      onDone();
    } catch (e2) {
      const ae = e2 as ApiError;
      const body = (ae.body ?? {}) as { code?: string; attemptsLeft?: number };
      if (body.code === 'challenge_expired') onExpired(t('Ha pasado demasiado tiempo o ha habido demasiados intentos. Vuelve a escribir la contraseña.'));
      else if (ae.status === 429) onError(t('Demasiados intentos. Espera un momento.'));
      else if (ae.status === 401) onError(body.attemptsLeft === 1 ? t('Código incorrecto. Te queda 1 intento.') : t('Código incorrecto. Te quedan {n} intentos.', { n: body.attemptsLeft ?? 0 }));
      else onError(ae.message === 'network' ? t('No se puede conectar con el servidor') : ae.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} class="login__form">
      <p class="muted tfa-hint">{recovery ? t('Escribe uno de tus códigos de recuperación.') : t('Escribe el código de 6 cifras de tu app de autenticación.')}</p>
      <div class="input-group input-group--lg">
        <span class="input-group__addon">
          <Icon name="shield" size={16} />
        </span>
        <input
          key={recovery ? 'r' : 'c'}
          class="input tfa-code-input"
          inputMode={recovery ? 'text' : 'numeric'}
          autocomplete={recovery ? 'off' : 'one-time-code'}
          autocapitalize="off"
          spellcheck={false}
          maxLength={recovery ? 14 : 7}
          placeholder={recovery ? 'xxxxx-xxxxx' : '123456'}
          aria-label={recovery ? t('Código de recuperación') : t('Código de 6 cifras')}
          value={code}
          autoFocus
          onInput={(e) => setCode(e.currentTarget.value)}
        />
      </div>
      <button type="submit" class={`btn btn--primary btn--block btn--lg ${busy ? 'is-loading' : ''}`} disabled={busy || !code.trim()}>
        {busy ? <span class="spinner" /> : null}
        <span>{t('Verificar')}</span>
      </button>
      <div class="tfa-alt">
        <button type="button" class="link-btn" onClick={() => { setRecovery(!recovery); setCode(''); onError(''); }}>
          {recovery ? t('Usar el código de la app') : t('Usar un código de recuperación')}
        </button>
        <button type="button" class="link-btn" onClick={() => onExpired('')}>
          {t('Volver')}
        </button>
      </div>
    </form>
  );
}
