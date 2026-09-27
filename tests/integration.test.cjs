/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner compiles TypeScript through a local CommonJS hook. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const api = require('../src/lib/api.ts');
const { tripRequestSchema } = require('../src/lib/validation.ts');
const trip = tripRequestSchema.parse({ origin: { address: 'Synthetic origin' }, destination: { address: 'Synthetic destination' }, allowWalking: false, maxWalkingMinutes: 0 });
const preference = { skip: false, category: 'coffee', timing: 'DESTINATION', maxExtraMinutes: 10, maxExtraBudget: 5 };
const candidate = { placeId: 'synthetic-place', name: 'Synthetic cafe', category: 'coffee', address: null, coordinates: null,
  rating: null, priceLevel: null, businessStatus: null, openNow: null, mapsUri: null, extraStopMinutes: null,
  comparisonMode: null, routeWalkingMinutes: null, budgetStatus: 'unknown' };
const fixture = { id: 'synthetic-trip', generatedAt: new Date().toISOString(), dataMode: 'live', recommendationSource: 'rules', warnings: [],
  rankings: { best: 'drive-1', fastest: 'drive-1', cheapest: null }, routeOptions: [{ id: 'drive-1', mode: 'DRIVE', durationMinutes: 30, distanceMeters: 1000,
    walkingMinutes: 0, estimatedTransportationCost: null, extraStopMinutes: 7, steps: [], warnings: ['Unknown fare'],
    constraints: { budget: 'unknown', walking: 'met', extraTime: 'met', extraBudget: 'unknown', eligible: true } }] };

test('form preserves walking choice and rejects conflicting schedule timestamps', () => {
  assert.equal(trip.allowWalking, false);
  assert.equal(tripRequestSchema.safeParse({ ...trip, arrivalTime: '2026-09-26T12:00:00Z', departureTime: '2026-09-26T11:00:00Z' }).success, false);
});
test('suggestion request maps timing to searchArea without UI-only fields', () => {
  const request = api.buildSuggestRequest(trip, preference);
  assert.equal(request.searchArea, 'DESTINATION'); assert.equal(request.maxExtraMinutes, 10);
  assert.equal(request.maxExtraBudget, 5); assert.equal(request.allowWalking, false);
  assert.equal('timing' in request, false); assert.equal('skip' in request, false);
});
test('initial trip submission uses a supported category and explicit on-route search', () => {
  const preference = api.buildInitialSuggestPreference(trip);
  assert.deepEqual(preference, { skip: false, category: 'food', timing: 'ON_ROUTE' });
  const request = api.buildSuggestRequest(trip, preference);
  assert.deepEqual(request.origin, trip.origin);
  assert.deepEqual(request.destination, trip.destination);
  assert.equal(request.searchArea, 'ON_ROUTE');
  assert.equal(request.category, 'food');
});
test('selection retains the real candidate and unknown rating, cost and detour', () => {
  const stop = api.toSuggestedStop(candidate, preference.timing);
  assert.equal(stop.rating, null); assert.equal(stop.estimatedExtraMinutes, null); assert.equal(stop.estimatedCost, undefined);
  assert.deepEqual(api.buildPlanRequest(trip, preference, stop).selectedStop, candidate);
  assert.equal(api.buildPlanRequest(trip, preference, stop).maxExtraBudget, 5);
});
test('skip clears stop and stop-specific limits and rejects a demo selection', () => {
  assert.deepEqual(api.buildPlanRequest(trip, preference, null), { ...trip, skip: true });
  assert.throws(() => api.buildPlanRequest(trip, preference, { id: 'demo' }), /live stop/);
});
test('response adapter preserves detour-inclusive duration and unknown fare', () => {
  const result = api.toTripPlan(fixture, true);
  assert.equal(result.routes[0].durationMinutes, 30); assert.equal(result.routes[0].includesStop, true);
  assert.equal(result.routes[0].extraStopMinutes, 7); assert.equal(result.routes[0].cost.amount, null);
  assert.equal(result.cheapest, null); assert.match(result.recommendation.reason, /available route times/);
  assert.doesNotMatch(result.recommendation.reason, /Gemini|AI ranking/i);
  assert.ok(result.warnings.includes('Unknown fare'));
});
test('response adapter rejects invalid ranking IDs and old response shape', () => {
  assert.throws(() => api.toTripPlan({ ...fixture, rankings: { ...fixture.rankings, best: 'invented' } }));
  assert.throws(() => api.toTripPlan({ routes: [], best: null }));
});
test('response adapter preserves only a backend-supplied route polyline', () => {
  const route = fixture.routeOptions[0];
  const withGeometry = api.toTripPlan({
    ...fixture,
    routeOptions: [{ ...route, encodedPolyline: '_p~iF~ps|U_ulLnnqC' }],
    rankings: { best: route.id, fastest: route.id, cheapest: null },
  });
  assert.equal(withGeometry.routes[0].encodedPolyline, '_p~iF~ps|U_ulLnnqC');
  assert.equal(api.toTripPlan(fixture).routes[0].encodedPolyline, null);
});
test('client supports string and structured errors, malformed JSON, stale servers and offline recovery', async () => {
  const original = global.fetch;
  try {
    for (const error of ['Bad trip', { message: 'Provider unavailable' }]) {
      global.fetch = async () => new Response(JSON.stringify({ error }), { status: 400 });
      await assert.rejects(api.planTrip(trip, null, null), typeof error === 'string' ? /Bad trip/ : /Provider unavailable/);
    }
    global.fetch = async () => new Response('<html>oops</html>');
    await assert.rejects(api.planTrip(trip, null, null), /unreadable/);
    global.fetch = async () => new Response(JSON.stringify({ routes: [] }));
    await assert.rejects(api.planTrip(trip, null, null), /latest backend/);
    global.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(api.planTrip(trip, null, null), /could not be reached/);
  } finally { global.fetch = original; }
});
test('client reads live candidates rather than the empty legacy stops array', async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, '/api/suggest-stops');
      const request = JSON.parse(options.body);
      assert.equal(request.searchArea, 'DESTINATION');
      assert.deepEqual(request.origin, trip.origin);
      assert.deepEqual(request.destination, trip.destination);
      return new Response(JSON.stringify({
        dataMode: 'live',
        availableCategories: ['food', 'coffee', 'gas', 'groceries', 'dessert', 'pharmacy'],
        recommendedCategories: ['coffee', 'food', 'gas', 'pharmacy', 'groceries', 'dessert'],
        timeOfDay: 'MORNING',
        stops: [],
        candidates: [candidate],
        warnings: [],
      }));
    };
    const result = await api.suggestStops(trip, preference);
    assert.equal(result.stops.length, 1); assert.equal(result.stops[0].id, candidate.placeId);
    assert.equal(result.timeOfDay, 'MORNING');
    assert.equal(result.recommendedCategories[0], 'coffee');
  } finally { global.fetch = original; }
});

