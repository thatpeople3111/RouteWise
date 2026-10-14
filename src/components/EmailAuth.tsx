'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getSupabaseConfigStatus } from '@/lib/supabase/config';
import { createEmailAccount, signInWithEmail, emailAuthErrorMessage } from '@/lib/supabase/emailAuth';
import { useAuth } from './AuthProvider';

export default function EmailAuth({ initialMode = 'signin', embedded = false }: { initialMode?: 'signin' | 'signup'; embedded?: boolean }) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const { isAuthenticated: signedIn, isAuthLoading, isSigningOut, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false), mounted = useRef(false);
  const configured = getSupabaseConfigStatus().status === 'configured';
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get('email') ?? ''), password = String(values.get('password') ?? '');
    // Password exists only in the input and this request's transient memory.
    values.delete('password');
    const input = form.elements.namedItem('password') as HTMLInputElement | null;
    if (input) input.value = '';
    pending.current = true; setBusy(true); setMessage(''); setError('');
    try {
      if (mode === 'signup') {
        const result = await createEmailAccount(client, email, password, window.location.origin);
        if (mounted.current) setMessage(result.status === 'signed-in' ? 'Account created. You are signed in.'
          : 'If this email is eligible, check your inbox to confirm it. If you already have an account, sign in instead.');
      } else {
        await signInWithEmail(client, email, password);
        if (mounted.current) setMessage('You are signed in.');
      }
    } catch (failure) { if (mounted.current) setError(emailAuthErrorMessage(failure)); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  async function logout() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage(''); setError('');
    try { await signOut(); if (mounted.current) setMessage('Signed out. Guest planning is available.'); }
    catch (failure) { if (mounted.current) setError(emailAuthErrorMessage(failure)); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  const fields = <>
      <div className="email-auth-modes">
        <button type="button" className="location-button" disabled={busy} aria-pressed={mode === 'signin'} onClick={() => { setMode('signin'); setError(''); setMessage(''); }}>Sign in</button>
        <button type="button" className="location-button" disabled={busy} aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setError(''); setMessage(''); }}>Create account</button>
      </div>
      <form key={mode} onSubmit={event => void submit(event)}>
        <label>Email<input name="email" type="email" autoComplete="email" required disabled={!configured || busy} /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required disabled={!configured || busy} /></label>
        <button type="submit" className="location-button" disabled={!configured || busy || isAuthLoading}>{busy ? mode === 'signup' ? 'Creating account...' : 'Signing in...' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
      </form>
      {!configured && <p>Email accounts are not configured. Continue as a guest.</p>}
    </>;
  return <section className="email-auth" aria-label="Optional email account">
    {signedIn ? <button type="button" className="location-button" disabled={busy || isSigningOut} onClick={() => void logout()}>{busy || isSigningOut ? 'Signing out...' : 'Sign out'}</button>
      : embedded ? fields : <details><summary>Sign in or create an account with email</summary>{fields}</details>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
