/* eslint-disable @typescript-eslint/no-require-imports */
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
const { toTripPlan } = require('../src/lib/api.ts');
const RouteResults = require('../src/components/RouteResults.tsx').default;

test('renders every route, tolls, fares, destination parking, and Gemini source', () => {
  const route = { id: 'drive', mode: 'DRIVE', durationMinutes: 20, distanceMeters: 5000,
    walkingMinutes: 0, extraStopMinutes: null, estimatedTransportationCost: null,
    steps: [{ mode: 'DRIVE', instruction: 'Turn right onto Main Street' }], warnings: [],
    constraints: { budget: 'unknown', walking: 'met', extraTime: 'not_requested', extraBudget: 'not_requested', eligible: true },
    tolls: { status: 'estimated', prices: [{ amount: 4.5, currency: 'USD' }] },
    parking: { status: 'available', locations: [{ placeId: 'garage', name: 'Destination Garage', address: '1 Main Street',
      coordinates: { latitude: 25.77, longitude: -80.19 }, distanceMeters: 120, mapsUri: 'https://www.google.com/maps/search/?api=1&query=garage', openNow: null }] },
  };
  const payload = { id: 'trip', generatedAt: new Date().toISOString(), dataMode: 'live', recommendationSource: 'gemini', warnings: [],
    rankings: { best: 'drive', fastest: 'drive', cheapest: null },
    routeOptions: [route, { ...route, id: 'transit', mode: 'TRANSIT', tolls: undefined, parking: undefined,
      estimatedTransportationCost: { amount: 2.25, currency: 'USD', source: 'google_routes_estimate' } },
      { ...route, id: 'walk', mode: 'WALK', tolls: undefined, parking: undefined,
        estimatedTransportationCost: { amount: 0, currency: 'USD', source: 'no_fare' } }],
  };
  const plan = toTripPlan(payload);
  const html = renderToStaticMarkup(React.createElement(RouteResults, { plan, origin: { address: 'Origin' }, destination: { address: 'Destination' }, onEditTrip() {} }));
  assert.equal((html.match(/<article/g) ?? []).length, 3);
  for (const text of ['Ranked with Gemini', '$4.50', '$2.25', '$0.00', 'Price unavailable', 'Destination Garage', '120', 'Turn right onto Main Street']) {
    assert.ok(html.includes(text), `Missing ${text}`);
  }
  assert.equal(plan.routes[0].cost.amount, null);
  assert.equal(plan.routes[0].steps[0].durationMinutes, null);
});
