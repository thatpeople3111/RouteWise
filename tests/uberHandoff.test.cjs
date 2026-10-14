/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { buildUberHandoff: build } = require('../src/lib/uberHandoff.ts');
const origin = { latitude: 25.76, longitude: -80.2, label: 'Selected pickup', address: '1 Main St' };
const destination = { latitude: 25.85, longitude: -80.3, label: 'Home', address: '100 Main St' };
const request = overrides => ({ origin, destination, travelMode: 'DRIVING', context: 'NORMAL', orderedStops: [], ...overrides });
const locations = url => {
  const query = new URL(url).searchParams;
  return { pickup: JSON.parse(query.get('pickup')), dropoff: JSON.parse(query.get('drop[0]')) };
};
test('pickup coordinates, label and address come from trip origin', () => {
  const result = build(request());
  assert.deepEqual(locations(result.url).pickup, { latitude: 25.76, longitude: -80.2, addressLine1: 'Selected pickup', addressLine2: '1 Main St' });
  assert.doesNotMatch(result.url, /my_location/);
});
test('destination coordinates, label and address are preserved', () => {
  assert.deepEqual(locations(build(request()).url).dropoff, { latitude: 25.85, longitude: -80.3, addressLine1: 'Home', addressLine2: '100 Main St' });
});
test('missing labels and addresses produce coordinate-only location objects', () => {
  const point = { latitude: 0, longitude: 0 };
  assert.deepEqual(locations(build(request({ origin: point, destination: point })).url), { pickup: point, dropoff: point });
});
test('explicit rideshare pickup/dropoff override trip endpoints without mutating them', () => {
  const data = request({ rideshare: { pickup: destination, dropoff: origin } });
  const before = JSON.stringify(data);
  const result = build(data);
  assert.equal(locations(result.url).pickup.latitude, destination.latitude);
  assert.equal(locations(result.url).dropoff.latitude, origin.latitude);
  assert.equal(JSON.stringify(data), before);
});
test('desktop and unknown use direct web fallback', () => {
  for (const platform of ['DESKTOP', 'UNKNOWN', undefined]) {
    const result = build(request(), platform);
    assert.equal(new URL(result.url).pathname, '/');
    assert.equal(result.url, result.webFallbackUrl);
    assert.equal(new URL(result.url).origin, 'https://m.uber.com');
  }
});
test('mobile platforms use HTTPS universal link and retain a parameterized web fallback', () => {
  for (const platform of ['ANDROID', 'IOS', 'IPADOS']) {
    const result = build(request(), platform);
    assert.equal(new URL(result.url).pathname, '/looking');
    assert.deepEqual(locations(result.url), locations(result.webFallbackUrl));
    assert.equal(new URL(result.webFallbackUrl).pathname, '/');
  }
});
test('special characters round-trip with no query injection or secret/provider fields', () => {
  const point = { ...origin, label: 'Cafe & Tea / #? 東京', address: '1 Main St & key=secret', apiKey: 'not-copied', vehicleType: 'not-copied', estimatedPriceLow: 10 };
  const result = build(request({ origin: point }));
  const query = new URL(result.url).searchParams;
  assert.equal(locations(result.url).pickup.addressLine1, point.label);
  assert.equal(locations(result.url).pickup.addressLine2, point.address);
  assert.deepEqual([...query.keys()], ['pickup', 'drop[0]']);
  assert.equal(new URL(result.url).hash, '');
  assert.doesNotMatch(result.url, /not-copied|product_id|client_secret/);
});
test('malformed coordinates are rejected; intermediate stops are reported without invented preload', () => {
  for (const latitude of [NaN, Infinity, 91, '25']) assert.throws(() => build(request({ origin: { ...origin, latitude } })), /valid resolved coordinates/);
  assert.throws(() => build(request({ rideshare: { dropoff: { latitude: 0, longitude: 181 } } })), /valid resolved coordinates/);
  const stop = { ...origin, kind: 'OPTIONAL_STOP' };
  const result = build(request({ orderedStops: [stop] }));
  assert.deepEqual(result.unsupportedStops, [stop]);
  assert.equal(result.exactRepresentation, false);
  assert.equal(new URL(result.url).searchParams.has('drop[1]'), false);
  assert.equal(build(request()).exactRepresentation, true);
});
