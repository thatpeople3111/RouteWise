import type { SupabaseClient } from '@supabase/supabase-js';
import { withDeadline } from './requestDeadline';

export function emailAuthErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AuthRetryableFetchError') return 'Account service is temporarily unavailable. Try again or continue as a guest.';
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'invalid_credentials': return 'Email or password is incorrect.';
    case 'email_not_confirmed': return 'Confirm your email before signing in. Check your inbox and spam folder.';
    case 'user_already_exists': case 'email_exists': return 'An account may already exist for this email. Try signing in.';
    case 'weak_password': return 'Choose a stronger password that meets the project password requirements.';
    case 'validation_failed': case 'email_address_invalid': return 'Check your email address and password.';
    case 'over_request_rate_limit': case 'over_email_send_rate_limit': return 'Too many attempts. Please wait before trying again.';
    case 'signup_disabled': case 'email_provider_disabled': return 'Email accounts are not enabled right now. Continue as a guest.';
    case 'otp_expired': return 'This confirmation link has expired or was already used. Try signing in or creating the account again.';
    default: return 'Authentication could not be completed. Try again or continue as a guest.';
  }
}

export async function createEmailAccount(client: SupabaseClient, email: string, password: string, origin: string) {
  const { data, error } = await withDeadline(client.auth.signUp({ email: email.trim(), password,
    options: { emailRedirectTo: new URL('/auth/callback', origin).href } }));
  if (error) throw error;
  if (!data.user) throw new Error('Signup did not return a user');
  return { status: data.session ? 'signed-in' : 'confirmation-required' } as const;
}

export async function signInWithEmail(client: SupabaseClient, email: string, password: string): Promise<void> {
  const { data, error } = await withDeadline(client.auth.signInWithPassword({ email: email.trim(), password }));
  if (error) throw error;
  if (!data.session?.user) throw new Error('No session was created');
}

export async function signOut(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

/** Direct email token links work across browsers; PKCE email codes use the existing callback. */
export async function confirmEmail(client: SupabaseClient, params: URLSearchParams): Promise<void> {
  const token = params.get('token_hash'), type = params.get('type');
  if (!token || !['email', 'signup'].includes(type ?? '') || params.has('error')) throw new Error('Invalid confirmation');
  const { data, error } = await client.auth.verifyOtp({ token_hash: token, type: type as 'email' | 'signup' });
  if (error) throw error;
  if (!data.session?.user) throw new Error('No confirmed session');
  const { data: stored, error: sessionError } = await client.auth.getSession();
  if (sessionError || stored.session?.user.id !== data.session.user.id) throw new Error('Session was not saved');
}
