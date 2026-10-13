// The family page on the phone (/f/<key>, or /f with the key this phone remembers). No admin login: the family key
// (header X-Family-Key) only lets the page see today's routines, tick them, see the stars and, when the parents allow
// it, redeem rewards. Works over plain http on the home network (no service worker, no clipboard, no crypto API).
// Screens: everyone (pick a person), one person's routines by time of day, and that kid's rewards. The view lives in
// the URL hash (#/m/<id>, #/m/<id>/premios) so the phone's back button works.
import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ChoreSlot, FamilyChoreView, FamilyMemberView, FamilyPhoneState, MealSlot } from '../shared/types';
import { chipColors } from '../display/color';
import { getLang, initialLang, locale, setLang, t } from './i18n';
import '../shared/emoji-font.css';
import './styles.css';

const LS_KEY = 'marco.family.key';
const POLL_MS = 30_000;
const RETRY_MS = 8_000;

const SLOT_ORDER: ChoreSlot[] = ['morning', 'afternoon', 'evening', 'any'];
const SLOT_LABEL: Record<ChoreSlot, string> = { morning: 'Por la mañana', afternoon: 'Por la tarde', evening: 'Por la noche', any: 'Durante el día' };
const SLOT_EMOJI: Record<ChoreSlot, string> = { morning: '☀️', afternoon: '🌤️', evening: '🌙', any: '✨' };
const MEAL_LABEL: Record<MealSlot, string> = { breakfast: 'Desayuno', lunch: 'Comida', snack: 'Merienda', dinner: 'Cena' };
const MEAL_EMOJI: Record<MealSlot, string> = { breakfast: '🥣', lunch: '🍽️', snack: '🍎', dinner: '🍲' };

// ---- the key ----

/** Key from the path (/f/<key>), remembered for /f; else the one this phone remembers. */
function readKey(): { key: string | null; fromPath: boolean } {
  const m = location.pathname.match(/^\/f\/([^/?#]+)/);
  const fromPath = m ? decodeURIComponent(m[1]) : null;
  if (fromPath) {
    try {
      localStorage.setItem(LS_KEY, fromPath);
    } catch {
      /* ignore */
    }
    return { key: fromPath, fromPath: true };
  }
  try {
    return { key: localStorage.getItem(LS_KEY), fromPath: false };
  } catch {
    return { key: null, fromPath: false };
  }
}

const KEY = readKey();

// ---- API ----

class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Family-Key': KEY.key || '' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(path, { method, headers, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new ApiError(res.status, data?.code || data?.error || `http_${res.status}`);
  return data as T;
}

const api = {
  state: () => call<FamilyPhoneState>('GET', '/api/family/state'),
  toggle: (choreId: string, done: boolean) => call<{ ok: true; state: FamilyPhoneState }>('POST', '/api/family/toggle', { choreId, done }),
  redeem: (rewardId: string, memberId: string) => call<{ ok: true; state: FamilyPhoneState }>('POST', '/api/family/redeem', { rewardId, memberId }),
};

// ---- view helpers ----

type Route = { page: 'home' } | { page: 'member'; id: string; tab: 'routines' | 'rewards' };

function readRoute(): Route {
  const m = location.hash.match(/^#\/m\/([^/]+)(\/premios)?$/);
  return m ? { page: 'member', id: decodeURIComponent(m[1]), tab: m[2] ? 'rewards' : 'routines' } : { page: 'home' };
}

const go = (hash: string) => {
  if (location.hash !== hash) location.hash = hash;
};

/** Inline colour variables of a person (soft fills are mixed in the CSS). */
function memberVars(color: string): Record<string, string> {
  const c = chipColors(color);
  return { '--kc': color, '--kc-on': c.onSolid, '--kc-shade': c.shade, '--kc-tint': c.tint };
}

/** The server's state with the taps still on their way applied, so the page never jumps back while saving. */
function withPending(data: FamilyPhoneState, pending: Map<string, boolean>): FamilyPhoneState {
  if (!pending.size) return data;
  const delta = new Map<string, { done: number; points: number }>();
  const chores = data.chores.map((c) => {
    const want = pending.get(c.id);
    if (want === undefined || want === c.done) return c;
    const d = delta.get(c.memberId) || { done: 0, points: 0 };
    d.done += want ? 1 : -1;
    d.points += want ? c.points : -c.points;
    delta.set(c.memberId, d);
    return { ...c, done: want };
  });
  const members = data.members.map((m) => {
    const d = delta.get(m.id);
    if (!d) return m;
    return { ...m, done: m.done + d.done, points: m.points == null ? null : Math.max(0, m.points + d.points) };
  });
  return { ...data, chores, members };
}

/** Time-of-day order: the current one first, then the later ones, "during the day", and the earlier ones last. */
function slotsFrom(now: Exclude<ChoreSlot, 'any'>): ChoreSlot[] {
  const timed = SLOT_ORDER.filter((s) => s !== 'any');
  const i = timed.indexOf(now);
  return [...timed.slice(i), 'any', ...timed.slice(0, i)];
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 13 ? t('Buenos días') : h < 20 ? t('Buenas tardes') : t('Buenas noches');
}

function dateLine(today: string): string {
  const d = new Date(`${today}T12:00:00`);
  const s = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CHECK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5.5 12.5l4.2 4.2L18.5 7.8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const BACK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

// ---- small pieces ----

/**
 * Profile photos. /media/avatars/<id> is loaded with the family key in the header (an <img> cannot send it) and kept
 * as a blob address for the life of the page; the address changes with every new photo, so a cached one is never
 * stale. Any other same-origin address (Marco Cloud signs its own) goes straight into the <img>.
 */
const photoBlobs = new Map<string, Promise<string | null>>();
function loadPhoto(url: string): Promise<string | null> {
  let p = photoBlobs.get(url);
  if (!p) {
    p = fetch(url, { headers: { 'X-Family-Key': KEY.key || '' } })
      .then(async (r) => (r.ok && (r.headers.get('content-type') || '').startsWith('image/') ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null);
    // a failed load is forgotten, so the next fresh data tries again
    void p.then((v) => v === null && photoBlobs.delete(url));
    photoBlobs.set(url, p);
  }
  return p;
}

/** Goes up with every fresh family state (App's take()): a photo that failed is tried again then. */
let dataGen = 0;

const samePath = (url: string | null | undefined): url is string => !!url && url.startsWith('/') && !url.startsWith('//');

function usePhoto(url: string | null | undefined, gen: number): string | null {
  const [src, setSrc] = useState<{ url: string; src: string | null } | null>(null);
  const direct = samePath(url) && !url.startsWith('/media/');
  useEffect(() => {
    let live = true;
    if (!samePath(url) || direct) return;
    // keep showing what is there while a retry runs; only a different photo starts empty
    void loadPhoto(url).then((v) => live && setSrc((cur) => (v === null && cur?.url === url && cur.src ? cur : { url, src: v })));
    return () => {
      live = false;
    };
  }, [url, gen]);
  if (!samePath(url)) return null;
  if (direct) return url;
  return src?.url === url ? src.src : null;
}

function Avatar({ m, size }: { m: FamilyMemberView; size: 'sm' | 'md' | 'lg' }) {
  const gen = dataGen;
  const photo = usePhoto(m.photo, gen);
  // a photo that did not draw: the emoji until it changes or fresh data arrives
  const [broken, setBroken] = useState<string | null>(null);
  const key = `${gen}|${photo}`;
  const show = photo && broken !== key;
  return (
    <span class={`f-avatar f-avatar-${size}${show ? ' has-photo' : ''}`} aria-hidden="true">
      {show ? <img src={photo} alt="" draggable={false} onError={() => setBroken(key)} /> : <span>{m.avatar || '🙂'}</span>}
    </span>
  );
}

function Stars({ n }: { n: number | null }) {
  if (n == null) return null;
  return (
    <span class="f-stars" aria-label={t('{n} estrellas', { n })}>
      ⭐ <b>{n}</b>
    </span>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div class="f-progress">
      <div class="f-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={t('{done} de {total} hechas', { done, total })}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <span class="f-count">
        {done}/{total}
      </span>
    </div>
  );
}

// ---- screens ----

function Home({ data }: { data: FamilyPhoneState }) {
  const meals = data.meals;
  return (
    <main class="f-page">
      <header class="f-head">
        <p class="f-date">{dateLine(data.today)}</p>
        <h1>{greeting()}</h1>
      </header>
      {data.members.length ? (
        <section aria-labelledby="who">
          <h2 id="who" class="f-h2">
            {t('¿Quién eres?')}
          </h2>
          <div class="f-grid">
            {data.members.map((m) => (
              <button type="button" class="f-person f-kc" style={memberVars(m.color)} onClick={() => go(`#/m/${encodeURIComponent(m.id)}`)}>
                <Avatar m={m} size="md" />
                <span class="f-person-name">{m.name}</span>
                {m.kid && data.showPoints ? <Stars n={m.points} /> : null}
                {m.total ? (
                  m.done >= m.total ? (
                    <span class="f-person-done">{t('¡Todo hecho!')} 🎉</span>
                  ) : (
                    <Progress done={m.done} total={m.total} />
                  )
                ) : (
                  <span class="f-person-none">{t('Sin rutinas hoy')}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <Notice emoji="👨‍👩‍👧" title={t('Todavía no hay nadie')} text={t('Añade a la familia en el panel, sección Familia.')} />
      )}
      {meals && meals.slots.length ? (
        <section class="f-card f-meals" aria-labelledby="meals">
          <h2 id="meals" class="f-h2">
            {t('Comidas de hoy')}
          </h2>
          {meals.slots.some((s) => meals.today[s]) ? (
            <ul>
              {meals.slots.map((s) => (
                <li>
                  <span class="f-meal-emoji" aria-hidden="true">
                    {MEAL_EMOJI[s]}
                  </span>
                  <span class="f-meal-label">{t(MEAL_LABEL[s])}</span>
                  <span class={`f-meal-text${meals.today[s] ? '' : ' is-empty'}`}>{meals.today[s] || '·'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p class="f-muted">{t('Sin menú para hoy')}</p>
          )}
        </section>
      ) : null}
    </main>
  );
}

function Notice({ emoji, title, text, page = false }: { emoji: string; title: string; text: string; page?: boolean }) {
  return (
    <div class={`f-notice${page ? ' is-page' : ''}`}>
      <span class="f-notice-emoji" aria-hidden="true">
        {emoji}
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function ChoreRow({ c, m, showStars, disabled, onToggle }: { c: FamilyChoreView; m: FamilyMemberView; showStars: boolean; disabled: boolean; onToggle: (c: FamilyChoreView) => void }) {
  return (
    <li>
      <button
        type="button"
        class={`f-chore${c.done ? ' is-done' : ''}`}
        aria-pressed={c.done}
        disabled={disabled}
        onClick={() => onToggle(c)}
      >
        <span class="f-chore-emoji" aria-hidden="true">
          {c.emoji || '⭐'}
        </span>
        <span class="f-chore-text">
          <span class="f-chore-title">{c.title}</span>
          {showStars && m.kid && c.points > 0 ? <span class="f-chore-pts">+{c.points} ⭐</span> : null}
        </span>
        <span class="f-check" aria-hidden="true">
          {c.done ? CHECK : null}
        </span>
      </button>
    </li>
  );
}

function Member({
  data, m, tab, offline, onToggle, onRedeem,
}: {
  data: FamilyPhoneState;
  m: FamilyMemberView;
  tab: 'routines' | 'rewards';
  offline: boolean;
  onToggle: (c: FamilyChoreView) => void;
  onRedeem: (rewardId: string) => void;
}) {
  const chores = data.chores.filter((c) => c.memberId === m.id);
  const done = chores.filter((c) => c.done).length;
  const hasRewards = m.kid && data.showPoints && m.points != null && data.rewards.length > 0;
  const showTab = hasRewards && tab === 'rewards' ? 'rewards' : 'routines';
  const base = `#/m/${encodeURIComponent(m.id)}`;
  return (
    <main class="f-page f-member f-kc" style={memberVars(m.color)}>
      <div class="f-top">
        <button type="button" class="f-back" onClick={() => go('#/')} aria-label={t('Volver')}>
          {BACK}
          <span>{t('Familia')}</span>
        </button>
      </div>
      <header class="f-hero">
        <Avatar m={m} size="lg" />
        <div class="f-hero-text">
          <h1>{m.name}</h1>
          {m.kid && data.showPoints ? <Stars n={m.points} /> : null}
          {chores.length ? <Progress done={done} total={chores.length} /> : null}
        </div>
      </header>
      {hasRewards ? (
        <div class="f-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={showTab === 'routines'} class={showTab === 'routines' ? 'is-on' : ''} onClick={() => go(base)}>
            {t('Rutinas')}
          </button>
          <button type="button" role="tab" aria-selected={showTab === 'rewards'} class={showTab === 'rewards' ? 'is-on' : ''} onClick={() => go(`${base}/premios`)}>
            {t('Premios')}
          </button>
        </div>
      ) : null}
      {showTab === 'routines' ? (
        <Routines data={data} m={m} chores={chores} offline={offline} onToggle={onToggle} />
      ) : (
        <Rewards data={data} m={m} offline={offline} onRedeem={onRedeem} />
      )}
    </main>
  );
}

function Routines({ data, m, chores, offline, onToggle }: { data: FamilyPhoneState; m: FamilyMemberView; chores: FamilyChoreView[]; offline: boolean; onToggle: (c: FamilyChoreView) => void }) {
  if (!chores.length) return <Notice emoji="🌈" title={t('Hoy no tienes rutinas')} text={t('¡Día libre!')} />;
  const allDone = chores.every((c) => c.done);
  return (
    <div class="f-routines">
      {allDone ? (
        <div class="f-alldone" role="status">
          <span aria-hidden="true">🎉</span> {t('¡Todo hecho!')}
        </div>
      ) : null}
      {slotsFrom(data.slotNow).map((slot) => {
        const list = chores.filter((c) => c.slot === slot);
        if (!list.length) return null;
        const now = slot === data.slotNow;
        return (
          <section class={`f-slot${now ? ' is-now' : ''}`} aria-label={t(SLOT_LABEL[slot])}>
            <h2 class="f-slot-head">
              <span aria-hidden="true">{SLOT_EMOJI[slot]}</span> {t(SLOT_LABEL[slot])}
              {now ? <span class="f-now">{t('Ahora')}</span> : null}
              <span class="f-slot-count">
                {list.filter((c) => c.done).length}/{list.length}
              </span>
            </h2>
            <ul class="f-chores">
              {list.map((c) => (
                <ChoreRow c={c} m={m} showStars={data.showPoints} disabled={offline} onToggle={onToggle} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Rewards({ data, m, offline, onRedeem }: { data: FamilyPhoneState; m: FamilyMemberView; offline: boolean; onRedeem: (rewardId: string) => void }) {
  const have = m.points || 0;
  const list = [...data.rewards].sort((a, b) => a.cost - b.cost);
  return (
    <div class="f-rewards">
      {data.allowRedeem ? null : <p class="f-hint">{t('Los premios se canjean con papá o mamá.')}</p>}
      <ul>
        {list.map((r) => {
          const ready = have >= r.cost;
          return (
            <li class={`f-card f-reward${ready ? ' is-ready' : ''}`}>
              <span class="f-reward-emoji" aria-hidden="true">
                {r.emoji || '🎁'}
              </span>
              <div class="f-reward-body">
                <span class="f-reward-title">{r.title}</span>
                <div class="f-progress">
                  <div class="f-bar" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, Math.round((have / r.cost) * 100))}%` }} />
                  </div>
                  <span class="f-count">{r.cost} ⭐</span>
                </div>
                <span class="f-reward-sub">{ready ? t('¡Ya lo puedes canjear!') : t('Te faltan {n} ⭐', { n: r.cost - have })}</span>
              </div>
              {data.allowRedeem ? (
                <button type="button" class="f-btn f-btn-solid" disabled={!ready || offline} onClick={() => onRedeem(r.id)}>
                  {t('Canjear')}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConfirmSheet({ title, text, ok, color, busy, onOk, onCancel }: { title: string; text: string; ok: string; color: string; busy: boolean; onOk: () => void; onCancel: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="f-sheet-wrap" onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div class="f-sheet f-kc" style={memberVars(color)} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <h2 id="sheet-title">{title}</h2>
        <p>{text}</p>
        <div class="f-sheet-btns">
          <button type="button" class="f-btn" onClick={onCancel} disabled={busy}>
            {t('Cancelar')}
          </button>
          <button type="button" class="f-btn f-btn-solid" ref={okRef} onClick={onOk} disabled={busy}>
            {ok}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- the page ----

type Status = 'loading' | 'ok' | 'nokey' | 'invalid' | 'off' | 'limited';

/** Message for an action that failed (null = handled elsewhere). */
function actionError(e: unknown): string {
  if (!(e instanceof ApiError)) return t('Sin conexión, lo intento de nuevo');
  switch (e.code) {
    case 'rate_limited': return t('Demasiados cambios seguidos. Espera un minuto.');
    case 'not_enough': return t('Todavía no tienes estrellas suficientes.');
    case 'redeem_off': return t('Los premios se canjean con papá o mamá.');
    case 'unknown_reward': return t('Este premio ya no está.');
    case 'unknown_chore': case 'not_today': return t('Esta rutina ya no está en la lista de hoy.');
    default: return t('No se ha podido guardar. Inténtalo otra vez.');
  }
}

function App() {
  const [status, setStatus] = useState<Status>(KEY.key ? 'loading' : 'nokey');
  const [data, setData] = useState<FamilyPhoneState | null>(null);
  const [offline, setOffline] = useState(false);
  const [route, setRoute] = useState<Route>(readRoute);
  const [pending, setPending] = useState<Map<string, boolean>>(() => new Map());
  const [confirm, setConfirm] = useState<{ rewardId: string; memberId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; good?: boolean } | null>(null);
  const toastTimer = useRef(0);
  const inflight = useRef(0);
  const hasData = useRef(false);
  // read by the visibility / online listeners, which were set up with the first render
  const statusRef = useRef(status);
  statusRef.current = status;

  const show = (text: string, good = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, good });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  const take = (s: FamilyPhoneState) => {
    if (s.lang && s.lang !== getLang()) setLang(s.lang);
    hasData.current = true;
    dataGen++;
    setData(s);
    setStatus('ok');
    setOffline(false);
  };

  /** Errors that end the page (wrong link, family off); false for the passing ones. */
  const fatal = (e: unknown): boolean => {
    if (!(e instanceof ApiError)) return false;
    if (e.code === 'invalid_key' || e.code === 'key_required') {
      // a remembered key that stopped working is forgotten; a key in the address stays (it is the link itself)
      if (!KEY.fromPath) {
        try {
          localStorage.removeItem(LS_KEY);
        } catch {
          /* ignore */
        }
      }
      statusRef.current = 'invalid';
      setStatus('invalid');
      return true;
    }
    if (e.code === 'family_off') {
      setStatus('off');
      return true;
    }
    return false;
  };

  const refresh = async () => {
    // a link the server refused stays refused: asking again would only count as more wrong tries
    if (!KEY.key || statusRef.current === 'invalid' || statusRef.current === 'nokey') return;
    const started = inflight.current;
    try {
      const s = await api.state();
      // a tap answered while this was on its way already brought newer data
      if (started === inflight.current) take(s);
    } catch (e) {
      if (fatal(e)) return;
      if (e instanceof ApiError && e.code === 'rate_limited') {
        if (!hasData.current) setStatus('limited');
        return;
      }
      setOffline(true);
    }
  };

  useEffect(() => {
    document.title = t('Familia');
  }, [data?.lang]);

  useEffect(() => {
    void refresh();
    const onHash = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    const onVis = () => document.visibilityState === 'visible' && void refresh();
    addEventListener('hashchange', onHash);
    document.addEventListener('visibilitychange', onVis);
    addEventListener('online', onVis);
    return () => {
      removeEventListener('hashchange', onHash);
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('online', onVis);
    };
  }, []);

  // every 30 s while the page is on screen; every few seconds while the server cannot be reached
  useEffect(() => {
    if (status === 'nokey' || status === 'invalid') return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, offline || status === 'limited' ? RETRY_MS : POLL_MS);
    return () => clearInterval(id);
  }, [offline, status]);

  const view = useMemo(() => (data ? withPending(data, pending) : null), [data, pending]);

  const onToggle = async (c: FamilyChoreView) => {
    if (pending.has(c.id) || offline) return;
    const want = !c.done;
    setPending((p) => new Map(p).set(c.id, want));
    try {
      (navigator as Navigator & { vibrate?: (ms: number) => boolean }).vibrate?.(12);
    } catch {
      /* ignore */
    }
    inflight.current++;
    try {
      const r = await api.toggle(c.id, want);
      take(r.state);
    } catch (e) {
      if (!fatal(e)) {
        show(actionError(e));
        if (!(e instanceof ApiError)) setOffline(true);
        else void refresh();
      }
    } finally {
      setPending((p) => {
        const n = new Map(p);
        n.delete(c.id);
        return n;
      });
    }
  };

  const doRedeem = async () => {
    if (!confirm) return;
    setBusy(true);
    inflight.current++;
    try {
      const r = await api.redeem(confirm.rewardId, confirm.memberId);
      const reward = data?.rewards.find((w) => w.id === confirm.rewardId);
      take(r.state);
      show(`${t('Canjeado: {reward}', { reward: reward?.title || '' })} 🎉`, true);
    } catch (e) {
      if (!fatal(e)) {
        show(actionError(e));
        void refresh();
      }
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (status === 'nokey') return <Notice page emoji="🔗" title={t('Falta el enlace familiar')} text={t('Abre el enlace familiar que tienes en el panel, o escanea el código QR de la pantalla.')} />;
  if (status === 'invalid') return <Notice page emoji="🔒" title={t('Este enlace ya no funciona')} text={t('Pide el enlace nuevo a quien lleva el panel, o escanea otra vez el código QR de la pantalla.')} />;
  if (status === 'off') return <Notice page emoji="💤" title={t('La familia está apagada')} text={t('Se enciende en el panel, sección Familia.')} />;
  if (status === 'limited') return <Notice page emoji="⏳" title={t('Demasiados intentos')} text={t('Espera unos minutos y vuelve a abrir el enlace.')} />;
  if (!view) {
    return (
      <div class="f-loading" role="status" aria-live="polite">
        {offline ? t('Sin conexión, lo intento de nuevo') : t('Cargando…')}
      </div>
    );
  }

  const member = route.page === 'member' ? view.members.find((m) => m.id === route.id) : undefined;
  const reward = confirm ? view.rewards.find((r) => r.id === confirm.rewardId) : undefined;
  const who = confirm ? view.members.find((m) => m.id === confirm.memberId) : undefined;

  return (
    <>
      {offline ? (
        <div class="f-offline" role="status">
          {t('Sin conexión, lo intento de nuevo')}
        </div>
      ) : null}
      {member && route.page === 'member' ? (
        <Member
          data={view}
          m={member}
          tab={route.tab}
          offline={offline}
          onToggle={onToggle}
          onRedeem={(rewardId) => setConfirm({ rewardId, memberId: member.id })}
        />
      ) : (
        <Home data={view} />
      )}
      {confirm && reward && who ? (
        <ConfirmSheet
          title={t('¿Canjear {reward} por {cost} ⭐?', { reward: `${reward.emoji} ${reward.title}`, cost: reward.cost })}
          text={t('Te quedarán {n} ⭐.', { n: Math.max(0, (who.points || 0) - reward.cost) })}
          ok={t('Canjear')}
          color={who.color}
          busy={busy}
          onOk={() => void doRedeem()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {toast ? (
        <div class={`f-toast${toast.good ? ' is-good' : ''}`} role="status" aria-live="polite">
          {toast.text}
        </div>
      ) : null}
    </>
  );
}

setLang(initialLang());
document.title = t('Familia');
render(<App />, document.getElementById('app')!);
