// "Save my changes" after a 409 conflict: put what this tab changed on top of the version saved elsewhere.
// Compares by value, two levels deep (top-level sections, then their keys). Lists of items with an `id` (screens,
// sources, countdowns, local events...) are merged item by item: items added or removed on either side are kept
// added or removed, and an item this tab did not touch takes the saved value. So an unrelated change made
// elsewhere (a Google login adding the allowed email, another screen edited in another tab) survives. A part
// changed on both sides keeps this tab's value.
import type { SaveConfigRequest, StoredConfig } from '../shared/types';

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Item = Record<string, unknown> & { id: string };
/** An array of objects with distinct string ids, or null. */
function idList(v: unknown): Item[] | null {
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  for (const x of v) {
    if (!isPlain(x) || typeof x.id !== 'string' || seen.has(x.id)) return null;
    seen.add(x.id);
  }
  return v as Item[];
}

function mergeList(base: Item[], mine: Item[], theirs: Item[], depth: number): Item[] {
  const byId = (l: Item[]) => new Map(l.map((x) => [x.id, x]));
  const b = byId(base);
  const m = byId(mine);
  const th = byId(theirs);
  const pick = (id: string): Item | undefined => {
    const [bi, mi, ti] = [b.get(id), m.get(id), th.get(id)];
    if (!bi) return mi ?? ti; // added here (or, with the same id, there)
    if (!mi) return undefined; // removed here: gone (this tab wins, as for any other part)
    if (!ti) return same(mi, bi) ? undefined : mi; // removed there: gone, unless it was changed here
    return mergeLevel(bi, mi, ti, depth) as Item;
  };
  // order: this tab's when it moved items around, otherwise the saved one; items added here go last
  const common = (l: Item[], other: Map<string, Item>) => l.filter((x) => other.has(x.id)).map((x) => x.id);
  const reordered = !same(common(mine, b), common(base, m));
  const ids = reordered ? [...mine.map((x) => x.id), ...theirs.map((x) => x.id)] : [...theirs.map((x) => x.id), ...mine.map((x) => x.id)];
  const out: Item[] = [];
  const done = new Set<string>();
  for (const id of ids) {
    if (done.has(id)) continue;
    done.add(id);
    const v = pick(id);
    if (v !== undefined) out.push(v);
  }
  return out;
}

function mergeLevel(base: unknown, mine: unknown, theirs: unknown, depth: number): unknown {
  if (same(mine, base)) return theirs;
  if (same(theirs, base)) return mine;
  const lb = idList(base);
  const lm = idList(mine);
  const lt = idList(theirs);
  if (lb && lm && lt) return mergeList(lb, lm, lt, depth);
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
