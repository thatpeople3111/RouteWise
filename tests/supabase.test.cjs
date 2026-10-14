/* eslint-disable @typescript-eslint/no-require-imports -- Compile the small TypeScript configuration module for Node's test runner. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { getSupabaseConfigStatus } = require('../src/lib/supabase/config.ts');
const { getSupabaseBrowserClient } = require('../src/lib/supabase/client.ts');

test('optional account deadline settles outages, cancels preference requests and ignores late results', async () => {
  const { withDeadline } = require('../src/lib/supabase/requestDeadline.ts');
  let finish, cancelled = false;
  const slow = new Promise(resolve => { finish = resolve; });
  await assert.rejects(withDeadline(slow, () => { cancelled = true; }, 5), /trip planning is still available/);
  assert.equal(cancelled, true);
  finish('late');
  assert.equal(await withDeadline(Promise.resolve('ready'), undefined, 5), 'ready');
  await assert.rejects(withDeadline(Promise.reject(new Error('failure')), undefined, 5), /failure/);
});

test('optional Supabase remains disabled without config and rejects partial, unsafe or privileged config', () => {
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  const saved = names.map(name => process.env[name]);
  try {
    names.forEach(name => delete process.env[name]);
    assert.deepEqual(getSupabaseConfigStatus(), { status: 'disabled' });
    assert.equal(getSupabaseBrowserClient(), null);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    assert.equal(getSupabaseConfigStatus().status, 'invalid');
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_secret_TEST_ONLY';
    assert.equal(getSupabaseConfigStatus().status, 'invalid');
    assert.ok(!JSON.stringify(getSupabaseConfigStatus()).includes('TEST_ONLY'));
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_TEST_ONLY';
    assert.equal(getSupabaseConfigStatus().status, 'configured');
    assert.equal(getSupabaseBrowserClient(), null, 'never instantiate the browser singleton during SSR');
    for (const url of ['invalid', 'http://example.com', 'https://user:password@example.com', 'https://example.com?secret=value']) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      assert.equal(getSupabaseConfigStatus().status, 'invalid');
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    assert.equal(getSupabaseConfigStatus().status, 'configured');
  } finally {
    names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; });
  }
});

const { startGoogleSignIn, completeGoogleSignIn } = require('../src/lib/supabase/googleAuth.ts');
const { startAppleSignIn } = require('../src/lib/supabase/appleAuth.ts');

test('Apple OAuth uses production callback, restores relay-email session, loads own preferences and logs out', async () => {
  const { completeOAuthSignIn } = require('../src/lib/supabase/googleAuth.ts');
  const { loadPreferences } = require('../src/lib/supabase/preferencesRepository.ts');
  const user = { id: '10000000-0000-0000-0000-000000000001', email: 'test@privaterelay.appleid.com', app_metadata: { provider: 'apple' }, user_metadata: {} };
  let current = { user, access_token: 'test-only' }, exchanges = 0;
  const client = { auth: {
    async signInWithOAuth(request) {
      assert.equal(request.provider, 'apple');
      assert.equal(request.options.redirectTo, 'https://routewise.example/auth/callback');
      assert.equal(request.options.skipBrowserRedirect, true);
      return { data: { url: 'https://example.supabase.co/auth/v1/authorize?provider=apple' }, error: null };
    },
    async exchangeCodeForSession(code, options) { exchanges++; assert.equal(code, 'apple-code'); assert.equal(options.flowId, 'apple-flow'); return { data: { session: current }, error: null }; },
    async getSession() { return { data: { session: current }, error: null }; },
    async getUser() { return { data: { user: current?.user ?? null }, error: null }; },
    async signOut(options) { assert.equal(options.scope, 'local'); current = null; return { error: null }; },
  }, from(table) {
    assert.equal(table, 'user_preferences');
    const query = { select() { return query; }, eq(column, id) { assert.equal(column, 'user_id'); assert.equal(id, user.id); return query; },
      async maybeSingle() { return { error: null, data: { user_id: user.id, preferred_transport_mode: 'PUBLIC_TRANSIT', route_priority: 'BEST', max_walking_minutes: null, max_budget: null, created_at: '2026-10-13T12:00:00Z', updated_at: '2026-10-13T12:00:00Z' } }; } };
    return query;
  } };
  assert.match(await startAppleSignIn(client, 'https://routewise.example'), /provider=apple/);
  const params = new URLSearchParams('code=apple-code&sb_flow_id=apple-flow');
  await Promise.all([completeOAuthSignIn(client, params), completeOAuthSignIn(client, params)]);
  assert.equal(exchanges, 1);
  assert.equal((await loadPreferences(client)).userId, user.id);
  await signOut(client);
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.equal(await loadPreferences(client), null);
  await assert.rejects(startAppleSignIn({ auth: { async signInWithOAuth() { return { data: {}, error: { message: 'PRIVATE_INTERNAL' } }; } } }, 'https://routewise.example'), /continue as a guest/);
});

test('Google OAuth uses a fixed callback and confirms a persisted PKCE session once', async () => {
  let exchanges = 0;
  const session = { user: { id: 'user' }, access_token: 'test-token' };
  const client = { auth: {
    async signInWithOAuth(request) {
      assert.equal(request.provider, 'google');
      assert.equal(request.options.redirectTo, 'http://localhost:3000/auth/callback');
      assert.equal(request.options.skipBrowserRedirect, true);
      return { data: { url: 'https://example.supabase.co/auth/v1/authorize?provider=google' }, error: null };
    },
    async exchangeCodeForSession(code, options) {
      exchanges++; assert.equal(code, 'test-code'); assert.deepEqual(options, { flowId: 'test-flow' });
      return { data: { session }, error: null };
    },
    async getSession() { return { data: { session }, error: null }; },
  } };
  assert.match(await startGoogleSignIn(client, 'http://localhost:3000'), /provider=google/);
  const params = new URLSearchParams('code=test-code&sb_flow_id=test-flow&next=https://untrusted.example');
  await Promise.all([completeGoogleSignIn(client, params), completeGoogleSignIn(client, params)]);
  assert.equal(exchanges, 1);
});

test('cancelled, missing, failed and unpersisted OAuth sessions never succeed', async () => {
  const client = { auth: { exchangeCodeForSession() { throw new Error('Must not exchange'); } } };
  await assert.rejects(completeGoogleSignIn(client, new URLSearchParams('error=access_denied&code=ignored')), /continue as a guest/);
  await assert.rejects(completeGoogleSignIn(client, new URLSearchParams()), /continue as a guest/);
  await assert.rejects(startGoogleSignIn({ auth: { async signInWithOAuth() { return { data: {}, error: new Error('Failed') }; } } }, 'http://localhost:3000'), /continue as a guest/);
  const failed = { auth: { async exchangeCodeForSession() { return { data: { session: null }, error: new Error('Expired') }; } } };
  await assert.rejects(completeGoogleSignIn(failed, new URLSearchParams('code=expired')), /continue as a guest/);
  const unsaved = { auth: {
    async exchangeCodeForSession() { return { data: { session: { user: { id: 'u' }, access_token: 'test' } }, error: null }; },
    async getSession() { return { data: { session: null }, error: null }; },
  } };
  await assert.rejects(completeGoogleSignIn(unsaved, new URLSearchParams('code=unsaved')), /continue as a guest/);
});

test('callback survives Strict Mode effect replay after clearing the OAuth URL', async () => {
  const path = require('node:path'), Module = require('node:module');
  const oldResolve = Module._resolveFilename;
  Module._resolveFilename = function(request, ...args) { return oldResolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args); };
  require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  const React = require('react');
  const clientModule = require('../src/lib/supabase/client.ts');
  const original = { effect: React.useEffect, ref: React.useRef, state: React.useState, client: clientModule.getSupabaseBrowserClient, window: global.window };
  let effect, exchanges = 0, cleared = 0, returned = 0;
  const session = { user: { id: 'strict-user' }, access_token: 'test' };
  React.useEffect = callback => { effect = callback; };
  React.useRef = () => ({ current: null });
  React.useState = initial => [initial, () => {}];
  clientModule.getSupabaseBrowserClient = () => ({ auth: {
    async exchangeCodeForSession() { exchanges++; return { data: { session }, error: null }; },
    async getSession() { return { data: { session }, error: null }; },
  } });
  global.window = { location: { search: '?code=strict-test', hash: '', replace(url) { assert.equal(url, '/'); returned++; } },
    history: { replaceState(_state, _unused, url) { cleared++; assert.equal(url, '/auth/callback'); global.window.location.search = ''; } } };
  try {
    require('../src/app/auth/callback/page.tsx').default();
    const cleanup = effect(); cleanup(); effect();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(exchanges, 1); assert.equal(cleared, 1); assert.equal(returned, 1);
  } finally {
    React.useEffect = original.effect; React.useRef = original.ref; React.useState = original.state;
    clientModule.getSupabaseBrowserClient = original.client; Module._resolveFilename = oldResolve;
    if (original.window === undefined) delete global.window; else global.window = original.window;
  }
});

const { createEmailAccount, signInWithEmail, signOut, confirmEmail, emailAuthErrorMessage } = require('../src/lib/supabase/emailAuth.ts');

test('email signup respects confirmation settings and keeps duplicate responses neutral', async () => {
  const password = 'test-password-only';
  const client = { auth: { async signUp(request) {
    assert.equal(request.email, 'user@example.com'); assert.equal(request.password, password);
    assert.equal(request.options.emailRedirectTo, 'http://localhost:3000/auth/callback');
    return { data: { user: { id: 'pending' }, session: null }, error: null };
  } } };
  assert.deepEqual(await createEmailAccount(client, ' user@example.com ', password, 'http://localhost:3000'), { status: 'confirmation-required' });
  client.auth.signUp = async () => ({ data: { user: { id: 'confirmed' }, session: { user: { id: 'confirmed' } } }, error: null });
  assert.deepEqual(await createEmailAccount(client, 'user@example.com', password, 'http://localhost:3000'), { status: 'signed-in' });
  client.auth.signUp = async () => ({ data: { user: { identities: [] }, session: null }, error: null });
  assert.deepEqual(await createEmailAccount(client, 'user@example.com', password, 'http://localhost:3000'), { status: 'confirmation-required' });
  assert.match(emailAuthErrorMessage({ code: 'user_already_exists' }), /signing in/);
  assert.match(emailAuthErrorMessage({ code: 'weak_password' }), /stronger password/);
  assert.match(emailAuthErrorMessage({ code: 'email_not_confirmed' }), /Confirm your email/);
});

test('email signin, local signout, and errors use the existing Supabase auth service', async () => {
  let logout = 0;
  const client = { auth: {
    async signInWithPassword(request) {
      assert.deepEqual(request, { email: 'user@example.com', password: 'test-only' });
      return { data: { session: { user: { id: 'u' } } }, error: null };
    },
    async signOut(options) { assert.deepEqual(options, { scope: 'local' }); logout++; return { error: null }; },
  } };
  await signInWithEmail(client, ' user@example.com ', 'test-only');
  await signOut(client); assert.equal(logout, 1);
  client.auth.signInWithPassword = async () => ({ data: {}, error: { code: 'invalid_credentials' } });
  await assert.rejects(signInWithEmail(client, 'user@example.com', 'bad'), error => emailAuthErrorMessage(error) === 'Email or password is incorrect.');
  client.auth.signOut = async () => ({ error: { code: 'over_request_rate_limit' } });
  await assert.rejects(signOut(client), error => /Too many attempts/.test(emailAuthErrorMessage(error)));
  assert.ok(!emailAuthErrorMessage(new Error('password=private')).includes('private'));
});

test('email confirmation verifies allowed token types and persists a session', async () => {
  const session = { user: { id: 'confirmed' }, access_token: 'test' };
  let calls = 0;
  const client = { auth: {
    async verifyOtp(request) { calls++; assert.deepEqual(request, { token_hash: 'test-hash', type: 'email' }); return { data: { session }, error: null }; },
    async getSession() { return { data: { session }, error: null }; },
  } };
  await confirmEmail(client, new URLSearchParams('token_hash=test-hash&type=email'));
  await assert.rejects(confirmEmail(client, new URLSearchParams('token_hash=test-hash&type=recovery')));
  await assert.rejects(confirmEmail(client, new URLSearchParams('type=email')));
  assert.equal(calls, 1);
  client.auth.verifyOtp = async () => ({ data: {}, error: { code: 'otp_expired' } });
  await assert.rejects(confirmEmail(client, new URLSearchParams('token_hash=expired&type=email')), error => /expired/.test(emailAuthErrorMessage(error)));
});

const { observeSession, AUTH_SERVICE_ERROR } = require('../src/lib/supabase/sessionState.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
const validSession = provider => ({ user: { id: `${provider}-user`, app_metadata: { provider } }, access_token: 'test-token', expires_at: Date.now() / 1000 + 3600 });

function sessionClient(read) {
  let listener, unsubscribed = 0;
  return {
    client: { auth: {
      getSession: read,
      onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() { unsubscribed++; } } } }; },
    } },
    emit(event, session) { listener(event, session); },
    unsubscribed() { return unsubscribed; },
  };
}

test('session observer resolves fresh/unconfigured guests and Google/email/Apple reloads', async () => {
  const guestStates = [];
  const guest = observeSession(null, state => guestStates.push(state));
  assert.equal(guestStates.length, 0, 'initialization is background work');
  await flush();
  assert.deepEqual(guestStates[0], { session: null, isAuthLoading: false, authError: null });
  guest.dispose();
  for (const provider of ['google', 'email', 'apple']) {
    const session = validSession(provider), states = [];
    const fake = sessionClient(async () => ({ data: { session }, error: null }));
    const observer = observeSession(fake.client, state => states.push(state));
    await flush();
    assert.equal(states.at(-1).session.user.app_metadata.provider, provider);
    assert.equal(states.at(-1).isAuthLoading, false);
    observer.dispose(); assert.equal(fake.unsubscribed(), 1);
  }
  const fake = sessionClient(async () => ({ data: { session: null }, error: null })), states = [];
  const observer = observeSession(fake.client, state => states.push(state));
  await flush(); assert.equal(states.at(-1).session, null); observer.dispose();
});

test('auth events win over stale restoration and update refreshed tokens/user changes/signout', async () => {
  let finishRead;
  const states = [];
  const fake = sessionClient(() => new Promise(resolve => { finishRead = resolve; }));
  const observer = observeSession(fake.client, state => states.push(state));
  const signedIn = validSession('google');
  fake.emit('SIGNED_IN', signedIn);
  const refreshed = { ...signedIn, access_token: 'refreshed-token' };
  fake.emit('TOKEN_REFRESHED', refreshed);
  assert.equal(states.at(-1).session.access_token, 'refreshed-token');
  fake.emit('USER_UPDATED', { ...refreshed, user: { ...refreshed.user, email: 'updated@example.com' } });
  assert.equal(states.at(-1).session.user.email, 'updated@example.com');
  fake.emit('SIGNED_OUT', null);
  finishRead({ data: { session: signedIn }, error: null });
  await flush(); assert.equal(states.at(-1).session, null);
  fake.emit('SIGNED_IN', validSession('email'));
  observer.clearSession(); assert.equal(states.at(-1).session, null);
  observer.dispose();
  const count = states.length; fake.emit('SIGNED_IN', signedIn);
  assert.equal(states.length, count, 'cleanup ignores late events');
});

test('expired sessions and authentication service errors settle safely as guests', async () => {
  for (const response of [
    { data: { session: { ...validSession('email'), expires_at: Date.now() / 1000 - 1 } }, error: null },
    { data: { session: null }, error: { message: 'Private service error' } },
  ]) {
    const states = [], fake = sessionClient(async () => response);
    const observer = observeSession(fake.client, state => states.push(state));
    await flush(); assert.equal(states.at(-1).session, null); assert.equal(states.at(-1).isAuthLoading, false);
    if (response.error) assert.equal(states.at(-1).authError, AUTH_SERVICE_ERROR);
    observer.dispose();
  }
  const states = [], fake = sessionClient(async () => { throw new Error('Offline'); });
  const observer = observeSession(fake.client, state => states.push(state));
  await flush(); assert.equal(states.at(-1).authError, AUTH_SERVICE_ERROR);
  fake.emit('SIGNED_IN', validSession('email'));
  assert.equal(states.at(-1).authError, null, 'later auth event recovers cleanly');
  observer.dispose();
});

test('session expiry clears stale identity when no successful refresh arrives', async () => {
  const states = [], fake = sessionClient(async () => ({ data: { session: null }, error: null }));
  const observer = observeSession(fake.client, state => states.push(state));
  await flush();
  fake.emit('SIGNED_IN', { ...validSession('email'), expires_at: (Date.now() + 30) / 1000 });
  assert.ok(states.at(-1).session);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(states.at(-1).session, null); observer.dispose();
});

test('synchronous initial session is not overwritten by a stale initial read', async () => {
  const states = [], session = validSession('google');
  const client = { auth: {
    onAuthStateChange(callback) { callback('INITIAL_SESSION', session); return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session: null }, error: null }; },
  } };
  const observer = observeSession(client, state => states.push(state));
  await flush(); assert.equal(states.at(-1).session, session); observer.dispose();
});

test('account menu exposes guest actions and signed-in profile without raw auth metadata', () => {
  const path = require('node:path'), Module = require('node:module'), React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const oldResolve = Module._resolveFilename;
  Module._resolveFilename = function(request, ...args) { return oldResolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args); };
  const provider = require('../src/components/AuthProvider.tsx');
  const preferencesProvider = require('../src/components/PreferencesProvider.tsx');
  const savedPreferences = preferencesProvider.usePreferences;
  let preferencesState = { isPreferencesLoading: false, isPreferencesSaving: false, preferencesError: null, retryPreferences() {} };
  preferencesProvider.usePreferences = () => preferencesState;
  const savedAuth = provider.useAuth, savedState = React.useState;
  const AccountMenu = require('../src/components/AccountMenu.tsx').default;
  let auth = { user: null, isAuthenticated: false, isAuthLoading: false, authError: null, signOut: async () => {} };
  provider.useAuth = () => auth;
  try {
    const guest = renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} }));
    for (const label of ['Continue as Guest', 'Sign in with Google', 'Sign in with email/password', 'Create account', 'An account is optional']) assert.ok(guest.includes(label));
    assert.ok(!guest.includes('Sign in with Apple'));
    const { AUTH_FEATURES } = require('../src/lib/authFeatures.ts');
    const OAuthControl = require('../src/components/GoogleSignIn.tsx').default;
    assert.equal(renderToStaticMarkup(React.createElement(OAuthControl, { provider: 'apple', onGuest() {} })), '');
    for (const view of ['signin', 'signup']) {
      React.useState = initial => savedState(initial === 'entry' ? view : initial);
      const emailView = renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} }));
      assert.ok(!emailView.includes('Sign in with Apple'));
      assert.ok(emailView.includes('Continue as Guest'));
      assert.ok(emailView.includes('name="email"'));
      assert.ok(emailView.includes('name="password"'));
    }
    React.useState = savedState;
    const disabledApple = AUTH_FEATURES.apple;
    try {
      AUTH_FEATURES.apple = true;
      assert.match(renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} })), /Sign in with Apple/);
    } finally { AUTH_FEATURES.apple = disabledApple; }
    React.useState = initial => savedState(initial === 'entry' ? 'profile' : initial);
    auth = { ...auth, isAuthenticated: true, user: { email: 'member@example.com', id: 'PRIVATE_ID', user_metadata: { full_name: 'Test Member', internal_data: 'PRIVATE_METADATA' } }, session: { access_token: 'PRIVATE_TOKEN' } };
    const member = renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} }));
    for (const label of ['Test Member', 'member@example.com', 'Profile', 'Your account', 'Sign out']) assert.ok(member.includes(label));
    for (const value of ['PRIVATE_ID', 'PRIVATE_METADATA', 'PRIVATE_TOKEN']) assert.ok(!member.includes(value));
    auth = { ...auth, user: { ...auth.user, user_metadata: { full_name: '<img src=x onerror=alert(1)>', avatar_url: 'javascript:alert(1)' } } };
    const hostileProfile = renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} }));
    assert.ok(hostileProfile.includes('&lt;img'));
    assert.ok(!hostileProfile.includes('<img'));
    assert.ok(!hostileProfile.includes('javascript:'));
    auth = { ...auth, user: { id: 'PRIVATE_ID', email: 'test@privaterelay.appleid.com', app_metadata: { provider: 'apple' }, user_metadata: {} } };
    const appleMember = renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} }));
    assert.match(appleMember, /test@privaterelay.appleid.com/);
    assert.match(appleMember, /Sign out/);
    auth = { ...auth, user: { ...auth.user, user_metadata: { full_name: ' ', name: 'Fallback name' } } };
    preferencesState = { ...preferencesState, preferences: { preferredTransportMode: 'PUBLIC_TRANSIT', routePriority: 'CHEAPEST', maxWalkingMinutes: 8, maxBudget: null } };
    const savedProfile = renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} }));
    for (const label of ['Fallback name', 'Saved travel defaults', 'Public Transit', 'Cheapest', '8 min', 'Not saved', 'Save defaults']) assert.ok(savedProfile.includes(label));
    assert.match(savedProfile, /name="walking"[^>]*value="8"/);
    assert.match(savedProfile, /name="budget"[^>]*value=""/);
    assert.ok(!guest.includes('Save travel defaults'));
    preferencesState = { ...preferencesState, isPreferencesLoading: true };
    assert.match(renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} })), /Loading saved defaults/);
    preferencesState = { ...preferencesState, isPreferencesLoading: false, isPreferencesSaving: true };
    assert.match(renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} })), /Saving your defaults/);
    preferencesState = { ...preferencesState, isPreferencesSaving: false, preferencesError: 'Saved defaults could not be loaded. You can still plan your trip normally.' };
    assert.match(renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} })), /Retry loading defaults/);
    auth = { ...auth, isAuthenticated: false, user: null, isAuthLoading: true };
    React.useState = savedState;
    const loading = renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} }));
    assert.ok(!loading.includes('Saved travel defaults'), 'guest never sees the prior account defaults');
    assert.ok(loading.includes('Checking account status'));
    assert.match(loading, /<button[^>]*>Continue as Guest<\/button>/);
    auth = { ...auth, isAuthLoading: false, authError: 'Account service unavailable.' };
    const failed = renderToStaticMarkup(React.createElement(AccountMenu, { onContinueAsGuest() {} }));
    assert.match(failed, /Retry account status/);
    assert.match(failed, /<button[^>]*>Continue as Guest<\/button>/);
  } finally { preferencesProvider.usePreferences = savedPreferences; provider.useAuth = savedAuth; React.useState = savedState; Module._resolveFilename = oldResolve; }
});

// Regression: an OAuth response must not redirect after guest dismissal.
test('Google/Apple triggers reject double submissions and cancel delayed redirects on guest/dismissal', async () => {
  const { AUTH_FEATURES } = require('../src/lib/authFeatures.ts');
  const savedAppleFlag = AUTH_FEATURES.apple;
  AUTH_FEATURES.apple = true; // Preserve regression coverage for the dormant Apple implementation.
  const path = require('node:path'), Module = require('node:module'), React = require('react');
  const oldResolve = Module._resolveFilename;
  Module._resolveFilename = function(request, ...args) { return oldResolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args); };
  const auth = require('../src/components/AuthProvider.tsx'), config = require('../src/lib/supabase/config.ts');
  const clients = require('../src/lib/supabase/client.ts'), oauth = require('../src/lib/supabase/googleAuth.ts');
  const apple = require('../src/lib/supabase/appleAuth.ts');
  const saved = { state: React.useState, ref: React.useRef, effect: React.useEffect, auth: auth.useAuth,
    config: config.getSupabaseConfigStatus, client: clients.getSupabaseBrowserClient, start: oauth.startGoogleSignIn, appleStart: apple.startAppleSignIn, window: global.window };
  let finish, cleanup, redirected = 0, guest = 0, starts = 0;
  React.useState = initial => [initial, () => {}]; React.useRef = initial => ({ current: initial });
  React.useEffect = callback => { cleanup = callback(); };
  auth.useAuth = () => ({ isAuthenticated: false, isAuthLoading: false });
  config.getSupabaseConfigStatus = () => ({ status: 'configured' });
  clients.getSupabaseBrowserClient = () => ({});
  oauth.startGoogleSignIn = apple.startAppleSignIn = () => { starts++; return new Promise(resolve => { finish = resolve; }); };
  global.window = { location: { origin: 'http://localhost:3000', assign() { redirected++; } } };
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  try {
    const SignIn = require('../src/components/GoogleSignIn.tsx').default;
    for (const provider of ['google', 'apple']) for (const action of ['guest', 'close']) {
      const tree = nodes(SignIn({ provider, onGuest() { guest++; } }));
      const trigger = tree.find(node => node.type === 'button' && node.props.children === `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'}`);
      trigger.props.onClick(); trigger.props.onClick();
      if (action === 'guest') tree.find(node => node.type === 'button' && node.props.children === 'Continue as Guest').props.onClick();
      else cleanup();
      finish('https://example.supabase.co/auth/v1/authorize');
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(redirected, 0); assert.equal(guest, 2); assert.equal(starts, 4);
  } finally {
    AUTH_FEATURES.apple = savedAppleFlag;
    cleanup?.(); React.useState = saved.state; React.useRef = saved.ref; React.useEffect = saved.effect;
    auth.useAuth = saved.auth; config.getSupabaseConfigStatus = saved.config; clients.getSupabaseBrowserClient = saved.client; oauth.startGoogleSignIn = saved.start; apple.startAppleSignIn = saved.appleStart;
    Module._resolveFilename = oldResolve;
    if (saved.window === undefined) delete global.window; else global.window = saved.window;
  }
});
