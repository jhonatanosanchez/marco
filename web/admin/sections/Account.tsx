// Account page for multi-tenant servers (Marco Cloud). It takes the place of the Security page. The household can
// be renamed here; with features.accountSettings the whole account lives here too (language, password, two-step
// verification, Google sign-in, sessions, data and deleting the account, on the server's account endpoints).
// Without it, the page links out to the server's own account pages.
// Loaded lazily by App.tsx, so self-hosted installs never download it.
import { useEffect, useState } from 'preact/hooks';
import type { AccountGoogleStatus, AccountSession, AuthMeResponse, Lang } from '../../shared/types';
import { LANG_NAMES, LANGS } from '../../shared/i18n';
import { MIN_PASSWORD, passwordProblem } from '../../shared/password';
import { api, ApiError } from '../api';
import { accountLinks, cleanHouseholdName, HOUSEHOLD_NAME_MAX } from '../authRedirect';
import { has } from '../caps';
import { confirmDialog, toast } from '../components/feedback';
import { GoogleG, Icon } from '../components/icons';
import { TwoFactorCard, type TwoFactorClient } from '../components/TwoFactor';
import { Button, Callout, Card, Field, PageHeader, Select, TextInput } from '../components/ui';
import { getLang, locale, relTime, t } from '../i18n';
import type { SectionProps } from './common';

export function AccountSection({ me, updateMe, setLang }: SectionProps) {
  const user = me.user;
  const household = me.account?.household ?? null;
  const links = accountLinks(me);
  const settings = has('accountSettings');
  const owner = household?.role === 'owner';
  const [name, setName] = useState(household?.name ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(household?.name ?? ''), [household?.name]);
  const clean = cleanHouseholdName(name);
  const changed = !!household && clean !== household.name;

  const rename = async (e: Event) => {
    e.preventDefault();
    if (!clean || !changed || busy) return;
    setBusy(true);
    try {
      const r = await api.renameHousehold(clean);
      const next = r?.household?.name ? r.household : { ...household!, name: clean };
      if (me.account) updateMe?.({ ...me, account: { ...me.account, household: next } });
      setName(next.name);
      toast(t('Nombre del hogar guardado'));
    } catch (err) {
      const ae = err as ApiError;
      if (ae.status !== 401) toast(`${t('No se pudo guardar')}: ${ae.message === 'network' ? t('servidor no disponible') : ae.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const since = settings && user?.createdAt ? memberSince(user.createdAt) : '';

  return (
    <>
      <PageHeader title={t('Cuenta')} desc={settings ? t('Tu cuenta, cómo entras y el hogar que gestionas desde este panel.') : t('Tu cuenta y el hogar que gestionas desde este panel.')} />
      {user && (
        <Card>
          <div class="who account-who">
            {user.picture ? <img class="avatar avatar--lg" src={user.picture} alt="" referrerpolicy="no-referrer" /> : <span class="avatar avatar--lg avatar--letter">{(user.name || user.email || 'A')[0].toUpperCase()}</span>}
            <div class="account-who__text">
              <strong>{settings ? user.email : user.name || user.email}</strong>
              <div class="muted small">{settings ? since || t('sesión con tu cuenta') : `${user.email} · ${t('sesión con tu cuenta')}`}</div>
            </div>
            {settings && <SignOutButton />}
          </div>
        </Card>
      )}
      {!household && <Callout kind="warn">{t('No se pudieron cargar los datos de la cuenta. Recarga la página.')}</Callout>}
      {household && (
        <Card id="acc-household" title={t('Hogar')} icon="home" desc={owner ? t('El nombre aparece en tu cuenta y en los correos.') : t('Solo el propietario puede cambiar el nombre.')}>
          <form class="account-rename" onSubmit={rename}>
            <Field label={t('Nombre del hogar')} htmlFor="acc-household-name" hint={`${t('Tu rol')}: ${roleLabel(household.role)}`} error={owner && name && !clean ? t('Escribe un nombre') : undefined}>
              <TextInput id="acc-household-name" value={name} onValue={setName} maxLength={HOUSEHOLD_NAME_MAX} disabled={!owner || busy} autocomplete="off" />
            </Field>
            {owner && (
              <Button type="submit" variant="primary" icon="check" loading={busy} disabled={!clean || !changed}>
                {t('Guardar nombre')}
              </Button>
            )}
          </form>
        </Card>
      )}
      {settings && user ? (
        <AccountSettings me={me} updateMe={updateMe} setLang={setLang} />
      ) : (
        links && (
          <Card id="acc-links" title={t('Cuenta y sesiones')} icon="user" desc={t('Se abren en las páginas de tu cuenta.')}>
            <div class="account-links">
              {links.account && (
                <a class="btn btn--default" href={links.account}>
                  <Icon name="user" size={17} />
                  <span>{t('Gestionar cuenta')}</span>
                </a>
              )}
              {links.sessions && (
                <a class="btn btn--default" href={links.sessions}>
                  <Icon name="shield" size={17} />
                  <span>{t('Sesiones abiertas')}</span>
                </a>
              )}
              {links.remove && (
                <a class="btn btn--danger" href={links.remove}>
                  <Icon name="trash" size={17} />
                  <span>{t('Eliminar cuenta')}</span>
                </a>
              )}
            </div>
          </Card>
        )
      )}
    </>
  );
}

function roleLabel(role: string): string {
  return role === 'owner' ? t('Propietario') : t('Miembro');
}

function memberSince(ms: number): string {
  try {
    return t('En Marco desde el {date}', { date: new Intl.DateTimeFormat(locale(), { dateStyle: 'long' }).format(new Date(ms)) });
  } catch {
    return '';
  }
}

/** Where the browser goes once this session has ended (signed out, account deleted). */
const leave = (q: string) => location.assign(`/login?${q}`);

/** Text for an error answer of the account endpoints (Marco Cloud codes in `error`, some in `code`). */
function accountError(e: unknown): string {
  const ae = e as ApiError;
  const b = (ae?.body ?? {}) as { error?: unknown; code?: unknown };
  const code = typeof b.code === 'string' ? b.code : typeof b.error === 'string' ? b.error : '';
  if (ae.message === 'network') return t('No se puede conectar con el servidor');
  if (code === 'reauth') return t('Por seguridad, cierra la sesión y vuelve a entrar antes de cambiar esto.');
  if (code === 'wrong_password') return t('La contraseña actual no es correcta');
  if (code === 'locked' || ae.status === 429) return t('Demasiados intentos. Espera un momento.');
  if (code === 'password_too_short') return t('Mínimo {n} caracteres', { n: MIN_PASSWORD });
  if (code === 'password_too_long') return t('Máximo 200 caracteres');
  if (code === 'password_common') return t('Demasiado común o sencilla');
  if (code === 'password_is_email') return t('La contraseña no puede ser tu email');
  if (code === 'mail_unavailable') return t('Ahora mismo no se pueden enviar correos. Inténtalo más tarde.');
  return ae.message;
}

function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      icon="logout"
      loading={busy}
      class="account-who__out"
      onClick={async () => {
        setBusy(true);
        try {
          await api.logout();
        } catch {
          /* signed out already */
        }
        leave('signedout=1');
      }}
    >
      {t('Cerrar sesión')}
    </Button>
  );
}

/** The account endpoints of Marco Cloud behind the two-step card (components/TwoFactor.tsx). */
const ACCOUNT_2FA: TwoFactorClient = {
  status: () => api.accountTwoFactorStatus(),
  setup: (password) => api.accountTwoFactorSetup(password),
  enable: (code) => api.accountTwoFactorEnable(code),
  disable: (proof) => api.accountTwoFactorDisable(proof),
  recoveryCodes: (proof) => api.accountTwoFactorRecoveryCodes(proof),
};

function AccountSettings({ me, updateMe, setLang }: { me: AuthMeResponse; updateMe?: (m: AuthMeResponse) => void; setLang?: (l: Lang) => void }) {
  const user = me.user!;
  const hasPassword = user.hasPassword !== false;
  const [sessionsKey, setSessionsKey] = useState(0);
  return (
    <>
      <LanguageCard setLang={setLang} />
      <PasswordCard
        email={user.email}
        hasPassword={hasPassword}
        onDone={() => {
          if (!hasPassword) updateMe?.({ ...me, user: { ...user, hasPassword: true } });
          setSessionsKey((k) => k + 1);
        }}
      />
      <TwoFactorCard key={hasPassword ? 'pw' : 'nopw'} me={me} client={ACCOUNT_2FA} desc={t('Al entrar, además de la contraseña, el enlace por email o Google, se pide un código de una app de autenticación del móvil.')} />
      <GoogleCard email={user.email} />
      <SessionsCard key={sessionsKey} />
      <Card id="acc-data" title={t('Tus datos')} icon="download" desc={t('Descarga una copia de todo lo que guardamos sobre tu cuenta, en un archivo JSON.')}>
        <div>
          <a class="btn btn--default" href="/api/account/export" download>
            <Icon name="download" size={17} />
            <span>{t('Descargar mis datos')}</span>
          </a>
        </div>
        <p class="muted small">{t('La configuración de las pantallas se exporta aparte, en Copias de seguridad.')}</p>
      </Card>
      <DeleteCard hasPassword={hasPassword} />
    </>
  );
}

function LanguageCard({ setLang }: { setLang?: (l: Lang) => void }) {
  const lang = getLang();
  return (
    <Card id="acc-lang" title={t('Idioma')} icon="globe" desc={t('El de este panel y el de los correos que te enviamos.')}>
      <div class="account-lang">
        <Select
          value={lang}
          options={LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))}
          onChange={async (l) => {
            if (setLang) setLang(l);
            else {
              try {
                await api.accountLang(l);
              } catch (e) {
                toast(accountError(e), 'error');
              }
            }
          }}
        />
      </div>
    </Card>
  );
}

function PasswordCard({ email, hasPassword, onDone }: { email: string; hasPassword: boolean; onDone: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [rep, setRep] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const problem = next ? passwordProblem(next) : null;
  const problemText = problem === 'too_short' ? t('Mínimo {n} caracteres', { n: MIN_PASSWORD }) : problem === 'too_common' ? t('Demasiado común o sencilla') : problem === 'too_long' ? t('Máximo 200 caracteres') : '';
  const ready = !problemText && !!next && rep === next && (!hasPassword || !!cur);
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api.accountPassword(next, hasPassword ? cur : undefined);
      toast(hasPassword ? t('Contraseña cambiada. Hemos cerrado la sesión en tus otros dispositivos.') : t('Contraseña guardada. Ya puedes entrar también con ella.'));
      setCur('');
      setNext('');
      setRep('');
      onDone();
    } catch (e2) {
      setErr(accountError(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      id="sec-password"
      title={t('Contraseña')}
      icon="key"
      desc={hasPassword ? t('Al cambiarla se cierra la sesión en tus otros dispositivos.') : t('Ahora entras con un enlace por email o con Google. Si quieres, pon también una contraseña.')}
    >
      <form class="pw-form account-pw" onSubmit={submit}>
        <input type="email" name="username" autocomplete="username" value={email} hidden readOnly />
        {hasPassword && (
          <Field label={t('Contraseña actual')}>
            <input class="input" type="password" autocomplete="current-password" maxLength={256} value={cur} onInput={(e) => setCur(e.currentTarget.value)} />
          </Field>
        )}
        <div class="grid grid--2">
          <Field label={t('Nueva contraseña')} error={problemText || undefined} hint={t('Mínimo {n} caracteres; nada obvio.', { n: MIN_PASSWORD })}>
            <input class="input" type="password" autocomplete="new-password" maxLength={256} value={next} onInput={(e) => setNext(e.currentTarget.value)} />
          </Field>
          <Field label={t('Repetir contraseña')} error={rep && rep !== next ? t('Las contraseñas no coinciden') : undefined}>
            <input class="input" type="password" autocomplete="new-password" maxLength={256} value={rep} onInput={(e) => setRep(e.currentTarget.value)} />
          </Field>
        </div>
        {err && <p class="err-text">{err}</p>}
        <div>
          <Button type="submit" variant="primary" icon="shield" loading={busy} disabled={!ready}>
            {hasPassword ? t('Cambiar contraseña') : t('Poner contraseña')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function GoogleCard({ email }: { email: string }) {
  const [g, setG] = useState<AccountGoogleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    api
      .accountGoogle()
      .then(setG)
      .catch(() => setG(null));
  useEffect(() => void load(), []);
  if (!g || (!g.enabled && !g.linked)) return null;
  const disconnect = async () => {
    const ok = await confirmDialog({
      title: t('¿Desconectar Google de tu cuenta de Marco?'),
      body: g.hasPassword ? t('Podrás seguir entrando con tu contraseña o con un enlace por email.') : t('Podrás seguir entrando con un enlace por email.'),
      confirm: t('Desconectar'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.accountGoogleDisconnect();
      toast(t('Google desconectado'));
      await load();
    } catch (e) {
      toast(accountError(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card id="acc-google" title={t('Entrar con Google')} icon="google">
      <div class="tfa-row">
        <span class={`tfa-state ${g.linked ? 'is-on' : ''}`}>
          <GoogleG size={15} /> {g.linked ? t('Conectada') : t('Sin conectar')}
        </span>
        {g.linked && (
          <Button variant="ghost" icon="x" loading={busy} onClick={disconnect}>
            {t('Desconectar')}
          </Button>
        )}
      </div>
      <p class="muted small">
        {g.linked
          ? t('Puedes entrar con la cuenta de Google {email}. Si la desconectas y vuelves a usar «Continuar con Google» con esa dirección, se conecta otra vez.', { email: g.linked.email })
          : t('Si usas «Continuar con Google» con {email} al entrar, se conecta sola.', { email })}
      </p>
    </Card>
  );
}

function countryName(code: string | null): string {
  if (!code || code === 'XX' || code === 'T1') return '';
  try {
    return new Intl.DisplayNames([locale()], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

function SessionsCard() {
  const [list, setList] = useState<AccountSession[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [allBusy, setAllBusy] = useState(false);
  const load = () =>
    api
      .accountSessions()
      .then((r) => {
        // this device first, then the most recently active
        setList([...r.sessions].sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt - a.lastSeenAt));
        setFailed(false);
      })
      .catch(() => setFailed(true));
  useEffect(() => void load(), []);
  const revoke = async (s: AccountSession) => {
    setBusyId(s.id);
    try {
      const r = await api.accountRevokeSession(s.id);
      if (r.current) return leave('signedout=1');
      toast(t('Sesión cerrada'));
      await load();
    } catch (e) {
      toast(accountError(e), 'error');
    } finally {
      setBusyId('');
    }
  };
  const all = async () => {
    const ok = await confirmDialog({
      title: t('¿Cerrar sesión en todos los dispositivos?'),
      body: t('También en este. Tendrás que volver a entrar.'),
      confirm: t('Cerrar todas'),
      danger: true,
    });
    if (!ok) return;
    setAllBusy(true);
    try {
      await api.logoutAll();
    } catch {
      /* signed out already */
    }
    leave('signedout=1');
  };
  return (
    <Card id="acc-sessions" title={t('Sesiones abiertas')} icon="monitor" desc={t('Dónde tienes la sesión abierta. Cierra la de cualquier dispositivo que no reconozcas.')}>
      {failed && <Callout kind="error">{t('No se pudieron cargar las sesiones.')}</Callout>}
      {!list && !failed && <div class="skeleton tfa-skeleton" />}
      {list && (
        <ul class="dev-list">
          {list.map((s) => {
            const place = countryName(s.country);
            return (
              <li class="dev" key={s.id}>
                <span class={`dev__state ${s.current ? 'is-on' : ''}`}>
                  <Icon name={s.current ? 'check' : 'monitor'} size={15} />
                </span>
                <div class="dev__main">
                  <strong>
                    {s.label || t('Navegador')}
                    {s.current && <span class="badge badge--soft account-badge">{t('Este dispositivo')}</span>}
                  </strong>
                  <span class="muted small">
                    {t('Última actividad {when}', { when: relTime(s.lastSeenAt) })}
                    {place ? ` · ${place}` : ''}
                  </span>
                </div>
                <div class="dev__actions">
                  <Button size="sm" variant="ghost" icon="logout" loading={busyId === s.id} onClick={() => revoke(s)}>
                    {t('Cerrar sesión')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <Button icon="logout" loading={allBusy} onClick={all}>
          {t('Cerrar sesión en todos los dispositivos')}
        </Button>
      </div>
    </Card>
  );
}

function DeleteCard({ hasPassword }: { hasPassword: boolean }) {
  const [pw, setPw] = useState('');
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const remove = async (e: Event) => {
    e.preventDefault();
    if (!pw || busy) return;
    const ok = await confirmDialog({
      title: t('¿Eliminar tu cuenta?'),
      body: t('Se borran al momento tu cuenta, tu hogar, sus pantallas y sus fotos. No se puede deshacer.'),
      confirm: t('Eliminar mi cuenta'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setErr('');
    try {
      await api.accountDelete(pw);
      leave('deleted=1');
    } catch (e2) {
      setErr(accountError(e2));
      setBusy(false);
    }
  };
  const byEmail = async () => {
    setMailBusy(true);
    setErr('');
    try {
      await api.accountDeleteByEmail();
      setSent(true);
    } catch (e) {
      setErr(accountError(e));
    } finally {
      setMailBusy(false);
    }
  };
  return (
    <Card id="acc-delete" class="card--danger" title={t('Eliminar cuenta')} icon="trash" desc={t('Se borran al momento tu cuenta, tu hogar, sus pantallas y sus fotos. No se puede deshacer.')}>
      {hasPassword && (
        <form class="account-delete" onSubmit={remove}>
          <Field label={t('Escribe tu contraseña para confirmarlo')}>
            {/* typed by hand: read only until focused, so browsers and password managers leave it empty */}
            <input
              class="input"
              type="password"
              name="confirm-delete"
              autocomplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              readOnly={locked}
              onFocus={() => setLocked(false)}
              onPointerDown={() => setLocked(false)}
              maxLength={256}
              value={pw}
              onInput={(e) => setPw(e.currentTarget.value)}
            />
          </Field>
          <div>
            <Button type="submit" variant="danger" icon="trash" loading={busy} disabled={!pw}>
              {t('Eliminar mi cuenta')}
            </Button>
          </div>
        </form>
      )}
      {err && <p class="err-text">{err}</p>}
      {sent ? (
        <Callout kind="ok">{t('Te hemos enviado un enlace de confirmación por email. Caduca a los 15 minutos.')}</Callout>
      ) : hasPassword ? (
        <p class="muted small">
          <button type="button" class="link-btn" disabled={mailBusy} onClick={byEmail}>
            {t('Prefiero confirmarlo con un enlace por email')}
          </button>
        </p>
      ) : (
        <div>
          <Button variant="danger" icon="trash" loading={mailBusy} onClick={byEmail}>
            {t('Enviarme el enlace para eliminarla')}
          </Button>
        </div>
      )}
    </Card>
  );
}
