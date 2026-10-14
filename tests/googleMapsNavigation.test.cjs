/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { buildGoogleMapsNavigationUrl: build } = require('../src/lib/googleMapsNavigation.ts');
const origin = { latitude: 25.76, longitude: -80.2 };
const destination = { latitude: 25.85, longitude: -80.3 };
const stop = index => ({ latitude: 25.77 + index / 100, longitude: -80.21, label: `Stop ${index}`, kind: 'OPTIONAL_STOP' });
const trip = overrides => ({ origin, destination, travelMode: 'DRIVING', context: 'NORMAL', orderedStops: [], ...overrides });
const params = result => new URL(result.url).searchParams;

for (const [travelMode, expected] of [['DRIVING', 'driving'], ['WALKING', 'walking'], ['TRANSIT', 'transit']]) {
  test(`${travelMode} maps explicitly to ${expected}`, () => {
    const result = build(trip({ travelMode }));
    assert.equal(params(result).get('travelmode'), expected);
    assert.equal(params(result).get('origin'), '25.76,-80.2');
    assert.equal(params(result).get('destination'), '25.85,-80.3');
    assert.equal(params(result).get('api'), '1');
    assert.equal(params(result).get('dir_action'), 'navigate');
    assert.equal(result.exactRepresentation, true);
  });
}
test('one waypoint uses encoded coordinates', () => {
  const result = build(trip({ orderedStops: [stop(0)] }));
  assert.equal(params(result).get('waypoints'), '25.77,-80.21');
  assert.match(result.url, /25.77%2C-80.21/);
});
test('multiple waypoints preserve order and matching place IDs', () => {
  const stops = [stop(2), stop(0), stop(1)].map((value, index) => ({ ...value, placeId: `place-${index}` }));
  const result = build(trip({ orderedStops: stops }));
  assert.deepEqual(result.includedStops, stops);
  assert.equal(params(result).get('waypoints'), stops.map(value => `${value.latitude},${value.longitude}`).join('|'));
  assert.equal(params(result).get('waypoint_place_ids'), 'place-0|place-1|place-2');
  assert.match(result.url, /%7C/);
  assert.equal(params(build(trip({ orderedStops: [stops[0], stop(0)] }))).has('waypoint_place_ids'), false);
});
test('normal driving ends at parking once and preserves destination for walking', () => {
  const parking = { ...stop(4), kind: 'PARKING' };
  for (const orderedStops of [[stop(0)], [stop(0), parking]]) {
    const result = build(trip({ orderedStops, parkingLocation: parking }));
    assert.deepEqual(result.includedStops.map(value => value.kind), ['OPTIONAL_STOP']);
    assert.equal(params(result).get('destination'), `${parking.latitude},${parking.longitude}`);
    assert.equal(result.continuation.destination.latitude, 25.85);
    assert.equal(result.continuation.travelMode, 'WALKING');
    assert.equal(result.exactRepresentation, false);
  }
});
test('overflow prioritizes selected optional stops while parking remains driving endpoint', () => {
  const stops = [{ ...stop(0), kind: 'OTHER' }, stop(1), stop(2), stop(3), { ...stop(4), kind: 'PARKING' }];
  const result = build(trip({ orderedStops: stops }));
  assert.deepEqual(result.includedStops, [stops[1], stops[2], stops[3]]);
  assert.deepEqual(result.omittedStops, [stops[0]]);
  assert.equal(params(result).get('destination'), `${stops[4].latitude},${stops[4].longitude}`);
  assert.equal(result.exactRepresentation, false);
  assert.match(result.warnings[0], /limit exceeded/);
  const desktop = build(trip({ orderedStops: Array.from({ length: 11 }, (_, index) => stop(index)) }), { target: 'DESKTOP' });
  assert.equal(desktop.includedStops.length, 9);
  assert.equal(desktop.omittedStops.length, 2);
});
test('Stranded driving retains previous waypoint and final-destination behavior', () => {
  const parking = { ...stop(4), kind: 'PARKING' };
  const result = build(trip({ context: 'STRANDED', orderedStops: [stop(0), parking], parkingLocation: parking }));
  assert.deepEqual(result.includedStops.map(value => value.kind), ['OPTIONAL_STOP', 'PARKING']);
  assert.equal(params(result).get('destination'), '25.85,-80.3');
  assert.equal(result.continuation, undefined);
});
test('transit never becomes driving and reports unsupported intermediate stops', () => {
  const result = build(trip({ travelMode: 'TRANSIT', orderedStops: [stop(0)] }));
  assert.equal(params(result).get('travelmode'), 'transit');
  assert.equal(params(result).has('waypoints'), false);
  assert.deepEqual(result.omittedStops, [stop(0)]);
  assert.equal(result.exactRepresentation, false);
});
test('destination-only URL omits origin without inventing current-location coordinates', () => {
  const result = build(trip({ origin: undefined }));
  assert.equal(params(result).has('origin'), false);
  assert.equal(params(result).has('origin_place_id'), false);
  assert.equal(params(result).get('destination'), '25.85,-80.3');
});
test('special-character metadata cannot inject queries or override coordinates', () => {
  const point = { ...destination, label: 'Cafe & Tea / #1? 東京', address: '1 Main St & key=secret', placeId: 'id & #? / 東京' };
  const result = build(trip({ destination: point }));
  assert.equal(params(result).get('destination'), '25.85,-80.3');
  assert.equal(params(result).get('destination_place_id'), point.placeId);
  assert.equal(params(result).has('key'), false);
  assert.equal(new URL(result.url).hash, '');
  assert.equal(new URL(result.url).origin, 'https://www.google.com');
});
test('safe-place first leg routes to safe place without mutating original destination', () => {
  const request = trip({ context: 'STRANDED_SAFE_PLACE_LEG', travelMode: 'WALKING', safePlaceFirstLeg: stop(0), orderedStops: [stop(1)] });
  const before = JSON.stringify(request);
  const result = build(request);
  assert.equal(params(result).get('destination'), '25.77,-80.21');
  assert.equal(params(result).has('waypoints'), false);
  assert.equal(JSON.stringify(request), before);
});
test('oversized place IDs fall back to coordinate-only URL within length limit', () => {
  const result = build(trip({ destination: { ...destination, placeId: 'x'.repeat(3000) } }));
  assert.ok(result.url.length <= 2048);
  assert.equal(params(result).has('destination_place_id'), false);
  assert.equal(result.exactRepresentation, true);
  assert.match(result.warnings[0], /length limit/);
});
test('malformed coordinates are rejected even in overflow stops', () => {
  for (const latitude of [NaN, Infinity, 91, '25']) {
    assert.throws(() => build(trip({ destination: { ...destination, latitude } })), /Invalid navigation coordinates/);
  }
  assert.throws(() => build(trip({ orderedStops: [stop(0), stop(1), stop(2), { ...stop(3), longitude: 181 }] })), /valid resolved coordinates/);
  assert.throws(() => build(trip({ travelMode: 'INVALID' })), /Unsupported/);
  assert.throws(() => build(trip({ context: 'STRANDED_SAFE_PLACE_LEG' })), /safe place and walking/);
});
