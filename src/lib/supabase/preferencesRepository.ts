import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { preferenceValuesSchema, transportModeSchema, routePrioritySchema, type PreferenceValues, type UserPreferences } from '../preferences';

const columns = 'user_id,preferred_transport_mode,max_walking_minutes,max_budget,route_priority,created_at,updated_at';
const rowSchema = z.object({ user_id: z.guid(), preferred_transport_mode: transportModeSchema,
  max_walking_minutes: z.number().int().nonnegative().nullable(), max_budget: z.number().nonnegative().nullable(),
  route_priority: routePrioritySchema, created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }) });
export const PREFERENCES_ERROR = 'Preferences could not be loaded or saved. Try again; guest planning is still available.';
function decode(row: unknown, owner: string): UserPreferences {
  const parsed = rowSchema.safeParse(row);
  if (!parsed.success || parsed.data.user_id !== owner) throw new Error(PREFERENCES_ERROR);
  const data = parsed.data;
  return { userId: data.user_id, preferredTransportMode: data.preferred_transport_mode, routePriority: data.route_priority,
    maxWalkingMinutes: data.max_walking_minutes, maxBudget: data.max_budget, createdAt: data.created_at, updatedAt: data.updated_at };
}

async function authenticatedOwner(client: SupabaseClient | null): Promise<string | null> {
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error) {
    if (error.name === 'AuthSessionMissingError') return null;
    throw new Error(PREFERENCES_ERROR);
  }
  return data.user?.id ?? null;
}

/** No user-ID argument: callers cannot choose whose record is loaded or saved. */
export async function loadPreferences(client: SupabaseClient | null, signal?: AbortSignal, isCurrentOwner: (owner: string) => boolean = () => true): Promise<UserPreferences | null> {
  const owner = await authenticatedOwner(client);
  signal?.throwIfAborted();
  if (!owner || !client) return null;
  if (!isCurrentOwner(owner)) throw new Error('The signed-in account changed.');
  const query = client.from('user_preferences').select(columns).eq('user_id', owner);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  if (error) throw new Error(PREFERENCES_ERROR);
  signal?.throwIfAborted();
  if (!isCurrentOwner(owner)) throw new Error('The signed-in account changed.');
  return data ? decode(data, owner) : null;
}

export async function savePreferences(client: SupabaseClient | null, values: PreferenceValues, signal?: AbortSignal, isCurrentOwner: (owner: string) => boolean = () => true): Promise<UserPreferences> {
  const owner = await authenticatedOwner(client);
  signal?.throwIfAborted();
  if (!owner || !client) throw new Error('Sign in to save preferences.');
  if (!isCurrentOwner(owner)) throw new Error('The signed-in account changed.');
  const validated = preferenceValuesSchema.safeParse(values);
  if (!validated.success) throw new Error('Check the preference values and nonnegative limits.');
  const value = validated.data;
  const fields = { preferred_transport_mode: value.preferredTransportMode, route_priority: value.routePriority,
    ...(value.maxWalkingMinutes !== undefined ? { max_walking_minutes: value.maxWalkingMinutes } : {}),
    ...(value.maxBudget !== undefined ? { max_budget: value.maxBudget } : {}) };
  const update = () => {
    signal?.throwIfAborted();
    if (!isCurrentOwner(owner)) throw new Error('The signed-in account changed.');
    const query = client.from('user_preferences').update(fields).eq('user_id', owner).select(columns);
    return (signal ? query.abortSignal(signal) : query).maybeSingle();
  };
  let result = await update();
  if (result.error) throw new Error(PREFERENCES_ERROR);
  if (!result.data) {
    signal?.throwIfAborted();
    if (!isCurrentOwner(owner)) throw new Error('The signed-in account changed.');
    const insert = client.from('user_preferences').insert({ ...fields, user_id: owner,
      max_walking_minutes: value.maxWalkingMinutes ?? null, max_budget: value.maxBudget ?? null }).select(columns);
    const inserted = await (signal ? insert.abortSignal(signal) : insert).single();
    if (inserted.error?.code === '23505') result = await update(); // Another tab created the row first.
    else result = inserted;
  }
  if (result.error || !result.data) throw new Error(PREFERENCES_ERROR);
  signal?.throwIfAborted();
  if (!isCurrentOwner(owner)) throw new Error('The signed-in account changed.');
  return decode(result.data, owner);
}
