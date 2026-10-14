# Navigation handoff security review

## Findings and focused fixes

The central validator previously accepted any HTTPS host. Legacy booking URLs could therefore direct users to unrelated sites, including provider-domain spoofing. It now enforces exact provider hosts, documented/current handoff paths, allowed query fields, intended-provider matching, and no embedded credentials, alternate ports, fragments, raw controls or backslashes. Redirect/auth/secret query fields and arbitrary schemes fail validation.

Location metadata was statically typed as text but not runtime-checked. A malformed object in a label/address/Place ID could be serialized, including unintended nested fields. The shared point adapter now rejects non-text metadata and handles absent/non-object locations with a controlled error. Nested Uber location objects and legacy numeric coordinate query fields are also validated before opening.

No automatic exposure of Google keys, Supabase service-role secrets, Gemini credentials or server tokens was found in navigation builders. Builders do not read environment credentials and whitelist location fields. Sentinel tests prove unrelated credential fields are discarded; environment files were not printed or incorporated into URLs. User-entered text is treated as location text, not a credential source.

## Trusted policy

HTTPS only: `www.google.com` (Maps directions path), `maps.apple.com` (compatibility/directions paths), `m.uber.com` (web/looking/current legacy universal paths), `ride.lyft.com` (ride query), `waymo.com` and `www.waymo.com` (current landing/download paths), and the exact published `waymo.smart.link/2wt03oz01` path. No wildcard subdomains or user-defined redirects. New provider capabilities require an explicit adapter/policy update; unrecognized supplied links fall back to the provider's fixed landing URL.

URLSearchParams encodes query text, separators and JSON once. Safe Place/business names cannot create top-level URL parameters. Coordinates must be finite numeric latitude/longitude in range; no re-geocoding is performed. Labels are rendered by React text interpolation, with no raw HTML in the handoff components. Provider-generated fixed destinations and validated anchors/open calls do not implement a user-controlled open redirect.

External opens remain synchronous from user actions, with `noopener,noreferrer`; direct fallback anchors use the same validation. Unknown/desktop fallbacks are fixed trusted URLs. Malformed navigation input shows an in-app error; malformed rideshare input uses a fixed ordinary provider landing without prefill. Unavailable providers remain non-actionable. Original itinerary and Safe Place state are not discarded by failed opens.

## Scope and limits

Focused on the navigation/provider handoff layer, not a whole-app/account audit or provider website audit. Trusted providers control subsequent app/store/HTTP redirects; local validation does not inspect remote redirects or promise app installation. No custom cryptography was introduced. Protected demo backend files and service-area/pricing logic were not changed.

Regression tests cover scheme/host/path/query injection, provider mismatch, secret fields, nested metadata, invalid coordinates, URL-encoded special characters and fallback behavior. Physical-device popup/app-association behavior remains subject to the mobile test plan.
