// One-shot "intents" passed between pages (command palette → page), e.g. open the "add birthday" form.
let pending: { route: string; action: string } | null = null;

export function setIntent(route: string, action: string) {
  pending = { route, action };
}

/** Returns true (and consumes it) when an intent for this route/action is pending. */
export function takeIntent(route: string, action: string): boolean {
  if (pending && pending.route === route && pending.action === action) {
    pending = null;
    return true;
  }
  return false;
}
