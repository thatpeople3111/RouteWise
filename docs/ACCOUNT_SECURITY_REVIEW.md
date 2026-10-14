# RouteWise account security review

Scope: frontend accounts, Supabase preferences, local environment handling, and emitted browser assets. No protected demo backend edits or hosted project changes.

## Findings and hardening

- Only the project URL and `sb_publishable_` key are accepted by the browser Supabase configuration. Secret/service-role keys are rejected; Next config does not inline server secrets. Validation cannot undo exposure if a privileged key is mistakenly assigned to a `NEXT_PUBLIC_` variable, because Next inlines its value before runtime validation. Never assign such keys there.
- `.env*` files are ignored except the tracked `.env.example`. Its credential values are empty; boolean/provider environment defaults are not secrets. `.env.local` has no Supabase credentials. No account-related token/password logging was found.
- Preferences use verified `auth.getUser()` identity, strict Zod values, explicit columns, ownership checks on returned rows, and cancellation across account changes. UI IDs are not authorization. RLS independently binds SELECT, INSERT, and UPDATE to `auth.uid()`. Guests have no grants; an authenticated role with no user claim also cannot access rows. Ownership/timestamps cannot be updated and there is no DELETE grant. Existing SQL requires no changes.
- Sessions use Supabase's persisted browser storage, refresh, events, and PKCE implementation. No custom token storage or cryptography. Logout uses local scope and hides preference data immediately when identity changes; failed logout does not pretend success. Other devices remain signed in by design.
- OAuth callback clears sensitive URL parameters and returns to a fixed `/`, with no user-controlled return URL. PKCE verifier/flow ID handling is delegated to Supabase. Added callback `Referrer-Policy: no-referrer` so pre-hydration requests cannot send callback URLs as referrers.
- Names/emails are rendered as React text; avatar URLs are not rendered or fetched. Tests include HTML/script-like metadata. Trip requests contain only travel fields and constraints, with no account ID/email/session/auth header.

## Settings and remaining limits

Verify the intended hosted project has the checked-in preference migration applied, RLS enabled, the three owner-only policies, and the documented column grants. Local SQL tests do not prove hosted configuration. Avoid adding permissive policies or views that bypass ownership.

Verify Site URL and exact redirect allowlist entries: `http://localhost:3000/auth/callback` for local development and `https://YOUR_APP_HOST/auth/callback` for production. Avoid production wildcard redirects. Google Cloud's authorized redirect is `https://YOUR_PROJECT.supabase.co/auth/v1/callback`; keep its client secret only in the Supabase dashboard.

Verify email confirmation, password rules, rate limits, and any CAPTCHA settings appropriate for your deployment. The existing optional `token_hash` confirmation template is a bearer-link flow, not a browser-bound PKCE flow. Forwarding such links can sign the recipient into the link owner's account (login CSRF/account confusion); prefer the default same-browser PKCE confirmation template if cross-browser confirmation is not required. This review preserves that existing feature.

Browser-persisted tokens remain readable to same-origin JavaScript. XSS or malicious dependencies can compromise them; escaping account metadata alone is not a site-wide XSS guarantee. No broad CSP refactor was made because maps and existing trip behavior need separate compatibility testing. Logout revokes the session's refresh token, but an already-issued access JWT can remain usable until expiry. Review Supabase JWT expiry; do not treat local UI sign-out as immediate JWT invalidation.

Callback URLs may still be present in hosting/access logs before hydration. Configure log redaction for `code`, `token_hash`, and auth headers at the host. Keep privileged keys server-only; if one was previously exposed in a public variable, rotate it and rebuild/remove old assets. No local Supabase environment cleanup is currently required. Restrict the existing public Google Maps browser key by allowed website referrers and API restrictions.

References: [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [logout semantics](https://supabase.com/docs/guides/auth/signout).

## Validation and dependency findings

Typecheck, lint, production build, Node security/regression tests, and actual embedded-PostgreSQL RLS tests passed. Built callback headers contain the new policy. Browser assets had no `sb_secret_` credential or service-role variable matches; no Supabase key is configured in this local build, so verify deployed environment/build assets separately.

`npm audit --omit=dev` reports three high-severity dependency entries: Next.js 16.3.6, sharp, and source-map-js. No Supabase advisory was reported. These framework/tooling dependencies were not upgraded during this focused account review. Schedule a separate dependency patch and compatibility check; applicability differs by deployment/features (development MCP exposure, caching, image processing, source-map parsing). Consult the audit details before deployment. Advisories include [Next.js cache poisoning](https://github.com/advisories/GHSA-4jqv-mc3x-m676), [sharp/librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), and [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
