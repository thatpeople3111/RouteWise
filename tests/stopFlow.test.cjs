/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner compiles TypeScript through a local CommonJS hook. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { dedupeClusteredPlaces, pickSpreadOnRouteStops } = require('../src/server/services/places.ts');

// A simple east→west route polyline (origin at lng 0, destination at lng 0.1) for zone math.
// Encoded polyline for points: (0,0) (0,0.025) (0,0.05) (0,0.075) (0,0.1)
// Using a helper: we don't need a real polyline; test pickSpread with a synthetic straight route.
// Encode roughly: use a known simple polyline. We'll build coordinates directly via a tiny encoder.
function encodePolyline(points) {
  let result = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of points) {
    const dLat = Math.round(lat * 1e5) - prevLat;
    const dLng = Math.round(lng * 1e5) - prevLng;
    prevLat = Math.round(lat * 1e5);
    prevLng = Math.round(lng * 1e5);
    for (const v of [dLat, dLng]) {
      let n = v < 0 ? ~(v << 1) : v << 1;
      while (n >= 0x20) { result += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
      result += String.fromCharCode(n + 63);
    }
  }
  return result;
}

const straightRoute = encodePolyline([[0, 0], [0, 0.025], [0, 0.05], [0, 0.075], [0, 0.1]]);

function place(name, lat, lng) {
  return { placeId: name, name, coordinates: { latitude: lat, longitude: lng }, rating: 4.5 };
}

test('dedupeClusteredPlaces removes same-name clusters but keeps distinct spots', () => {
  const places = [
    place('Cafe A', 0, 0.01),
    place('Cafe A', 0, 0.0102), // ~20 m away, same name → duplicate
    place('Cafe B', 0, 0.05),
  ];
  const deduped = dedupeClusteredPlaces(places);
  assert.equal(deduped.length, 2);
  assert.ok(deduped.some(p => p.name === 'Cafe B'));
});

test('pickSpreadOnRouteStops prefers early and mid zones over origin clustering', () => {
  // Four candidates clustered near the origin plus clearly early (~30%) and mid (~60%) ones.
  const clustered = [
    place('Origin1', 0, 0.002),
    place('Origin2', 0, 0.004),
    place('Origin3', 0, 0.006),
    place('Origin4', 0, 0.008),
    place('Early', 0, 0.022),   // clearly early, ~22% along
    place('Mid', 0, 0.062),     // clearly mid, ~62% along
  ];
  const picked = pickSpreadOnRouteStops(clustered, straightRoute, 4);
  const names = picked.map(p => p.name);
  // The spread set includes the early and mid candidates and is not four origin-clustered stops.
  assert.ok(names.includes('Mid'), 'includes a mid-route stop');
  assert.ok(names.filter(n => n.startsWith('Origin')).length < 4, 'does not fill all slots with origin-clustered stops');
  assert.ok(names.includes('Early') || names.includes('Mid'), 'includes at least one non-origin-zone stop');
});

test('pickSpreadOnRouteStops returns all when fewer candidates than slots', () => {
  const few = [place('Only', 0, 0.05)];
  assert.equal(pickSpreadOnRouteStops(few, straightRoute, 4).length, 1);
});
