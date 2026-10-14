/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { buildWaymoHandoff: build } = require('../src/lib/waymoHandoff.ts');
const origin = { latitude: 25.76, longitude: -80.2, label: 'Pickup & Cafe' };
const destination = { latitude: 25.85, longitude: -80.3, label: 'Home' };
const request = { origin, destination, orderedStops: [], travelMode: 'DRIVING', context: 'NORMAL' };
const option = { provider: 'WAYMO', available: true };

test('available Waymo retains endpoints internally without transmitting invented parameters', () => {
  const result = build(request, option);
  assert.equal(result.enabled, true);
  assert.deepEqual(result.pickup, origin);
  assert.deepEqual(result.dropoff, destination);
  assert.equal(result.endpointsPreloaded, false);
  assert.equal(result.exactRepresentation, false);
  assert.equal(new URL(result.url).search, '');
});
test('unavailable Waymo returns no actionable URL even when booking URL was supplied', () => {
  const result = build(request, { ...option, available: false, bookingUrl: 'https://waymo.com/rides/', unavailableReason: 'Outside service area' });
  assert.equal(result.enabled, false);
  assert.equal(result.url, undefined);
  assert.equal(result.webFallbackUrl, undefined);
  assert.equal(result.reason, 'Outside service area');
});
test('existing supported provider URL is reused unchanged', () => {
  const result = build(request, { ...option, bookingUrl: 'https://waymo.com/waymo-one/' }, 'ANDROID');
  assert.equal(result.url, 'https://waymo.com/waymo-one/');
  assert.equal(result.flow, 'PROVIDER_LINK');
});
test('published app/download link is accepted without added pickup/dropoff query', () => {
  const url = 'https://waymo.smart.link/2wt03oz01';
  const result = build(request, { ...option, fare: { bookingUrl: url }, bookingUrl: 'https://waymo.com/rides/' }, 'IOS');
  assert.equal(result.url, url);
  assert.equal(result.endpointsPreloaded, false);
});
for (const platform of ['ANDROID', 'IOS', 'IPADOS', 'DESKTOP', 'UNKNOWN']) {
  test(`${platform} uses a valid app/web landing fallback`, () => {
    const result = build(request, option, platform);
    assert.equal(result.url, ['ANDROID', 'IOS', 'IPADOS'].includes(platform) ? 'https://waymo.com/download/' : 'https://waymo.com/rides/');
    assert.equal(result.webFallbackUrl, 'https://waymo.com/rides/');
    assert.equal(result.flow, 'LANDING_FLOW');
  });
}
test('unverified URLs and parameters fall back instead of treating them as supported deep links', () => {
  for (const bookingUrl of ['waymo://ride?pickup=1', 'javascript:alert(1)', 'https://waymo.com/rides/?pickup=1', 'https://waymo.com.evil.test/rides/']) {
    assert.equal(build(request, { ...option, bookingUrl }).url, 'https://waymo.com/rides/');
  }
});
test('explicit ride endpoints override origin/destination without mutation or GPS substitution', () => {
  const data = { ...request, rideshare: { pickup: destination, dropoff: origin } };
  const before = JSON.stringify(data);
  const result = build(data, option);
  assert.deepEqual(result.pickup, destination);
  assert.deepEqual(result.dropoff, origin);
  assert.equal(JSON.stringify(data), before);
});
test('coordinates are validated and no price, ETA or keys enter the handoff', () => {
  assert.throws(() => build({ ...request, origin: { latitude: NaN, longitude: 0 } }, option), /valid resolved coordinates/);
  assert.throws(() => build(request, { ...option, provider: 'UBER' }), /Waymo option/);
  const result = build({ ...request, origin: { ...origin, apiKey: 'secret', estimatedPickupMinutes: 10 } }, option);
  assert.deepEqual(result.pickup, origin);
  assert.equal(result.estimatedPriceLow, undefined);
  assert.equal(result.estimatedPickupMinutes, undefined);
});
