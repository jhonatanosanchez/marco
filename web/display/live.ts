// How the display learns about changes (docs/ARCHITECTURE.md). Self-hosted servers keep an SSE stream open
// (/api/stream). A server that cannot hold long-lived connections answers `live: 'poll'` in GET /api/health; the
// display then skips the EventSource and checks the config revision every 90 s instead.
// No imports on purpose: the module is unit-tested directly by node --test (server/test/display-live.test.js).

export type LiveMode = 'sse' | 'poll';

export const CONFIG_POLL_MS = 90_000;

/** Live mode advertised by a /api/health body. Anything but an explicit 'poll' (old servers, self-hosted) is SSE. */
export function liveModeOf(health: unknown): LiveMode {
  return (health as { live?: unknown } | null)?.live === 'poll' ? 'poll' : 'sse';
}

export interface DetectOptions {
  health: () => Promise<unknown>;
  /** True when the error is an HTTP answer (the server is up but /api/health failed): settle on SSE right away. */
  answered: (e: unknown) => boolean;
  /** Stop retrying (access denied, page closing). */
  cancelled?: () => boolean;
  wait?: (ms: number) => Promise<void>;
}

/**
 * Ask /api/health which live mode to use. A network error or timeout is retried (5 s, doubling to 30 s) until the
 * server answers, so a display that boots offline does not pick SSE against a polling-only server.
 */
export async function detectLiveMode(o: DetectOptions): Promise<LiveMode | null> {
  const wait = o.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let delay = 5000;
  for (;;) {
    if (o.cancelled?.()) return null;
    try {
      return liveModeOf(await o.health());
    } catch (e) {
      if (o.answered(e)) return 'sse';
    }
    await wait(delay);
    delay = Math.min(delay * 2, 30_000);
  }
}

export interface ConfigPollOptions {
  /** Current config revision (before the fetch). */
  revision: () => number | undefined;
  /** Fetch, save and apply the config; false on failure (401 / 403 handling lives in the caller). */
  fetchConfig: () => Promise<boolean>;
  /** Called after a fetched config carries a different revision (refetch events and countdowns). */
  changed: () => void;
  intervalMs?: number;
}

/** Poll the display config; same contract as the SSE `config` event. */
export function startConfigPoll(o: ConfigPollOptions): { close(): void; tick(): Promise<void> } {
  let closed = false;
  let busy = false;
  const tick = async () => {
    if (closed || busy) return;
    busy = true;
    try {
      const before = o.revision();
      if ((await o.fetchConfig()) && !closed && o.revision() !== before) o.changed();
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), o.intervalMs ?? CONFIG_POLL_MS);
  return {
    close() {
      closed = true;
      clearInterval(timer);
    },
    tick,
  };
}
