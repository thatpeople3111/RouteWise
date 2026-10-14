'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { completeOAuthSignIn } from '@/lib/supabase/googleAuth';
import { confirmEmail } from '@/lib/supabase/emailAuth';
import { withDeadline } from '@/lib/supabase/requestDeadline';

export default function AuthCallback() {
  const [failed, setFailed] = useState(false);
  const completion = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let active = true;
    // Capture once, then remove codes/error details from the URL immediately.
    if (!completion.current) {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (hash.has('error') || hash.has('error_code')) params.set('error', 'oauth_error');
      window.history.replaceState(null, '', '/auth/callback');
      const client = getSupabaseBrowserClient();
      completion.current = withDeadline(Promise.resolve().then(() => {
        if (!client) throw new Error('Account sign-in is not configured.');
        return params.has('token_hash') ? confirmEmail(client, params) : completeOAuthSignIn(client, params);
      }));
    }
    void completion.current.then(() => { if (active) window.location.replace('/'); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return <main className="auth-callback">
    <h1>{failed ? 'Sign-in unsuccessful' : 'Completing sign-in...'}</h1>
    <p role={failed ? 'alert' : 'status'}>{failed ? 'Sign-in or email confirmation could not be completed. The link may have expired. Try signing in again or continue as a guest.' : 'Confirming your session before returning to RouteWise.'}</p>
    <Link href="/">Continue as Guest</Link>
  </main>;
}
