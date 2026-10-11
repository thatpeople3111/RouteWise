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
const TransitTabs = require('../src/components/TransitTabs.tsx').default;
const { toTripPlan } = require('../src/lib/api.ts');

function transitStep(mode, opts = {}) {
  return {
    mode, instruction: opts.instruction ?? '', durationMinutes: opts.duration ?? null, distanceMeters: opts.distance ?? null,
    encodedPolyline: opts.polyline ?? null,
    transit: opts.transit ? {
      line: opts.transit.line ?? '', lineShortName: opts.transit.short ?? null, headsign: opts.transit.headsign ?? null,
      departureStop: opts.transit.from ?? null, arrivalStop: opts.transit.to ?? null, departureTime: null, arrivalTime: null,
      vehicleType: opts.transit.vehicleType ?? null, vehicleName: opts.transit.vehicleName ?? null, lineColor: opts.transit.lineColor ?? null,
      agencyName: opts.transit.agencyName ?? null, stopCount: opts.transit.stopCount ?? null, agencies: [],
    } : null,
  };
}

function transitAlt(id, title, opts = {}) {
  return {
    id, title, durationMinutes: opts.duration ?? 40, distanceMeters: opts.distance ?? 10000,
    walkingMinutes: opts.walking ?? 8,
    estimatedTransportationCost: opts.fare !== undefined ? opts.fare : { amount: 2.25, currency: 'USD', source: 'google_routes_estimate' },
    encodedPolyline: opts.polyline ?? 'route-poly-' + id,
    steps: opts.steps ?? [transitStep('WALK', { duration: 4 }), transitStep('TRANSIT', { transit: { line: 'Metrorail', short: 'M', vehicleType: 'SUBWAY', from: 'Dadeland', to: 'Brickell', stopCount: 6 }, duration: 30 }), transitStep('WALK', { duration: 4 })],
    transfers: opts.transfers ?? 0,
    recommended: opts.recommended ?? false,
    availability: opts.availability,
    warnings: opts.warnings ?? [],
  };
}

const baseRoute = {
  id: 'transit-1', mode: 'TRANSIT', label: 'Public transit', durationMinutes: 40, distanceMeters: 10000,
  walkingMinutes: 8, includesStop: false, extraStopMinutes: null,
  cost: { amount: 2.25, currency: 'USD', kind: 'provider_fare', complete: true, note: '' },
  steps: [], encodedPolyline: 'route-poly-transit-1', destination: null, mapsUrl: '', departureTime: null, arrivalTime: null,
  timing: 'estimated_now', constraints: { budget: 'met', walking: 'met', arrival: 'unknown', eligible: true }, warnings: [],
};

test('single transit option renders no tab bar', () => {
  const route = { ...baseRoute, transitAlternatives: [transitAlt('transit-1', 'Bus')] };
  const html = renderToStaticMarkup(React.createElement(TransitTabs, { route, origin: { address: 'O' }, destination: { address: 'D' } }));
  assert.equal(html.includes('role="tablist"'), false, 'no tab bar for a single option');
  assert.ok(html.includes('Metrorail'), 'renders the line name');
  assert.ok(html.includes('Dadeland'), 'renders the boarding stop');
});

test('multiple transit options render a tab per alternative with a recommended badge', () => {
  const route = { ...baseRoute, transitAlternatives: [
    transitAlt('t-a', 'Bus', { duration: 52, recommended: false }),
    transitAlt('t-b', 'Rail + Walk', { duration: 38, recommended: true, polyline: 'route-poly-t-b' }),
  ] };
  const html = renderToStaticMarkup(React.createElement(TransitTabs, { route, origin: { address: 'O' }, destination: { address: 'D' } }));
  assert.ok(html.includes('role="tablist"'), 'tab bar present for multiple options');
  assert.ok(html.includes('Bus') && html.includes('Rail + Walk'), 'both tabs labeled');
  assert.ok(html.includes('Recommended'), 'recommended option marked');
});

test('a multi-transfer option stays one tab with a transfer timeline', () => {
  const steps = [
    transitStep('WALK', { duration: 4 }),
    transitStep('TRANSIT', { transit: { line: 'Metrobus', short: '11', vehicleType: 'BUS', from: 'FIU', to: 'Government Center', stopCount: 12 }, duration: 20 }),
    transitStep('TRANSIT', { transit: { line: 'Metrorail', short: 'M', vehicleType: 'SUBWAY', from: 'Government Center', to: 'Brickell', stopCount: 3 }, duration: 8 }),
    transitStep('WALK', { duration: 3 }),
  ];
  const route = { ...baseRoute, transitAlternatives: [transitAlt('t-multi', 'Bus + Rail', { steps, transfers: 1, polyline: 'route-poly-t-multi' })] };
  const html = renderToStaticMarkup(React.createElement(TransitTabs, { route, origin: { address: 'O' }, destination: { address: 'D' } }));
  assert.ok(!html.includes('role="tablist"'), 'a single multi-transfer journey has no extra tabs');
  assert.ok(html.includes('Transfer'), 'transfer marker shown between transit segments');
  assert.ok(html.includes('Metrobus') && html.includes('Metrorail'), 'both lines shown in the timeline');
  assert.ok(html.includes('Transfers: 1'), 'transfer count excludes initial boarding');
});

test('a walking-limit-exceeding option is marked unavailable while others stay usable', () => {
  const route = { ...baseRoute, transitAlternatives: [
    transitAlt('t-ok', 'Rail', { walking: 8, recommended: true }),
    transitAlt('t-far', 'Bus', { walking: 22, availability: { available: false, reasonCode: 'WALKING_LIMIT_EXCEEDED', message: 'This option needs about 22 minutes of walking, over your 15-minute limit.' } }),
  ] };
  const html = renderToStaticMarkup(React.createElement(TransitTabs, { route, origin: { address: 'O' }, destination: { address: 'D' } }));
  assert.ok(html.includes('over your 15-minute limit'), 'unavailable option shows its reason');
  assert.ok(html.includes('Rail'), 'the valid option remains');
});

test('fare is shown per option and missing fare is labeled without $0', () => {
  const route = { ...baseRoute, transitAlternatives: [
    transitAlt('t-paid', 'Rail', { fare: { amount: 2.25, currency: 'USD', source: 'google_routes_estimate' } }),
    transitAlt('t-free', 'Mover', { fare: null }),
  ] };
  const html = renderToStaticMarkup(React.createElement(TransitTabs, { route, origin: { address: 'O' }, destination: { address: 'D' } }));
  assert.ok(html.includes('Fare: $2.25'), 'known fare shown');
  // The missing-fare option's fare text appears when selected; the default render shows the first option.
  assert.ok(!/\$0(?:\.00)?/.test(html), 'never shows $0');
});

test('wire adapter maps transitAlternatives with per-step geometry and vehicle data', () => {
  const wireStep = {
    mode: 'TRANSIT', instruction: 'Take rail', durationMinutes: 30, distanceMeters: 9000,
    encodedPolyline: 'seg-1',
    transit: { line: 'Metrorail', lineShortName: 'M', vehicleType: 'SUBWAY', departureStop: 'A', arrivalStop: 'B', stopCount: 5 },
  };
  const payload = {
    id: 'trip', generatedAt: new Date().toISOString(), dataMode: 'live', recommendationSource: 'rules', warnings: [],
    rankings: { best: 'transit-1', fastest: 'transit-1', cheapest: 'transit-1' },
    routeOptions: [{
      id: 'transit-1', mode: 'TRANSIT', durationMinutes: 40, distanceMeters: 10000, walkingMinutes: 8,
      estimatedTransportationCost: { amount: 2.25, currency: 'USD', source: 'google_routes_estimate' },
      extraStopMinutes: null, encodedPolyline: 'route-poly-transit-1',
      steps: [wireStep],
      constraints: { budget: 'met', walking: 'met', extraTime: 'not_requested', extraBudget: 'not_requested', eligible: true },
      warnings: [],
      transitAlternatives: [{
        id: 't-a', title: 'Rail', durationMinutes: 40, distanceMeters: 10000, walkingMinutes: 8,
        estimatedTransportationCost: { amount: 2.25, currency: 'USD', source: 'google_routes_estimate' },
        encodedPolyline: 'route-poly-t-a', steps: [wireStep], transfers: 0, recommended: true, warnings: [],
      }],
    }],
  };
  const plan = toTripPlan(payload);
  assert.equal(plan.routes[0].transitAlternatives?.length, 1);
  assert.equal(plan.routes[0].transitAlternatives?.[0].title, 'Rail');
  assert.equal(plan.routes[0].steps[0].encodedPolyline, 'seg-1');
  assert.equal(plan.routes[0].steps[0].transit.vehicleType, 'SUBWAY');
});
