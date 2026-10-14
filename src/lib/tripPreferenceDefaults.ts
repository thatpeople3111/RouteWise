import type { UserPreferences } from './preferences';
import type { TripDraft } from './tripDraft';

export const preferenceDraftFields = ['preferredTransportMode', 'routePriority', 'maxWalkingMinutes', 'budgetUsd'] as const;
export type PreferenceDraftField = typeof preferenceDraftFields[number];
export type DefaultsGuard = { edited: boolean; applied: boolean; editedPreferenceFields?: PreferenceDraftField[] };

/** Apply once, preserving each edited preference field and all travel-detail input. */
export function applyTripPreferenceDefaults(draft: TripDraft, preferences: UserPreferences | null, guard: DefaultsGuard): TripDraft {
  // Legacy callers without field tracking keep the conservative all-edits guard.
  if (!preferences || guard.applied || (guard.edited && !guard.editedPreferenceFields)) return draft;
  const edited = new Set(guard.editedPreferenceFields);
  const budget = preferences.maxBudget, walking = preferences.maxWalkingMinutes;
  return { ...draft,
    ...(!edited.has('preferredTransportMode') ? { preferredTransportMode: preferences.preferredTransportMode } : {}),
    ...(!edited.has('routePriority') ? { routePriority: preferences.routePriority } : {}),
    ...(budget !== null && !edited.has('budgetUsd') ? { budgetUsd: Math.min(budget, 1000) } : {}),
    ...(walking !== null && !edited.has('maxWalkingMinutes') ? { maxWalkingMinutes: Math.min(walking, 180) } : {}),
    usingSavedDefaults: preferenceDraftFields.some(field => !edited.has(field)
      && (field === 'budgetUsd' ? budget !== null : field === 'maxWalkingMinutes' ? walking !== null : true)),
    savedDefaultsLimited: (budget !== null && !edited.has('budgetUsd') && budget > 1000)
      || (walking !== null && !edited.has('maxWalkingMinutes') && walking > 180),
    // A preference is not car ownership and must never disable alternative modes.
  };
}
