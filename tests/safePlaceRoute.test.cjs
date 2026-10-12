/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const oldResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return oldResolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args); };
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const api = require('../src/lib/api.ts');
const { findSafePlaceRoute } = require('../src/lib/safePlaceRoute.ts');
const origin = { latitude: 25.76, longitude: -80.2 };
const place = id => ({ placeId: id, name: 'Wait ' + id, category: 'pharmacy', coordinates: { latitude: 25.761, longitude: -80.2 }, address: 'Main St', distanceMeters: 200, walkingMinutes: 4, rating: 4, openNow: true });
const walking = { id: 'walk', mode: 'WALK', label: 'Walking', durationMinutes: 4, distanceMeters: 200, encodedPolyline: 'actual-route', steps: [{ instruction: 'Walk east on Main St' }], warnings: [] };

test('safe-place adapter uses current coordinates, walking only, and no rideshare or stop requests', async () => {
  const main = Object.freeze({ routes: Object.freeze([walking]), rideshares: Object.freeze([]) });
  const result = await findSafePlaceRoute(origin, place('one'), async (request, preference, stop) => {
    assert.deepEqual(request.origin, origin); assert.deepEqual(request.destination, place('one').coordinates);
    assert.equal(request.allowTransit, false); assert.equal(request.allowWalking, true); assert.deepEqual(request.rideshareProviders, []);
    assert.deepEqual(preference, { skip: true }); assert.equal(stop, null); return main;
  });
  assert.equal(result.route, walking); assert.equal(result.safePlaceId, 'one');
  await findSafePlaceRoute(origin, { ...place('exact-id'), coordinates: null }, async request => {
    assert.deepEqual(request.destination, { placeId: 'exact-id' }); return main;
  });
  await assert.rejects(findSafePlaceRoute(origin, place('none'), async () => ({ routes: [] })), /couldn't create a walking route/);
});

test('safe-place cards switch, hide, ignore stale responses, and keep errors/loading inline while main trip stays unchanged', async () => {
  const saved = { state: React.useState, ref: React.useRef, effect: React.useEffect, plan: api.planTrip };
  let slots = [], cursor = 0, cleanup;
  React.useState = initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; };
  React.useRef = initial => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; };
  React.useEffect = callback => { cleanup = callback(); };
  const Routes = require('../src/components/SafePlaceRoutes.tsx').default;
  const StrandedResults = require('../src/components/StrandedResults.tsx').default;
  const props = { origin, status: 'ready', best: place('one'), alternates: [place('two'), place('three')], onRetry() {} };
  const mainPlan = { routes: [{ ...walking, id: 'original-walk' }, { ...walking, mode: 'TRANSIT', id: 'original-transit' }], rideshares: [], warnings: [] };
  const originalDestination = { latitude: 25.85, longitude: -80.3 };
  const before = JSON.stringify(mainPlan);
  const tree = () => { cursor = 0; return Routes(props); };
  const pending = [];
  api.planTrip = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  try {
    const first = tree().props.onRouteHere(place('one'));
    assert.equal(tree().props.selectedPlaceId, 'one'); assert.match(renderToStaticMarkup(tree()), /Finding route/);
    const second = tree().props.onRouteHere(place('two'));
    pending[0].resolve({ routes: [walking] }); await first;
    assert.equal(tree().props.selectedPlaceId, 'two'); assert.match(renderToStaticMarkup(tree()), /Finding route/);
    pending[1].resolve({ routes: [walking] }); await second;
    let html = renderToStaticMarkup(tree());
    assert.equal((html.match(/WALKING ROUTE/g) || []).length, 1); assert.match(html, /Walk east on Main St/);
    assert.equal((html.match(/aria-expanded="true"/g) || []).length, 1);
    const mainElement = StrandedResults({ plan: mainPlan, origin, destination: originalDestination, safePlaces: tree() });
    const sections = mainElement.props.children[2];
    for (const section of sections) {
      const card = section.props.children[1].props.children[0][0];
      assert.equal(card.props.destination, originalDestination);
      assert.equal(card.props.route, mainPlan.routes.find(route => route.mode === section.key));
    }
    assert.equal(JSON.stringify(mainPlan), before);
    const failed = tree().props.onRouteHere(place('three')); pending[2].reject(Error('provider failed')); await failed;
    html = renderToStaticMarkup(tree()); assert.match(html, /role="alert"/); assert.match(html, /couldn&#x27;t create a walking route/);
    assert.equal(tree().props.selectedPlaceId, 'three'); assert.equal(JSON.stringify(mainPlan), before);
    await tree().props.onRouteHere(place('three')); assert.equal(tree().props.selectedPlaceId, null);
    const hidden = tree().props.onRouteHere(place('one')); await tree().props.onRouteHere(place('one'));
    pending[3].resolve({ routes: [walking] }); await hidden; assert.equal(tree().props.selectedPlaceId, null);
    const unmounted = tree().props.onRouteHere(place('two')); cleanup(); pending[4].resolve({ routes: [walking] }); await unmounted;
    assert.equal(tree().props.routeDetails.props.children[0].props.children, 'Finding route…');
  } finally { React.useState = saved.state; React.useRef = saved.ref; React.useEffect = saved.effect; api.planTrip = saved.plan; }
});
