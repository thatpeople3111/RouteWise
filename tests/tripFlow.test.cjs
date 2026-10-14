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

test('route request excludes account identity, sessions and metadata even if present on the draft', () => {
  const request = draftToTripRequest({ ...DEFAULT_TRIP_DRAFT, departureNow: true,
    originText: 'Origin', destinationText: 'Destination', userId: 'PRIVATE_USER',
    email: 'PRIVATE_EMAIL', session: { access_token: 'PRIVATE_TOKEN' },
    preferences: { userId: 'PRIVATE_OWNER' }, preferredTransportMode: 'PUBLIC_TRANSIT' });
  const serialized = JSON.stringify(request);
  assert.ok(!serialized.includes('PRIVATE_'));
  assert.ok(!('preferredTransportMode' in request));
});

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

const { applyTripPreferenceDefaults } = require('../src/lib/tripPreferenceDefaults.ts');
const preferences = { userId: 'user', preferredTransportMode: 'PUBLIC_TRANSIT', routePriority: 'FASTEST', maxWalkingMinutes: 8, maxBudget: 12, createdAt: '', updatedAt: '' };

test('saved defaults populate first trip without disabling alternatives or assuming car ownership', () => {
  const draft = applyTripPreferenceDefaults(DEFAULT_TRIP_DRAFT, preferences, { edited: false, applied: false });
  assert.equal(draft.maxWalkingMinutes, 8); assert.equal(draft.budgetUsd, 12);
  assert.equal(draft.preferredTransportMode, 'PUBLIC_TRANSIT'); assert.equal(draft.routePriority, 'FASTEST');
  assert.equal(draft.allowTransit, true); assert.equal(draft.allowWalking, true);
  assert.deepEqual(draft.rideshareProviders, DEFAULT_TRIP_DRAFT.rideshareProviders);
  const driving = applyTripPreferenceDefaults(DEFAULT_TRIP_DRAFT, { ...preferences, preferredTransportMode: 'DRIVING' }, { edited: false, applied: false });
  assert.equal(driving.hasCar, false, 'preference does not imply car access');
  assert.equal(DEFAULT_TRIP_DRAFT.budgetUsd, 25, 'original defaults are not mutated');
});

test('all saved modes and priorities populate trip defaults while preserving choices and account values', () => {
  for (const preferredTransportMode of ['PUBLIC_TRANSIT', 'DRIVING', 'WALKING', 'RIDESHARE']) {
    for (const routePriority of ['BEST', 'FASTEST', 'CHEAPEST']) {
      for (const limits of [{ maxWalkingMinutes: null, maxBudget: null }, { maxWalkingMinutes: 7, maxBudget: 18 }]) {
        const saved = { ...preferences, preferredTransportMode, routePriority, ...limits };
        const draft = applyTripPreferenceDefaults(DEFAULT_TRIP_DRAFT, saved, { edited: false, applied: false });
        assert.equal(draft.preferredTransportMode, preferredTransportMode);
        assert.equal(draft.maxWalkingMinutes, limits.maxWalkingMinutes ?? DEFAULT_TRIP_DRAFT.maxWalkingMinutes);
        assert.equal(draft.budgetUsd, limits.maxBudget ?? DEFAULT_TRIP_DRAFT.budgetUsd);
        assert.equal(draft.allowTransit, true); assert.equal(draft.allowWalking, true);
        assert.deepEqual(draft.rideshareProviders, DEFAULT_TRIP_DRAFT.rideshareProviders);
        const request = draftToTripRequest({ ...draft, departureNow: true });
        assert.equal(request.preference, { BEST: 'balanced', FASTEST: 'fastest', CHEAPEST: 'cheapest' }[routePriority]);
        const override = { ...draft, budgetUsd: 44, preferredTransportMode: undefined };
        assert.equal(applyTripPreferenceDefaults(override, saved, { edited: true, applied: true }), override);
        assert.equal(saved.maxBudget, limits.maxBudget);
      }
    }
  }
});

test('slow preferences never overwrite a draft after any edit; defaults apply once', () => {
  const edited = { ...DEFAULT_TRIP_DRAFT, originText: 'Entered origin', budgetUsd: 42 };
  assert.equal(applyTripPreferenceDefaults(edited, preferences, { edited: true, applied: false }), edited);
  const applied = applyTripPreferenceDefaults(DEFAULT_TRIP_DRAFT, preferences, { edited: false, applied: false });
  const override = { ...applied, budgetUsd: 50, maxWalkingMinutes: 25, routePriority: 'CHEAPEST', preferredTransportMode: 'WALKING' };
  assert.equal(applyTripPreferenceDefaults(override, preferences, { edited: true, applied: true }), override);
  assert.equal(applyTripPreferenceDefaults(override, preferences, { edited: false, applied: true }), override);
  const request = draftToTripRequest({ ...override, originText: 'Origin', destinationText: 'Destination', departureNow: true, scheduleMode: 'departure' });
  assert.equal(request.preference, 'cheapest'); assert.equal(request.budgetUsd, 50); assert.equal(request.maxWalkingMinutes, 25);
  assert.equal(preferences.maxBudget, 12, 'trip changes never alter account values');
  assert.ok(!('preferredTransportMode' in request), 'presentation-only mode does not alter the backend contract');
});

test('guest/no preferences and null limits preserve existing defaults; zero remains a saved limit', () => {
  assert.equal(applyTripPreferenceDefaults(DEFAULT_TRIP_DRAFT, null, { edited: false, applied: false }), DEFAULT_TRIP_DRAFT);
  const emptyLimits = applyTripPreferenceDefaults(DEFAULT_TRIP_DRAFT, { ...preferences, maxWalkingMinutes: null, maxBudget: null }, { edited: false, applied: false });
  assert.equal(emptyLimits.maxWalkingMinutes, 15); assert.equal(emptyLimits.budgetUsd, 25);
  const zero = applyTripPreferenceDefaults(DEFAULT_TRIP_DRAFT, { ...preferences, maxWalkingMinutes: 0, maxBudget: 0 }, { edited: false, applied: false });
  assert.equal(zero.maxWalkingMinutes, 0); assert.equal(zero.budgetUsd, 0);
  const large = applyTripPreferenceDefaults(DEFAULT_TRIP_DRAFT, { ...preferences, maxWalkingMinutes: 999, maxBudget: 5000 }, { edited: false, applied: false });
  assert.equal(large.maxWalkingMinutes, 180); assert.equal(large.budgetUsd, 1000); assert.equal(large.savedDefaultsLimited, true);
});

test('late defaults preserve each edited field, travel details and disabled walking independently', () => {
  const base = { ...DEFAULT_TRIP_DRAFT, originText: 'My origin', destinationText: 'My destination', scheduleTime: future };
  const earlyTravel = applyTripPreferenceDefaults(base, preferences, { edited: true, applied: false, editedPreferenceFields: [] });
  assert.equal(earlyTravel.originText, base.originText); assert.equal(earlyTravel.destinationText, base.destinationText);
  assert.equal(earlyTravel.scheduleTime, future); assert.equal(earlyTravel.budgetUsd, 12);
  for (const [field, value] of [['budgetUsd', 42], ['maxWalkingMinutes', 30], ['routePriority', 'CHEAPEST'], ['preferredTransportMode', undefined]]) {
    const draft = { ...base, [field]: value };
    const applied = applyTripPreferenceDefaults(draft, preferences, { edited: true, applied: false, editedPreferenceFields: [field] });
    assert.equal(applied[field], value, `${field} must survive`);
    if (field !== 'budgetUsd') assert.equal(applied.budgetUsd, 12);
    if (field !== 'maxWalkingMinutes') assert.equal(applied.maxWalkingMinutes, 8);
  }
  const noWalking = applyTripPreferenceDefaults({ ...base, allowWalking: false }, preferences, { edited: true, applied: false, editedPreferenceFields: ['maxWalkingMinutes'] });
  assert.equal(noWalking.allowWalking, false); assert.equal(noWalking.maxWalkingMinutes, base.maxWalkingMinutes);
  assert.equal(applyTripPreferenceDefaults(base, preferences, { edited: false, applied: true, editedPreferenceFields: [] }), base, 'submitted trips stay frozen');
});
