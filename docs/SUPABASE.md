Supabase Google authentication is optional. Guest planning and the RouteWise backend
do not depend on a session. A temporary Google sign-in control appears only on Home.

Set these browser-safe values in ignored root .env.local:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Restart development after changes; set these values before production builds too.
Missing/invalid settings disable sign-in without disabling planning. No privileged
key or Google client secret belongs in frontend environment variables or source code.

Google Cloud configuration:

1. In Google Auth Platform configure Branding, Audience and Data Access. For an
   External app in Testing, add your Google account to Test users. Use only openid,
   https://www.googleapis.com/auth/userinfo.email and
   https://www.googleapis.com/auth/userinfo.profile scopes.
2. Create an OAuth client with type Web application.
3. Authorized JavaScript origins: http://localhost:3000 and your actual production
   origin, e.g. https://YOUR_ROUTEWISE_DOMAIN. Use the actual local port if different.
4. Authorized redirect URI: https://YOUR_PROJECT.supabase.co/auth/v1/callback.
   Copy the exact callback from Supabase's Google provider settings if using a custom
   domain. Google's redirect goes to Supabase, not to RouteWise.
5. Save the OAuth client ID and client secret for the next step.

Supabase Dashboard configuration:

1. Authentication > Sign In / Providers > Google: enable Google, enter the OAuth
   client ID and secret, and save. Keep default nonce checks enabled.
2. Authentication > URL Configuration: Site URL = your RouteWise origin (use
   http://localhost:3000 in development; production origin when deployed).
3. Add exact Redirect URLs: http://localhost:3000/auth/callback and
   https://YOUR_ROUTEWISE_DOMAIN/auth/callback. Register other local ports/preview
   origins individually as needed. Avoid broad production redirect wildcards.

Flow: Home calls signInWithOAuth with Google. The existing browser client uses PKCE,
localStorage persistence and token refresh. /auth/callback explicitly exchanges the
code and optional sb_flow_id, confirms a session can be read back, and replaces the
URL with /. Home reads the saved session and shows a minimal signed-in confirmation.
Callback parameters are cleared immediately. One promise prevents React Strict Mode
from consuming a code twice. Automatic URL session detection is disabled to avoid
competing with the explicit exchange. No arbitrary next URL is accepted.

Cancellation, absent/expired codes, disabled providers, or failed exchanges show a
generic error with a Continue as Guest link. Guest routes remain ungated.

Limitations: browser-session auth only; no server/cookie authentication. The backend
receives no auth token. Complete OAuth in the same browser/profile and origin where
it began so the PKCE verifier is available. Sign-in starts only on Home and returns
there; planner state is not persisted across full OAuth navigation. No final profile UI, Apple, saved preferences or database migrations are included.
Browser storage must be available. Live Google verification requires manual setup.

Manual verification: click Sign in with Google, approve consent, confirm Home shows
Signed in to RouteWise, reload to confirm persistence, and check Authentication >
Users in Supabase. Cancel consent and confirm Continue as Guest still opens planning.
Automated tests mock the OAuth exchange; they do not perform a live Google login.

References:
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession

Email/password accounts (optional):

- Home now includes a small expandable email form and a sign-out control for an
  authenticated browser session. Google and Continue as Guest remain available.
- createEmailAccount uses Supabase signUp. A returned session means confirmation is
  disabled and the user is signed in immediately. A null session shows neutral
  check-email/sign-in guidance, including when Supabase masks an existing account.
- signInWithEmail uses signInWithPassword; signOut uses local scope (this browser).
- Passwords are not copied to React state, logs, browser storage, trip requests or
  the RouteWise backend. The password input is cleared on submission. Only Supabase
  receives the password; Supabase owns hashing and password validation.

Manual email configuration:

1. In Supabase Authentication > Sign In / Providers > Email, enable Email and
   Allow new users to sign up. Set Confirm email according to your requirements.
   RouteWise handles either setting; confirmation is recommended for real users.
2. Configure minimum password length and complexity in Supabase's password settings.
   RouteWise displays a safe weak-password message; it does not duplicate hashing or
   override your project's password policy.
3. Keep the existing Site URL and allowlisted /auth/callback URLs (localhost and
   production) from the Google configuration above.
4. For confirmation-enabled signup, configure SMTP/email delivery. Supabase's default
   sender may restrict recipients to authorized project-team addresses and has low
   rate limits; configure custom SMTP for normal external-user signup.
5. The default Confirm signup template using {{ .ConfirmationURL }} supports PKCE
   confirmation in the same browser/profile and origin that initiated signup.
   The existing callback accepts the resulting code.
6. To support email confirmation in another browser/device, set Confirm signup's link
   to this template (RedirectTo is supplied by RouteWise as the allowlisted callback):

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirm email</a>
```

The callback accepts only email/signup token types, calls verifyOtp and confirms a
saved session before returning Home. Expired/used links show a guest-return option.
The token/code is cleared from the visible URL immediately. No new environment
variables, privileged credentials, database migrations or preferences are needed.

Supabase can deliberately return an obfuscated signup response for an already-used
email. RouteWise does not query account existence or claim a new account was created
in that case. Explicit duplicate errors suggest signing in; invalid credentials,
unconfirmed email, weak passwords and rate limits have concise safe messages.

Existing browser-auth limitations still apply. There is no password reset UI in this
stage, and no Apple or saved travel preferences. Live email delivery and Google
consent require project configuration and have not been exercised by automated tests.
The signed-in status is now provider-neutral: Signed in to RouteWise.

Email references:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/debugging/error-codes

Application auth state:

AuthProvider wraps the root layout and useAuth() exposes user, session,
isAuthenticated, isAuthLoading, authError and signOut. GoogleSignIn and EmailAuth
consume this shared state instead of subscribing or reading sessions themselves.
The callback services retain their explicit one-time session checks after exchange.

The provider always renders children. Guests can enter Trip Details and Stranded
Mode immediately while session restoration occurs in the background. Only auth
submission controls wait for the initial state; there is no planner loading gate.
Missing config settles as a guest. Restoration errors and a 10-second restoration
timeout settle as a guest with a safe authError; later auth events can recover.

The existing singleton Supabase SDK keeps persistSession and autoRefreshToken
enabled. The SDK owns localStorage persistence/refresh and cross-tab events; no
second token store or password storage is added. Reloads restore Google and email
sessions through one provider session read. Event listeners update sign-in, sign-out,
refreshed tokens and user/session changes. Stale reads cannot overwrite newer events.
Expired unrefreshed sessions clear UI identity. Cleanup cancels timers/subscriptions.

useAuth().signOut() uses the existing local-scope Supabase signout service. On success,
the SDK clears this browser's saved session and the provider clears its state. Failed
signout rejects to the caller rather than falsely claiming success. Trip state and
routing are unchanged. These browser values are for frontend state, not server-side
identity verification or authorization. No preferences storage is included.

Tests cover fresh guests, Google/email restoration, token/user events, signout races,
expiry and service failures with mocked SDK responses. Live visits still require
configured providers and browser storage. No new Supabase settings are required.

Account interface:

The shared header now has an Account dropdown on every normal planner screen,
including while Stranded Mode is shown. It replaces the temporary Home-only auth
controls. Guests can choose Google, email sign-in, Create account, or Continue as
Guest. On Home, Continue as Guest opens Trip Details; during a trip it simply closes
the dropdown and preserves the current screen/state. Outside clicks and Escape
close the dropdown; Escape returns focus to the Account trigger.

Signed-in users see their source-provided name/email (or a member fallback) and an
initials avatar, a basic Profile section and Sign out. Raw IDs, tokens and unrelated
metadata are not displayed. There is no saved-preferences UI or persistence.

The dropdown uses existing dark backgrounds, blue accents, rounded corners and
focus styles. Width is bounded to the viewport, long identity text wraps, and the
panel scrolls on short screens. Guest controls stay usable during auth initialization.
No new credentials or provider settings are needed beyond the setup above. Google
OAuth still returns to Home after full navigation; active planner state is not saved
across OAuth redirects. Email sign-in/signout do not change the active planner screen.

Preferences data layer:

PreferencesProvider wraps app children inside AuthProvider. usePreferences() exposes
preferences (null when not configured), isPreferencesLoading, isPreferencesSaving,
preferencesError and savePreferences. Nothing reads these values into the trip form
or ranking pipeline yet, and no preferences UI is added.

The repository owns all user_preferences requests and obtains the owner through
Supabase auth.getUser. No UI-supplied user ID is accepted. RLS remains authoritative.
A load returns null for a missing row and never creates defaults. A save updates
preference columns only, or inserts the first row using verified ownership. A
concurrent insert collision retries the update once. Returned database values refresh
shared state, including database-generated timestamps and numeric rounding.

On update, optional undefined/omitted fields preserve stored limits; explicit null
clears them. On first insert, undefined becomes SQL NULL. Zero is a valid limit.
Mode and priority are required; input validation rejects unknown ownership fields,
invalid enums, non-finite/negative limits and fractional walking minutes.

Preferences load once per signed-in user lifecycle. Token refreshes and unrelated
renders do not poll/reload. Saves refresh state from the database response. Signing
out hides preference data immediately, aborts the prior lifecycle's requests and
ignores stale results. Guests perform no table requests and cannot save. No tokens,
passwords or service-role keys are stored by this layer.

Apply the migration in supabase/migrations before using the data layer. Missing
schema, RLS/privilege denial, network and malformed-response failures surface a safe
preferencesError without gating planning. Failed saves retain previously loaded
preferences and reject to the caller. No new provider settings, environment variables
or migrations are needed in this stage. Tests mock Supabase requests; live project
integration remains unverified.

Saved trip defaults:

TripPreferenceDefaults waits for resolved auth/preferences and applies saved values
once per new draft. A synchronous ref tracks edits to mode, priority, walking and
budget independently. Late defaults fill only untouched fields; entering locations
or a schedule does not prevent saved preferences from arriving in the background.
Explicitly disabling walking protects its limit, and clearing the mode remains a
trip-specific "No preference" override.
Submitting locks defaults too; results, pending requests and Stranded trips are not
modified. Start over resets the guard for a new trip. Editing an existing trip keeps
its current overrides. No row means normal defaults; guests follow the same flow.

Saved walking and budget values prefill the existing fields when non-null. Zero is
preserved. Values exceeding the existing form limits are capped to 180 minutes/$1000,
with a note; saved account values are not changed. Preferred transportation and route
priority are editable selects. BEST maps to balanced, FASTEST to fastest and CHEAPEST
to cheapest in the existing request preference field. No new backend fields are sent.

The selected mode is highlighted on normal local results (including rideshare), not
used to disable alternatives or override backend BEST rankings. Car access is still
explicitly confirmed rather than inferred from a Driving preference. Existing
walking/transit/rideshare/car controls, optional stops, pricing and maps remain.
The constraints step stays available for review; prefilled values do not require
re-entry. Trip overrides never call savePreferences or write to Supabase. Explicit
account-preference editing/saving UI is a later stage.

Preferred-mode presentation bias:

Backend routing/ranking remains authoritative. On normal local Results, the factual
Best match stays first with its original BEST/FASTEST/CHEAPEST IDs and badges. A valid
preferred local route is moved to the front of the remaining alternatives only when
its duration is no more than the Best match duration plus max(5 minutes, 20%). When
both the reference and candidate are local routes, promotion also requires complete,
same-currency prices no more than reference price plus max(5 currency units, 20%).
Unknown local costs cannot justify promotion. No comparison baseline means valid
preferred routes may be first among alternatives; no backend ranking is rewritten.

Availability=false, ineligible routes, exceeded budget/walking limits or missed
arrival constraints prevent promotion. Such routes retain the existing hidden or
non-recommended-section behavior. Clearly slower/costlier preferred routes remain
accessible in the ordinary alternatives. Preferred mode is soft; saved walking and
budget limits remain hard request inputs, and route priority continues using the
existing backend optimization field.

For a rideshare preference, the rideshare section moves directly after Best match
only if an available provider is already identified by backend BEST/FASTEST and
satisfies the same duration comparison. Provider ordering, availability, prices and
Waymo logic are unchanged. Otherwise the section stays in its original position.
Guest/no-mode order is unchanged. Stranded safety ordering and long-distance journey
lists remain unchanged. The earlier trip mode selection remains editable/preselected;
this stage adds no new preference questions or saves.

Guest compatibility audit:

No travel API, trip form, constraints, optional-stop, map, local/long-distance ranking
or Stranded component requires a Supabase session. Auth/preferences providers always
render children; guest preference state does not query or write the user_preferences
table. Account controls are collapsed by default and never automatically reopen.
Continue as Guest enters Trip Details from Home or closes the menu without changing
an active trip. Refresh returns to the normal guest Home using the existing in-memory
trip-state behavior; no account prompt or login requirement is introduced.

Fixed guest regression: a delayed Google OAuth URL response could redirect after the
user chose Continue as Guest or closed the account dropdown. OAuth attempts now have
cancellation generations, and closing the dropdown resets/unmounts its auth controls.
A late response cannot interrupt guest planning. Google sign-in still redirects when
the user keeps the requested auth action active.

Tests cover guest current-location entry with synthetic GPS coordinates, guest
Stranded destination/results flow, optional stops through results, guest preference
no-writes, auth error/startup behavior, and existing local/long-distance/rideshare
pipelines. Live browser verification uses public test locations and no account.

Live guest audit result: a public FIU-to-Miami International Airport test trip
completed from Home through location resolution, constraints, optional coffee-stop
search/addition and live ranked results without Supabase sign-in. Driving, transit,
Uber, Lyft and unavailable Waymo cards were present; Walking was revealable under
non-recommended routes due to the selected hard walking limit. Continue as Guest
from results closed the menu without losing that trip. Synthetic geolocation tests
cover current-location and Stranded guest planning without using private GPS data.
# Account operation resilience

Account/session initialization remains background work; the planner never waits for it. Account status failures offer an explicit retry in the account menu. Google, email signup/login, sign-out, and preference requests have bounded 12-second waits (initial session restoration retains its existing 10-second deadline). Buttons prevent duplicate submissions while pending; signup confirmation messages respect Supabase's email-confirmation settings and masked duplicate-account behavior.

Preference loading/saving indicators and safe error messages appear locally in the account menu. Failed loads leave preferences unset so the normal trip defaults apply. Failed saves retain the last confirmed preferences. Retry loading is explicit, with no polling or automatic write retries. Preference deadlines abort their database request and invalidate late results; account changes continue to invalidate requests.

An auth request can still complete at Supabase after a local deadline; session events reconcile the resulting state. A timed-out save may already have reached the database, so the UI recommends reloading to confirm before saving again. No request payloads, passwords, tokens, or raw service errors are logged or displayed. No additional environment variables or dashboard setup are required for this stage. Live authentication/outage testing requires a configured Supabase project; local checks use mocked services.

Account default editing: Signed-in users can now save transportation, priority, walking and budget defaults from Account > Profile. Blank limits save NULL; zero remains valid. The form uses the existing verified-owner repository and shared preference state. Loading failures block editing until defaults are reloaded, and save failures retain the last confirmed values. Saving affects future drafts only; the active trip remains unchanged. Live validation still requires the hosted project connection values and applied migration.
