'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { usePreferences } from './PreferencesProvider';
import { preferenceValuesSchema } from '@/lib/preferences';

export default function SavedPreferencesForm() {
  const { preferences, savePreferences, isPreferencesLoading, isPreferencesSaving, preferencesError } = usePreferences();
  const [message, setMessage] = useState('');
  const mounted = useRef(false);
  const pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || isPreferencesLoading || isPreferencesSaving || preferencesError) return;
    const fields = new FormData(event.currentTarget);
    const optionalNumber = (name: string) => {
      const value = String(fields.get(name) ?? '').trim();
      return value === '' ? null : Number(value);
    };
    const parsed = preferenceValuesSchema.safeParse({
      preferredTransportMode: fields.get('transport'), routePriority: fields.get('priority'),
      maxWalkingMinutes: optionalNumber('walking'), maxBudget: optionalNumber('budget'),
    });
    if (!parsed.success) { setMessage('Choose a transportation mode and priority, and enter valid nonnegative limits.'); return; }
    pending.current = true;
    setMessage('');
    try {
      await savePreferences(parsed.data);
      if (mounted.current) setMessage('Defaults saved for future trips. Your current trip stays as it is.');
    } catch { if (mounted.current) setMessage('Could not confirm the save. Reload defaults to check before trying again.'); }
    finally { pending.current = false; }
  }
  if (isPreferencesLoading || preferencesError) return null;
  return <div className="email-auth">
    <p>Save defaults for future trips. Blank limits use the normal trip defaults. Trip fields cap walking at 180 minutes and budget at $1,000; you can review them before planning.</p>
    <form onSubmit={event => void submit(event)} aria-label="Save travel defaults">
      <fieldset disabled={isPreferencesSaving} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 12 }}>
        <label>Transportation<select name="transport" required defaultValue={preferences?.preferredTransportMode ?? ''}>
          <option value="" disabled>Choose transportation</option><option value="PUBLIC_TRANSIT">Public Transit</option><option value="DRIVING">Driving</option><option value="WALKING">Walking</option><option value="RIDESHARE">Rideshare</option>
        </select></label>
        <label>Priority<select name="priority" defaultValue={preferences?.routePriority ?? 'BEST'}>
          <option value="BEST">Best</option><option value="FASTEST">Fastest</option><option value="CHEAPEST">Cheapest</option>
        </select></label>
        <label>Walking limit (minutes)<input name="walking" type="number" min="0" max="2147483647" step="1" defaultValue={preferences?.maxWalkingMinutes ?? ''} /></label>
        <label>Budget (USD)<input name="budget" type="number" min="0" max="99999999.99" step="0.01" defaultValue={preferences?.maxBudget ?? ''} /></label>
        <button type="submit" className="account-action">{isPreferencesSaving ? 'Saving…' : 'Save defaults'}</button>
      </fieldset>
    </form>
    {message && <p role="status">{message}</p>}
  </div>;
}
