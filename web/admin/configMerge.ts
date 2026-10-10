// "Save my changes" after a 409 conflict: put what this tab changed on top of the version saved elsewhere.
// Compares by value, two levels deep (top-level sections, then their keys). A part this tab did not touch takes
// the saved value, so an unrelated change made elsewhere (a Google login adding the allowed email, a screen
// renamed in another tab) survives. A part changed on both sides keeps this tab's value.
import type { SaveConfigRequest, StoredConfig } from '../shared/types';

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function mergeLevel(base: unknown, mine: unknown, theirs: unknown, depth: number): unknown {
  if (same(mine, base)) return theirs;
  if (depth > 0 && isPlain(base) && isPlain(mine) && isPlain(theirs)) {
    const out: Record<string, unknown> = {};
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
      const v = mergeLevel(base[k], mine[k], theirs[k], depth - 1);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return mine;
}

/**
 * `base` = the config this tab loaded, `mine` = its draft, `theirs` = the config on the server now.
 * The result carries the server revision, so it can be sent with baseRevision = theirs.revision.
 */
export function mergeOverwrite(base: StoredConfig, mine: StoredConfig, theirs: StoredConfig): StoredConfig {
  const out = mergeLevel(base, mine, theirs, 2) as StoredConfig;
  return { ...out, revision: theirs.revision };
}

export type ConflictChoice = 'overwrite' | 'reload' | null;

export type SaveOutcome =
  | { status: 'saved'; config: StoredConfig }
  | { status: 'reloaded'; config: StoredConfig }
  | { status: 'cancelled' };

/**
 * Save `draft` with the revision guard. On a conflict: fetch the saved config, ask the user, then either hand
 * the saved config back ("reload") or merge this draft on top of it and save again with the new baseRevision
 * ("overwrite"). Errors other than a conflict are thrown to the caller. A conflict on every round (someone
 * saving in a loop) ends as `cancelled` after `rounds` tries.
 */
export async function saveWithRevision(o: {
  draft: StoredConfig;
  base: StoredConfig;
  put: (body: SaveConfigRequest) => Promise<StoredConfig>;
  get: () => Promise<StoredConfig>;
  choose: (theirs: StoredConfig) => Promise<ConflictChoice>;
  isConflict: (e: unknown) => boolean;
  /** Called with the merged draft and the saved config before the next try (the UI shows the merged draft). */
  merged?: (draft: StoredConfig, theirs: StoredConfig) => void;
  rounds?: number;
}): Promise<SaveOutcome> {
  let { draft, base } = o;
  for (let round = 0; round < (o.rounds ?? 3); round++) {
    try {
      return { status: 'saved', config: await o.put({ ...draft, baseRevision: draft.revision }) };
    } catch (e) {
      if (!o.isConflict(e)) throw e;
    }
    const theirs = await o.get();
    const choice = await o.choose(theirs);
    if (choice === 'reload') return { status: 'reloaded', config: theirs };
    if (choice !== 'overwrite') return { status: 'cancelled' };
    draft = mergeOverwrite(base, draft, theirs);
    base = theirs;
    o.merged?.(draft, theirs);
  }
  return { status: 'cancelled' };
}
