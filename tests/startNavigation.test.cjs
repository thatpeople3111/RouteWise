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
const { prepareNormalRouteNavigation: prepare, canStartRoute } = require('../src/lib/startNavigation.ts');
const RouteStart = require('../src/components/RouteStart.tsx').default;
const RouteResults = require('../src/components/RouteResults.tsx').default;
const RouteCard = require('../src/components/RouteCard.tsx').default;
const TransitTabs = require('../src/components/TransitTabs.tsx').default;
const StrandedResults = require('../src/components/StrandedResults.tsx').default;
const origin = { latitude: 25.76, longitude: -80.2 };
const destination = { latitude: 25.85, longitude: -80.3 };
const route = (mode, id = mode) => ({ id, mode, label: mode, durationMinutes: 20, distanceMeters: 5000, walkingMinutes: 4,
  cost: { amount: null, currency: 'USD', complete: false, note: '' }, steps: [], warnings: [], destination: null,
  constraints: { budget: 'unknown', walking: 'met', eligible: true } });
const input = mode => ({ route: route(mode), origin, destination });
const markup = (component, props) => renderToStaticMarkup(React.createElement(component, props));

for (const mode of ['DRIVE', 'WALK', 'TRANSIT']) test(`normal ${mode} Start builds the selected handoff`, () => {
  const result = prepare(input(mode), 'ANDROID');
  assert.equal(result.request.routeId, mode);
  assert.equal(result.request.context, 'NORMAL');
  assert.deepEqual(result.request.origin, origin);
  assert.deepEqual(result.request.destination, destination);
  assert.match(markup(RouteStart, input(mode)), />Start<\/button>/);
});
for (const [platform, host] of [['ANDROID', 'www.google.com'], ['IOS', 'maps.apple.com'], ['IPADOS', 'maps.apple.com'], ['DESKTOP', 'www.google.com'], ['UNKNOWN', 'www.google.com']]) {
  test(`${platform} chooses ${host}`, () => assert.equal(new URL(prepare(input('TRANSIT'), platform).url).hostname, host));
}
test('secondary and restricted routes have Start, system failures and Stranded cards do not', () => {
  const routes = [route('DRIVE'), route('WALK'), { ...route('TRANSIT'), availability: { available: false, reasonCode: 'BUDGET_EXCEEDED' } },
    { ...route('WALK', 'failure'), availability: { available: false, reasonCode: 'NO_ROUTE' } }];
  const plan = { routes, best: 'DRIVE', fastest: null, cheapest: null, dataMode: 'live', warnings: [], recommendation: { source: 'rules', reason: '' } };
  const html = markup(RouteResults, { plan, origin, destination, onEditTrip() {} });
  assert.equal((html.match(/>Start<\/button>/g) ?? []).length, 3);
  assert.match(html, /Show non-recommended routes/);
  assert.equal(canStartRoute(routes[3]), false);
  assert.throws(() => prepare({ ...input('WALK'), route: routes[3] }, 'ANDROID'), /unavailable/);
  assert.doesNotMatch(markup(RouteCard, { route: route('DRIVE'), origin, destination, variant: 'stranded' }), />Start<\/button>/);
});
test('retained place metadata, included optional stop and parking reach provider builders', () => {
  const candidate = { coordinates: { latitude: 25.77, longitude: -80.21 }, placeId: 'cafe', name: 'Cafe', address: 'Main St' };
  const parking = { ...candidate, placeId: 'parking', recommended: true };
  const data = { ...input('DRIVE'), origin: { coordinates: origin, placeId: 'origin', name: 'Origin', formattedAddress: 'Start St' },
    selectedStop: { timing: 'ON_ROUTE', candidate }, route: { ...route('DRIVE'), includesStop: true, parking: { locations: [parking] } } };
  const result = prepare(data, 'IOS');
  assert.equal(result.request.origin.placeId, 'origin');
  assert.deepEqual(result.request.orderedStops.map(stop => stop.kind), ['OPTIONAL_STOP', 'PARKING']);
  assert.equal(result.continuation.destination.latitude, destination.latitude);
  assert.equal(prepare({ ...data, route: route('WALK') }, 'ANDROID').request.orderedStops.length, 0);
});
test('Start detects runtime platform and navigates synchronously; missing endpoints show error', () => {
  const originalState = React.useState;
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const opened = []; let error = '';
  React.useState = initial => initial === null ? [null, () => {}] : [error, value => { error = value; }];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: (url, target, features) => {
    assert.equal(target, '_blank'); assert.equal(features, 'noopener,noreferrer'); opened.push(url);
  } } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'iPhone', platform: 'iPhone' } });
  try {
    RouteStart(input('WALK')).props.children[0].props.onClick();
    assert.equal(new URL(opened[0]).hostname, 'maps.apple.com');
    RouteStart({ route: route('WALK'), tripOrigin: { placeId: 'unresolved' }, tripDestination: destination }).props.children[0].props.onClick();
    assert.match(error, /coordinates are unavailable/);
    assert.equal(opened.length, 1);
  } finally {
    React.useState = originalState;
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor); else delete globalThis.window;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
  }
});
test('transit Start follows selected alternative ID and availability', () => {
  const originalState = React.useState;
  const alternatives = ['first', 'second'].map(id => ({ id, title: id, durationMinutes: 20, distanceMeters: 5000, walkingMinutes: 2, steps: [], warnings: [], transfers: 0, estimatedTransportationCost: null }));
  React.useState = () => ['second', () => {}];
  try {
    const tree = TransitTabs({ route: { ...route('TRANSIT'), transitAlternatives: alternatives }, origin, destination, navigation: { origin, destination } });
    const start = tree.props.children.find(child => child?.type === RouteStart);
    assert.equal(start.props.route.id, 'second');
    assert.equal(prepare(start.props, 'ANDROID').request.routeId, 'second');
  } finally { React.useState = originalState; }
});

test('normal multiple stops retain exact selections before parking and walking destination', () => {
  const selected = [0, 1, 2, 3].map(index => ({ coordinates: { latitude: 25.77 + index / 100, longitude: -80.21 }, placeId: `selected-${index}`, name: `Selected ${index}`, address: 'Main St' }));
  const parking = { coordinates: { latitude: 25.84, longitude: -80.29 }, placeId: 'lot', name: 'Lot', recommended: true };
  const data = { ...input('DRIVE'), optionalStops: selected, route: { ...route('DRIVE'), includesStop: true, parking: { locations: [parking] } } };
  const before = JSON.stringify(data);
  const mobile = prepare(data, 'ANDROID');
  assert.deepEqual(mobile.request.orderedStops.map(point => point.placeId), ['selected-0', 'selected-1', 'selected-2', 'selected-3', 'lot']);
  assert.deepEqual(mobile.includedStops.map(point => point.placeId), ['selected-0', 'selected-1', 'selected-2']);
  assert.deepEqual(mobile.omittedStops.map(point => point.placeId), ['selected-3']);
  assert.equal(new URL(mobile.url).searchParams.get('destination_place_id'), 'lot');
  assert.deepEqual(mobile.request.parkingContinuation, mobile.continuation);
  const desktop = prepare(data, 'DESKTOP');
  assert.equal(desktop.omittedStops.length, 0);
  assert.equal(desktop.includedStops.length, 4);
  const apple = prepare(data, 'IOS');
  assert.equal(apple.omittedStops.length, 4);
  assert.deepEqual(apple.continuation.destination, destination);
  assert.equal(JSON.stringify(data), before);
});

test('Start shows omission message only when needed and keeps walking continuation actionable', () => {
  const savedState = React.useState;
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let slots = [], cursor = 0; const opened = [];
  React.useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = value; }];
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: url => opened.push(url) } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Android' } });
  const candidate = { coordinates: { latitude: 25.77, longitude: -80.21 }, placeId: 'cafe', name: 'Exact Cafe' };
  const parking = { ...candidate, coordinates: { latitude: 25.84, longitude: -80.29 }, name: 'Exact Lot', recommended: true };
  let data = input('DRIVE');
  const tree = () => { cursor = 0; return RouteStart(data); };
  const html = () => renderToStaticMarkup(tree());
  const message = /Some RouteWise stops could not be preloaded/;
  try {
    tree().props.children[0].props.onClick();
    assert.doesNotMatch(html(), message);
    slots = [];
    data = { ...input('DRIVE'), optionalStops: [candidate], route: { ...route('DRIVE'), includesStop: true, parking: { locations: [parking] } } };
    tree().props.children[0].props.onClick();
    assert.doesNotMatch(html(), message);
    assert.match(html(), /Drive to Exact Lot, then walk to/);
    const findButton = node => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'button' && node.props.children === 'Walking directions from parking') return node;
      const children = node.props?.children;
      return (Array.isArray(children) ? children.flat(Infinity) : [children]).map(findButton).find(Boolean);
    };
    findButton(tree()).props.onClick();
    const walking = new URL(opened.at(-1)).searchParams;
    assert.equal(walking.get('travelmode'), 'walking');
    assert.equal(walking.get('origin'), '25.84,-80.29');
    assert.equal(walking.get('destination'), '25.85,-80.3');
    assert.match(html(), /Exact Cafe → Exact Lot/);
    assert.match(html(), /Walking directions from parking/);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'iPhone' } });
    slots = [];
    tree().props.children[0].props.onClick();
    assert.match(html(), message);
    assert.match(html(), /Exact Cafe → Exact Lot/);
  } finally {
    React.useState = savedState;
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow); else delete globalThis.window;
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator); else delete globalThis.navigator;
  }
});

for (const platform of ['ANDROID', 'IOS']) {
  for (const [field, kind] of [['departureTime', 'DEPARTURE'], ['arrivalTime', 'ARRIVAL']]) {
    test(`${platform} transit retains requested ${kind} without unsupported URL parameters`, () => {
      const time = '2026-10-15T09:30:00-04:00';
      const steps = [
        { mode: 'WALK', instruction: 'Walk to station', durationMinutes: 4 },
        { mode: 'TRANSIT', transit: { line: 'Metrobus 11' } },
        { mode: 'TRANSIT', transit: { line: 'Metrorail Orange Line' } },
        { mode: 'TRANSIT', transit: { line: 'Metromover' } },
        { mode: 'WALK', instruction: 'Walk to destination', durationMinutes: 3 },
      ];
      const data = { ...input('TRANSIT'), [field]: time, route: { ...route('TRANSIT'), steps } };
      const before = JSON.stringify(data);
      const result = prepare(data, platform);
      assert.deepEqual(result.request.requestedTiming, { kind, time });
      assert.deepEqual(result.transit, { exactJourneyPreloaded: false, requestedTimingPreloaded: false });
      const query = new URL(result.url).searchParams;
      assert.equal(query.get(platform === 'ANDROID' ? 'travelmode' : 'dirflg'), platform === 'ANDROID' ? 'transit' : 'r');
      assert.equal(query.get(platform === 'ANDROID' ? 'origin' : 'saddr'), '25.76,-80.2');
      assert.equal(query.get(platform === 'ANDROID' ? 'destination' : 'daddr'), '25.85,-80.3');
      assert.equal(query.has('departure_time'), false);
      assert.equal(query.has('arrival_time'), false);
      assert.doesNotMatch(result.url, /Metrobus|Metrorail|Metromover/);
      assert.equal(JSON.stringify(data), before);
      assert.ok(result.warnings.some(text => text.includes('recalculate')));
    });
  }
}
test('transit notice appears before Start while walking and driving keep their existing copy', () => {
  assert.match(markup(RouteStart, input('TRANSIT')), /may recalculate the exact transit combination/);
  assert.doesNotMatch(markup(RouteStart, input('WALK')), /may recalculate/);
  assert.doesNotMatch(markup(RouteStart, input('DRIVE')), /may recalculate/);
  assert.equal(prepare(input('TRANSIT'), 'ANDROID').request.requestedTiming, undefined);
  assert.throws(() => prepare({ ...input('TRANSIT'), departureTime: 'invalid' }, 'ANDROID'), /valid timestamp/);
  assert.throws(() => prepare({ ...input('TRANSIT'), departureTime: '2026-10-15T09:30:00Z', arrivalTime: '2026-10-15T10:30:00Z' }, 'IOS'), /either departure or arrival/);
});
test('requested arrival remains visible after transit handoff without replacing the plan', () => {
  const saved = React.useState;
  const data = { ...input('TRANSIT'), arrivalTime: '2026-10-15T10:30:00-04:00' };
  const result = prepare(data, 'IOS');
  let slot = 0;
  React.useState = () => [slot++ === 0 ? '' : result, () => {}];
  try {
    const html = renderToStaticMarkup(RouteStart(data));
    assert.match(html, /Requested arrival:/);
    assert.match(html, /Set this time in Maps; it could not be preloaded/);
    assert.equal(result.request.routeId, data.route.id);
  } finally { React.useState = saved; }
});

test('Stranded transit/walking Start preserves original destination across platforms and leaves rideshares unchanged', () => {
  const originalDestination = { coordinates: destination, placeId: 'original', name: 'Original destination', formattedAddress: '100 Main St' };
  const routes = [route('TRANSIT'), route('WALK'), route('DRIVE')];
  const ride = { id: 'uber', provider: 'UBER', available: true, origin: 'Origin', destination: 'Original destination', bookingUrl: 'https://existing-uber.example/ride' };
  const plan = { routes, rideshares: [ride], warnings: [], best: 'uber', fastest: null, cheapest: null };
  const before = JSON.stringify({ plan, originalDestination });
  const props = { plan, origin, destination: { placeId: 'original' }, navigation: { origin, destination: originalDestination },
    safePlaces: React.createElement('div', null, 'Safe Place inline unchanged') };
  const html = markup(StrandedResults, props);
  assert.equal((html.match(/>Start<\/button>/g) ?? []).length, 2);
  assert.match(html, /Open Uber/);
  assert.ok(html.indexOf('Open Uber') < html.indexOf('Safe Place inline unchanged'));
  assert.ok(html.indexOf('Safe Place inline unchanged') < html.indexOf('PUBLIC TRANSIT'));
  assert.doesNotMatch(html, /Start DRIVE route/);
  for (const mode of ['TRANSIT', 'WALK']) for (const platform of ['ANDROID', 'IOS', 'DESKTOP']) {
    const result = prepare({ route: route(mode), origin, destination: originalDestination, context: 'STRANDED' }, platform);
    assert.equal(result.request.context, 'STRANDED');
    assert.equal(result.request.destination.placeId, 'original');
    const query = new URL(result.url).searchParams;
    assert.equal(query.get(platform === 'IOS' ? 'daddr' : 'destination'), '25.85,-80.3');
  }
  assert.equal(JSON.stringify({ plan, originalDestination }), before);
});
test('Stranded missing original resolved destination never falls back to a route endpoint', () => {
  assert.throws(() => prepare({ route: { ...route('WALK'), destination: origin }, origin, tripDestination: { placeId: 'unresolved-original' }, context: 'STRANDED' }, 'ANDROID'), /original stranded destination/);
});
test('main Stranded cards resume from Safe Place/refreshed GPS while historical maps and trip stay unchanged', () => {
  const routes = [route('TRANSIT'), route('WALK'), { ...route('WALK', 'restricted'), availability: { available: false, reasonCode: 'BUDGET_EXCEEDED' } }];
  const plan = { routes, rideshares: [], warnings: [] };
  const original = { ...destination, label: 'Original destination' };
  const safe = { latitude: 25.77, longitude: -80.21, label: 'Safe Cafe' };
  const context = { originalDestination: original, firstLegOrigin: origin, activeSafePlace: safe, safePlaceLegStarted: true };
  const before = JSON.stringify({ plan, context });
  for (const refreshedPickup of [undefined, { latitude: 25.78, longitude: -80.22, label: 'Current position' }]) {
    const tree = StrandedResults({ plan, origin, destination, navigation: { origin, destination: original }, safePlaceContinuation: { ...context, refreshedPickup } });
    for (const section of tree.props.children[2]) {
      const card = section.props.children[1].props.children[0];
      assert.deepEqual(card.props.origin, origin); // historical map unchanged
      assert.deepEqual(card.props.destination, destination);
      const result = prepare({ route: card.props.route, ...card.props.navigation }, 'ANDROID');
      assert.equal(result.request.context, 'STRANDED_RESUME');
      assert.equal(result.request.origin.latitude, refreshedPickup?.latitude ?? safe.latitude);
      assert.deepEqual(result.request.destination, original);
    }
    const restricted = tree.props.children.find(child => child?.props?.routes === undefined ? false : child.props.routes.some(candidate => candidate.id === 'restricted'));
    assert.equal(restricted.props.navigation.origin.latitude, refreshedPickup?.latitude ?? safe.latitude);
  }
  assert.equal(JSON.stringify({ plan, context }), before);
});
