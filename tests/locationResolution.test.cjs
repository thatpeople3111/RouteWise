/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { resolveUserLocationQuery, splitLocationQuery, resolveTripLocations } = require('../src/server/services/locationResolution.ts');
const { searchPlaces } = require('../src/server/services/places.ts');
const { stopCategoryConfig } = require('../src/server/services/stopCategoryConfig.ts');
const { filterStopCandidates } = require('../src/server/services/stopFiltering.ts');
const { DEFAULT_TRIP_DRAFT, draftToTripRequest } = require('../src/lib/tripDraft.ts');
const reference = { latitude: 25.756, longitude: -80.374 };
const wirePlace = (id, name, coordinates = reference, types) => ({ id, displayName: { text: name }, location: coordinates, formattedAddress: id + ' Main St', ...(types ? { types } : {}) });
const response = places => new Response(JSON.stringify({ places }));

test('relative queries search businesses separately and never select the reference landmark', async () => {
  for (const query of ['Publix across from FIU', 'Starbucks near Brickell', 'CVS next to the airport', 'Walgreens close to campus']) {
    const parsed = splitLocationQuery(query), calls = [];
    const result = await resolveUserLocationQuery({ query, tripOrigin: reference }, { apiKey: 'test', fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body); calls.push(body);
      return response(body.textQuery === parsed.reference ? [wirePlace('reference', parsed.reference)] : [
        wirePlace('landmark', parsed.reference), wirePlace('far', parsed.searchTerm, { latitude: 25.78, longitude: -80.374 }),
        wirePlace('near', parsed.searchTerm, { latitude: 25.757, longitude: -80.374 }),
      ]);
    } });
    assert.equal(result.place.placeId, 'near');
    assert.equal(calls[1].textQuery, parsed.searchTerm);
    assert.deepEqual(calls[1].locationBias.circle.center, reference);
  }
});

test('unqualified businesses use origin bias; equally close alternatives require selection', async () => {
  const options = { apiKey: 'test', fetchImpl: async () => response([
    wirePlace('near', 'Publix'), wirePlace('far', 'Publix', { latitude: 25.78, longitude: -80.374 }),
  ]) };
  assert.equal((await resolveUserLocationQuery({ query: 'Publix', tripOrigin: reference }, options)).place.placeId, 'near');
  const ambiguous = await resolveUserLocationQuery({ query: 'Publix', tripOrigin: reference }, { ...options, fetchImpl: async () => response([
    wirePlace('one', 'Publix'), wirePlace('two', 'Publix', { latitude: 25.757, longitude: -80.374 }),
  ]) });
  assert.equal(ambiguous.resolved, false); assert.equal(ambiguous.alternatives.length, 2);
});

test('selected IDs and metadata remain in the draft and skip re-resolution', async () => {
  const selected = { placeId: 'exact-selected-id', name: 'Chosen store', formattedAddress: '42 Main St', coordinates: reference };
  const result = await resolveUserLocationQuery({ query: 'Different text', selectedPlace: selected }, { fetchImpl: async () => { throw Error('must not fetch'); } });
  assert.equal(result.place, selected);
  const request = draftToTripRequest({ ...DEFAULT_TRIP_DRAFT, departureNow: true, originPlace: selected, destinationPlace: { ...selected, placeId: 'exact-destination-id' } });
  assert.deepEqual(request.origin, { placeId: selected.placeId });
  assert.deepEqual(request.destination, { placeId: 'exact-destination-id' });
  assert.deepEqual(await resolveTripLocations(request), request);
});

function encode(points) {
  let text = '', lat = 0, lng = 0;
  for (const point of points) {
    const nextLat = Math.round(point.latitude * 1e5), nextLng = Math.round(point.longitude * 1e5);
    for (const delta of [nextLat - lat, nextLng - lng]) {
      let value = delta < 0 ? ~(delta << 1) : delta << 1;
      while (value >= 32) { text += String.fromCharCode((value & 31 | 32) + 63); value >>= 5; }
      text += String.fromCharCode(value + 63);
    }
    lat = nextLat; lng = nextLng;
  }
  return text;
}

test('all stop categories broaden along diverse routes and retain missing optional metadata', async () => {
  for (const base of [{ latitude: 25.76, longitude: -80.37 }, { latitude: 27.95, longitude: -82.46 }, { latitude: 33.75, longitude: -84.39 }, { latitude: 28.5, longitude: -81.38 }]) {
    for (const [category, config] of Object.entries(stopCategoryConfig)) {
      const calls = [];
      const places = await searchPlaces({ category, searchArea: 'ON_ROUTE', routePolyline: encode([base, { ...base, longitude: base.longitude + 0.08 }]) }, { apiKey: 'test', fetchImpl: async (url, init) => {
        const body = JSON.parse(init.body); calls.push(body);
        if (url.endsWith('searchNearby')) return response([]);
        const center = body.locationBias.circle.center;
        return response([wirePlace('place-' + center.longitude, config.textQuery, center, [config.type]), wirePlace('wrong-category', 'Landmark', center, ['school'])]);
      } });
      assert.ok(places.length >= 4, category);
      assert.ok(calls.some(call => call.textQuery === config.textQuery));
      assert.ok(places.every(place => place.coordinates && place.rating === null && place.priceLevel === null && place.openNow === null));
      assert.equal(new Set(places.map(place => place.placeId)).size, places.length);
      assert.ok(Math.max(...places.map(place => place.coordinates.longitude)) - Math.min(...places.map(place => place.coordinates.longitude)) > 0.02);
    }
  }
});

test('broader candidates still respect hard time limits; individual route failures do not abort valid stops', async () => {
  const candidates = ['good', 'detour', 'failed'].map(placeId => ({ placeId, name: placeId, category: 'gas', coordinates: reference, address: null, rating: null, priceLevel: null, openNow: null, businessStatus: null, mapsUri: null }));
  const route = seconds => ({ travelMode: 'DRIVE', durationSeconds: seconds, steps: [{ travelMode: 'DRIVE', durationSeconds: seconds }] });
  const result = await filterStopCandidates({}, candidates, { maxExtraMinutes: 5, maxWalkingMinutes: 10 }, { getOriginalRoutes: async () => [route(600)], getRoutesViaStop: async (_trip, place) => {
    if (place.placeId === 'failed') throw Error('provider outage');
    return [route(place.placeId === 'good' ? 720 : 1800)];
  } });
  assert.deepEqual(result.accepted.map(place => place.placeId), ['good']);
  assert.equal(result.serviceFailures, 1);
  assert.ok(result.rejected.find(place => place.placeId === 'detour').rejectionReasons.includes('EXTRA_TIME_LIMIT'));
});

test('zero matches and provider failures remain distinct; partial searches preserve usable places', async () => {
  const input = { category: 'gas', searchArea: 'DESTINATION', destination: reference };
  assert.deepEqual(await searchPlaces(input, { apiKey: 'test', fetchImpl: async () => response([]) }), []);
  await assert.rejects(searchPlaces(input, { apiKey: 'test', fetchImpl: async () => { throw Error('outage'); } }), /Could not reach/);
  const found = await searchPlaces(input, { apiKey: 'test', fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.locationRestriction?.circle.radius === stopCategoryConfig.gas.radius) return response([wirePlace('gas', 'Fuel stop', reference, ['gas_station'])]);
    throw Error('expanded search outage');
  } });
  assert.equal(found[0].placeId, 'gas');
});

test('time and walking limits must be satisfied by the same route option', async () => {
  const candidate = { placeId: 's', name: 'Stop', category: 'gas', coordinates: reference };
  const route = (mode, seconds, walking) => ({ travelMode: mode, durationSeconds: seconds, steps: [{ travelMode: 'WALK', durationSeconds: walking * 60 }] });
  const result = await filterStopCandidates({}, [candidate], { maxExtraMinutes: 10, maxWalkingMinutes: 10 }, {
    getOriginalRoutes: async () => [route('DRIVE', 600, 0), route('TRANSIT', 600, 0)],
    getRoutesViaStop: async () => [route('DRIVE', 840, 20), route('TRANSIT', 1800, 4)],
  });
  assert.equal(result.accepted.length, 0);
  assert.ok(result.rejected[0].rejectionReasons.includes('WALKING_LIMIT'));
});

test('Trip Details resolves before continuing, retains exact choices, and discards stale searches after edits', async () => {
  const path = require('node:path'), Module = require('node:module');
  const oldResolve = Module._resolveFilename;
  Module._resolveFilename = function(request, ...args) {
    return oldResolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args);
  };
  require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  const React = require('react');
  const saved = { state: React.useState, ref: React.useRef, effect: React.useEffect };
  const api = require('../src/lib/api.ts'), savedSearch = api.resolveLocation;
  let slots = [], cursor = 0, continued = 0;
  let draft = { ...DEFAULT_TRIP_DRAFT, departureNow: true, originCoordinates: reference, destinationText: 'Publix across from FIU' };
  React.useState = initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; };
  React.useRef = initial => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; };
  React.useEffect = () => {};
  const Screen = require('../src/components/TripDetailsScreen.tsx').default;
  const place = { placeId: 'chosen-store', name: 'Publix', formattedAddress: '1525 SW 107th Ave', coordinates: reference };
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const tree = () => { cursor = 0; return nodes(Screen({ draft, onChange: patch => { draft = { ...draft, ...patch }; }, onBack() {}, onContinue() { continued++; } })); };
  const submit = () => tree().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  try {
    api.resolveLocation = async () => ({ place, alternatives: [], resolved: true, confidence: 'HIGH' });
    await submit();
    assert.equal(continued, 1);
    assert.deepEqual(draft.destinationPlace, place);
    api.resolveLocation = async () => { throw Error('selected places must not be resolved again'); };
    await submit(); assert.equal(continued, 2);
    const edit = value => tree().find(node => node.props?.['aria-label'] === 'Destination').props.onChange({ target: { value } });
    edit('New destination');
    let finish;
    api.resolveLocation = () => new Promise(resolve => { finish = () => resolve({ place, alternatives: [] }); });
    const pending = submit();
    edit('Different destination'); finish(); await pending;
    assert.equal(draft.destinationPlace, null); assert.equal(continued, 2);
    api.resolveLocation = async () => ({ place: null, alternatives: [place, { ...place, placeId: 'other-store' }] });
    await submit();
    assert.equal(continued, 2);
    const choice = tree().find(node => node.type === 'button' && node.key === 'chosen-store');
    choice.props.onClick();
    await submit(); assert.equal(continued, 3);
  } finally {
    React.useState = saved.state; React.useRef = saved.ref; React.useEffect = saved.effect;
    api.resolveLocation = savedSearch; Module._resolveFilename = oldResolve;
  }
});
