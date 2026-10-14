/* eslint-disable @typescript-eslint/no-require-imports -- Compile TypeScript for the Node test runner. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { loadPreferences, savePreferences } = require('../src/lib/supabase/preferencesRepository.ts');
const owner = '10000000-0000-0000-0000-000000000001';
const row = { user_id: owner, preferred_transport_mode: 'PUBLIC_TRANSIT', route_priority: 'BEST', max_walking_minutes: 15, max_budget: 20, created_at: '2026-10-13T12:00:00Z', updated_at: '2026-10-13T12:00:00Z' };
const values = { preferredTransportMode: 'WALKING', routePriority: 'CHEAPEST' };
function fakeClient(initial = null, user = { id: owner }) {
  let stored = initial, failure = null;
  const calls = [];
  return {
    calls, stored: () => stored, fail(error) { failure = error; },
    auth: { async getUser() { return { data: { user }, error: null }; } },
    from(table) {
      assert.equal(table, 'user_preferences');
      let action = 'select', fields;
      const query = {
        select() { return query; },
        eq(column, id) { assert.equal(column, 'user_id'); assert.equal(id, owner); return query; },
        update(input) { action = 'update'; fields = input; assert.ok(!('user_id' in fields)); return query; },
        insert(input) { action = 'insert'; fields = input; assert.equal(fields.user_id, owner); return query; },
        async maybeSingle() { return query.single(); },
        async single() {
          calls.push({ action, fields });
          if (failure) return { data: null, error: failure };
          if (action === 'insert') stored = { ...row, ...fields };
          if (action === 'update' && stored) stored = { ...stored, ...fields };
          return { data: stored, error: null };
        },
      };
      return query;
    },
  };
}

test('new account returns not configured without creating defaults; existing account loads', async () => {
  const fresh = fakeClient(); assert.equal(await loadPreferences(fresh), null);
  assert.deepEqual(fresh.calls.map(call => call.action), ['select']);
  const saved = await loadPreferences(fakeClient(row));
  assert.equal(saved.userId, owner); assert.equal(saved.maxBudget, 20); assert.equal(saved.maxWalkingMinutes, 15);
});

test('preference save/load matrix covers all modes, priorities and optional limit combinations', async () => {
  for (const preferredTransportMode of ['PUBLIC_TRANSIT', 'DRIVING', 'WALKING', 'RIDESHARE']) {
    for (const routePriority of ['BEST', 'FASTEST', 'CHEAPEST']) {
      for (const maxWalkingMinutes of [null, 0, 12]) {
        for (const maxBudget of [null, 0, 35.5]) {
          const client = fakeClient();
          const input = { preferredTransportMode, routePriority, maxWalkingMinutes, maxBudget };
          await savePreferences(client, input);
          const loaded = await loadPreferences(client);
          for (const [key, value] of Object.entries(input)) assert.equal(loaded[key], value);
        }
      }
    }
  }
});

test('first save inserts verified ownership; updates preserve undefined, clear null, and retain zero', async () => {
  const fresh = fakeClient();
  const saved = await savePreferences(fresh, values);
  assert.deepEqual(fresh.calls.map(call => call.action), ['update', 'insert']);
  assert.equal(saved.maxWalkingMinutes, null); assert.equal(saved.maxBudget, null);
  assert.equal(saved.userId, owner);
  const existing = fakeClient(row);
  let changed = await savePreferences(existing, { ...values, maxBudget: undefined });
  assert.equal(changed.maxBudget, 20); assert.equal(changed.maxWalkingMinutes, 15);
  changed = await savePreferences(existing, { ...values, maxBudget: null, maxWalkingMinutes: 0 });
  assert.equal(changed.maxBudget, null); assert.equal(changed.maxWalkingMinutes, 0);
  changed = await savePreferences(existing, { ...values, maxBudget: 0, maxWalkingMinutes: null });
  assert.equal(changed.maxBudget, 0); assert.equal(changed.maxWalkingMinutes, null);
});

test('guest/signed-out callers do not touch the table; UI ownership cannot be injected', async () => {
  const guest = fakeClient(null, null);
  assert.equal(await loadPreferences(guest), null);
  assert.equal(await loadPreferences(null), null);
  await assert.rejects(savePreferences(guest, values), /Sign in/);
  assert.equal(guest.calls.length, 0);
  const user = fakeClient(row);
  await assert.rejects(savePreferences(user, { ...values, userId: 'someone-else' }), /Check the preference/);
  await assert.rejects(savePreferences(user, { ...values, maxBudget: -1 }), /Check the preference/);
  assert.equal(user.calls.length, 0);
});

test('failed requests and RLS denials surface safe errors; aborted identity changes never write', async () => {
  const client = fakeClient(row); client.fail({ code: '42501', message: 'Private database detail' });
  await assert.rejects(loadPreferences(client), /Preferences could not/);
  await assert.rejects(savePreferences(client, values), /Preferences could not/);
  const controller = new AbortController(), pending = fakeClient(row);
  pending.auth.getUser = async () => { controller.abort(); return { data: { user: { id: owner } }, error: null }; };
  await assert.rejects(savePreferences(pending, values, controller.signal));
  assert.equal(pending.calls.length, 0);
  const invalid = fakeClient({ ...row, user_id: '10000000-0000-0000-0000-000000000002' });
  await assert.rejects(loadPreferences(invalid), /Preferences could not/);
});

test('account changes during identity verification are rejected before loading or writing', async () => {
  const client = fakeClient(row);
  const currentAccount = () => false;
  await assert.rejects(loadPreferences(client, undefined, currentAccount), /account changed/);
  await assert.rejects(savePreferences(client, values, undefined, currentAccount), /account changed/);
  assert.equal(client.calls.length, 0);
});

test('preferences provider keeps guest content visible and clears data on signout/account changes', async () => {
  const path = require('node:path'), Module = require('node:module'), React = require('react');
  const oldResolve = Module._resolveFilename;
  Module._resolveFilename = function(request, ...args) { return oldResolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args); };
  require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  const auth = require('../src/components/AuthProvider.tsx');
  const clients = require('../src/lib/supabase/client.ts');
  const repository = require('../src/lib/supabase/preferencesRepository.ts');
  const saved = { state: React.useState, ref: React.useRef, effect: React.useEffect, memo: React.useMemo, callback: React.useCallback,
    auth: auth.useAuth, client: clients.getSupabaseBrowserClient, load: repository.loadPreferences, save: repository.savePreferences };
  let currentUser = null, cursor = 0, slots = [], effect, cleanup, loads = 0, resolveSave;
  React.useState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; };
  React.useRef = initial => { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; };
  React.useEffect = callback => { effect = callback; };
  React.useMemo = callback => callback(); React.useCallback = callback => callback;
  auth.useAuth = () => ({ user: currentUser, isAuthLoading: false });
  clients.getSupabaseBrowserClient = () => ({});
  repository.loadPreferences = async () => { loads++; return { userId: currentUser.id, maxBudget: 15 }; };
  repository.savePreferences = () => new Promise(resolve => { resolveSave = resolve; });
  try {
    const Provider = require('../src/components/PreferencesProvider.tsx').default;
    const render = () => { cursor = 0; return Provider({ children: 'guest planner' }); };
    const commit = () => { cleanup?.(); cleanup = effect(); };
    let tree = render(); assert.equal(tree.props.children, 'guest planner'); commit();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(render().props.value.preferences, null); assert.equal(loads, 0);
    currentUser = { id: owner }; render(); commit(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(render().props.value.preferences.userId, owner); assert.equal(loads, 1);
    const pendingSave = render().props.value.savePreferences(values);
    const rejected = assert.rejects(pendingSave, /account changed/);
    currentUser = null;
    assert.equal(render().props.value.preferences, null, 'identity clears before effect cleanup'); commit();
    resolveSave({ userId: owner, maxBudget: 99 }); await rejected;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(render().props.value.preferences, null);
    currentUser = { id: 'another-user' }; render(); commit(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(render().props.value.preferences.userId, 'another-user'); assert.equal(loads, 2);
    repository.loadPreferences = async () => { throw new Error('PRIVATE_DATABASE_DETAIL'); };
    render().props.value.retryPreferences(); render(); commit();
    await new Promise(resolve => setImmediate(resolve));
    tree = render();
    assert.equal(tree.props.children, 'guest planner');
    assert.equal(tree.props.value.isPreferencesLoading, false);
    assert.equal(tree.props.value.preferences, null);
    assert.match(tree.props.value.preferencesError, /plan your trip normally/);
    assert.ok(!tree.props.value.preferencesError.includes('PRIVATE'));
    repository.loadPreferences = async () => ({ userId: currentUser.id, maxBudget: 22 });
    tree.props.value.retryPreferences(); render(); commit();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(render().props.value.preferences.maxBudget, 22);
    assert.equal(render().props.value.preferencesError, null);
    repository.savePreferences = async () => { throw new Error('PRIVATE_DATABASE_DETAIL'); };
    await assert.rejects(render().props.value.savePreferences(values), /Preferences could not be loaded or saved/);
    tree = render();
    assert.equal(tree.props.value.preferences.maxBudget, 22, 'failed save retains last confirmed data');
    assert.equal(tree.props.value.isPreferencesSaving, false);
    assert.match(tree.props.value.preferencesError, /Retry loading/);
    assert.ok(!tree.props.value.preferencesError.includes('PRIVATE'));
  } finally {
    cleanup?.();
    React.useState = saved.state; React.useRef = saved.ref; React.useEffect = saved.effect; React.useMemo = saved.memo; React.useCallback = saved.callback;
    auth.useAuth = saved.auth; clients.getSupabaseBrowserClient = saved.client; repository.loadPreferences = saved.load; repository.savePreferences = saved.save;
    Module._resolveFilename = oldResolve;
  }
});
