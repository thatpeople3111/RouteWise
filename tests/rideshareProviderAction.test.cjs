/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args); };
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { prepareRideshareProviderAction: prepare, hasRideshareProviderAction: hasAction } = require('../src/lib/rideshareProviderAction.ts');
const Card = require('../src/components/RideshareCard.tsx').default;
const Options = require('../src/components/RideshareOptions.tsx').default;
const Action = require('../src/components/RideshareProviderAction.tsx').default;
const option = provider => ({ id: provider, provider, available: true, origin: 'Origin', destination: 'Destination', estimatedPriceLow: 10, estimatedPriceHigh: 20, priceSource: 'estimate', bookingUrl: provider === 'WAYMO' ? 'https://waymo.com/waymo-one/' : provider === 'UBER' ? 'https://m.uber.com/ul/' : 'https://ride.lyft.com/?id=lyft' });
const endpoints = { pickup: { latitude: 25.76, longitude: -80.2, label: 'Selected pickup' }, dropoff: { latitude: 25.85, longitude: -80.3, label: 'Home' } };
const html = (component, props) => renderToStaticMarkup(React.createElement(component, props));
test('normal Uber cards use provider action with retained pickup and dropoff', () => {
  const data = option('UBER');
  const result = prepare(data, endpoints, 'results', 'ANDROID');
  const query = new URL(result.url).searchParams;
  assert.deepEqual(JSON.parse(query.get('pickup')), { latitude: 25.76, longitude: -80.2, addressLine1: 'Selected pickup' });
  assert.equal(JSON.parse(query.get('drop[0]')).addressLine1, 'Home');
  const markup = html(Card, { option: data, endpoints, labels: ['BEST'] });
  assert.match(markup, /Open Uber/); assert.match(markup, /BEST/); assert.match(markup, /Estimated fare/);
  assert.doesNotMatch(markup, />Start</);
});
test('normal Waymo retains supported provider URL and does not claim endpoint prefill', () => {
  const result = prepare(option('WAYMO'), endpoints, 'results', 'IOS');
  assert.equal(result.url, 'https://waymo.com/waymo-one/');
  assert.match(result.notice, /cannot preload/);
  assert.match(html(Card, { option: option('WAYMO'), endpoints }), /Open Waymo/);
});
test('unavailable Waymo stays visible last with existing class and no provider action', () => {
  const waymo = { ...option('WAYMO'), available: false, unavailableReason: 'Outside service area' };
  const markup = html(Options, { options: [waymo, option('UBER'), option('LYFT')], endpoints });
  assert.ok(markup.indexOf('rideshare-option-lyft') < markup.indexOf('rideshare-option-waymo'));
  assert.match(markup, /rideshare-option-waymo is-unavailable/);
  assert.doesNotMatch(markup, /Open Waymo|>Start</);
  assert.equal(hasAction(waymo), false);
  assert.throws(() => prepare(waymo, endpoints), /unavailable/);
});
test('Stranded actions use the same legacy links despite available resolved endpoints', () => {
  for (const provider of ['UBER', 'WAYMO', 'LYFT']) {
    const data = option(provider);
    assert.equal(prepare(data, endpoints, 'stranded', 'IOS').url, data.bookingUrl);
    assert.doesNotMatch(html(Card, { option: data, endpoints, variant: 'stranded' }), />Start</);
  }
});
test('Lyft preserves fare URL precedence and remains an extensible legacy provider', () => {
  const data = { ...option('LYFT'), fare: { bookingUrl: 'https://ride.lyft.com/?id=lyft&destination[address]=Home' } };
  assert.equal(prepare(data, endpoints, 'results', 'ANDROID').url, data.fare.bookingUrl);
});
test('desktop and mobile select Uber web/universal links with identical endpoints', () => {
  assert.equal(new URL(prepare(option('UBER'), endpoints, 'results', 'DESKTOP').url).pathname, '/');
  for (const platform of ['ANDROID', 'IOS', 'IPADOS']) assert.equal(new URL(prepare(option('UBER'), endpoints, 'results', platform).url).pathname, '/looking');
});
test('unresolved endpoints gracefully open provider landing without GPS replacement', () => {
  const result = prepare(option('UBER'), { pickup: { placeId: 'unresolved' }, dropoff: endpoints.dropoff }, 'results', 'DESKTOP');
  assert.equal(result.url, 'https://m.uber.com/');
  assert.match(result.notice, /resolved locations are unavailable/);
  assert.equal(prepare(option('WAYMO'), undefined).url, 'https://waymo.com/waymo-one/');
});
test('shared component opens synchronously on runtime mobile detection and never emits Start', () => {
  const state = React.useState;
  const win = Object.getOwnPropertyDescriptor(globalThis, 'window'), nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const opened = [];
  React.useState = () => ['', () => {}];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: (url, target, features) => { assert.equal(target, '_blank'); assert.equal(features, 'noopener,noreferrer'); opened.push(url); } } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Android' } });
  try {
    const tree = Action({ option: option('UBER'), endpoints, label: 'Open Uber' });
    tree.props.children[0].props.onClick();
    assert.equal(new URL(opened[0]).pathname, '/looking');
    assert.equal(tree.props.children[0].props.children, 'Open Uber');
  } finally {
    React.useState = state;
    if (win) Object.defineProperty(globalThis, 'window', win); else delete globalThis.window;
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
  }
});

test('Safe Place Uber pickup and original dropoff replace old booking endpoints', () => {
  const { safePlaceRideEndpoints, safePlaceRideshareOptions } = require('../src/lib/safePlaceHandoff.ts');
  const context = { firstLegOrigin: { latitude: 0, longitude: 0 }, originalDestination: endpoints.dropoff,
    activeSafePlace: { latitude: 25.77, longitude: -80.21, label: 'Exact Safe Cafe' }, safePlaceLegStarted: true };
  const before = JSON.stringify(context);
  for (const refreshedPickup of [undefined, { latitude: 25.78, longitude: -80.22, label: 'Readable current place' }]) {
    const rideEndpoints = safePlaceRideEndpoints({ ...context, refreshedPickup });
    const result = prepare(option('UBER'), rideEndpoints, 'stranded', 'ANDROID');
    const params = new URL(result.url).searchParams;
    const pickup = JSON.parse(params.get('pickup')), dropoff = JSON.parse(params.get('drop[0]'));
    assert.equal(pickup.latitude, refreshedPickup?.latitude ?? context.activeSafePlace.latitude);
    assert.equal(pickup.addressLine1, refreshedPickup?.label ?? 'Exact Safe Cafe');
    assert.equal(dropoff.latitude, context.originalDestination.latitude);
    assert.notEqual(pickup.latitude, context.firstLegOrigin.latitude);
    const lyft = new URL(prepare(option('LYFT'), rideEndpoints, 'stranded', 'IOS').url).searchParams;
    assert.equal(lyft.get('pickup[latitude]'), String(pickup.latitude));
    const waymo = prepare(option('WAYMO'), rideEndpoints, 'stranded', 'IOS');
    assert.equal(waymo.url, 'https://waymo.com/waymo-one/');
    assert.match(waymo.notice, /cannot preload/);
  }
  const outside = { ...context, activeSafePlace: { latitude: 0, longitude: 0, label: 'Outside' } };
  const checked = safePlaceRideshareOptions(outside, [option('UBER'), option('WAYMO')]);
  assert.equal(checked[1].available, false);
  assert.equal(hasAction(checked[1], 'stranded', safePlaceRideEndpoints(outside)), false);
  assert.equal(checked[0].available, true);
  assert.equal(JSON.stringify(context), before);
});
