/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { buildAppleMapsNavigationUrl: build } = require('../src/lib/appleMapsNavigation.ts');
const origin = { latitude: 25.76, longitude: -80.2 };
const destination = { latitude: 25.85, longitude: -80.3 };
const stop = { latitude: 25.77, longitude: -80.21, label: 'Cafe', kind: 'OPTIONAL_STOP' };
const parking = { latitude: 25.84, longitude: -80.29, label: 'Parking', kind: 'PARKING' };
const trip = overrides => ({ origin, destination, travelMode: 'DRIVING', context: 'NORMAL', orderedStops: [], ...overrides });
const params = result => new URL(result.url).searchParams;

for (const [travelMode, flag, mode] of [['DRIVING', 'd', 'driving'], ['WALKING', 'w', 'walking'], ['TRANSIT', 'r', 'transit']]) {
  test(`${travelMode} is preserved in compatibility and unified links`, () => {
    const result = build(trip({ travelMode }));
    assert.equal(params(result).get('dirflg'), flag);
    assert.equal(params(result).get('saddr'), '25.76,-80.2');
    assert.equal(params(result).get('daddr'), '25.85,-80.3');
    assert.equal(result.exactRepresentation, true);
    const unified = build(trip({ travelMode }), { format: 'UNIFIED' });
    assert.equal(params(unified).get('mode'), mode);
    assert.equal(new URL(unified.url).pathname, '/directions');
  });
}
test('parking is the driving endpoint, with final destination and walking continuation retained', () => {
  const request = trip({ parkingLocation: parking, orderedStops: [stop, parking] });
  const before = JSON.stringify(request);
  const result = build(request);
  assert.equal(params(result).get('daddr'), '25.84,-80.29');
  assert.deepEqual(result.finalDestination, destination);
  assert.deepEqual(result.continuation, { origin: { latitude: 25.84, longitude: -80.29, label: 'Parking' }, destination, travelMode: 'WALKING' });
  assert.deepEqual(result.unsupportedStops, [stop]);
  assert.equal(result.exactRepresentation, false);
  assert.equal(JSON.stringify(request), before);
  assert.equal(params(build(trip({ orderedStops: [parking] }))).get('daddr'), '25.84,-80.29');
});
test('walking and transit do not switch destination to a parking lot', () => {
  for (const travelMode of ['WALKING', 'TRANSIT']) {
    const result = build(trip({ travelMode, parkingLocation: parking }));
    assert.equal(params(result).get('daddr'), '25.85,-80.3');
    assert.equal(result.continuation, undefined);
  }
});
test('intermediate stops are reported in itinerary order on compatibility links', () => {
  const stops = [stop, { ...stop, latitude: 25.78, kind: 'OTHER' }];
  const result = build(trip({ orderedStops: stops }));
  assert.deepEqual(result.unsupportedStops, stops);
  assert.deepEqual(result.includedStops, []);
  assert.equal(result.exactRepresentation, false);
  assert.equal(params(result).has('waypoint'), false);
  assert.ok(result.warnings.length);
});
test('known unified URL support uses documented repeated waypoints in original order', () => {
  const stops = [stop, { ...stop, latitude: 25.78 }];
  const result = build(trip({ orderedStops: stops }), { format: 'UNIFIED' });
  assert.deepEqual(params(result).getAll('waypoint'), ['25.77,-80.21', '25.78,-80.21']);
  assert.deepEqual(result.includedStops, stops);
  assert.deepEqual(result.unsupportedStops, []);
  assert.equal(result.exactRepresentation, true);
  const parked = build(trip({ orderedStops: [...stops, parking], parkingLocation: parking }), { format: 'UNIFIED' });
  assert.equal(params(parked).getAll('waypoint').length, 2);
  assert.equal(parked.exactRepresentation, false);
});
test('special characters remain in metadata and cannot inject URL parameters', () => {
  const point = { ...destination, label: 'Cafe & Tea / #? 東京', address: 'Main & key=secret', placeId: 'Google-place-id' };
  const result = build(trip({ destination: point }));
  assert.deepEqual(result.finalDestination, point);
  assert.equal(params(result).get('daddr'), '25.85,-80.3');
  assert.match(result.url, /25.85%2C-80.3/);
  assert.equal(params(result).has('key'), false);
  assert.equal(params(result).has('q'), false);
  assert.equal(new URL(result.url).hash, '');
  assert.equal(new URL(result.url).origin, 'https://maps.apple.com');
});
test('missing label still produces a valid coordinate handoff', () => {
  assert.equal(params(build(trip())).get('daddr'), '25.85,-80.3');
});
test('safe-place leg retains original destination and resume returns to it', () => {
  const result = build(trip({ travelMode: 'WALKING', context: 'STRANDED_SAFE_PLACE_LEG', safePlaceFirstLeg: stop, orderedStops: [parking] }));
  assert.equal(params(result).get('daddr'), '25.77,-80.21');
  assert.deepEqual(result.finalDestination, destination);
  assert.equal(result.exactRepresentation, true);
  assert.deepEqual(result.unsupportedStops, []);
  const resume = build(trip({ origin: stop, context: 'STRANDED_RESUME', safePlaceFirstLeg: stop, travelMode: 'TRANSIT' }));
  assert.equal(params(resume).get('daddr'), '25.85,-80.3');
  assert.equal(params(resume).get('dirflg'), 'r');
});
test('invalid coordinates, omitted stops, mode and safe-leg input are rejected', () => {
  for (const latitude of [NaN, Infinity, 91, '25']) assert.throws(() => build(trip({ origin: { ...origin, latitude } })), /valid resolved coordinates/);
  assert.throws(() => build(trip({ orderedStops: [{ ...stop, longitude: 181 }] })), /valid resolved coordinates/);
  assert.throws(() => build(trip({ parkingLocation: { ...parking, latitude: -91 } })), /valid resolved coordinates/);
  assert.throws(() => build(trip({ travelMode: 'INVALID' })), /Unsupported/);
  assert.throws(() => build(trip({ context: 'STRANDED_SAFE_PLACE_LEG' })), /safe place and walking/);
});
