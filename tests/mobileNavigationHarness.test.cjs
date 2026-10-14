/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args); };
const React = require('react');
const Harness = require('../src/components/NavigationTestHarness.tsx').default;
const Page = require('../src/app/dev/navigation/page.tsx').default;
test('navigation debug page is inaccessible outside development', () => {
  const saved = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production'; assert.throws(() => Page(), /NEXT_HTTP_ERROR_FALLBACK;404/);
    process.env.NODE_ENV = 'test'; assert.throws(() => Page(), /NEXT_HTTP_ERROR_FALLBACK;404/);
    process.env.NODE_ENV = 'development'; assert.equal(Page().type, Harness);
  } finally { if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved; }
});
test('physical-device harness generates all mobile scenarios with runtime iPad detection', () => {
  const state = React.useState;
  const win = Object.getOwnPropertyDescriptor(globalThis, 'window'), nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const slots = []; let cursor = 0;
  React.useState = initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { platform: 'MacIntel', userAgent: 'Macintosh Safari', maxTouchPoints: 5 } });
  try {
    const tree = Harness();
    tree.props.children.find(child => child?.type === 'button').props.onClick();
    assert.equal(slots[1], 'IPADOS');
    assert.equal(slots[0].length, 10);
    assert.equal(new URL(slots[0][0].url).hostname, 'maps.apple.com');
    assert.ok(slots[0].every(link => new URL(link.url).protocol === 'https:'));
    assert.ok(slots[0].some(link => link.name === 'Stranded resume'));
    assert.ok(slots[0].some(link => link.name.startsWith('Uber')));
    assert.ok(slots[0].some(link => link.name.startsWith('Waymo')));
  } finally {
    React.useState = state;
    if (win) Object.defineProperty(globalThis, 'window', win); else delete globalThis.window;
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
  }
});
test('mobile GPS exceptions and negative accuracy recover to Safe Place fallback', () => {
  const Continuation = require('../src/components/SafePlaceContinuation.tsx').default;
  const saved = { state: React.useState, ref: React.useRef, effect: React.useEffect };
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const slots = []; let cursor = 0; const pickups = [];
  React.useState = initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; };
  React.useRef = initial => ({ current: initial }); React.useEffect = () => {};
  const geolocation = { getCurrentPosition() { throw Error('device security exception'); } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation } });
  const props = { context: { activeSafePlace: { latitude: 25.77, longitude: -80.2 }, originalDestination: { latitude: 25.85, longitude: -80.3 } },
    routes: [], onSelect() {}, onClear() {}, onPickupChange: point => pickups.push(point) };
  const refresh = () => { cursor = 0; const tree = Continuation(props); tree.props.children.find(child => child?.type === 'button' && child.props.children === 'Refresh current location').props.onClick(); };
  try {
    refresh(); assert.equal(slots[1], false); assert.match(slots[2], /Location unavailable/);
    geolocation.getCurrentPosition = success => success({ coords: { latitude: 25.78, longitude: -80.2, accuracy: -1 } });
    refresh(); assert.equal(slots[0], undefined); assert.equal(slots[1], false);
    assert.ok(pickups.every(point => point === undefined));
  } finally {
    React.useState = saved.state; React.useRef = saved.ref; React.useEffect = saved.effect;
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
  }
});
