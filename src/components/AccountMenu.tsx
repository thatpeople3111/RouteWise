'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import GoogleSignIn from './GoogleSignIn';
import EmailAuth from './EmailAuth';
import SavedPreferencesForm from './SavedPreferencesForm';
import { usePreferences } from './PreferencesProvider';
import { AUTH_FEATURES } from '@/lib/authFeatures';

export default function AccountMenu({ onContinueAsGuest }: { onContinueAsGuest: () => void }) {
  const { user, isAuthenticated, isAuthLoading, authError, retryAuth } = useAuth();
  const { preferences, isPreferencesLoading, isPreferencesSaving, preferencesError, retryPreferences } = usePreferences();
  const [view, setView] = useState<'entry' | 'signin' | 'signup' | 'profile'>('entry');
  const [authAttempt, setAuthAttempt] = useState(0);
  const menu = useRef<HTMLDetailsElement>(null);
  const name = [user?.user_metadata?.full_name, user?.user_metadata?.name]
    .find(value => typeof value === 'string' && value.trim())?.trim().slice(0, 80) ?? '';
  const email = user?.email ?? '';
  const identity = name || email || 'RouteWise member';
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  function guest() {
    if (menu.current) menu.current.open = false;
    setView('entry');
    onContinueAsGuest();
  }
  return <details className="account-menu" ref={menu} onToggle={event => {
    if (!event.currentTarget.open) { setView('entry'); setAuthAttempt(value => value + 1); }
  }} onKeyDown={event => {
    if (event.key === 'Escape' && menu.current) {
      menu.current.open = false;
      menu.current.querySelector('summary')?.focus();
    }
  }}>
    <summary className="account-trigger">
      <span className="account-avatar" aria-hidden="true">{isAuthenticated ? identity.slice(0, 1).toUpperCase() : '○'}</span>
      Account <span className="account-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div className="account-panel" aria-label="RouteWise account">
      {isAuthenticated ? <>
        <div className="account-identity"><span className="account-avatar" aria-hidden="true">{identity.slice(0, 1).toUpperCase()}</span>
          <div><strong>{identity}</strong>{name && email && <p>{email}</p>}<span className="account-status">Signed in</span></div>
        </div>
        <button type="button" className="account-action" onClick={() => setView(view === 'profile' ? 'entry' : 'profile')}>Profile</button>
        {view === 'profile' && <section className="account-profile" aria-label="Profile"><h2>Your account</h2><p>{email || 'No email address available'}</p><p>Your account is optional. You can plan trips at any time.</p>
          <h2>Saved travel defaults</h2>
          {preferences && !isPreferencesLoading && <dl className="account-defaults">
            <dt>Transportation</dt><dd>{{ PUBLIC_TRANSIT: 'Public Transit', DRIVING: 'Driving', WALKING: 'Walking', RIDESHARE: 'Rideshare' }[preferences.preferredTransportMode]}</dd>
            <dt>Priority</dt><dd>{{ BEST: 'Best', FASTEST: 'Fastest', CHEAPEST: 'Cheapest' }[preferences.routePriority]}</dd>
            <dt>Walking limit</dt><dd>{preferences.maxWalkingMinutes === null ? 'Not saved — normal trip default' : `${preferences.maxWalkingMinutes} min`}</dd>
            <dt>Budget</dt><dd>{preferences.maxBudget === null ? 'Not saved — normal trip default' : `$${preferences.maxBudget.toFixed(2)}`}</dd>
          </dl>}
          {!preferences && !isPreferencesLoading && !preferencesError && <p>No saved travel defaults yet.</p>}
          <SavedPreferencesForm key={user?.id} />
        </section>}
        <EmailAuth embedded />
        {(isPreferencesLoading || isPreferencesSaving || preferencesError) && <section className="account-profile" aria-label="Saved defaults status" aria-busy={isPreferencesLoading || isPreferencesSaving}>
          {isPreferencesLoading && <p role="status">Loading saved defaults… You can plan now.</p>}
          {isPreferencesSaving && <p role="status">Saving your defaults…</p>}
          {preferencesError && <><p role="alert">{preferencesError}</p><button type="button" className="account-action" disabled={isPreferencesLoading || isPreferencesSaving} onClick={retryPreferences}>Retry loading defaults</button></>}
        </section>}
      </> : <>
        <h2>Your RouteWise account</h2>
        <p className="account-hint">An account is optional. Plan any trip as a guest.</p>
        {isAuthLoading && <p role="status" className="account-hint">Checking account status...</p>}
        {authError && <><p className="account-hint" role="alert">{authError}</p><button type="button" className="account-action" disabled={isAuthLoading} onClick={retryAuth}>Retry account status</button></>}
        {view === 'signin' || view === 'signup' ? <>
          <button type="button" className="account-back" onClick={() => setView('entry')}>Back to sign-in options</button>
          <EmailAuth key={`${view}-${authAttempt}`} embedded initialMode={view} />
          <button type="button" className="account-action" onClick={guest}>Continue as Guest</button>
        </> : <>
          <GoogleSignIn key={authAttempt} onGuest={guest} />
          {AUTH_FEATURES.apple && <GoogleSignIn key={`apple-${authAttempt}`} provider="apple" showGuest={false} onGuest={guest} />}
          <button type="button" className="account-action" onClick={() => setView('signin')}>Sign in with email/password</button>
          <button type="button" className="account-action" onClick={() => setView('signup')}>Create account</button>
        </>}
      </>}
    </div>
  </details>;
}
