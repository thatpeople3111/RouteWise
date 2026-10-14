# Sign in with Apple

Apple uses the existing Supabase browser client, PKCE callback at `/auth/callback`,
session provider and user-ID preference repository. Apple UI is temporarily hidden
by `AUTH_FEATURES.apple: false` in `src/lib/authFeatures.ts`. After Apple Developer
and Supabase provider setup/testing, change only `apple` to `true` to restore the
existing button. Google/email and Continue as Guest remain available. This UI flag
does not disable Apple OAuth helpers, callback compatibility or existing identities. Local loading, safe
errors, deadlines, double-submission guards and dismissal cancellation are reused.
Success verifies the stored session then returns to `/`. No schema, dependencies,
Apple SDK, custom crypto or Apple-specific profile UI were added.

## Manual setup

In Apple Developer Certificates, Identifiers & Profiles:

1. Use an Apple Developer membership. Register/select a primary App ID and enable
   Sign in with Apple. Associate the web configuration with that primary App ID.
2. Create a Services ID (for example `com.yourcompany.routewise.web`), enable Sign in
   with Apple and configure it for the primary App ID.
3. Website domain: `YOUR_PROJECT.supabase.co` (or your actual Supabase Auth custom
   domain). Return URL: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`.
   Copy the callback shown by your Supabase project. Apple returns to Supabase,
   not directly to RouteWise; do not enter a localhost Apple return URL.
4. Create a Sign in with Apple signing key associated with the primary App ID.
   Record Team ID and Key ID and securely download the `.p8` key. Use the client
   secret generator in the official Supabase Apple guide to generate the OAuth
   secret from these values and the Services ID. Do not commit/upload the private
   key to RouteWise or place it in Vercel/browser variables. Store it outside the
   repository; `.p8` files are also ignored as an accidental-commit safeguard. Renew the generated
   secret before its expiry (maximum six months) and update Supabase.
5. If sending mail to Apple relay addresses, register your sending domain/address
   and envelope sender with Apple's private email relay service and configure
   SPF/DKIM for your actual SMTP provider. Test delivery and bounce handling.

In Supabase Authentication:

1. Enable Apple. Set Client IDs to the web Services ID, first if multiple IDs are
   configured. Enter the generated OAuth secret and save.
2. Set Site URL to your RouteWise HTTPS origin. Allow exact
   `https://YOUR_APP_HOST/auth/callback`, plus `http://localhost:3000/auth/callback`
   if testing locally against hosted Supabase. Configure explicit preview URLs
   separately. These are Supabase-to-RouteWise redirects, distinct from Apple's
   return URL above. No new RouteWise callback route is required.
3. Retain the existing preferences migration and RLS. Preferences belong to the
   Supabase user UUID, not the email/provider. A newly created Apple user has no
   saved row until explicitly saved. A relay address can create a separate user
   from an existing real-email account; RouteWise does not merge users by names
   or guessed email matches.

Environment: no new variables. Keep the existing browser-safe
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Apple client
secrets belong only in Supabase's provider settings. Rebuild if existing public
environment values change.

## Name and email handling

Apple may share names only on initial authorization. Supabase's chosen web OAuth
flow does not expose that name to RouteWise. Existing name metadata is displayed
if present and never overwritten; otherwise the UI uses the stored email or
“RouteWise member”. A name is never required for login or preferences. Private
relay email is accepted as returned; no request for a real email or email-based
authorization was introduced. Logout uses the existing local-session sign-out.

## Validation

Automated tests exercise Apple initiation, production redirect, shared PKCE
exchange/session verification, restore events, missing-name/relay identity,
preference ownership/load, logout, safe failure, duplicate-click protection and
guest dismissal. Google/email/guest regression tests run with the same suite.
Live Apple consent cannot be certified until the portal/provider configuration
and a test Apple account are available. After setup, test Share My Email and Hide
My Email, first/repeat login, cancellation, refresh, preferences, and sign-out.

Sources: [Supabase Apple OAuth](https://supabase.com/docs/guides/auth/social-login/auth-apple),
[Apple web setup](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/),
[Apple email relay](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service/).
