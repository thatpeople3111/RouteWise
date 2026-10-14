/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { validateExternalHandoffUrl: validate, openExternalHandoff: open } = require('../src/lib/externalHandoff.ts');
const { prepareNavigationProviderHandoff: prepare } = require('../src/lib/startNavigation.ts');
const { prepareRideshareProviderAction: ride } = require('../src/lib/rideshareProviderAction.ts');
const point = { latitude: 25.76, longitude: -80.2 };
const trip = { origin: point, destination: { latitude: 25.85, longitude: -80.3 }, orderedStops: [], travelMode: 'WALKING', context: 'NORMAL' };
test('invalid links never reach browser open', () => {
  for (const value of [undefined, '', 'undefined', '/relative', 'javascript:alert(1)', 'data:text/html,a', 'http://example.com', 'https://user:password@example.com']) assert.throws(() => validate(value), /No valid/);
});
test('blocked, thrown, successful and SSR opens provide honest recoverable status', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: () => null } });
    assert.match(open('https://maps.apple.com/').message, /If the app did not open/);
    globalThis.window.open = () => { throw Error('blocked'); };
    assert.match(open('https://maps.apple.com/').message, /browser could not open/);
    globalThis.window.open = () => ({});
    assert.deepEqual(open('https://maps.apple.com/'), {});
    delete globalThis.window;
    assert.match(open('https://maps.apple.com/').message, /browser/);
  } finally { if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window; }
});
test('Apple fallback is Google web with itinerary omissions recorded', () => {
  const stops = Array.from({ length: 5 }, (_, index) => ({ latitude: 25.77 + index / 100, longitude: -80.21, kind: 'OPTIONAL_STOP' }));
  const apple = prepare({ ...trip, orderedStops: stops }, 'IOS');
  assert.equal(new URL(apple.url).hostname, 'maps.apple.com');
  assert.equal(new URL(apple.webFallbackUrl).hostname, 'www.google.com');
  assert.equal(apple.omittedStops.length, 5);
  const google = prepare({ ...trip, orderedStops: stops }, 'ANDROID');
  assert.equal(google.omittedStops.length, 2);
  assert.equal(google.request.orderedStops.length, 5);
  for (const platform of ['DESKTOP', 'UNKNOWN']) assert.equal(new URL(prepare(trip, platform).url).hostname, 'www.google.com');
});
test('transit fallback keeps transit and reports exact journey cannot transfer', () => {
  const result = prepare({ ...trip, travelMode: 'TRANSIT' }, 'IOS');
  assert.equal(new URL(result.webFallbackUrl).searchParams.get('travelmode'), 'transit');
  assert.equal(result.transit.exactJourneyPreloaded, false);
});
test('missing coordinates reject navigation, but rideshare uses ordinary provider landing', () => {
  assert.throws(() => prepare({ ...trip, destination: { latitude: NaN, longitude: 0 } }, 'UNKNOWN'), /Invalid navigation coordinates/);
  const option = { id: 'uber', provider: 'UBER', available: true };
  const result = ride(option, { pickup: { latitude: NaN, longitude: 0 }, dropoff: trip.destination }, 'results', 'DESKTOP');
  assert.equal(result.url, 'https://m.uber.com/');
  assert.match(result.notice, /unavailable/);
  const legacy = ride({ ...option, provider: 'LYFT', bookingUrl: 'javascript:alert(1)' });
  assert.equal(legacy.url, 'https://ride.lyft.com/');
  const waymo = ride({ ...option, provider: 'WAYMO', bookingUrl: 'waymo://invented' }, { pickup: point, dropoff: trip.destination });
  assert.equal(waymo.url, 'https://waymo.com/rides/');
  assert.match(waymo.notice, /cannot preload/);
});
test('trusted-host policy rejects spoofing, arbitrary redirects, secret parameters and provider mismatch', () => {
  for (const url of ['https://evil.example/ride', 'https://m.uber.com.evil.example/', 'https://m.uber.com@evil.example/',
    'https://m.uber.com:8443/', 'https://m.uber.com./', 'https://www.google.com/url?url=https://evil.example',
    'https://maps.apple.com/?redirect=https://evil.example', 'https://ride.lyft.com/?client_secret=secret',
    'https://waymo.smart.link/unverified', 'https://maps.apple.com/#javascript:alert(1)', 'https://m.uber.com/\n',
    'https://ride.lyft.com/?pickup[latitude]=999']) assert.throws(() => validate(url), /No valid/);
  assert.throws(() => validate('https://ride.lyft.com/', 'UBER'), /No valid/);
  const fallback = ride({ id: 'lyft', provider: 'LYFT', available: true, bookingUrl: 'https://evil.example/ride' });
  assert.equal(fallback.url, 'https://ride.lyft.com/');
});
test('nested Uber prefill rejects secret payloads and malformed coordinates', () => {
  for (const point of [{ latitude: 25, longitude: -80, client_secret: 'secret' }, { latitude: '25', longitude: -80 }, { latitude: 25, longitude: 181 }, { latitude: 25, longitude: -80, addressLine1: { nested: 'secret' } }]) {
    const url = new URL('https://m.uber.com/looking'); url.searchParams.set('pickup', JSON.stringify(point));
    assert.throws(() => validate(url.toString()), /No valid/);
  }
});
test('navigation point metadata rejects nested objects and ignores unrelated credential fields', () => {
  const { toNavigationPoint } = require('../src/lib/navigationHandoff.ts');
  for (const source of [null, undefined, 'location']) assert.throws(() => toNavigationPoint(source), /valid resolved coordinates/);
  assert.throws(() => toNavigationPoint({ ...point, label: { secret: 'sentinel' } }), /metadata must be text/);
  assert.deepEqual(toNavigationPoint({ ...point, apiKey: 'sentinel', supabaseServiceRole: 'sentinel', geminiKey: 'sentinel' }), point);
});
