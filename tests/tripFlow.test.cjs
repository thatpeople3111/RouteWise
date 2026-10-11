/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner compiles TypeScript through a local CommonJS hook. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { DEFAULT_TRIP_DRAFT, draftToTripRequest } = require('../src/lib/tripDraft.ts');
const { tripRequestSchema } = require('../src/lib/validation.ts');

const future = new Date(Date.now() + 3600000).toISOString();

test('draft assembles a valid departure TripRequest only on completion', () => {
  const draft = {
    ...DEFAULT_TRIP_DRAFT,
    originText: 'FIU MMC',
    destinationText: 'Wynwood',
    scheduleMode: 'departure',
    scheduleTime: future.slice(0, 16),
    budgetUsd: 20,
    maxWalkingMinutes: 15,
    hasCar: true,
    rideshareProviders: ['LYFT', 'WAYMO'],
    maxRideshareBudget: 25,
    notes: 'Prefer cheap parking.',
  };
  const request = draftToTripRequest(draft);
  const parsed = tripRequestSchema.parse(request);
  assert.equal(parsed.origin.address, 'FIU MMC');
  assert.equal(parsed.destination.address, 'Wynwood');
  assert.ok(parsed.departureTime);
  assert.equal(parsed.arrivalTime, undefined, 'departure mode never sends arrivalTime');
  assert.equal(parsed.hasCar, true);
  assert.deepEqual(parsed.rideshareProviders, ['LYFT', 'WAYMO']);
  assert.equal(parsed.maxRideshareBudget, 25);
  assert.equal(parsed.notes, 'Prefer cheap parking.');
});

test('draft assembles an arrival TripRequest with only arrivalTime', () => {
  const draft = { ...DEFAULT_TRIP_DRAFT, originText: 'Origin', destinationText: 'Destination', scheduleMode: 'arrival', scheduleTime: future.slice(0, 16) };
  const request = draftToTripRequest(draft);
  assert.ok(request.arrivalTime);
  assert.equal(request.departureTime, undefined, 'arrival mode never sends departureTime');
});

test('draft uses current-location coordinates when present', () => {
  const draft = { ...DEFAULT_TRIP_DRAFT, originCoordinates: { latitude: 25.77, longitude: -80.19 }, originText: 'Current location (25.7700, -80.1900)', destinationText: 'Wynwood', scheduleMode: 'departure', scheduleTime: future.slice(0, 16) };
  const request = draftToTripRequest(draft);
  assert.equal(request.origin.latitude, 25.77);
});

test('draft rejects a missing or invalid time with a user-facing message', () => {
  const base = { ...DEFAULT_TRIP_DRAFT, originText: 'Origin', destinationText: 'Destination' };
  assert.throws(() => draftToTripRequest({ ...base, scheduleTime: '' }), /time/i);
  // A past timestamp is only rejected when the user did not pick "Now" (Now is always valid).
  const past = new Date(Date.now() - 3600000).toISOString().slice(0, 16);
  const request = draftToTripRequest({ ...base, scheduleMode: 'departure', scheduleTime: past, departureNow: true });
  assert.ok(request.departureTime, 'Now departure is allowed');
});

test('draft honors no-walking and rideshare-budget omitted when unset', () => {
  const draft = { ...DEFAULT_TRIP_DRAFT, originText: 'Origin', destinationText: 'Destination', scheduleTime: future.slice(0, 16), allowWalking: false, maxRideshareBudget: undefined };
  const request = draftToTripRequest(draft);
  assert.equal(request.maxWalkingMinutes, 0, 'no walking sets the limit to zero');
  assert.equal(request.maxRideshareBudget, undefined, 'no rideshare budget stays unset');
});
