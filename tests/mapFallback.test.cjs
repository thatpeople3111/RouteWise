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
const Map = require('../src/components/Map.tsx').default;

// A driving route whose backend call returned no polyline.
const geometryLessRoute = {
  id: 'drive-1', mode: 'DRIVE', label: 'Driving', durationMinutes: 20, distanceMeters: 5000,
  walkingMinutes: 0, includesStop: false, extraStopMinutes: null,
  cost: { amount: 3, currency: 'USD', kind: 'provider_fare', complete: true, note: '' },
  steps: [], encodedPolyline: null, destination: null, mapsUrl: '', departureTime: null,
  arrivalTime: null, timing: 'estimated_now',
  constraints: { budget: 'met', walking: 'met', arrival: 'unknown', eligible: true }, warnings: [],
};

test('a geometry-less route renders its map panel gracefully without crashing', () => {
  const html = renderToStaticMarkup(React.createElement(Map, {
    origin: { address: 'Origin' },
    destination: { address: 'Destination' },
    selectedRoute: geometryLessRoute,
    selectedStop: null,
  }));
  // Without a browser Maps key the panel degrades to the unavailable fallback (origin/destination
  // still listed). With a key, the client shows "Route map unavailable for this option" after
  // hydration — it never borrows another mode's geometry.
  assert.ok(html.includes('Driving route'));
  assert.ok(html.includes('Map preview needs a browser-restricted Maps key') || html.includes('Loading map'));
  assert.ok(html.includes('Origin') && html.includes('Destination'));
});
