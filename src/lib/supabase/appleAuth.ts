import type { SupabaseClient } from '@supabase/supabase-js';

export const APPLE_AUTH_ERROR = 'Apple sign-in could not be completed. Try again or continue as a guest.';

/** Web OAuth: Supabase handles Apple's credentials, state and provider response. */
export async function startAppleSignIn(client: SupabaseClient, origin: string) {
  const { data, error } = await client.auth.signInWithOAuth({ provider: 'apple',
    options: { redirectTo: new URL('/auth/callback', origin).href, skipBrowserRedirect: true } });
  if (error || !data.url) throw new Error(APPLE_AUTH_ERROR);
  return data.url;
}
