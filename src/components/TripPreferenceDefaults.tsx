'use client';

import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { usePreferences } from './PreferencesProvider';
import type { UserPreferences } from '@/lib/preferences';

export default function TripPreferenceDefaults({ onReady }: { onReady: (preferences: UserPreferences) => void }) {
  const { isAuthLoading } = useAuth();
  const { preferences, isPreferencesLoading } = usePreferences();
  useEffect(() => {
    if (!isAuthLoading && !isPreferencesLoading && preferences) onReady(preferences);
  }, [isAuthLoading, isPreferencesLoading, preferences, onReady]);
  return null;
}
