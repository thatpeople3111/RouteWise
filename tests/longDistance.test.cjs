/* eslint-disable @typescript-eslint/no-require-imports */
process.env.ROUTEWISE_PUBLIC_PRICING_ENABLED = 'false'; // Integration fixtures use no external pricing requests.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const ts = require('typescript'), { test } = require('node:test'), assert = require('node:assert/strict');
const compile = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
require.extensions['.ts'] = compile; require.extensions['.tsx'] = compile;
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args); };
const { determineTripScope } = require('../src/server/services/tripScope.ts');
const { discoverRail, findNearbyAirports, isTransportationHub, AIRPORTS } = require('../src/server/services/travelProviders.ts');
const { createLongDistancePlan, sumJourneyCost, rankLongDistanceJourneys } = require('../src/server/services/longDistancePlanning.ts');
const { createTripPlan } = require('../src/server/services/tripPlanning.ts');
const { toTripPlan } = require('../src/lib/api.ts');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const Results = require('../src/components/RouteResults.tsx').default;
const miami = { latitude: 25.77, longitude: -80.19 }, orlando = { latitude: 28.5383, longitude: -81.3792 };
const request = { origin: miami, destination: orlando, hasCar: true, allowTransit: true, allowWalking: true,
  budgetUsd: 1000, maxWalkingMinutes: 15, departureTime: '2026-10-14T12:00:00Z', skip: true };
const drive = { id: 'drive', travelMode: 'DRIVE', durationSeconds: 14400, distanceMeters: 380000,
  originCoordinates: miami, destinationCoordinates: orlando, encodedPolyline: 'real-provider-polyline',
  steps: [{ travelMode: 'DRIVE', instruction: 'Drive', durationSeconds: 14400 }], warnings: [],
  tolls: { status: 'estimated', prices: [{ amount: 15, currency: 'USD' }] } };
const options = { getDrive: async trip => ({ ...drive, durationSeconds: 1200, distanceMeters: 10000,
  originCoordinates: trip.origin, destinationCoordinates: trip.destination }),
  getParking: async () => ({ status: 'available', locations: [{ placeId: 'parking', name: 'Lot', coordinates: orlando,
    distanceMeters: 100, address: null, openNow: null, mapsUri: 'https://maps.google.com/', recommended: true,
    walkingMinutes: 3, priceAmount: 10, priceSource: 'official_config' }] }) };

test('scope uses trip distance, never just congestion or a literal city pair', () => {
  assert.equal(determineTripScope(miami, orlando), 'LONG_DISTANCE');
  assert.equal(determineTripScope({ latitude: 33.75, longitude: -84.39 }, { latitude: 35.23, longitude: -80.84 }), 'LONG_DISTANCE');
  assert.equal(determineTripScope(miami, { latitude: 25.76, longitude: -80.37 }, 25000, 200), 'LOCAL');
  assert.equal(determineTripScope(null, null, 160000), 'LONG_DISTANCE');
});
test('rail discovery honors provider corridors and airports rank by coordinates', () => {
  assert.deepEqual(discoverRail(miami, orlando).map(item => item.provider.id), ['brightline', 'amtrak']);
  assert.ok(discoverRail(miami, { latitude: 26.76, longitude: -80.07 }).some(item => item.provider.id === 'tri-rail'));
  assert.ok(discoverRail({ latitude: 28.26, longitude: -81.49 }, { latitude: 29.02, longitude: -81.35 }).some(item => item.provider.id === 'sunrail'));
  assert.equal(discoverRail(miami, { latitude: 33.75, longitude: -84.39 }).length, 0);
  assert.equal(findNearbyAirports(miami)[0].id, 'MIA');
  assert.equal(findNearbyAirports(orlando)[0].id, 'MCO');
  assert.equal(isTransportationHub(orlando), null);
});
test('Miami to Orlando produces separate rail/flight journeys and hub-specific destination rides', async () => {
  const plan = await createLongDistancePlan(request, miami, orlando, [drive], [drive], options);
  assert.equal(plan.tripScope, 'LONG_DISTANCE');
  assert.equal(plan.routeOptions.some(route => route.mode === 'WALK'), false);
  assert.deepEqual(plan.rideshares, []);
  assert.equal(plan.longDistance.destinationHub, null);
  assert.equal(plan.longDistance.rentals.length, 0);
  const rail = plan.longDistance.journeys.find(journey => journey.id === 'brightline');
  assert.equal(rail.rideMinutes, 210);
  assert.equal(rail.durationMinutes, rail.firstMile.durationMinutes + 210 + 30 + rail.lastMile.durationMinutes);
  assert.ok(rail.lastMile.rideshares.some(ride => ride.provider === 'UBER'));
  assert.ok(rail.lastMile.rideshares.some(ride => ride.provider === 'LYFT'));
  assert.ok(rail.lastMile.rideshares.some(ride => ride.provider === 'WAYMO'));
  assert.equal(rail.fare.sourceType, 'MODELED'); assert.equal(rail.cost.complete, true); assert.ok(rail.cost.totalUsd > 0);
  assert.ok(rail.lastMile.rideshares.every(ride => ride.origin !== '25.7700, -80.1900'));
  const flight = plan.longDistance.journeys.find(journey => journey.mode === 'FLIGHT');
  assert.equal(flight.durationMinutes, null); assert.equal(flight.labels.length, 0);
  assert.equal(flight.status, 'search_only');
  const view = toTripPlan(plan);
  const html = renderToStaticMarkup(React.createElement(Results, { plan: view, origin: miami, destination: orlando, onEditTrip() {} }));
  assert.ok(html.includes('LONG-DISTANCE OPTIONS') && html.includes('Brightline'));
  assert.equal(html.includes('All other options'), false);
  assert.ok(html.includes('Fare unavailable'));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'journey headings and rideshare titles remain unique');
});
test('MCO, TPA, ATL hub destinations expose three configured rentals without fabricated prices', async () => {
  for (const code of ['MCO', 'TPA', 'ATL']) {
    const hub = AIRPORTS.find(airport => airport.id === code);
    const plan = await createLongDistancePlan({ ...request, destination: hub.coordinates }, miami, hub.coordinates, [drive], [drive], options);
    assert.equal(plan.longDistance.destinationHub.id, code);
    assert.equal(plan.longDistance.rentals.length, 3);
    assert.ok(plan.longDistance.rentals.every(rental => rental.priceUsdPerDay === null && fs.existsSync(path.join(__dirname, '../public', rental.logo))));
    for (const journey of plan.longDistance.journeys.filter(journey => journey.mode === 'FLIGHT' && journey.destinationHub.id === code)) {
      assert.equal(journey.lastMile.mode, 'AT_HUB'); assert.equal(journey.lastMile.costUsd, 0);
    }
  }
});
test('cost components count once, and incomplete/over-budget journeys cannot win Cheapest', () => {
  assert.deepEqual(sumJourneyCost([{ label: 'fare', amountUsd: 20, source: 'official' }, { label: 'transfer', amountUsd: 10, source: 'estimated' }]), {
    components: [{ label: 'fare', amountUsd: 20, source: 'official' }, { label: 'transfer', amountUsd: 10, source: 'estimated' }], complete: true, knownSubtotalUsd: 30, knownSubtotalLowUsd: 30, priceLowUsd: 30, priceHighUsd: 30, totalUsd: 30,
  });
  const base = { mode: 'RAIL', status: 'configured_service', labels: [], warnings: [], durationMinutes: 100 };
  const journeys = [{ ...base, id: 'unknown', cost: sumJourneyCost([{ label: 'fare', amountUsd: null, source: 'unavailable' }]) },
    { ...base, id: 'known', durationMinutes: 150, cost: sumJourneyCost([{ label: 'fare', amountUsd: 30, source: 'official' }]) }];
  assert.equal(rankLongDistanceJourneys(journeys, { budgetUsd: 40 }).cheapest, 'known');
  assert.equal(rankLongDistanceJourneys(journeys, { budgetUsd: 20 }).best, null);
});
test('pipeline leaves local and Stranded planning on their existing branch', async () => {
  const localDestination = { latitude: 25.76, longitude: -80.37 };
  const local = await createTripPlan({ ...request, destination: localDestination }, { getRoutes: async () => [{ ...drive, destinationCoordinates: localDestination,
    distanceMeters: 20000, durationSeconds: 1800 }], getParking: async () => ({ status: 'none', locations: [] }), rankWithGemini: async () => null });
  assert.equal(local.tripScope, undefined);
  assert.ok(local.rideshares.length);
  const stranded = await createTripPlan({ ...request, notes: 'RouteWise Stranded mode request.' }, { getRoutes: async () => [drive],
    getParking: async () => ({ status: 'none', locations: [] }), rankWithGemini: async () => null });
  assert.equal(stranded.tripScope, undefined);
});

test('arrival rentals belong to the rail/flight hub even for a hotel destination; Driving has none', async () => {
  const plan = await createLongDistancePlan(request, miami, orlando, [drive], [drive], options);
  const flight = plan.longDistance.journeys.find(journey => journey.mode === 'FLIGHT');
  const rail = plan.longDistance.journeys.find(journey => journey.id === 'brightline');
  assert.equal(flight.destinationHub.id, 'MCO');
  for (const journey of [flight, rail]) {
    assert.equal(journey.rentals.length, 3); assert.ok(journey.rentals.every(rental => rental.pickup.includes('Orlando') && rental.priceUsdPerDay === null));
  }
  assert.equal(plan.longDistance.journeys.find(journey => journey.mode === 'DRIVING').rentals, undefined);
  const html = renderToStaticMarkup(React.createElement(Results, { plan: toTripPlan(plan), origin: miami, destination: orlando, onEditTrip() {} }));
  assert.ok(html.includes('DESTINATION TRANSPORTATION')); assert.ok(html.includes('Enterprise'));
  assert.ok(!html.includes('210 min') && html.includes('3 hr 30 min'));
});
test('time-aware fares are modeled, preserve unsupported modes, and work across several route markets', () => {
  const { estimateFare } = require('../src/server/services/fareEstimation.ts');
  for (const origin of [miami, { latitude: 27.95, longitude: -82.46 }, orlando, { latitude: 33.75, longitude: -84.39 }, { latitude: 37.77, longitude: -122.42 }]) {
    const input = { providerType: 'RIDESHARE', provider: 'LYFT', distanceMeters: 15000, durationMinutes: 25, origin };
    const day = estimateFare({ ...input, departureTime: '2026-10-14T17:00:00Z' });
    const night = estimateFare({ ...input, departureTime: '2026-10-15T06:00:00Z' });
    assert.equal(day.sourceType, 'MODELED'); assert.equal(night.sourceType, 'MODELED');
    assert.ok(night.priceHigh > day.priceHigh); assert.match(night.methodology, /planning assumptions/);
    assert.equal(day.label, 'Estimated fare');
  }
  for (const providerType of ['RAIL', 'FLIGHT', 'RENTAL']) {
    const fare = estimateFare({ providerType, provider: 'unconfigured', distanceMeters: 400000, durationMinutes: 200 });
    assert.equal(fare.sourceType, 'UNAVAILABLE'); assert.equal(fare.priceLow, null);
  }
  const invalid = estimateFare({ providerType: 'RIDESHARE', provider: 'LYFT', distanceMeters: NaN, durationMinutes: 2 });
  assert.equal(invalid.priceLow, null);
});
test('shared duration formatter handles thresholds, missing/invalid values, and rounding', () => {
  const { formatDuration } = require('../src/lib/formatDuration.ts');
  for (const [value, expected] of [[0,'0 min'],[5,'5 min'],[59,'59 min'],[60,'1 hr'],[61,'1 hr 1 min'],[90,'1 hr 30 min'],[120,'2 hr'],[135,'2 hr 15 min'],[59.6,'1 hr'],[60.2,'1 hr']]) assert.equal(formatDuration(value), expected);
  for (const value of [undefined,null,-1,NaN,Infinity]) assert.equal(formatDuration(value), 'Unavailable');
});

test('arrival transport stays journey-specific across Tampa/Miami, Orlando/Atlanta, and Atlanta/Tampa', async () => {
  const tampa = { latitude: 27.95, longitude: -82.46 }, atlanta = { latitude: 33.75, longitude: -84.39 };
  for (const [origin, destination, expectedAirport] of [[tampa, miami, 'MIA'], [orlando, atlanta, 'ATL'], [atlanta, tampa, 'TPA']]) {
    const plan = await createLongDistancePlan({ ...request, origin, destination }, origin, destination, [drive], [drive], options);
    const flight = plan.longDistance.journeys.find(journey => journey.mode === 'FLIGHT');
    assert.equal(flight.destinationHub.id, expectedAirport);
    assert.equal(flight.rentals.length, expectedAirport === 'MIA' ? 0 : 3);
    assert.ok(flight.lastMile.rideshares.every(ride => !ride.notes || !ride.notes.some(note => /weekday commute planning factor/.test(note))), 'unknown flight arrival does not reuse departure pricing band');
    assert.equal(plan.longDistance.journeys.find(journey => journey.mode === 'DRIVING').rentals, undefined);
  }
});
