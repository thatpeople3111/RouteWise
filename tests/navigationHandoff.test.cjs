/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { buildNavigationHandoffFromRoute: build, navigationLegPoints: points, toNavigationPoint, isValidNavigationPoint } = require('../src/lib/navigationHandoff.ts');
const origin = Object.freeze({ latitude: 25.76, longitude: -80.2, label: 'Current location' });
const destination = Object.freeze({ coordinates: { latitude: 25.85, longitude: -80.3 }, placeId: 'destination', name: 'Home', formattedAddress: '100 Main St' });
const safePlace = Object.freeze({ coordinates: { latitude: 25.77, longitude: -80.21 }, placeId: 'safe', name: 'Cafe', address: '2 Main St' });
const route = mode => Object.freeze({ id: `${mode}-route`, mode, destination: null });
const input = mode => ({ route: route(mode), origin, destination });

for (const [mode, expected] of [['DRIVE', 'DRIVING'], ['WALK', 'WALKING'], ['TRANSIT', 'TRANSIT']]) {
  test(`${expected.toLowerCase()} trip preserves endpoints and selected route`, () => {
    const result = build(input(mode));
    assert.equal(result.travelMode, expected);
    assert.equal(result.context, 'NORMAL');
    assert.equal(result.routeId, `${mode}-route`);
    assert.deepEqual(result.destination, { latitude: 25.85, longitude: -80.3, label: 'Home', address: '100 Main St', placeId: 'destination' });
    assert.deepEqual(points(result), [origin, result.destination]);
  });
}

test('optional stops preserve supplied order and unwrap the existing UI candidate', () => {
  const result = build({ ...input('DRIVE'), optionalStops: [{ timing: 'ON_ROUTE', candidate: safePlace }, destination] });
  assert.deepEqual(result.orderedStops.map(stop => stop.placeId), ['safe', 'destination']);
  assert.ok(result.orderedStops.every(stop => stop.kind === 'OPTIONAL_STOP'));
});

test('recommended parking follows optional stops and explicit selection wins', () => {
  const parking = { ...safePlace, placeId: 'lot', recommended: true };
  const selected = { ...parking, placeId: 'selected-lot' };
  const trip = { ...input('DRIVE'), route: { ...route('DRIVE'), parking: { locations: [parking] } }, optionalStops: [safePlace] };
  const result = build(trip);
  assert.deepEqual(points(result).map(point => point.placeId), [undefined, 'safe', 'lot', 'destination']);
  assert.equal(result.orderedStops[1].kind, 'PARKING');
  assert.equal(build({ ...trip, parkingLocation: selected }).parkingLocation.placeId, 'selected-lot');
  assert.equal(build({ ...trip, route: route('WALK') }).parkingLocation, undefined);
});

test('stranded safe-place leg preserves original destination without mutating the trip', () => {
  const trip = { ...input('WALK'), context: 'STRANDED_SAFE_PLACE_LEG', safePlace, optionalStops: [destination] };
  const before = JSON.stringify(trip);
  const result = build(trip);
  assert.equal(result.destination.placeId, 'destination');
  assert.deepEqual(points(result), [origin, toNavigationPoint(safePlace)]);
  assert.deepEqual(result.orderedStops, []);
  assert.equal(JSON.stringify(trip), before);
  assert.throws(() => build({ ...trip, destination: undefined }), /original stranded destination/);
});

test('stranded resume retains selected safe place and continuation route separately', () => {
  const result = build({ ...input('TRANSIT'), context: 'STRANDED_RESUME', origin: safePlace, safePlace });
  assert.equal(result.routeId, 'TRANSIT-route');
  assert.equal(result.context, 'STRANDED_RESUME');
  assert.equal(result.safePlaceFirstLeg.placeId, 'safe');
  assert.deepEqual(points(result), [toNavigationPoint(safePlace), result.destination]);
  assert.equal(build({ ...input('WALK'), context: 'STRANDED' }).context, 'STRANDED');
});

test('rideshare pickup and dropoff are independent resolved points', () => {
  const result = build({ ...input('DRIVE'), rideshare: { pickup: safePlace, dropoff: destination } });
  assert.equal(result.rideshare.pickup.placeId, 'safe');
  assert.equal(result.rideshare.dropoff.placeId, 'destination');
  assert.deepEqual(result.origin, origin);
});

test('wire route coordinates and metadata are reused without geocoding', () => {
  const result = build({ route: { ...route('TRANSIT'), origin: { placeId: 'start' }, originCoordinates: origin, destination: destination.coordinates } });
  assert.equal(result.origin.placeId, 'start');
  assert.equal(result.destination.latitude, destination.coordinates.latitude);
  assert.throws(() => build({ route: { ...route('WALK'), origin: { address: 'Unresolved' } } }), /coordinates are unavailable/);
});

test('validation rejects missing, nonnumeric, nonfinite, and out-of-range coordinates', () => {
  for (const latitude of [NaN, Infinity, 91, -91, '25', undefined]) {
    assert.equal(isValidNavigationPoint({ latitude, longitude: 0 }), false);
    assert.throws(() => toNavigationPoint({ latitude, longitude: 0 }), /valid resolved coordinates/);
  }
  for (const longitude of [NaN, Infinity, 181, -181, '0']) assert.equal(isValidNavigationPoint({ latitude: 0, longitude }), false);
  assert.equal(isValidNavigationPoint({ latitude: 0, longitude: 0 }), true);
  assert.throws(() => toNavigationPoint({ ...safePlace, coordinates: null }), /valid resolved coordinates/);
  assert.throws(() => build(input('BICYCLE')), /not supported/);
  assert.throws(() => build({ ...input('DRIVE'), context: 'STRANDED_SAFE_PLACE_LEG', safePlace }), /walking route/);
  assert.throws(() => build({ ...input('WALK'), context: 'STRANDED_RESUME' }), /selected safe place/);
  assert.throws(() => build({ ...input('DRIVE'), optionalStops: [{ timing: 'ON_ROUTE' }] }), /stop coordinates/);
  assert.deepEqual(toNavigationPoint({ ...origin, apiKey: 'excluded', mapsUri: 'excluded' }), origin);
});
