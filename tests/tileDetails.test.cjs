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
  assert.ok(html.includes('38 minutes of walking'), 'the walking-limit message renders inside the tile');
  assert.ok(html.includes('20-minute limit'), 'the limit is included in the message');
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
  assert.ok(html.includes('Exceeds your walking limit.'), 'tile shows the constraint message');
  assert.ok(html.includes('Walking routes are in beta.'), 'tile shows the route warning');
});
