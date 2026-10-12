// The side preview shows unsaved settings: the screen's config as the server would send it once saved
// (server/core/screens.js, the same projection), posted to the preview iframe (web/display/main.ts listens).
import { displayConfig } from '../../server/core/screens.js';
import type { DisplayConfig, StoredConfig } from '../shared/types';

/** Display config of `screenId` from the draft, or null when it cannot be built (the preview keeps the saved one). */
export function draftDisplayConfig(draft: StoredConfig, screenId: string): DisplayConfig | null {
  const screen = draft.screens.find((s) => s.id === screenId);
  if (!screen) return null;
  try {
    return displayConfig(draft, screen) as DisplayConfig;
  } catch (e) {
    console.warn('[preview] draft config', e);
    return null;
  }
}
