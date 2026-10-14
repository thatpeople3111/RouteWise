/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner compiles TypeScript through a local CommonJS hook. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const compile = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const RouteResults = require('../src/components/RouteResults.tsx').default;
const { lookupTransitFare } = require('../src/server/services/transitFares.ts');
const { lookupParkingPrice } = require('../src/server/services/parkingPricing.ts');

function routeOption(id, mode, extra = {}) {
  return {
    id, mode, label: { DRIVE: 'Driving', TRANSIT: 'Public transit', WALK: 'Walking' }[mode],
    durationMinutes: 20, distanceMeters: 5000, walkingMinutes: mode === 'WALK' ? 20 : 2,
    includesStop: false, extraStopMinutes: null,
    cost: { amount: mode === 'WALK' ? 0 : 3, currency: 'USD', kind: 'provider_fare', complete: true, note: 'Transportation estimate.' },
    steps: [], encodedPolyline: 'abc', destination: null, mapsUrl: '', departureTime: null,
    arrivalTime: null, timing: 'estimated_now',
    constraints: { budget: 'met', walking: 'met', arrival: 'unknown', eligible: true },
    warnings: [], ...extra,
  };
}
const basePlan = {
  id: 'trip', generatedAt: new Date().toISOString(), dataMode: 'live',
  routes: [routeOption('drive-1', 'DRIVE')], best: 'drive-1', fastest: 'drive-1', cheapest: 'drive-1',
  rideshares: [], recommendation: { source: 'rules', reason: 'Ranked using route facts.' },
  nearby: [], groundedGuidance: null, warnings: [], attribution: '',
};
function renderResults(plan) {
  return renderToStaticMarkup(React.createElement(RouteResults, {
    plan, origin: { address: 'Origin' }, destination: { address: 'Destination' }, onEditTrip() {},
  }));
}

test('a constraint-violating route stays visible with its reason inside the tile', () => {
  const plan = { ...basePlan, routes: [routeOption('walk-1', 'WALK', {
    walkingMinutes: 38,
    availability: { available: false, reasonCode: 'WALKING_LIMIT_EXCEEDED', message: 'This trip requires about 38 minutes of walking, which exceeds your 20-minute limit.' },
  })] };
  const html = renderResults(plan);
  assert.ok(html.includes('Exceeds walking limit by 18 min'), 'the concise walking-limit message renders inside the tile');
  assert.ok(html.includes('Not recommended'), 'constraint exclusion is accurately labeled');
});

test('transit fare distinguishes official fare from unavailable', () => {
  const withFare = { ...basePlan, routes: [routeOption('transit-1', 'TRANSIT', { cost: { amount: 2.25, currency: 'USD', kind: 'provider_fare', complete: true, note: 'Fare: Miami-Dade Metrorail published base fare.' } })] };
  assert.ok(renderResults(withFare).includes('Fare: $2.25'));
  const noFare = { ...basePlan, routes: [routeOption('transit-1', 'TRANSIT', { cost: { amount: null, currency: 'USD', kind: 'unknown', complete: false, note: 'Fare unavailable.' } })] };
  const noFareHtml = renderResults(noFare);
  assert.ok(noFareHtml.includes('Fare unavailable'));
  assert.ok(!noFareHtml.includes('$0'), 'never shows $0 for an unknown fare');
});

test('transit fare config only returns maintained official fares and never invents one', () => {
  const miami = lookupTransitFare({ lines: ['Metrorail'], origin: { latitude: 25.77, longitude: -80.19 }, destination: null });
  assert.equal(miami.fareAvailable, true);
  assert.equal(miami.amount, 2.25);
  assert.equal(miami.source, 'agency_official');
  const unknown = lookupTransitFare({ lines: ['Some Unknown Agency'], origin: { latitude: 40.7, longitude: -74.0 }, destination: null });
  assert.equal(unknown.fareAvailable, false);
  const none = lookupTransitFare({ lines: [] });
  assert.equal(none.fareAvailable, false);
});

test('parking price config returns maintained official prices and never invents one', () => {
  const museum = lookupParkingPrice('Museum Garage');
  assert.equal(museum.priceAvailable, true);
  assert.equal(museum.amount, 10);
  const unknown = lookupParkingPrice('Random Downtown Lot');
  assert.equal(unknown.priceAvailable, false);
});

test('driving tile lists parking lots with prices and walk times and a recommended lot', () => {
  const plan = { ...basePlan, routes: [routeOption('drive-1', 'DRIVE', {
    parking: {
      status: 'available',
      locations: [
        { placeId: 'a', name: 'Museum Garage', address: '1 Museum Way', coordinates: { latitude: 25.77, longitude: -80.19 }, distanceMeters: 200, mapsUri: 'https://maps.example/a', openNow: null, priceAmount: 10, priceCurrency: 'USD', priceSource: 'official_config', walkingMinutes: 5, walkingDistanceMeters: 322, recommended: true },
        { placeId: 'b', name: 'City Lot 14', address: '14 City St', coordinates: { latitude: 25.772, longitude: -80.19 }, distanceMeters: 500, mapsUri: 'https://maps.example/b', openNow: null, priceAmount: null, priceCurrency: 'USD', priceSource: 'unavailable', walkingMinutes: 8, walkingDistanceMeters: 644 },
      ],
    },
    tolls: { status: 'estimated', prices: [{ amount: 3, currency: 'USD' }] },
  })] };
  const html = renderResults(plan);
  assert.ok(html.includes('Museum Garage'), 'first lot listed');
  assert.ok(html.includes('City Lot 14'), 'second lot listed');
  assert.ok(html.includes('Parking: $10.00'), 'known lot price shown');
  assert.ok(html.includes('Parking price unavailable'), 'unknown lot price labeled');
  assert.ok(html.includes('5 min walk'), 'walk time from lot shown');
  assert.ok(html.includes('Recommended'), 'recommended lot marked');
  // $3 base cost + $3 tolls + $10 recommended parking = $16.
  assert.ok(html.includes('Estimated total: $16.00'), 'driving total includes cost + tolls + recommended parking');
});

test('route-scoped warnings stay in the tile and do not duplicate at the bottom', () => {
  const plan = { ...basePlan, warnings: ['Routes excluded by constraints: WALKING_LIMIT.'], routes: [routeOption('walk-1', 'WALK', {
    availability: { available: false, reasonCode: 'WALKING_LIMIT_EXCEEDED', message: 'Exceeds your walking limit.' },
    warnings: ['Walking routes are in beta.'],
  })] };
  const html = renderResults(plan);
  // The route-scoped warning appears in the tile, and the bottom list drops route-scoped text.
  assert.ok(html.includes('Exceeds walking limit'), 'tile shows the constraint message');
  assert.ok(html.includes('Walking routes are in beta.'), 'tile shows the route warning');
  assert.ok(!html.includes('Routes excluded by constraints'), 'covered constraint summary is not repeated');
});

const { getShortConstraintMessage, getGlobalWarnings } = require('../src/lib/routeWarnings.ts');
const StrandedResults = require('../src/components/StrandedResults.tsx').default;

test('constraint display calculates excess, suppresses nonpositive values, and keeps unknown reasons', () => {
  const availability = { available: false, reasonCode: 'WALKING_LIMIT_EXCEEDED', message: 'This trip requires about 17 min of walking, which exceeds your 15-minute limit.' };
  assert.equal(getShortConstraintMessage(availability, { walkingMinutes: 17 }), 'Exceeds walking limit by 2 min');
  assert.equal(getShortConstraintMessage(availability, { walkingMinutes: 22 }), 'Exceeds walking limit by 7 min');
  assert.equal(getShortConstraintMessage(availability, { walkingMinutes: 15 }), null);
  assert.equal(getShortConstraintMessage(availability, { walkingMinutes: 14 }), null);
  assert.equal(getShortConstraintMessage(availability, { walkingMinutes: 15.2 }), 'Exceeds walking limit by less than 1 min');
  assert.equal(getShortConstraintMessage({ ...availability, available: true }, { walkingMinutes: 17 }), null);
  assert.equal(getShortConstraintMessage(availability, { walkingMinutes: null }), 'Exceeds walking limit');
  assert.equal(getShortConstraintMessage({ available: false, reasonCode: 'BUDGET_EXCEEDED', message: 'The estimated fare is $19.00, above your $15 trip budget.' }), 'Over budget by $4');
  assert.equal(getShortConstraintMessage({ available: false, reasonCode: 'EXTRA_TIME_EXCEEDED' }), 'Stop exceeds extra-time limit');
  assert.equal(getShortConstraintMessage({ available: false, reasonCode: 'OTHER', message: 'No service at selected time' }), 'No service at selected time');
});

test('each alternative owns its warning in both results views; global messages survive', () => {
  const alternative = (id, minutes) => ({
    id, title: 'Bus', durationMinutes: 45, distanceMeters: 5000, walkingMinutes: minutes,
    estimatedTransportationCost: null, steps: [{ mode: 'TRANSIT', instruction: '', durationMinutes: 20, distanceMeters: 1000, transit: { line: 'Metrobus', lineShortName: id, headsign: null, departureStop: 'A', arrivalStop: 'B', departureTime: null, arrivalTime: null, agencies: [], vehicleType: 'BUS' } }],
    transfers: 0, recommended: minutes < 15, warnings: [],
    availability: minutes > 15 ? { available: false, reasonCode: 'WALKING_LIMIT_EXCEEDED', message: `This option needs about ${minutes} minutes of walking, over your 15-minute limit.` } : undefined,
  });
  const alts = [alternative('8', 17), alternative('11', 22), alternative('24', 14)];
  const route = routeOption('transit', 'TRANSIT', { transitAlternatives: alts });
  const plan = { ...basePlan, routes: [route], best: 'transit', warnings: [alts[0].availability.message, alts[1].availability.message, 'Global transit provider outage notice'] };
  for (const Component of [RouteResults, StrandedResults]) {
    const html = renderToStaticMarkup(React.createElement(Component, { plan, origin: { address: 'O' }, destination: { address: 'D' }, onEditTrip() {} }));
    const buttons = html.match(/<button[^>]*role="tab"[\s\S]*?<\/button>/g);
    assert.equal(buttons.length, 2);
    assert.ok(buttons[0].includes('Not recommended') && buttons[0].includes('Exceeds walking limit by 2 min'));
    assert.ok(buttons[1].includes('Not recommended') && buttons[1].includes('Exceeds walking limit by 7 min'));
    assert.ok(html.includes('Show non-recommended routes'));
    assert.equal((html.match(/Exceeds walking limit by/g) ?? []).length, 2);
    assert.ok(!html.includes('This option needs') && !html.includes('transit-option-unavailable'));
    assert.ok(html.includes('Global transit provider outage notice'));
  }
  assert.deepEqual(getGlobalWarnings(plan), ['Global transit provider outage notice']);
});

const { partitionLocalRoutes, routeAvailabilityCategory } = require('../src/lib/routeAvailability.ts');
const RideshareOptions = require('../src/components/RideshareOptions.tsx').default;

test('local route partition uses codes only, hides failures and preserves real restricted routes', () => {
  const valid = routeOption('valid', 'TRANSIT');
  const walk = routeOption('walk-limit', 'WALK', { availability: { available: false, reasonCode: 'WALKING_LIMIT_EXCEEDED', message: 'Anything' } });
  const drive = routeOption('drive-budget', 'DRIVE', { availability: { available: false, reasonCode: 'BUDGET_EXCEEDED' } });
  const missing = routeOption('missing', 'TRANSIT', { availability: { available: false, reasonCode: 'NO_TRANSIT_ROUTE', message: 'walking limit' } });
  const routes = [valid, walk, drive, missing];
  const before = JSON.stringify(routes);
  const parts = partitionLocalRoutes(routes);
  assert.deepEqual(parts.available.map(r => r.id), ['valid']);
  assert.deepEqual(parts.restricted.map(r => r.id), ['walk-limit', 'drive-budget']);
  assert.equal(JSON.stringify(routes), before);
  assert.equal(routeAvailabilityCategory({ available: false, reasonCode: 'WALKING_UNVERIFIABLE' }), 'SYSTEM_UNAVAILABLE');
  const html = renderResults({ ...basePlan, routes, best: 'walk-limit', fastest: 'drive-budget', cheapest: 'missing' });
  assert.ok(!html.includes('route-card-missing-title'));
  assert.ok(!html.includes('>BEST<') && !html.includes('>FASTEST<') && !html.includes('>CHEAPEST<'));
  assert.match(html, /<details class="non-recommended-routes "><summary>Show non-recommended routes/);
  assert.ok(!html.includes('<details class="non-recommended-routes " open'));
  assert.ok(!renderResults({ ...basePlan, routes: [valid] }).includes('Show non-recommended routes'));
  assert.ok(!renderResults({ ...basePlan, routes: [missing] }).includes('Show non-recommended routes'));
});

test('unavailable Waymo stays visible last; available provider ordering is preserved', () => {
  const options = [
    { id: 'waymo', provider: 'WAYMO', available: false, origin: 'O', destination: 'D', unavailableReason: 'Unavailable for this trip', unavailableDetail: 'Outside the service area' },
    { id: 'uber', provider: 'UBER', available: false, origin: 'O', destination: 'D' },
    { id: 'lyft', provider: 'LYFT', available: false, origin: 'O', destination: 'D' },
  ];
  for (const variant of ['results', 'stranded']) {
    const html = renderToStaticMarkup(React.createElement(RideshareOptions, { options, variant }));
    assert.ok(html.indexOf('rideshare-option-uber') < html.indexOf('rideshare-option-lyft'));
    assert.ok(html.indexOf('rideshare-option-lyft') < html.indexOf('rideshare-option-waymo'));
    assert.ok(html.includes('Outside the service area'));
  }
  const available = { ...options[0], available: true };
  const html = renderToStaticMarkup(React.createElement(RideshareOptions, { options: [available, ...options.slice(1)] }));
  assert.ok(html.indexOf('rideshare-option-waymo') < html.indexOf('rideshare-option-uber'));
  assert.ok(!html.includes('rideshare-option-waymo is-unavailable'));
});

test('one secondary local route uses horizontal layout without counting restricted routes or rideshares', () => {
  const driving = routeOption('drive', 'DRIVE');
  const transit = routeOption('transit', 'TRANSIT');
  const walking = routeOption('walk', 'WALK', { availability: { available: false, reasonCode: 'WALKING_LIMIT_EXCEEDED' } });
  const plan = { ...basePlan, best: 'drive', routes: [driving, transit, walking] };
  const html = renderResults(plan);
  assert.equal((html.match(/horizontal-route-content/g) ?? []).length, 1);
  assert.ok(html.includes('Show non-recommended routes'));
  assert.ok(!renderResults({ ...plan, routes: [driving, transit, routeOption('walk', 'WALK')] }).includes('horizontal-route-content'));
  assert.ok(!renderResults({ ...plan, routes: [driving] }).includes('horizontal-route-content'));
  assert.equal((renderResults({ ...plan, best: 'transit', routes: [transit, routeOption('walk', 'WALK')] }).match(/horizontal-route-content/g) ?? []).length, 1);
});

test('current location label prefers source-provided places and addresses, keeping coordinate routing intact', async () => {
  const { chooseReverseGeocodeLabel, locationDisplayName, resolveCurrentLocationName } = require('../src/lib/currentLocation.ts');
  assert.equal(chooseReverseGeocodeLabel([{ types: ['street_address'], formatted_address: '11200 SW 8th St' }, { types: ['point_of_interest'], formatted_address: 'Campus address', address_components: [{ types: ['point_of_interest'], long_name: 'Florida International University' }] }]), 'Florida International University');
  assert.equal(chooseReverseGeocodeLabel([{ types: ['street_address'], formatted_address: '11200 SW 8th St' }]), '11200 SW 8th St');
  assert.equal(chooseReverseGeocodeLabel([]), 'Current location');
  const point = { latitude: 25.756123, longitude: -80.376281 };
  const before = JSON.stringify(point);
  assert.equal(locationDisplayName(point), 'Current location');
  assert.equal(locationDisplayName({ address: 'Selected campus' }), 'Selected campus');
  const saved = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  try { assert.equal(await resolveCurrentLocationName(point), 'Current location'); }
  finally { if (saved !== undefined) process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = saved; }
  assert.equal(JSON.stringify(point), before);
});

test('reverse-geocode success is cached and provider failure keeps current-location fallback', async () => {
  const loader = require('@googlemaps/js-api-loader');
  const { resolveCurrentLocationName, locationDisplayName } = require('../src/lib/currentLocation.ts');
  const savedImport = loader.importLibrary, savedOptions = loader.setOptions;
  const savedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  let calls = 0, fail = false;
  loader.setOptions = () => {};
  loader.importLibrary = async () => ({ Geocoder: class {
    async geocode(request) {
      calls++;
      assert.equal(request.location.lat, fail ? 40 : 41);
      if (fail) throw new Error('Provider failed');
      return { results: [{ types: ['street_address'], formatted_address: '123 Example Street' }] };
    }
  } });
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
  try {
    const point = { latitude: 41, longitude: -72 };
    assert.equal(await resolveCurrentLocationName(point), '123 Example Street');
    assert.equal(locationDisplayName(point), '123 Example Street');
    assert.equal(await resolveCurrentLocationName(point), '123 Example Street');
    assert.equal(calls, 1);
    assert.deepEqual(point, { latitude: 41, longitude: -72 });
    fail = true;
    assert.equal(await resolveCurrentLocationName({ latitude: 40, longitude: -73 }), 'Current location');
  } finally {
    loader.importLibrary = savedImport; loader.setOptions = savedOptions;
    if (savedKey === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    else process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = savedKey;
  }
});

test('nearby place selection requires a recognizable, close and unambiguous match', () => {
  const { selectBestNearbyPlace } = require('../src/lib/currentLocation.ts');
  const userCoordinates = { latitude: 25, longitude: -80 };
  const place = (name, meters, placeId = name, types = ['store']) => ({ name, placeId, types, coordinates: { latitude: 25 + meters / 111195, longitude: -80 } });
  const select = (candidates, accuracyMeters = 20) => selectBestNearbyPlace({ userCoordinates, accuracyMeters, candidates });
  assert.equal(select([place('Publix Super Market', 10)]).name, 'Publix Super Market');
  assert.equal(select([place('Florida International University', 9, 'fiu', ['university'])]).name, 'Florida International University');
  assert.equal(select([place('Target', 150)]), null);
  assert.equal(select([place('Store A', 10), place('Store B', 12)]), null);
  assert.equal(select([place('Store A', 10)], 150), null);
  assert.equal(select([place('Store A', 30)], 30), null);
  assert.equal(select([place('Unnamed Road', 1), place('Building 3', 2), place('United States', 1, 'us', ['country'])]), null);
  assert.equal(select([]), null);
  assert.equal(select([place('Store A', 10)], NaN), null);
});

test('nearby Places lookup takes priority, falls back on failure and keys cache by accuracy', async () => {
  const loader = require('@googlemaps/js-api-loader');
  const { resolveCurrentLocationName } = require('../src/lib/currentLocation.ts');
  const savedImport = loader.importLibrary, savedOptions = loader.setOptions, savedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  let failPlaces = false, failGeocode = false, nearbyCalls = 0, geocodeCalls = 0;
  loader.setOptions = () => {};
  loader.importLibrary = async library => library === 'places' ? {
    SearchNearbyRankPreference: { DISTANCE: 'DISTANCE' },
    Place: { async searchNearby(request) {
      nearbyCalls++;
      assert.equal(request.locationRestriction.radius, 50);
      if (failPlaces) throw new Error('Places unavailable');
      return { places: [{ id: 'pub', displayName: 'Publix Super Market', types: ['grocery_store'], location: { lat: () => 26.00005, lng: () => -80 } }] };
    } },
  } : { Geocoder: class { async geocode() {
    geocodeCalls++;
    if (failGeocode) throw new Error('Geocoding unavailable');
    return { results: [{ types: ['street_address'], formatted_address: '123 Residential Street' }] };
  } } };
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
  try {
    const point = { latitude: 26, longitude: -80 };
    assert.equal(await resolveCurrentLocationName(point, 20), 'Publix Super Market');
    assert.equal(await resolveCurrentLocationName(point, 20), 'Publix Super Market');
    assert.equal(nearbyCalls, 1); assert.equal(geocodeCalls, 0);
    assert.equal(await resolveCurrentLocationName(point, 150), '123 Residential Street');
    assert.equal(nearbyCalls, 1);
    failPlaces = true;
    assert.equal(await resolveCurrentLocationName({ latitude: 27, longitude: -80 }, 20), '123 Residential Street');
    failGeocode = true;
    assert.equal(await resolveCurrentLocationName({ latitude: 28, longitude: -80 }, 20), 'Current location');
    assert.deepEqual(point, { latitude: 26, longitude: -80 });
  } finally {
    loader.importLibrary = savedImport; loader.setOptions = savedOptions;
    if (savedKey === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    else process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = savedKey;
  }
});

const { preferredModePresentation } = require('../src/lib/preferredModePresentation.ts');
test('soft mode bias promotes comparable transit/driving/walking alternatives without rewriting ranks', () => {
  for (const [preference, mode] of [['PUBLIC_TRANSIT', 'TRANSIT'], ['DRIVING', 'DRIVE'], ['WALKING', 'WALK']]) {
    const bestMode = mode === 'DRIVE' ? 'TRANSIT' : 'DRIVE';
    const routes = [routeOption('best', bestMode), routeOption('other', bestMode), routeOption('preferred', mode, { durationMinutes: 23 })];
    const plan = { ...basePlan, routes, best: 'best', fastest: 'other', cheapest: 'other' };
    const before = JSON.stringify(plan);
    assert.equal(preferredModePresentation(plan, routes, preference).preferredRouteId, 'preferred');
    const html = renderToStaticMarkup(React.createElement(RouteResults, { plan, preferredTransportMode: preference, origin: { address: 'O' }, destination: { address: 'D' }, onEditTrip() {} }));
    assert.ok(html.indexOf('route-card-best-title') < html.indexOf('route-card-preferred-title'));
    assert.ok(html.indexOf('route-card-preferred-title') < html.indexOf('route-card-other-title'));
    assert.ok(html.includes('comparable alternatives'));
    assert.equal(JSON.stringify(plan), before);
  }
});

test('unavailable, constrained and clearly inferior preferred modes never receive a presentation promotion', () => {
  const best = routeOption('best', 'DRIVE');
  for (const preferred of [
    routeOption('preferred', 'TRANSIT', { availability: { available: false, reasonCode: 'NO_TRANSIT_ROUTE' } }),
    routeOption('preferred', 'TRANSIT', { availability: { available: false, reasonCode: 'WALKING_LIMIT_EXCEEDED' } }),
    routeOption('preferred', 'TRANSIT', { constraints: { budget: 'exceeded', walking: 'met', arrival: 'unknown', eligible: true } }),
    routeOption('preferred', 'TRANSIT', { durationMinutes: 120 }),
    routeOption('preferred', 'TRANSIT', { cost: { amount: 50, currency: 'USD', complete: true } }),
  ]) {
    const plan = { ...basePlan, routes: [best, preferred], best: 'best' };
    assert.equal(preferredModePresentation(plan, plan.routes, 'PUBLIC_TRANSIT').preferredRouteId, null);
  }
  const restricted = routeOption('preferred', 'TRANSIT', { availability: { available: false, reasonCode: 'BUDGET_EXCEEDED', message: 'Over budget' } });
  const html = renderToStaticMarkup(React.createElement(RouteResults, { plan: { ...basePlan, routes: [best, restricted], best: 'best' }, preferredTransportMode: 'PUBLIC_TRANSIT', origin: { address: 'O' }, destination: { address: 'D' }, onEditTrip() {} }));
  assert.ok(html.includes('Show non-recommended routes')); assert.ok(!html.includes('comparable alternatives'));
});

test('rideshare soft bias moves the section without changing availability or Waymo order; guest order stays unchanged', () => {
  const routes = [routeOption('best', 'DRIVE'), routeOption('walk', 'WALK')];
  const rideshares = [
    { id: 'uber', provider: 'UBER', available: true, origin: 'O', destination: 'D', estimatedTotalMinutes: 18 },
    { id: 'lyft', provider: 'LYFT', available: true, origin: 'O', destination: 'D', estimatedTotalMinutes: 22 },
    { id: 'waymo', provider: 'WAYMO', available: false, origin: 'O', destination: 'D' },
  ];
  const plan = { ...basePlan, routes, rideshares, best: 'best', fastest: 'uber' };
  const render = preferredTransportMode => renderToStaticMarkup(React.createElement(RouteResults, { plan, preferredTransportMode, origin: { address: 'O' }, destination: { address: 'D' }, onEditTrip() {} }));
  const guest = render(undefined), preferred = render('RIDESHARE');
  assert.ok(guest.indexOf('other-routes-heading') < guest.indexOf('rideshare-options-heading'));
  assert.ok(preferred.indexOf('best-route-heading') < preferred.indexOf('rideshare-options-heading'));
  assert.ok(preferred.indexOf('rideshare-options-heading') < preferred.indexOf('other-routes-heading'));
  assert.equal((preferred.match(/id="rideshare-options-heading"/g) ?? []).length, 1);
  assert.ok(preferred.indexOf('rideshare-option-lyft') < preferred.indexOf('rideshare-option-waymo'));
  assert.equal(preferredModePresentation({ ...plan, rideshares: rideshares.map(ride => ({ ...ride, available: false })) }, routes, 'RIDESHARE').promoteRideshare, false);
  assert.deepEqual(preferredModePresentation(plan, routes), { routeMode: null, preferredRouteId: null, promoteRideshare: false });
});
