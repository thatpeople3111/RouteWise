'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfigStatus, getSupabasePublicConfig } from './config';

let browserClient: SupabaseClient | null = null;

/** Optional, lazy singleton. Guest routes never need this client or configured accounts. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === 'undefined' || getSupabaseConfigStatus().status !== 'configured') return null;
  if (!browserClient) {
    const { url, publishableKey } = getSupabasePublicConfig();
    browserClient = createClient(url, publishableKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
    });
  }
  return browserClient;
}
