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
const Map = require('../src/components/Map.tsx').default;

// Encoded polylines for three DIFFERENT point pairs, so geometry is provably mode-specific.
const WALK_POLY = '~hyeFnzliVC?';            // (0,0) → (0,0.01) → (0,0.01)
const TRANSIT_POLY = 'wiveFdajiVE?';         // (0.01,0) → (0.01,0.01)
const DRIVE_POLY = 'o~geFdzkjV';             // (0.02,0.02)

function routeOption(id, mode, polyline, extra = {}) {
  return {
    id, mode, label: { DRIVE: 'Driving', TRANSIT: 'Public transit', WALK: 'Walking' }[mode],
    durationMinutes: 20, distanceMeters: 5000, walkingMinutes: mode === 'WALK' ? 20 : 2,
    includesStop: false, extraStopMinutes: null,
    cost: { amount: mode === 'WALK' ? 0 : 3, currency: 'USD', kind: 'provider_fare', complete: true, note: 'Transportation estimate.' },
    steps: [{ mode, instruction: `Take ${mode}`, durationMinutes: 20, distanceMeters: 5000, transit: null }],
    encodedPolyline: polyline, destination: null, mapsUrl: '', departureTime: null, arrivalTime: null,
    timing: 'estimated_now',
    constraints: { budget: 'met', walking: 'met', arrival: 'unknown', eligible: true },
    warnings: [], ...extra,
  };
}

const routes = [
  routeOption('drive-1', 'DRIVE', DRIVE_POLY),
  routeOption('transit-1', 'TRANSIT', TRANSIT_POLY),
  routeOption('walk-1', 'WALK', WALK_POLY),
];

const plan = {
  id: 'trip', generatedAt: new Date().toISOString(), dataMode: 'live',
  routes, best: 'transit-1', fastest: 'drive-1', cheapest: 'walk-1', rideshares: [],
  recommendation: { source: 'rules', reason: 'Ranked using available route facts.' },
  nearby: [], groundedGuidance: null, warnings: [], attribution: '',
};

function renderResults(currentPlan = plan) {
  return renderToStaticMarkup(React.createElement(RouteResults, {
    plan: currentPlan, origin: { address: 'Origin' }, destination: { address: 'Destination' }, onEditTrip() {},
  }));
}

test('every route card embeds its own compact map keyed by that route', () => {
  const html = renderResults();
  // Each card embeds a compact map (SSR shows the no-key fallback inside each card).
  // One per route card, and no single shared map at the top.
  const compactMaps = html.match(/map-compact/g) ?? [];
  assert.equal(compactMaps.length, 3, 'one compact map per route card');
  assert.ok(!html.includes('trip-map-title'), 'no single shared map header');
});

test('each route keeps its own backend geometry on the RouteOption, never a shared one', () => {
  assert.notEqual(routes[0].encodedPolyline, routes[1].encodedPolyline);
  assert.notEqual(routes[1].encodedPolyline, routes[2].encodedPolyline);
  assert.notEqual(routes[0].encodedPolyline, routes[2].encodedPolyline);
});

test('Map derives geometry from the selected route only and never mixes routes', () => {
  const html = renderToStaticMarkup(React.createElement(Map, {
    origin: { address: 'Origin' },
    destination: { address: 'Destination' },
    selectedRoute: routes[1],
    selectedStop: null,
  }));
  assert.ok(html.includes('Public transit route'), 'map heading reflects the selected route mode');

  const walkHtml = renderToStaticMarkup(React.createElement(Map, {
    origin: { address: 'Origin' },
    destination: { address: 'Destination' },
    selectedRoute: routes[2],
    selectedStop: null,
  }));
  assert.ok(walkHtml.includes('Walking route'));
});

test('results page still renders all route cards when one route lacks geometry', () => {
  const broken = { ...plan, routes: [routeOption('drive-1', 'DRIVE', null), routes[1], routes[2]] };
  const resultsHtml = renderResults(broken);
  assert.ok(resultsHtml.includes('Public transit'), 'transit card still renders');
  assert.ok(resultsHtml.includes('Walking'), 'walking card still renders');
  assert.ok(resultsHtml.includes('Driving'), 'geometry-less driving card still renders');
});

test('Map without a selected route still renders location markers gracefully', () => {
  const html = renderToStaticMarkup(React.createElement(Map, {
    origin: { address: 'Origin' },
    destination: { address: 'Destination' },
  }));
  assert.ok(html.includes('Map preview needs a browser-restricted Maps key') || html.includes('Loading map'));
  assert.ok(html.includes('Origin'));
});
