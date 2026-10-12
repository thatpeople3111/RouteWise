/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { PricingService } = require('../src/server/pricing/pricingService.ts');
const { unavailableFare, fareUpperBound } = require('../src/server/pricing/types.ts');
const { extractFareWithGemini, validateExtractedFare } = require('../src/server/pricing/geminiPriceExtractor.ts');
const { fetchPublicFareSource } = require('../src/server/pricing/publicSource.ts');
const { fareSchema } = require('../src/lib/pricing.ts');
const origin = { latitude: 25.77, longitude: -80.19 }, destination = { latitude: 28.53, longitude: -81.38 };
const request = { provider: 'LYFT', origin, destination, departureTime: '2026-10-14T17:00:00Z', distanceMeters: 15000, durationMinutes: 25 };
const exact = (req, sourceType = 'LIVE_API') => ({ ...unavailableFare(req), exactPrice: 29, sourceType, confidence: 'HIGH', label: 'Live price', kind: 'EXACT', appliesToTrip: true });
const range = req => ({ ...unavailableFare(req), priceLow: 29, priceHigh: 38, sourceType: 'OFFICIAL', confidence: 'MEDIUM', label: 'Official fare', kind: 'RANGE', appliesToTrip: true });

test('exact/range sources preserve numeric USD values and preferred-source precedence', async () => {
  let officialCalls = 0;
  const service = new PricingService({ publicEnabled: false, liveAdapters: { LYFT: async req => exact(req) }, officialAdapters: { LYFT: async req => { officialCalls++; return range(req); } } });
  const fare = await service.getFare(request); assert.equal(fare.exactPrice, 29); assert.equal(fare.sourceType, 'LIVE_API'); assert.equal(officialCalls, 0); assert.equal(fareUpperBound(fare), 29); fareSchema.parse(fare);
  const official = await new PricingService({ publicEnabled: false, officialAdapters: { LYFT: async req => range(req) } }).getFare(request);
  assert.equal(official.priceLow, 29); assert.equal(official.priceHigh, 38); assert.equal(official.sourceType, 'OFFICIAL'); fareSchema.parse(official);
});
test('failed, missing, malformed adapters fall through to modeled or unavailable fares', async () => {
  const service = new PricingService({ publicEnabled: false, liveAdapters: { LYFT: async () => { throw Error('provider secret must not escape'); } }, officialAdapters: { LYFT: async req => ({ ...range(req), priceHigh: NaN }) } });
  const fare = await service.getFare(request); assert.equal(fare.sourceType, 'MODELED'); assert.ok(fare.priceHigh >= fare.priceLow); assert.equal(fare.label, 'Estimated fare'); fareSchema.parse(fare);
  const missing = await service.getFare({ ...request, provider: 'FLIGHT' }); assert.equal(missing.sourceType, 'UNAVAILABLE'); assert.equal(missing.exactPrice, undefined); assert.equal(missing.priceLow, undefined); fareSchema.parse(missing);
});
test('Gemini only accepts verbatim USD evidence and distinguishes trip fares from starting/reference prices', () => {
  const req = { ...request, provider: 'BRIGHTLINE', providerMetadata: { originName: 'Miami', destinationName: 'Orlando' } };
  const source = { url: 'https://www.gobrightline.com/', text: 'Miami to Orlando 2026-10-14 13:30 fare $59. Tickets from $39. Range $59 to $79.' };
  const data = { sourceFound: true, currency: 'USD', fareLabel: 'exact', exactPrice: 59, departureTime: '13:30', evidence: 'Miami to Orlando 2026-10-14 13:30 fare $59' };
  const fare = validateExtractedFare(data, req, source); assert.equal(fare.sourceType, 'GEMINI_GROUNDED'); assert.equal(fare.appliesToTrip, true); assert.equal(fareUpperBound(fare), 59); fareSchema.parse(fare);
  assert.equal(validateExtractedFare({ ...data, exactPrice: 60 }, req, source), null);
  assert.equal(validateExtractedFare({ ...data, evidence: 'invented $59' }, req, source), null);
  assert.equal(validateExtractedFare({ ...data, sourceFound: false }, req, source), null);
  const from = validateExtractedFare({ ...data, fareLabel: 'from', exactPrice: null, priceLow: 39, evidence: 'Tickets from $39' }, req, source);
  assert.equal(from.kind, 'FROM'); assert.equal(from.appliesToTrip, false); assert.equal(fareUpperBound(from), null);
  assert.equal(validateExtractedFare({ ...data, exactPrice: 39, evidence: 'Tickets from $39' }, req, source), null);
});
test('Gemini malformed output and upstream failures return null without leaking credentials', async () => {
  const req = { ...request, provider: 'BRIGHTLINE' }, source = { url: 'https://www.gobrightline.com/', text: 'Tickets from $39' };
  for (const text of ['not JSON', '{}', '{"sourceFound":true,"exactPrice":99}']) {
    const result = await extractFareWithGemini(req, source, { apiKey: 'test-secret', fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body); assert.match(body.contents[0].parts[0].text, /Never invent/);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
    } }); assert.equal(result, null);
  }
  assert.equal(await extractFareWithGemini(req, source, { apiKey: 'test-secret', fetchImpl: async () => { throw Error('offline'); } }), null);
});
test('public pages use trusted domains, no redirects/auth, and do not bypass challenges', async () => {
  let calls = 0;
  const fetchImpl = async (_url, init) => { calls++; assert.equal(init.redirect, 'manual'); assert.equal(init.headers.Authorization, undefined); return new Response('<p>Tickets from $39</p>', { headers: { 'content-type': 'text/html' } }); };
  const req = { ...request, provider: 'BRIGHTLINE', providerMetadata: { sourceUrl: 'https://www.gobrightline.com/' } };
  assert.equal((await fetchPublicFareSource(req, fetchImpl)).text, 'Tickets from $39');
  for (const url of ['http://www.gobrightline.com/', 'https://evil.test/', 'https://www.gobrightline.com.evil.test/', 'https://user:password@www.gobrightline.com/']) assert.equal(await fetchPublicFareSource({ ...req, providerMetadata: { sourceUrl: url } }, fetchImpl), null);
  assert.equal(calls, 1);
  assert.equal(await fetchPublicFareSource(req, async () => new Response('verify you are human CAPTCHA', { headers: { 'content-type': 'text/html' } })), null);
  assert.equal(await fetchPublicFareSource(req, async () => new Response('', { status: 302 })), null);
});
test('public advertised fares remain reference-only; full route/date Gemini evidence can win', async () => {
  const req = { ...request, provider: 'BRIGHTLINE', providerMetadata: { sourceUrl: 'https://www.gobrightline.com/', originName: 'Miami', destinationName: 'Orlando' } };
  const publicFetch = async () => new Response('Tickets from $39', { headers: { 'content-type': 'text/html' } });
  const reference = await new PricingService({ publicEnabled: true, fetchImpl: publicFetch, extract: async () => null }).getFare(req);
  assert.equal(reference.sourceType, 'PUBLIC_BOOKING_PAGE'); assert.equal(reference.kind, 'FROM'); assert.equal(fareUpperBound(reference), null); fareSchema.parse(reference);
  const sourceText = 'Miami Orlando 2026-10-14 13:30 fare $59';
  const grounded = await new PricingService({ publicEnabled: true, fetchImpl: async () => new Response(sourceText, { headers: { 'content-type': 'text/html' } }), extract: async (r, source) => validateExtractedFare({ sourceFound: true, currency: 'USD', fareLabel: 'exact', exactPrice: 59, evidence: sourceText }, r, source) }).getFare(req);
  assert.equal(grounded.sourceType, 'GEMINI_GROUNDED'); assert.equal(grounded.exactPrice, 59);
});
test('cache expires, separates requested times, coalesces duplicate calls, and does not share mutable values', async () => {
  let now = 0, calls = 0;
  const service = new PricingService({ now: () => now, ttlMs: 100, publicEnabled: false, liveAdapters: { LYFT: async req => { calls++; return exact(req); } } });
  const [first, second] = await Promise.all([service.getFare(request), service.getFare(request)]); assert.equal(calls, 1);
  first.exactPrice = 900; assert.equal(second.exactPrice, 29); assert.equal((await service.getFare(request)).exactPrice, 29);
  now = 101; await service.getFare(request); assert.equal(calls, 2);
  await service.getFare({ ...request, departureTime: '2026-10-15T17:00:00Z' }); assert.equal(calls, 3);
});

test('Gemini failure still yields a usable model, and invalid source fields are rejected', async () => {
  const service = new PricingService({ publicEnabled: true, fetchImpl: async () => new Response('No fare is published', { headers: { 'content-type': 'text/html' } }), extract: async () => { throw Error('extraction failed'); } });
  const fare = await service.getFare({ ...request, providerMetadata: { sourceUrl: 'https://www.lyft.com/' } });
  assert.equal(fare.sourceType, 'MODELED'); assert.ok(fare.priceHigh > 0);
  assert.equal(fareSchema.safeParse({ ...fare, kind: 'FROM', appliesToTrip: true }).success, false);
});
test('existing Google/official transit and parking prices gain normalized metadata without invented totals', async () => {
  const { normalizeKnownTransitFare } = require('../src/server/pricing/knownFare.ts');
  const known = normalizeKnownTransitFare(request, { amount: 2.25, currency: 'USD', source: 'agency_official', sourceName: 'Metrorail' });
  assert.equal(known.sourceType, 'OFFICIAL'); assert.equal(known.exactPrice, 2.25); assert.equal(known.appliesToTrip, false); fareSchema.parse(known);
  const live = normalizeKnownTransitFare(request, { amount: 5.5, currency: 'USD', source: 'google_routes_estimate' });
  assert.equal(live.sourceType, 'LIVE_API'); assert.equal(live.exactPrice, 5.5); assert.equal(live.appliesToTrip, true);
  const parking = await new PricingService({ publicEnabled: false }).getFare({ ...request, provider: 'PARKING', providerMetadata: { facilityName: 'Museum Garage' } });
  assert.equal(parking.sourceType, 'OFFICIAL'); assert.equal(parking.exactPrice, 10); assert.equal(parking.appliesToTrip, false);
});
