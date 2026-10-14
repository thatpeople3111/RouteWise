'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { observeSession, type SessionState, AUTH_SERVICE_ERROR } from '@/lib/supabase/sessionState';
import { signOut as signOutSession } from '@/lib/supabase/emailAuth';
import { withDeadline } from '@/lib/supabase/requestDeadline';

type AuthState = {
  user: User | null; session: Session | null; isAuthenticated: boolean;
  isAuthLoading: boolean; authError: string | null; isSigningOut: boolean; retryAuth: () => void; signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, isAuthLoading: true, authError: null });
  const observer = useRef<ReturnType<typeof observeSession> | null>(null);
  const [retry, setRetry] = useState(0);
  const [isSigningOut, setSigningOut] = useState(false);
  const pendingSignOut = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let active = true;
    try { observer.current = observeSession(getSupabaseBrowserClient(), setState); }
    catch { queueMicrotask(() => { if (active) setState({ session: null, isAuthLoading: false, authError: AUTH_SERVICE_ERROR }); }); }
    return () => { active = false; observer.current?.dispose(); observer.current = null; };
  }, [retry]);
  const retryAuth = useCallback(() => {
    setState(previous => ({ ...previous, isAuthLoading: true, authError: null }));
    setRetry(value => value + 1);
  }, []);
  const signOut = useCallback(() => {
    if (pendingSignOut.current) return pendingSignOut.current;
    setSigningOut(true);
    const operation = Promise.resolve().then(async () => {
      const client = getSupabaseBrowserClient();
      if (client) await withDeadline(signOutSession(client));
      observer.current?.clearSession();
    }).finally(() => { pendingSignOut.current = null; setSigningOut(false); });
    pendingSignOut.current = operation;
    return operation;
  }, []);
  const value = useMemo<AuthState>(() => ({ ...state, user: state.session?.user ?? null,
    isAuthenticated: !!state.session?.user, signOut, isSigningOut, retryAuth }), [state, signOut, isSigningOut, retryAuth]);
  // Never replace children with a loading gate. Auth restoration is background work.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside AuthProvider');
  return auth;
}
