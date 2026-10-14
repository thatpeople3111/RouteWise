import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type SessionState = { session: Session | null; isAuthLoading: boolean; authError: string | null };
export const AUTH_SERVICE_ERROR = 'Account status could not be restored. Guest planning is still available.';

/** Single session observer. No Supabase calls inside onAuthStateChange callbacks. */
export function observeSession(client: SupabaseClient | null, notify: (state: SessionState) => void) {
  let active = true, revision = 0;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let restoreTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  const update = (session: Session | null, authError: string | null = null) => {
    if (!active) return;
    clearTimeout(expiryTimer);
    clearTimeout(restoreTimer);
    const expiresAt = session?.expires_at;
    const remaining = expiresAt === undefined ? undefined : expiresAt * 1000 - Date.now();
    const valid = session?.user && session.access_token && (remaining === undefined || remaining > 0) ? session : null;
    notify({ session: valid, isAuthLoading: false, authError });
    if (valid && remaining !== undefined) {
      expiryTimer = setTimeout(() => { revision++; update(expiresAt! * 1000 > Date.now() ? valid : null); }, Math.min(remaining, 2147483647));
    }
  };
  const controller = {
    clearSession() { revision++; update(null); },
    dispose() { active = false; clearTimeout(expiryTimer); clearTimeout(restoreTimer); unsubscribe?.(); },
  };
  if (!client) { queueMicrotask(() => update(null)); return controller; }
  const restoreRevision = revision;
  try {
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      revision++;
      update(session);
    });
    unsubscribe = () => subscription.unsubscribe();
    if (revision === restoreRevision) {
      restoreTimer = setTimeout(() => {
        if (active && revision === restoreRevision) { revision++; update(null, AUTH_SERVICE_ERROR); }
      }, 10000);
    }
    void client.auth.getSession().then(({ data, error }) => {
      if (active && revision === restoreRevision) update(error ? null : data.session, error ? AUTH_SERVICE_ERROR : null);
    }).catch(() => {
      if (active && revision === restoreRevision) update(null, AUTH_SERVICE_ERROR);
    });
  } catch {
    queueMicrotask(() => { if (revision === restoreRevision) update(null, AUTH_SERVICE_ERROR); });
  }
  return controller;
}
