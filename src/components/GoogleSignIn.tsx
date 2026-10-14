'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getSupabaseConfigStatus } from '@/lib/supabase/config';
import { GOOGLE_AUTH_ERROR, startGoogleSignIn } from '@/lib/supabase/googleAuth';
import { useAuth } from './AuthProvider';
import { withDeadline } from '@/lib/supabase/requestDeadline';
import { APPLE_AUTH_ERROR, startAppleSignIn } from '@/lib/supabase/appleAuth';
import { AUTH_FEATURES } from '@/lib/authFeatures';

/** Shared OAuth control, retaining the original Google entry point. */
export default function GoogleSignIn({ onGuest, provider = 'google', showGuest = true }: {
  onGuest: () => void; provider?: 'google' | 'apple'; showGuest?: boolean;
}) {
  const label = provider === 'apple' ? 'Apple' : 'Google';
  const { isAuthenticated: signedIn, isAuthLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const starting = useRef(false);
  const attempt = useRef(0);
  const mounted = useRef(false);
  const configured = getSupabaseConfigStatus().status === 'configured';
  useEffect(() => {
    mounted.current = true;
    const cancel = () => { attempt.current++; };
    return () => { mounted.current = false; cancel(); };
  }, []);
  async function signIn() {
    if (starting.current) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    starting.current = true; setBusy(true); setError('');
    const request = ++attempt.current;
    try {
      const url = await withDeadline((provider === 'apple' ? startAppleSignIn : startGoogleSignIn)(client, window.location.origin));
      if (mounted.current && request === attempt.current) window.location.assign(url);
    } catch {
      if (mounted.current && request === attempt.current) { setError(provider === 'apple' ? APPLE_AUTH_ERROR : GOOGLE_AUTH_ERROR); starting.current = false; setBusy(false); }
    }
  }
  function continueAsGuest() {
    attempt.current++;
    starting.current = false;
    setBusy(false); setError('');
    onGuest();
  }
  // Guard the shared entry point as well as its menu so future callers respect the UI flag.
  if (provider === 'apple' && !AUTH_FEATURES.apple) return null;
  return <section className="google-auth-test" aria-label={`Optional ${label} sign-in`}>
    {signedIn ? <p role="status">Signed in to RouteWise.</p> : <>
      <button type="button" className="location-button" disabled={!configured || busy || isAuthLoading} onClick={() => void signIn()}>{busy ? `Opening ${label}...` : `Sign in with ${label}`}</button>
      {showGuest && <button type="button" className="location-button" onClick={continueAsGuest}>Continue as Guest</button>}
      {!configured && <p>{label} sign-in is not configured. Guest planning is available.</p>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
