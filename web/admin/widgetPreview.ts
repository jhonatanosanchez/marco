// The preview on the Widgets page: the widget being edited, placed on the screen being edited, as the TV draws it.
// The admin builds that screen's config with only this widget at the chosen place (a copy of the draft, never saved)
// and the preview frame shows it like any unsaved change (livePreview.ts, Preview.tsx). The display reports where the
// widget is so the preview can zoom in on it (web/display/main.ts, 'marco:preview-focus').
import { useEffect, useState } from 'preact/hooks';
import type { FrameCorner, StoredConfig, WidgetDef, WidgetSize } from '../shared/types';
import { clone } from './util';

export type WidgetPreviewPlace = 'corner' | 'side' | 'full';
export interface WidgetPreviewSpot {
  place: WidgetPreviewPlace;
  size: WidgetSize;
  corner: FrameCorner;
}

interface PickState {
  /** the widget the owner is editing (null = the first one) */
  id: string | null;
  /** chosen in the preview bar; null = where the screen has it (widgetPreviewSpot) */
  spot: WidgetPreviewSpot | null;
  /** bumped by a "Probar": the preview loads the widget again */
  tested: number;
}

let pick: PickState = { id: null, spot: null, tested: 0 };
const subs = new Set<(p: PickState) => void>();
const emit = (next: PickState) => {
  pick = next;
  for (const fn of subs) fn(pick);
};

/** The owner works on widget `id`: the preview shows it where the screen has it (until another place is chosen). */
export const setPreviewWidget = (id: string) => void (pick.id !== id && emit({ ...pick, id, spot: null }));
export const setPreviewSpot = (spot: WidgetPreviewSpot | null) => emit({ ...pick, spot });
/** A test of widget `id` went through: the preview shows it (and loads it again). */
export const previewTested = (id: string) => emit({ ...pick, id, spot: pick.id === id ? pick.spot : null, tested: pick.tested + 1 });

export function useWidgetPreview(): PickState {
  const [p, setP] = useState(pick);
  useEffect(() => {
    subs.add(setP);
    setP(pick);
    return () => void subs.delete(setP);
  }, []);
  return p;
}

/** Where `w` goes on screen `screenId`: as placed there, else a medium corner (prices: the side column, with its chart). */
export function widgetPreviewSpot(cfg: StoredConfig, screenId: string, w: WidgetDef): WidgetPreviewSpot {
  const screen = cfg.screens.find((s) => s.id === screenId);
  if (screen?.layout.preset === 'widget' && screen.layout.widgetId === w.id) return { place: 'full', size: 'l', corner: 'br' };
  const p = (screen?.widgets ?? []).find((x) => x.widgetId === w.id);
  if (p) return { place: p.place, size: p.size, corner: p.corner };
  return w.type === 'prices' ? { place: 'side', size: 'm', corner: 'br' } : { place: 'corner', size: 'm', corner: 'br' };
}

/** Layouts without a side column (the display puts a side widget in its corner there). */
const NO_SIDE = new Set(['photoFrame', 'bedside', 'widget', 'topBottom', 'kidsRoutines', 'kidsFamily', 'kidsMeals']);
export const hasSideColumn = (preset: string) => !NO_SIDE.has(preset);
/** The layout the preview uses for a side widget on a screen without a side column. */
export const SIDE_FALLBACK_PRESET = 'bigCalendar' as const;

/**
 * A copy of `cfg` where screen `screenId` shows only widget `widgetId` at `spot`: in a corner or the side column (on a
 * layout that has one), or full screen with the Widget layout. Null when the screen or the widget is missing.
 */
export function widgetPreviewDraft(cfg: StoredConfig, screenId: string, widgetId: string, spot: WidgetPreviewSpot): StoredConfig | null {
  if (!cfg.screens.some((s) => s.id === screenId) || !(cfg.widgets ?? []).some((w) => w.id === widgetId)) return null;
  const d = clone(cfg);
  const s = d.screens.find((x) => x.id === screenId)!;
  if (spot.place === 'full') {
    s.layout.preset = 'widget';
    s.layout.widgetId = widgetId;
    s.widgets = [];
    return d;
  }
  if (s.layout.preset === 'widget' || (spot.place === 'side' && !hasSideColumn(s.layout.preset))) s.layout.preset = SIDE_FALLBACK_PRESET;
  s.widgets = [{ widgetId, place: spot.place, corner: spot.corner, size: spot.size }];
  return d;
}
