// SSE client for /api/stream?screen=&client= with manual exponential-backoff reconnect (docs/ARCHITECTURE.md).
import type { Announcement, IdentifyPayload, NightCommand, StreamHello } from '../shared/types';
import { clientId, isPreview, screenKey } from './identity';

export interface StreamHandlers {
  hello?: (d: Partial<StreamHello>) => void;
  config?: (d: { revision: number }) => void;
  reload?: () => void;
  events?: (d: { hash: string }) => void;
  photos?: (d: { hidden?: string[] }) => void;
  announce?: (d: Announcement) => void;
  announceClear?: (d: { id: string | null }) => void;
  identify?: (d: IdentifyPayload) => void;
  night?: (d: { mode: NightCommand }) => void;
  open?: () => void;
  down?: () => void;
}

export function streamUrl(): string {
  const q = new URLSearchParams();
  if (screenKey) q.set('screen', screenKey);
  q.set('client', clientId);
  if (isPreview) q.set('preview', '1');
  return `/api/stream?${q.toString()}`;
}

export function connectStream(h: StreamHandlers): { close(): void } {
  let es: EventSource | null = null;
  let delay = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  const parse = (e: Event) => {
    try {
      const d = (e as MessageEvent).data;
      return d ? JSON.parse(d) : {};
    } catch {
      return {};
    }
  };

  // Server sends a named `ping` event every 25 s; any event counts as liveness. If nothing arrives
  // for ~3 heartbeats the stream is considered stalled and is reopened.
  const kick = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => restart(), 80 * 1000);
  };

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      console.error('[stream] handler failed', err);
    }
  };

  const listen = (name: string, fn: (d: any) => void) => {
    es!.addEventListener(name, (e) => {
      kick();
      const d = parse(e);
      safe(() => fn(d));
    });
  };

  const open = () => {
    if (closed) return;
    try {
      es = new EventSource(streamUrl());
    } catch {
      schedule();
      return;
    }
    es.onopen = () => {
      delay = 1000;
      kick();
      h.open?.();
    };
    es.onerror = () => {
      h.down?.();
      restart();
    };
    listen('hello', (d) => h.hello?.(d));
    listen('config', (d) => h.config?.(d));
    listen('events', (d) => h.events?.(d));
    listen('photos', (d) => h.photos?.({ hidden: Array.isArray(d?.hidden) ? d.hidden.filter((f: unknown) => typeof f === 'string') : undefined }));
    listen('reload', () => h.reload?.());
    listen('announce', (d) => d && typeof d.id === 'string' && h.announce?.(d));
    listen('announce-clear', (d) => h.announceClear?.({ id: typeof d?.id === 'string' ? d.id : null }));
    listen('identify', (d) => h.identify?.(d));
    listen('night', (d) => (d?.mode === 'on' || d?.mode === 'off' || d?.mode === 'auto') && h.night?.(d));
    es.addEventListener('ping', () => kick());
    es.onmessage = () => kick();
  };

  const restart = () => {
    if (es) {
      es.close();
      es = null;
    }
    schedule();
  };

  const schedule = () => {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      open();
    }, delay + Math.random() * 500);
    delay = Math.min(delay * 2, 30000);
  };

  open();
  return {
    close() {
      closed = true;
      es?.close();
      if (timer) clearTimeout(timer);
      if (watchdog) clearTimeout(watchdog);
    },
  };
}
