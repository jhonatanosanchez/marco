// Updates in the admin: the banner above every page, the release notes dialog with the update button (or the commands
// for this kind of install) and its progress, the Updates card in Status, and Marco Cloud's one-time "What's new".
// The logic is in ../updates.ts (tested); the server side in server/updates.js.
import { useEffect, useState } from 'preact/hooks';
import type { UpdateInfo, UpdateSettings } from '../../shared/types';
import { api, ApiError } from '../api';
import { caps, has } from '../caps';
import { relTime, t } from '../i18n';
import { bannerFor, compareVersions, howToUpdate, noteBlocks, phaseOf, shouldShowWhatsNew, type Phase } from '../updates';
import { toast } from './feedback';
import { Icon } from './icons';
import { CopyField } from './share';
import { Button, Callout, Card, Modal, ToggleRow } from './ui';

const LS_DISMISSED = 'marco.updateDismissed';
const LS_SEEN = 'marco.seenVersion';
const POLL_BUSY_MS = 2500;
const POLL_IDLE_MS = 6 * 3600_000;

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

// ---------------------------------------------------------------- shared state

interface State {
  info: UpdateInfo | null;
  /** the last request failed while an update was under way (the server is restarting) */
  unreachable: boolean;
  /** an update was started from this page */
  started: boolean;
  dialog: boolean;
  dismissed: string | null;
}
let state: State = { info: null, unreachable: false, started: false, dialog: false, dismissed: lsGet(LS_DISMISSED) };
const listeners = new Set<() => void>();
const setState = (p: Partial<State>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};

function useUpdateState(): State {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return state;
}

/** The server version this page was loaded from (a newer one means: reload). */
const pageVersion = () => caps().version || __APP_VERSION__;

const busyPhase = (p: Phase) => p === 'requested' || p === 'running' || p === 'restarting';

export async function refreshUpdates(): Promise<void> {
  if (!has('updates')) return;
  try {
    setState({ info: await api.updateInfo(), unreachable: false });
  } catch (e) {
    const err = e as ApiError;
    // Only an update under way explains a server that does not answer.
    const wasBusy = state.info?.status && ['requested', 'running'].includes(state.info.status.state);
    if ((err.status === 0 || err.status >= 502) && (wasBusy || state.unreachable)) setState({ unreachable: true });
  }
}

export const openUpdateDialog = () => setState({ dialog: true });

function dismiss(key: string) {
  lsSet(LS_DISMISSED, key);
  setState({ dismissed: key });
}

// ---------------------------------------------------------------- banner + dialog host (rendered once by App)

/** Loads the update info, polls while an update runs, and shows the banner. */
export function UpdateBanner() {
  const s = useUpdateState();
  const phase = phaseOf(s.info, s.unreachable);
  const busy = busyPhase(phase);
  useEffect(() => {
    if (!has('updates')) return;
    void refreshUpdates();
  }, []);
  useEffect(() => {
    if (!has('updates')) return;
    const id = setInterval(() => void refreshUpdates(), busy ? POLL_BUSY_MS : POLL_IDLE_MS);
    return () => clearInterval(id);
  }, [busy]);

  const b = bannerFor(s.info, caps(), pageVersion(), s.dismissed);
  if (!b) return null;
  return (
    <div class={`update-banner update-banner--${b.kind}`} role="status">
      <Icon name={b.kind === 'failed' ? 'alert' : b.kind === 'updated' ? 'check' : b.kind === 'updating' ? 'refresh' : 'sparkles'} size={16} />
      <span class="update-banner__text">
        {b.kind === 'available' && t('Marco {v} disponible', { v: b.version })}
        {b.kind === 'updating' && t('Actualizando Marco a {v}…', { v: b.version })}
        {b.kind === 'updated' && t('Marco se ha actualizado a {v}. Recarga el panel para usar la nueva versión.', { v: b.version })}
        {b.kind === 'failed' && t('No se pudo actualizar a {v}. Marco sigue en {cur}.', { v: b.version, cur: s.info?.current ?? '' })}
      </span>
      <span class="update-banner__actions">
        {b.kind === 'updated' ? (
          <Button variant="primary" size="sm" icon="refresh" onClick={() => location.reload()}>
            {t('Recargar')}
          </Button>
        ) : (
          <Button variant={b.kind === 'available' ? 'primary' : 'default'} size="sm" onClick={openUpdateDialog}>
            {b.kind === 'available' ? t('Ver novedades') : t('Detalles')}
          </Button>
        )}
        {(b.kind === 'available' || b.kind === 'failed') && (
          <button type="button" class="icon-btn" aria-label={t('Cerrar')} title={t('Ocultar hasta la próxima versión')} onClick={() => dismiss(b.kind === 'failed' ? `failed:${b.version}` : b.version)}>
            <Icon name="x" size={14} />
          </button>
        )}
      </span>
    </div>
  );
}

export function UpdateDialogHost() {
  const s = useUpdateState();
  if (!s.dialog || !s.info) return null;
  return <UpdateDialog info={s.info} unreachable={s.unreachable} started={s.started} onClose={() => setState({ dialog: false })} />;
}

function Notes({ md }: { md: string }) {
  const blocks = noteBlocks(md);
  if (!blocks.length) return <p class="muted">{t('Esta versión no trae notas.')}</p>;
  const out: any[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul>{list.map((x) => <li>{x}</li>)}</ul>);
    list = [];
  };
  for (const b of blocks) {
    if (b.type === 'li') list.push(b.text);
    else {
      flush();
      out.push(b.type === 'h' ? <h4>{b.text}</h4> : <p>{b.text}</p>);
    }
  }
  flush();
  return <div class="release-notes">{out}</div>;
}

function HowTo({ info }: { info: UpdateInfo }) {
  const h = howToUpdate(info.install);
  return (
    <div class="update-howto">
      <p class="muted small">{t(h.where)}</p>
      <CopyField value={h.commands.join(info.install.kind === 'docker' || !info.install.cli ? ' && ' : '\n')} />
      {info.install.kind === 'release' && !info.install.canApply && (
        <p class="muted small">{t('Para actualizar desde aquí la próxima vez, ejecuta «sudo marco update» una vez en el servidor: activa el botón Actualizar.')}</p>
      )}
    </div>
  );
}

function Progress({ info, phase }: { info: UpdateInfo; phase: Phase }) {
  const st = info.status;
  const reloadable = compareVersions(info.current, pageVersion()) > 0;
  useEffect(() => {
    if (phase !== 'done' || !reloadable) return;
    const id = setTimeout(() => location.reload(), 5000);
    return () => clearTimeout(id);
  }, [phase, reloadable]);
  return (
    <div class="update-progress">
      {busyPhase(phase) && (
        <Callout kind="info">
          <span class="update-progress__line">
            <span class="spinner" />
            {phase === 'requested' && t('Esperando al servicio de actualización…')}
            {phase === 'running' && t('Descargando e instalando la nueva versión…')}
            {phase === 'restarting' && t('Reiniciando el servidor…')}
          </span>
          <span class="muted small">{t('Las pantallas se recargarán solas cuando termine. No cierres esta página.')}</span>
        </Callout>
      )}
      {phase === 'done' && (
        <Callout kind="ok">
          {t('Marco se ha actualizado a {v}.', { v: st?.to || info.current })} {reloadable && t('El panel se recargará en unos segundos.')}
        </Callout>
      )}
      {phase === 'current' && <Callout kind="ok">{t('Marco ya tenía la última versión ({v}).', { v: info.current })}</Callout>}
      {phase === 'failed' && (
        <Callout kind="error">
          {st?.rolledBack
            ? t('La nueva versión no arrancó y Marco ha vuelto a la versión {v}. No se ha perdido nada.', { v: st.from || info.current })
            : t('La actualización no se pudo completar. Marco sigue en la versión {v}.', { v: info.current })}
        </Callout>
      )}
      {phase === 'stalled' && (
        <Callout kind="warn">
          {t('El servicio de actualización no ha respondido. Actualiza desde el servidor con «sudo marco update».')}
        </Callout>
      )}
      {info.log.length > 0 && (
        <details class="update-log" open={phase === 'failed'}>
          <summary>{t('Registro de la actualización')}</summary>
          <pre>{info.log.join('\n')}</pre>
        </details>
      )}
    </div>
  );
}

function UpdateDialog({ info, unreachable, started, onClose }: { info: UpdateInfo; unreachable: boolean; started: boolean; onClose: () => void }) {
  const [sending, setSending] = useState(false);
  const phase = phaseOf(info, unreachable);
  const rel = info.latest;
  const showProgress = started || phase !== 'idle';
  const canStart = info.install.canApply && info.available && !busyPhase(phase) && phase !== 'stalled';

  const start = async () => {
    setSending(true);
    try {
      setState({ info: await api.updateApply(), started: true, unreachable: false });
    } catch (e) {
      const err = e as ApiError;
      const code = (err.body as { error?: string } | undefined)?.error;
      toast(
        code === 'busy'
          ? t('Ya hay una actualización en marcha.')
          : code === 'up_to_date'
            ? t('Marco ya tiene la última versión.')
            : code === 'not_supported'
              ? t('Este servidor no se puede actualizar desde el panel.')
              : err.message,
        'error'
      );
      void refreshUpdates();
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title={rel ? t('Marco {v}', { v: rel.version }) : t('Actualizaciones')}
      icon="sparkles"
      size="lg"
      onClose={onClose}
      footer={
        <>
          {rel?.url && (
            <a class="btn btn--ghost" href={rel.url} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={15} /> <span>{t('Ver en GitHub')}</span>
            </a>
          )}
          <span class="spacer" />
          {canStart ? (
            <Button variant="primary" icon="download" loading={sending} onClick={start}>
              {t('Actualizar ahora')}
            </Button>
          ) : (
            <Button onClick={onClose}>{t('Cerrar')}</Button>
          )}
        </>
      }
    >
      <p class="muted small">
        {t('Tienes la versión {cur}.', { cur: info.current })}
        {rel?.publishedAt && ` ${t('Publicada {when}.', { when: relTime(rel.publishedAt) })}`}
      </p>
      {showProgress && <Progress info={info} phase={phase} />}
      {canStart && !showProgress && (
        <Callout kind="info">
          {t('Se descarga la nueva versión, se comprueba y se cambia en un momento. Si no arranca, Marco vuelve solo a la versión actual. Tus datos no se tocan y las pantallas se recargan solas.')}
        </Callout>
      )}
      {!info.install.canApply && info.available && <HowTo info={info} />}
      {rel && <Notes md={rel.notes} />}
    </Modal>
  );
}

// ---------------------------------------------------------------- Status > Updates

export function UpdatesCard() {
  const s = useUpdateState();
  const [checking, setChecking] = useState(false);
  const info = s.info;
  useEffect(() => {
    if (!info) void refreshUpdates();
  }, []);
  if (!has('updates')) return null;

  const save = async (patch: Partial<UpdateSettings>) => {
    try {
      setState({ info: await api.updateSettings(patch) });
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  };
  const checkNow = async () => {
    setChecking(true);
    try {
      const next = await api.updateCheck();
      setState({ info: next });
      if (next.error) toast(t('No se pudo consultar GitHub. Se volverá a intentar más tarde.'), 'error');
      else toast(next.available ? t('Marco {v} disponible', { v: next.latest?.version ?? '' }) : t('Tienes la última versión.'), next.available ? 'info' : 'ok');
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setChecking(false);
    }
  };

  const envOff = info?.checks === 'env-off';
  const canApply = !!info?.install.canApply;
  return (
    <Card
      id="updates"
      title={t('Actualizaciones')}
      icon="download"
      desc={info ? t('Versión instalada: {v}', { v: info.current }) : undefined}
      actions={
        <Button size="sm" icon="refresh" loading={checking} disabled={!info || envOff} onClick={checkNow}>
          {t('Buscar ahora')}
        </Button>
      }
    >
      {!info ? (
        <div class="skeleton" />
      ) : (
        <div class="stack">
          {info.available && info.latest ? (
            <Callout kind="info">
              <span>{t('Marco {v} disponible', { v: info.latest.version })}</span>{' '}
              <button type="button" class="link-btn" onClick={openUpdateDialog}>
                {canApply ? t('Ver novedades y actualizar') : t('Ver novedades')}
              </button>
            </Callout>
          ) : (
            info.latest && !envOff && <p class="muted small">{t('Tienes la última versión.')}</p>
          )}
          {!envOff && (
            <p class="muted small">
              {info.checkedAt ? t('Última comprobación: {when}', { when: relTime(info.checkedAt) }) : t('Todavía no se ha comprobado.')}
              {info.error && ` · ${t('No se pudo consultar GitHub. Se volverá a intentar más tarde.')}`}
            </p>
          )}
          {envOff ? (
            <Callout kind="info">{t('Las comprobaciones están desactivadas en el servidor (MARCO_UPDATE_CHECK=0).')}</Callout>
          ) : (
            <ToggleRow
              label={t('Buscar actualizaciones')}
              hint={t('Una vez al día, Marco pregunta a GitHub cuál es la última versión. No se envía ningún dato.')}
              checked={info.settings.check}
              onChange={(v) => save({ check: v })}
            />
          )}
          {canApply && !envOff && (
            <>
              <ToggleRow
                label={t('Actualizar automáticamente')}
                hint={t('Instala la nueva versión sola dentro del horario elegido. Si no arranca, vuelve a la anterior y no lo reintenta.')}
                checked={info.settings.auto}
                disabled={!info.settings.check}
                onChange={(v) => save({ auto: v })}
              />
              {info.settings.auto && info.settings.check && (
                <div class="update-window">
                  <span>{t('Entre las')}</span>
                  <input type="time" class="input input--sm" value={info.settings.from} onChange={(e) => save({ from: (e.target as HTMLInputElement).value })} />
                  <span>{t('y las')}</span>
                  <input type="time" class="input input--sm" value={info.settings.to} onChange={(e) => save({ to: (e.target as HTMLInputElement).value })} />
                  <span class="muted small">{t('(en la zona horaria de Fecha y hora)')}</span>
                </div>
              )}
            </>
          )}
          {!canApply && (
            <div>
              <p class="small"><strong>{t('Cómo actualizar este servidor')}</strong></p>
              <HowTo info={info} />
            </div>
          )}
          {info.status && info.status.state !== 'requested' && info.status.state !== 'running' && info.status.at && (
            <p class="muted small">
              {info.status.state === 'failed'
                ? t('Última actualización: falló ({when})', { when: relTime(info.status.at) })
                : t('Última actualización: {from} → {to} ({when})', { from: info.status.from, to: info.status.to, when: relTime(info.status.at) })}{' '}
              {info.log.length > 0 && (
                <button type="button" class="link-btn" onClick={openUpdateDialog}>
                  {t('Detalles')}
                </button>
              )}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Marco Cloud: "What's new" once per version

export function WhatsNewHost() {
  const [notes, setNotes] = useState<string | null>(null);
  const version = __APP_VERSION__;
  useEffect(() => {
    const c = caps();
    if (c.runtime !== 'workers' && c.edition !== 'cloud') return;
    const seen = lsGet(LS_SEEN);
    if (!seen || compareVersions(version, seen) <= 0) {
      if (!seen || compareVersions(version, seen) > 0) lsSet(LS_SEEN, version);
      return;
    }
    let alive = true;
    import('../whatsNewNotes')
      .then((m) => {
        if (!alive) return;
        if (shouldShowWhatsNew(c, version, seen, m.APP_NOTES)) setNotes(m.APP_NOTES);
        else lsSet(LS_SEEN, version);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (notes == null) return null;
  const close = () => {
    lsSet(LS_SEEN, version);
    setNotes(null);
  };
  return (
    <Modal title={t('Novedades de Marco {v}', { v: version })} icon="sparkles" size="lg" onClose={close} footer={<Button variant="primary" onClick={close}>{t('Entendido')}</Button>}>
      <Notes md={notes} />
    </Modal>
  );
}
