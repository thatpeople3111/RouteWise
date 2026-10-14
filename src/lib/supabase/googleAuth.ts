import type { SupabaseClient } from '@supabase/supabase-js';

export const GOOGLE_AUTH_ERROR = 'Google sign-in could not be completed. You can try again or continue as a guest.';

export async function startGoogleSignIn(client: SupabaseClient, origin: string) {
  const { data, error } = await client.auth.signInWithOAuth({ provider: 'google',
    options: { redirectTo: new URL('/auth/callback', origin).href, skipBrowserRedirect: true } });
  if (error || !data.url) throw new Error(GOOGLE_AUTH_ERROR);
  return data.url;
}

// React Strict Mode may mount the callback twice. A PKCE code must be exchanged only once.
const exchanges = new WeakMap<SupabaseClient, Map<string, Promise<void>>>();
export function completeGoogleSignIn(client: SupabaseClient, params: URLSearchParams): Promise<void> {
  if (params.has('error') || params.has('error_code')) return Promise.reject(new Error(GOOGLE_AUTH_ERROR));
  const code = params.get('code');
  if (!code) return Promise.reject(new Error(GOOGLE_AUTH_ERROR));
  const flowId = params.get('sb_flow_id');
  let requests = exchanges.get(client);
  if (!requests) { requests = new Map(); exchanges.set(client, requests); }
  const key = `${code}:${flowId ?? ''}`;
  const existing = requests.get(key);
  if (existing) return existing;
  const request = (async () => {
    const { data, error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error || !data.session?.user || !data.session.access_token) throw new Error(GOOGLE_AUTH_ERROR);
    const { data: saved, error: sessionError } = await client.auth.getSession();
    if (sessionError || saved.session?.user.id !== data.session.user.id || !saved.session?.access_token) throw new Error(GOOGLE_AUTH_ERROR);
  })();
  requests.set(key, request);
  if (requests.size > 5) requests.delete(requests.keys().next().value!);
  return request;
}

// Supabase's application callback is identical for Google, Apple and email PKCE.
export const completeOAuthSignIn = completeGoogleSignIn;
