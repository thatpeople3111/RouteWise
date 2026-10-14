export type SupabaseConfigStatus =
  | { status: 'disabled' }
  | { status: 'invalid'; message: string }
  | { status: 'configured' };

/** Public values only. Do not add privileged server credentials to this module. */
export function getSupabasePublicConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '',
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
  };
}

/** Local validation only: does not contact Supabase or return credentials. */
export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const { url, publishableKey } = getSupabasePublicConfig();
  if (!url && !publishableKey) return { status: 'disabled' };
  if (!url || !publishableKey) return { status: 'invalid', message: 'Set both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.' };
  try {
    const parsed = new URL(url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))
      || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Invalid URL');
  } catch {
    return { status: 'invalid', message: 'NEXT_PUBLIC_SUPABASE_URL must be an HTTPS project URL (HTTP is allowed for local development).' };
  }
  if (!publishableKey.startsWith('sb_publishable_') || publishableKey.length <= 'sb_publishable_'.length) {
    return { status: 'invalid', message: 'Use a Supabase publishable key (sb_publishable_...) for NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.' };
  }
  return { status: 'configured' };
}
