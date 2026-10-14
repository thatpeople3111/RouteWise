'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { loadPreferences, savePreferences as persistPreferences, PREFERENCES_ERROR } from '@/lib/supabase/preferencesRepository';
import type { PreferenceValues, UserPreferences } from '@/lib/preferences';
import { withDeadline } from '@/lib/supabase/requestDeadline';

type PreferencesState = { preferences: UserPreferences | null; isPreferencesLoading: boolean;
  isPreferencesSaving: boolean; preferencesError: string | null; retryPreferences: () => void; savePreferences: (values: PreferenceValues) => Promise<UserPreferences> };
const PreferencesContext = createContext<PreferencesState | null>(null);
type Snapshot = { owner: string | null; preferences: UserPreferences | null; loading: boolean; saving: boolean; error: string | null };

export default function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, isAuthLoading } = useAuth();
  const owner = user?.id ?? null;
  const [reload, setReload] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>({ owner: null, preferences: null, loading: false, saving: false, error: null });
  const generation = useRef(0), saving = useRef(false);
  const lifetime = useRef<{ owner: string; controller: AbortController } | null>(null);
  useEffect(() => {
    const request = ++generation.current;
    const invalidate = () => { generation.current++; };
    let active = true;
    saving.current = false;
    if (!owner || isAuthLoading) {
      queueMicrotask(() => {
        if (active) setSnapshot({ owner: null, preferences: null, loading: false, saving: false, error: null });
      });
      return () => { active = false; invalidate(); };
    }
    const controller = new AbortController();
    lifetime.current = { owner, controller };
    const loadController = new AbortController();
    const loadSignal = AbortSignal.any([controller.signal, loadController.signal]);
    queueMicrotask(() => {
      if (active && generation.current === request) setSnapshot({ owner, preferences: null, loading: true, saving: false, error: null });
    });
    void withDeadline(Promise.resolve().then(() => loadPreferences(getSupabaseBrowserClient(), loadSignal, id => !loadSignal.aborted && id === owner && generation.current === request)), () => loadController.abort()).then(preferences => {
      if (active && generation.current === request) setSnapshot({ owner, preferences, loading: false, saving: false, error: null });
    }).catch(() => {
      if (active && generation.current === request) setSnapshot({ owner, preferences: null, loading: false, saving: false, error: 'Saved defaults could not be loaded. You can still plan your trip normally.' });
    });
    return () => { active = false; invalidate(); controller.abort(); lifetime.current = null; };
  }, [owner, isAuthLoading, reload]);
  const retryPreferences = useCallback(() => { if (owner && !isAuthLoading && !saving.current) setReload(value => value + 1); }, [owner, isAuthLoading]);
  const save = useCallback(async (values: PreferenceValues) => {
    if (!owner || isAuthLoading) throw new Error('Sign in to save preferences.');
    if (lifetime.current?.owner !== owner) throw new Error('Account preferences are still initializing.');
    if (saving.current) throw new Error('A preference save is already in progress.');
    saving.current = true;
    const request = ++generation.current;
    setSnapshot(previous => ({ owner, preferences: previous.owner === owner ? previous.preferences : null, loading: false, saving: true, error: null }));
    try {
      // A separate request controller leaves the provider usable after a timeout.
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, lifetime.current.controller.signal]);
      const preferences = await withDeadline(persistPreferences(getSupabaseBrowserClient(), values, signal, id => !signal.aborted && id === owner && generation.current === request), () => controller.abort());
      if (generation.current !== request || preferences.userId !== owner) throw new Error('The signed-in account changed.');
      setSnapshot({ owner, preferences, loading: false, saving: false, error: null });
      return preferences;
    } catch {
      if (generation.current === request) setSnapshot(previous => ({ ...previous, saving: false, error: 'Could not confirm your saved defaults. Retry loading to check them before saving again.' }));
      throw new Error(generation.current !== request ? 'The signed-in account changed.' : PREFERENCES_ERROR);
    } finally { if (generation.current === request) saving.current = false; }
  }, [owner, isAuthLoading]);
  // Hide prior-user data immediately on sign-out/account switches, before effect cleanup.
  const current = !!owner && snapshot.owner === owner;
  const value = useMemo<PreferencesState>(() => ({
    preferences: current ? snapshot.preferences : null,
    isPreferencesLoading: !!owner && !isAuthLoading && (!current || snapshot.loading),
    isPreferencesSaving: current && snapshot.saving,
    preferencesError: current ? snapshot.error : null, savePreferences: save, retryPreferences,
  }), [current, snapshot, owner, isAuthLoading, save, retryPreferences]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesState {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
