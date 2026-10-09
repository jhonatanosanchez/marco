// Private display access (docs/API.md "Display access"): a display that has no valid key shows
//   - 'pair':    "Pair this screen" + a 6-character code + QR to /admin/#pair=<code> (private mode, no key yet)
//   - 'invalid': "This link is no longer valid" (regenerated link / revoked device) + the same pairing code
// and never any family data. The page polls /api/pair/status with the secret session id every ~2 s; once an admin
// claims the code it stores the device token and starts normally.
import { qrSvg } from '../../shared/qr';
import type { Lang, PairStartResponse, PairStatusResponse } from '../../shared/types';
import { clearCaches, saveDeviceToken } from '../identity';

const TEXT: Record<Lang, Record<string, string>> = {
  en: {
    pairTitle: 'Pair this screen',
    pairLead: 'This screen is private. Link it to your Marco from your phone or computer:',
    invalidTitle: 'This link is no longer valid',
    invalidLead: 'Its private link was replaced or this device was removed. Open the admin to get the new link, or pair this screen again:',
    s1: 'Open the admin → Connected screens → Pair a screen',
    s2: 'Type this code or scan the QR',
    s3: 'This screen starts by itself',
    expires: 'The code changes in {t}',
    renewing: 'Getting a new code…',
    busy: 'Too many pairing requests. Trying again in a minute…',
    offline: 'Cannot reach the server. Retrying…',
    paired: 'Paired! Starting…',
    scan: 'Scan with the phone where you use the admin',
  },
  es: {
    pairTitle: 'Vincula esta pantalla',
    pairLead: 'Esta pantalla es privada. Vincúlala a tu Marco desde el móvil o el ordenador:',
    invalidTitle: 'Este enlace ya no es válido',
    invalidLead: 'Su enlace privado se ha cambiado o este dispositivo se ha quitado. Abre el panel para obtener el enlace nuevo o vuelve a vincular esta pantalla:',
    s1: 'Abre el panel → Pantallas conectadas → Vincular una pantalla',
    s2: 'Escribe este código o escanea el QR',
    s3: 'Esta pantalla arranca sola',
    expires: 'El código cambia en {t}',
    renewing: 'Pidiendo un código nuevo…',
    busy: 'Demasiadas solicitudes de vinculación. Se reintenta en un minuto…',
    offline: 'No se puede conectar con el servidor. Reintentando…',
    paired: '¡Vinculada! Arrancando…',
    scan: 'Escanéalo con el móvil donde usas el panel',
  },
  pt: {
    pairTitle: 'Emparelha este ecrã',
    pairLead: 'Este ecrã é privado. Liga-o ao teu Marco a partir do telemóvel ou do computador:',
    invalidTitle: 'Esta ligação já não é válida',
    invalidLead: 'A ligação privada foi substituída ou este dispositivo foi removido. Abre o painel para obter a nova ligação ou volta a emparelhar este ecrã:',
    s1: 'Abre o painel → Ecrãs ligados → Emparelhar um ecrã',
    s2: 'Escreve este código ou lê o QR',
    s3: 'Este ecrã arranca sozinho',
    expires: 'O código muda em {t}',
    renewing: 'A pedir um código novo…',
    busy: 'Demasiados pedidos de emparelhamento. Nova tentativa dentro de um minuto…',
    offline: 'Não é possível ligar ao servidor. A tentar de novo…',
    paired: 'Emparelhado! A arrancar…',
    scan: 'Lê com o telemóvel onde usas o painel',
  },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** Language for a screen that has no config yet: ?lang=, else the browser's, else English. */
export function pairingLang(params = new URLSearchParams(location.search)): Lang {
  const pl = params.get('lang');
  if (pl === 'es' || pl === 'en' || pl === 'pt') return pl;
  try {
    for (const l of navigator.languages ?? [navigator.language]) {
      const b = String(l).slice(0, 2).toLowerCase();
      if (b === 'es' || b === 'en' || b === 'pt') return b;
    }
  } catch { /* ignore */ }
  return 'en';
}

let root: HTMLElement | null = null;
let running = false;

async function post<T>(url: string, body: unknown): Promise<{ status: number; json: T | null }> {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, {
      method: 'POST', cache: 'no-store', signal: ctl.signal,
      headers: { 'content-type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body ?? {}),
    });
    let json: T | null = null;
    try {
      json = (await r.json()) as T;
    } catch { /* not JSON */ }
    return { status: r.status, json };
  } finally {
    clearTimeout(tm);
  }
}

const fmtCode = (c: string) => `${c.slice(0, 3)} ${c.slice(3)}`;

/** Where the display goes once paired: the plain display page (keeps ?client= & co., drops a dead /d/<key>). */
function afterPairUrl(): string {
  const q = new URLSearchParams(location.search);
  q.delete('k');
  const s = q.toString();
  return `/${s ? `?${s}` : ''}`;
}

/** Full-screen pairing / invalid-link screen. Never returns to the dashboard by itself except by reloading. */
export function showPairing(kind: 'pair' | 'invalid', lang: Lang): void {
  const T = TEXT[lang] ?? TEXT.en;
  clearCaches();
  document.documentElement.classList.add('needs-setup', 'needs-pairing');
  root ??= document.body.appendChild(document.createElement('div'));
  root.id = 'welcome';
  root.className = `wl--pair wl--${kind}`;
  root.setAttribute('role', 'dialog');
  const title = kind === 'invalid' ? T.invalidTitle : T.pairTitle;
  root.setAttribute('aria-label', title);
  root.innerHTML = `
    <div class="wl-bg" aria-hidden="true"><span class="wl-blob wl-blob--a"></span><span class="wl-blob wl-blob--b"></span><span class="wl-blob wl-blob--c"></span></div>
    <div class="wl-card">
      <div class="wl-main">
        <div class="wl-brand"><span class="wl-logo" aria-hidden="true"><span class="wl-logo__m"></span><span class="wl-logo__d"></span></span>Marco</div>
        ${kind === 'invalid' ? '<div class="wl-badge" aria-hidden="true">!</div>' : ''}
        <h1>${esc(title)}</h1>
        <p class="wl-lead">${esc(kind === 'invalid' ? T.invalidLead : T.pairLead)}</p>
        <div class="wl-code" aria-live="polite"><span class="wl-code__txt">··· ···</span></div>
        <ol class="wl-steps">
          <li><span>1</span>${esc(T.s1)}</li>
          <li><span>2</span>${esc(T.s2)}</li>
          <li><span>3</span>${esc(T.s3)}</li>
        </ol>
        <p class="wl-note wl-status"></p>
      </div>
      <div class="wl-qr"><div class="wl-qr__img"></div><span>${esc(T.scan)}</span></div>
    </div>
    <div class="wl-clock" aria-hidden="true"></div>`;
  const now = new Date();
  const loc = lang === 'en' ? 'en-GB' : lang === 'pt' ? 'pt-PT' : 'es-ES';
  (root.querySelector('.wl-logo__m') as HTMLElement).textContent = now.toLocaleDateString(loc, { month: 'short' }).replace('.', '');
  (root.querySelector('.wl-logo__d') as HTMLElement).textContent = String(now.getDate());
  const clock = root.querySelector('.wl-clock') as HTMLElement;
  const tick = () => {
    clock.textContent = new Date().toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  };
  tick();
  setInterval(tick, 10_000);
  if (!running) {
    running = true;
    void pairLoop(T);
  }
}

async function pairLoop(T: Record<string, string>): Promise<void> {
  const el = root!;
  const codeEl = el.querySelector('.wl-code__txt') as HTMLElement;
  const qrEl = el.querySelector('.wl-qr__img') as HTMLElement;
  const statusEl = el.querySelector('.wl-status') as HTMLElement;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let countdown: ReturnType<typeof setInterval> | null = null;
  for (;;) {
    let start: { status: number; json: PairStartResponse | null };
    try {
      start = await post<PairStartResponse>('/api/pair/start', {});
    } catch {
      statusEl.textContent = T.offline;
      await wait(5000);
      continue;
    }
    if (start.status !== 200 || !start.json?.code) {
      statusEl.textContent = start.status === 429 || start.status === 503 ? T.busy : T.offline;
      await wait(start.status === 429 || start.status === 503 ? 60_000 : 5000);
      continue;
    }
    const s = start.json;
    codeEl.textContent = fmtCode(s.code);
    el.querySelector('.wl-code')!.setAttribute('aria-label', s.code.split('').join(' '));
    const adminUrl = `${location.origin}/admin/#pair=${s.code}`;
    try {
      qrEl.innerHTML = qrSvg(adminUrl, { dark: '#0b0d11', light: '#ffffff', title: adminUrl });
    } catch {
      qrEl.innerHTML = '';
    }
    const expiresAt = Date.parse(s.expiresAt) || Date.now() + 600_000;
    const showLeft = () => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      statusEl.textContent = T.expires.replace('{t}', `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    };
    if (countdown) clearInterval(countdown);
    showLeft();
    countdown = setInterval(showLeft, 1000);
    // Poll with the secret session id (never the code) until paired or expired.
    let renew = false;
    while (!renew) {
      await wait(Math.max(1000, s.pollMs || 2000));
      let st: { status: number; json: PairStatusResponse | null };
      try {
        st = await post<PairStatusResponse>('/api/pair/status', { sessionId: s.sessionId });
      } catch {
        continue; // server restarting: keep trying until the code expires
      }
      const j = st.json;
      if (j?.status === 'paired' && j.token) {
        if (countdown) clearInterval(countdown);
        saveDeviceToken(j.token);
        clearCaches();
        codeEl.textContent = '✓';
        statusEl.textContent = T.paired;
        el.classList.add('is-paired');
        setTimeout(() => location.replace(afterPairUrl()), 900);
        return;
      }
      if (st.status === 404 || j?.status === 'expired' || Date.now() > expiresAt) {
        statusEl.textContent = T.renewing;
        renew = true;
      }
    }
  }
}
