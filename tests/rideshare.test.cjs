/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner compiles TypeScript through a local CommonJS hook. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const compile = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { checkWaymoAvailability, findWaymoServiceArea } = require('../src/server/services/waymoAvailability.ts');
const { estimateRideshareFare } = require('../src/server/services/ridesharePricing.ts');
const { buildRideshareOptions, isRideshareRankable } = require('../src/server/services/rideshareOptions.ts');
const { validateGeminiRankings } = require('../src/server/services/gemini.ts');
const { createTripPlan } = require('../src/server/services/tripPlanning.ts');
const { toTripPlan } = require('../src/lib/api.ts');
const RideshareOptions = require('../src/components/RideshareOptions.tsx').default;

const SF = { latitude: 37.7749, longitude: -122.4194 };
const SAN_JOSE = { latitude: 37.3382, longitude: -121.8863 }; // outside every area
const PHOENIX = { latitude: 33.4484, longitude: -112.074 };
const DALLAS = { latitude: 32.7767, longitude: -96.797 }; // no Waymo area

const SF_NEARBY = { latitude: 37.78, longitude: -122.40 };
const factsInArea = { originCoordinates: SF, destinationCoordinates: SF_NEARBY, rideMinutes: 20, distanceMeters: 16093 };
const baseRequest = { origin: SF, destination: SF_NEARBY };

test('Waymo zone check: both points inside a supported area is available', () => {
  const result = checkWaymoAvailability(SF, PHOENIX);
  assert.equal(result.available, true);
  assert.equal(result.originSupported, true);
  assert.equal(result.destinationSupported, true);
});

test('Waymo zone check: destination outside reports the destination', () => {
  const result = checkWaymoAvailability(SF, DALLAS);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'DESTINATION_OUTSIDE');
  assert.match(result.detail, /destination is outside/i);
});

test('Waymo zone check: origin outside reports the pickup location', () => {
  const result = checkWaymoAvailability(DALLAS, SF);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'ORIGIN_OUTSIDE');
  assert.match(result.detail, /pickup location is outside/i);
});

test('Waymo zone check: both points outside reports the whole trip', () => {
  const result = checkWaymoAvailability(DALLAS, SAN_JOSE);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'TRIP_OUTSIDE');
  assert.match(result.detail, /trip is outside/i);
});

test('Waymo zone check: missing coordinates never assume availability', () => {
  for (const [origin, destination] of [[null, SF], [SF, null], [null, null]]) {
    const result = checkWaymoAvailability(origin, destination);
    assert.equal(result.available, false);
    assert.equal(result.reason, 'UNVERIFIABLE');
    assert.match(result.message, /unable to verify waymo availability/i);
  }
});

test('Waymo area lookup stays coordinate-based and finds published metros', () => {
  assert.equal(findWaymoServiceArea(SF), 'San Francisco Bay Area, CA');
  assert.equal(findWaymoServiceArea(DALLAS), null);
});

test('fare estimates are labeled ranges and never zero-dollar', () => {
  const fare = estimateRideshareFare('LYFT', 16093, 20);
  assert.equal(fare.currency, 'USD');
  assert.equal(fare.source, 'routewise_estimate');
  assert.ok(fare.low >= 1 && fare.high >= fare.low, 'range must be sane and non-zero');
});

test('fare estimate returns null without factual distance or duration', () => {
  assert.equal(estimateRideshareFare('LYFT', null, 20), null);
  assert.equal(estimateRideshareFare('LYFT', 16093, null), null);
  assert.ok(estimateRideshareFare('UBER', 16093, 20).high > 0, 'Uber now has an explicit modeled range');
});

test('Lyft option carries labeled estimates, times, and an open action', () => {
  const [lyft] = buildRideshareOptions({ ...baseRequest, rideshareProviders: ['LYFT'] }, factsInArea);
  assert.equal(lyft.provider, 'LYFT');
  assert.equal(lyft.available, true);
  assert.equal(lyft.priceSource, 'estimate');
  assert.ok(lyft.estimatedPriceLow > 0 && lyft.estimatedPriceHigh >= lyft.estimatedPriceLow);
  assert.equal(lyft.estimatedRideMinutes, 20);
  assert.equal(lyft.estimatedTotalMinutes, lyft.estimatedRideMinutes + lyft.estimatedPickupMinutes);
  assert.match(lyft.bookingUrl, /^https:\/\/ride\.lyft\.com\//);
  assert.ok(lyft.notes.some(note => /not a live lyft quote/i.test(note)));
  assert.equal(lyft.withinBudget, null);
});

test('Lyft option without route facts shows no invented price or time', () => {
  const [lyft] = buildRideshareOptions(
    { ...baseRequest, rideshareProviders: ['LYFT'] },
    { originCoordinates: SF, destinationCoordinates: null, rideMinutes: null, distanceMeters: null },
  );
  assert.equal(lyft.available, true);
  assert.equal(lyft.priceSource, 'unavailable');
  assert.equal(lyft.estimatedPriceLow, undefined);
  assert.equal(lyft.estimatedRideMinutes, undefined);
  assert.equal(lyft.estimatedTotalMinutes, undefined);
  assert.ok(lyft.notes.some(note => /unavailable for this trip/i.test(note)));
});

test('unavailable Waymo stays visible with a reason and no misleading fare', () => {
  const [waymo] = buildRideshareOptions(
    { ...baseRequest, rideshareProviders: ['WAYMO'] },
    { originCoordinates: SF, destinationCoordinates: DALLAS, rideMinutes: 30, distanceMeters: 30000 },
  );
  assert.equal(waymo.available, false);
  assert.match(waymo.unavailableReason, /waymo is unavailable for this trip/i);
  assert.match(waymo.unavailableDetail, /destination is outside/i);
  assert.equal(waymo.estimatedPriceLow, undefined);
  assert.equal(waymo.estimatedTotalMinutes, undefined);
  assert.equal(waymo.bookingUrl, undefined);
});

test('available Waymo shows an estimated fare inside the service area', () => {
  const [waymo] = buildRideshareOptions({ ...baseRequest, rideshareProviders: ['WAYMO'] }, factsInArea);
  assert.equal(waymo.available, true);
  assert.equal(waymo.priceSource, 'estimate');
  assert.ok(waymo.estimatedPriceLow > 0);
  assert.match(waymo.bookingUrl, /^https:\/\/waymo\.com\//);
  assert.ok(waymo.notes.some(note => /not a live waymo quote/i.test(note)));
});

test('rideshare budget flags over-budget estimates and blocks ranking', () => {
  const cheapFacts = { originCoordinates: SF, destinationCoordinates: PHOENIX, rideMinutes: 120, distanceMeters: 90000 };
  const [lyft] = buildRideshareOptions({ ...baseRequest, rideshareProviders: ['LYFT'], maxRideshareBudget: 5 }, cheapFacts);
  assert.equal(lyft.withinBudget, false);
  assert.ok(lyft.notes.some(note => /above your rideshare budget/i.test(note)));
  assert.equal(isRideshareRankable(lyft, 5), false);
  const [unbudgeted] = buildRideshareOptions({ ...baseRequest, rideshareProviders: ['LYFT'] }, cheapFacts);
  assert.equal(isRideshareRankable(unbudgeted, undefined), true);
});

test('provider preference limits which rideshares are built', () => {
  const options = buildRideshareOptions({ ...baseRequest, rideshareProviders: ['WAYMO'] }, factsInArea);
  assert.deepEqual(options.map(option => option.provider), ['WAYMO']);
});

test('a selected optional stop adds a direct-trip limitation note instead of a detour fare', () => {
  const stop = { placeId: 'p', name: 'Cafe', category: 'coffee', address: null, coordinates: null, rating: null, priceLevel: null, businessStatus: null, openNow: null, mapsUri: null };
  const [lyft] = buildRideshareOptions({ ...baseRequest, rideshareProviders: ['LYFT'], selectedStop: stop }, factsInArea);
  assert.ok(lyft.notes.some(note => /do not include your optional stop/i.test(note)));
});

const routeCandidate = (overrides = {}) => ({
  id: 'transit-1', travelMode: 'TRANSIT', durationSeconds: 45 * 60, distanceMeters: 12000,
  estimatedCost: { amount: 2.5, currency: 'USD', source: 'google_routes_estimate' },
  steps: [], warnings: [], ...overrides,
});
const driveCandidate = {
  id: 'drive-1', travelMode: 'DRIVE', durationSeconds: 20 * 60, distanceMeters: 16093,
  originCoordinates: SF, destinationCoordinates: SF_NEARBY, steps: [], warnings: [],
};

test('trip plan includes rideshares and a faster rideshare can win BEST and FASTEST deterministically', async () => {
  const plan = await createTripPlan({ ...baseRequest, skip: true }, {
    getRoutes: async () => [routeCandidate()],
    getRideshareRoute: async () => driveCandidate,
    rankWithGemini: async () => null,
  });
  assert.equal(plan.recommendationSource, 'rules');
  assert.deepEqual(plan.rideshares.map(option => option.provider), ['LYFT', 'WAYMO', 'UBER']);
  assert.equal(plan.rankings.fastest, 'rideshare-lyft');
  assert.equal(plan.rankings.best, 'rideshare-lyft');
  assert.equal(plan.rankings.cheapest, 'transit-1');
});

test('unavailable Waymo is never ranked and over-budget rideshares are excluded with a warning', async () => {
  const plan = await createTripPlan(
    { origin: SF, destination: SAN_JOSE, skip: true, maxRideshareBudget: 5 },
    {
      getRoutes: async () => [routeCandidate()],
      getRideshareRoute: async () => ({ ...driveCandidate, destinationCoordinates: SAN_JOSE }),
      rankWithGemini: async () => null,
    },
  );
  const waymo = plan.rideshares.find(option => option.provider === 'WAYMO');
  assert.equal(waymo.available, false);
  assert.ok(![plan.rankings.best, plan.rankings.fastest, plan.rankings.cheapest].includes('rideshare-waymo'));
  assert.equal(plan.rankings.fastest, 'transit-1');
  assert.ok(plan.warnings.some(warning => /rideshare budget/i.test(warning)));
});

test('Gemini-suggested rideshare rankings are honored by the trip plan', async () => {
  const plan = await createTripPlan({ ...baseRequest, skip: true }, {
    getRoutes: async () => [routeCandidate()],
    getRideshareRoute: async () => driveCandidate,
    rankWithGemini: async () => ({ best: 'rideshare-waymo', fastest: 'rideshare-lyft', cheapest: 'transit-1' }),
  });
  assert.equal(plan.recommendationSource, 'gemini');
  assert.equal(plan.rankings.best, 'rideshare-waymo');
  assert.equal(plan.rankings.fastest, 'rideshare-lyft');
});

test('Gemini validation accepts rideshares for best/fastest but never for cheapest', () => {
  const candidates = [{ id: 'transit-1', durationMinutes: 45, estimatedTransportationCost: { amount: 2.5, currency: 'USD' } }];
  const rideshares = [
    { id: 'rideshare-lyft', estimatedTotalMinutes: 25 },
    { id: 'rideshare-waymo', estimatedTotalMinutes: 26 },
  ];
  assert.deepEqual(
    validateGeminiRankings({ best: 'rideshare-waymo', fastest: 'rideshare-lyft', cheapest: 'transit-1' }, candidates, rideshares),
    { best: 'rideshare-waymo', fastest: 'rideshare-lyft', cheapest: 'transit-1' },
  );
  assert.equal(validateGeminiRankings({ best: 'transit-1', fastest: 'rideshare-lyft', cheapest: 'rideshare-lyft' }, candidates, rideshares), null);
  assert.equal(validateGeminiRankings({ best: 'transit-1', fastest: 'transit-1', cheapest: 'transit-1' }, candidates, rideshares), null, 'fastest must be the true minimum');
  assert.equal(validateGeminiRankings({ best: 'invented', fastest: 'rideshare-lyft', cheapest: 'transit-1' }, candidates, rideshares), null);
});

test('wire adapter keeps rideshares and ranking IDs that reference them', () => {
  const payload = {
    id: 'trip', generatedAt: new Date().toISOString(), dataMode: 'live', recommendationSource: 'gemini', warnings: [],
    rankings: { best: 'rideshare-lyft', fastest: 'rideshare-lyft', cheapest: 'transit-1' },
    routeOptions: [{
      id: 'transit-1', mode: 'TRANSIT', durationMinutes: 45, distanceMeters: 12000, walkingMinutes: 4,
      estimatedTransportationCost: { amount: 2.5, currency: 'USD', source: 'google_routes_estimate' },
      extraStopMinutes: null, steps: [], warnings: [],
      constraints: { budget: 'met', walking: 'met', extraTime: 'not_requested', extraBudget: 'not_requested', eligible: true },
    }],
    rideshares: [{
      id: 'rideshare-lyft', provider: 'LYFT', available: true, estimatedPickupMinutes: 5,
      estimatedRideMinutes: 20, estimatedTotalMinutes: 25, estimatedPriceLow: 18, estimatedPriceHigh: 24,
      priceSource: 'estimate', withinBudget: null, currency: 'USD', origin: 'A', destination: 'B',
      bookingUrl: 'https://ride.lyft.com/?id=lyft', notes: ['Estimate only'],
    }],
  };
  const plan = toTripPlan(payload);
  assert.equal(plan.best, 'rideshare-lyft');
  assert.equal(plan.rideshares[0].provider, 'LYFT');
  assert.equal(plan.rideshares[0].priceSource, 'estimate');
  assert.deepEqual(toTripPlan({ ...payload, rideshares: undefined, rankings: { best: 'transit-1', fastest: 'transit-1', cheapest: 'transit-1' } }).rideshares, []);
});

test('results rideshare section renders providers, estimates, and unavailable messaging', () => {
  const options = buildRideshareOptions(baseRequest, factsInArea);
  const outsideOptions = buildRideshareOptions(
    { origin: SF, destination: DALLAS },
    { originCoordinates: SF, destinationCoordinates: DALLAS, rideMinutes: 30, distanceMeters: 30000 },
  );
  const html = renderToStaticMarkup(React.createElement(RideshareOptions, {
    options: [...options, ...outsideOptions.filter(option => option.provider === 'WAYMO')],
    labelsById: { 'rideshare-lyft': ['FASTEST'] },
  }));
  for (const text of ['Lyft', 'Waymo', 'Uber', 'Estimated fare', 'Open Lyft', 'Open Waymo', 'FASTEST',
    'Waymo is unavailable for this trip', 'destination is outside', 'Estimated fare', 'min']) {
    assert.ok(html.includes(text), `Missing ${text}`);
  }
});

test('stranded variant keeps the unavailable Waymo tile and empty state', () => {
  const unavailable = buildRideshareOptions(
    { origin: DALLAS, destination: DALLAS },
    { originCoordinates: DALLAS, destinationCoordinates: DALLAS, rideMinutes: 30, distanceMeters: 30000 },
  );
  const html = renderToStaticMarkup(React.createElement(RideshareOptions, { options: unavailable, variant: 'stranded' }));
  assert.ok(html.includes('Rideshare Options'));
  assert.ok(html.includes('Waymo is unavailable for this trip'));
  assert.ok(html.includes('Open Lyft'));
  const empty = renderToStaticMarkup(React.createElement(RideshareOptions, { options: [], variant: 'stranded' }));
  assert.ok(empty.includes('No rideshare options could be prepared right now.'));
});

test('results variant renders nothing when no providers are enabled', () => {
  const html = renderToStaticMarkup(React.createElement(RideshareOptions, { options: [] }));
  assert.equal(html, '');
});

const MIAMI = {
  brickell: { latitude: 25.7601, longitude: -80.1958 },
  worldcenter: { latitude: 25.7820, longitude: -80.1915 },
  downtown: { latitude: 25.7743, longitude: -80.1937 },
  wynwood: { latitude: 25.8010, longitude: -80.1994 },
  designDistrict: { latitude: 25.8134, longitude: -80.1936 },
  coralGables: { latitude: 25.7494, longitude: -80.2635 },
};

test('Miami core coverage is available with fallback confidence, without route-name exceptions', () => {
  for (const [from, to] of [['brickell', 'worldcenter'], ['brickell', 'wynwood'], ['coralGables', 'brickell'], ['designDistrict', 'downtown']]) {
    const result = checkWaymoAvailability(MIAMI[from], MIAMI[to]);
    assert.equal(result.available, true, from + ' to ' + to);
    assert.equal(result.confidence, 'FALLBACK');
    const [option] = buildRideshareOptions({ origin: MIAMI[from], destination: MIAMI[to], rideshareProviders: ['WAYMO'] },
      { originCoordinates: MIAMI[from], destinationCoordinates: MIAMI[to], rideMinutes: 15, distanceMeters: 5000 });
    assert.equal(option.available, true);
    assert.ok(option.notes.some(note => /approximate service area/.test(note)));
  }
});

test('Miami fallback excludes outer county and invalid geocodes remain unverifiable', () => {
  for (const outside of [{ latitude: 25.47, longitude: -80.47 }, { latitude: 26.12, longitude: -80.14 }, { latitude: 25.7959, longitude: -80.287 }]) {
    assert.equal(checkWaymoAvailability(MIAMI.brickell, outside).reason, 'DESTINATION_OUTSIDE');
    assert.equal(checkWaymoAvailability(outside, MIAMI.brickell).reason, 'ORIGIN_OUTSIDE');
  }
  for (const invalid of [null, { latitude: NaN, longitude: -80.2 }, { latitude: 91, longitude: -80.2 }]) {
    assert.equal(checkWaymoAvailability(invalid, MIAMI.brickell).reason, 'UNVERIFIABLE');
  }
});

test('Waymo diagnostics include only coordinate/service decisions and run only in development', () => {
  const oldEnv = process.env.NODE_ENV, oldDebug = console.debug;
  const logs = [];
  console.debug = (...args) => logs.push(args);
  try {
    process.env.NODE_ENV = 'production';
    checkWaymoAvailability(MIAMI.brickell, MIAMI.worldcenter);
    assert.equal(logs.length, 0);
    process.env.NODE_ENV = 'development';
    checkWaymoAvailability(MIAMI.brickell, MIAMI.worldcenter);
    assert.equal(logs.length, 1);
    assert.equal(logs[0][1].origin.city, 'Miami');
    assert.equal(logs[0][1].origin.fallbackMatch, true);
    assert.equal(logs[0][1].available, true);
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
    console.debug = oldDebug;
  }
});

const StrandedResults = require('../src/components/StrandedResults.tsx').default;
const SafeWaitPanel = require('../src/components/SafeWaitPanel.tsx').default;

test('Stranded results contain one rideshare block, three real waiting cards, then transit and walking', () => {
  const place = id => ({ placeId: id, name: 'Wait place ' + id, category: 'pharmacy', distanceMeters: 200, walkingMinutes: 4, rating: 4, openNow: true, address: 'Main St' });
  const safePlaces = React.createElement(SafeWaitPanel, { status: 'ready', best: place('1'), alternates: [place('2'), place('3'), place('4')], busyPlaceId: null, routeError: '', onRouteHere() {}, onRetry() {} });
  const plan = { routes: [], rideshares: buildRideshareOptions(baseRequest, factsInArea), best: null, fastest: null, cheapest: null, warnings: [] };
  const html = renderToStaticMarkup(React.createElement(StrandedResults, { plan, origin: SF, destination: PHOENIX, safePlaces }));
  assert.equal((html.match(/id="rideshare-title"/g) || []).length, 1);
  assert.equal(html.includes('rideshare-options-heading'), false);
  const headings = ['rideshare-title', 'safe-wait-title', 'stranded-TRANSIT-title', 'stranded-WALK-title'].map(id => html.indexOf('id="' + id + '"'));
  assert.ok(headings.every((position, i) => position >= 0 && (i === 0 || position > headings[i - 1])));
  assert.equal((html.match(/<article class="safe-wait-card/g) || []).length, 3);
  assert.equal(html.includes('Wait place 4'), false);
});


test('Tampa is ACTIVE and actual app-resolved central Tampa endpoints use fallback coverage', () => {
  const { WAYMO_SERVICE_AREAS } = require('../src/server/services/waymoAvailability.ts');
  assert.equal(WAYMO_SERVICE_AREAS.find(area => area.city === 'Tampa').status, 'ACTIVE');
  const fixture = require('./tampa-route-coordinates.json');
  for (const route of fixture.routes) {
    const result = checkWaymoAvailability(route.originCoordinates, route.destinationCoordinates);
    assert.equal(result.available, true, route.origin + ' to ' + route.destination);
    assert.equal(result.citySupported, true);
    assert.equal(result.originInServiceArea, true);
    assert.equal(result.confidence, 'FALLBACK');
  }
  for (const endpoint of [{ latitude: 27.77, longitude: -82.64 }, { latitude: 28.23, longitude: -82.46 }]) {
    assert.equal(checkWaymoAvailability(fixture.routes[0].originCoordinates, endpoint).reason, 'DESTINATION_OUTSIDE');
  }
});

test('active city with incomplete zone data is unverifiable, while reliable and stale polygons stay distinct', () => {
  const { WAYMO_SERVICE_AREAS } = require('../src/server/services/waymoAvailability.ts');
  const tampa = WAYMO_SERVICE_AREAS.find(area => area.city === 'Tampa');
  const core = { latitude: 27.95, longitude: -82.45 };
  const unknown = checkWaymoAvailability(core, { latitude: 28.06, longitude: -82.45 });
  assert.equal(unknown.available, false);
  assert.equal(unknown.citySupported, true);
  assert.equal(unknown.destinationInServiceArea, 'UNKNOWN');
  assert.equal(unknown.reason, 'UNVERIFIABLE');
  assert.equal(unknown.confidence, 'UNKNOWN');
  assert.match(unknown.detail, /Availability could not be verified/);
  const polygon = { reliable: true, points: [
    { latitude: 27.94, longitude: -82.46 }, { latitude: 27.96, longitude: -82.46 },
    { latitude: 27.96, longitude: -82.44 }, { latitude: 27.94, longitude: -82.44 },
  ] };
  const exactArea = { ...tampa, polygons: [polygon] };
  assert.equal(checkWaymoAvailability(core, core, [exactArea]).confidence, 'HIGH');
  const outside = { latitude: 27.97, longitude: -82.45 };
  assert.equal(checkWaymoAvailability(core, outside, [exactArea]).reason, 'DESTINATION_OUTSIDE');
  assert.equal(checkWaymoAvailability(core, outside, [{ ...exactArea, polygons: [{ ...polygon, reliable: false }] }]).available, true);
  const missingGeometry = { ...tampa, fallbackBounds: undefined };
  assert.equal(checkWaymoAvailability(core, core, [missingGeometry]).reason, 'UNVERIFIABLE');
});

test('stranded route cards use an explicit dark theme while normal cards keep their default theme', () => {
  const RouteCard = require('../src/components/RouteCard.tsx').default;
  for (const mode of ['WALK', 'TRANSIT']) {
    const route = { id: 'theme-' + mode, mode, label: mode, durationMinutes: 20, walkingMinutes: 5, distanceMeters: 2000,
      cost: { amount: null, currency: 'USD', complete: false, note: '' }, steps: [], warnings: ['Check current conditions.'] };
    const props = { route, origin: SF, destination: PHOENIX };
    const stranded = renderToStaticMarkup(React.createElement(RouteCard, { ...props, variant: 'stranded' }));
    const normal = renderToStaticMarkup(React.createElement(RouteCard, props));
    assert.match(stranded, /<article class="[^"]*stranded-route-card/);
    assert.doesNotMatch(stranded, /<article class="[^"]*bg-white/);
    assert.match(normal, /<article class="[^"]*bg-white/);
    assert.doesNotMatch(normal, /stranded-route-card/);
    assert.ok(stranded.includes('Map preview'), 'nested map fallback remains available');
  }
});
