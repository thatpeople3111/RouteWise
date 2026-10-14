/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const filename = require('node:path').join(__dirname, '../src/lib/navigationPlatform.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(globals = {}) {
  const exports = {};
  vm.runInNewContext(compiled, { exports, ...globals });
  return exports.detectNavigationPlatform;
}
const detect = load();
const cases = [
  ['Android Chrome', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 }, 'ANDROID'],
  ['iPhone Safari', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 }, 'IOS'],
  ['iPad Safari mobile mode', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPad', maxTouchPoints: 5 }, 'IPADOS'],
  ['iPad Safari desktop mode', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }, 'IPADOS'],
  ['Windows Chrome', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', platform: 'Win32', maxTouchPoints: 0 }, 'DESKTOP'],
  ['macOS browser', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 }, 'DESKTOP'],
  ['unknown agent', { userAgent: 'Unrecognized/1.0' }, 'UNKNOWN'],
  ['empty signals', {}, 'UNKNOWN'],
  ['Android client hints with desktop UA', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', userAgentData: { platform: 'Android', mobile: false } }, 'ANDROID'],
  ['Windows client hints with reduced UA', { userAgentData: { platform: 'Windows', mobile: false } }, 'DESKTOP'],
  ['iPad Mac platform with reduced UA', { platform: 'MacIntel', maxTouchPoints: 5 }, 'IPADOS'],
  ['Mac single touch signal', { platform: 'MacIntel', maxTouchPoints: 1 }, 'DESKTOP'],
  ['unknown mobile OS', { platform: 'Linux armv8l', userAgent: 'SomeBrowser Mobile', userAgentData: { mobile: true } }, 'UNKNOWN'],
  ['Windows phone', { userAgent: 'Mozilla/5.0 (Windows Phone 10.0) Mobile' }, 'UNKNOWN'],
  ['Linux desktop', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' }, 'DESKTOP'],
];
for (const [name, signals, expected] of cases) test(name, () => assert.equal(detect(signals), expected));
test('module import and no-argument calls are SSR safe without browser globals', () => {
  assert.equal(load()(), 'UNKNOWN');
  assert.equal(load({ navigator: { userAgent: 'Node.js/22', platform: 'Win32' } })(), 'UNKNOWN');
});
test('no-argument browser call reads runtime signals rather than caching at import', () => {
  const navigator = { userAgentData: { platform: 'Android' } };
  const runtimeDetect = load({ window: {}, navigator });
  assert.equal(runtimeDetect(), 'ANDROID');
  navigator.userAgentData.platform = 'Windows';
  assert.equal(runtimeDetect(), 'DESKTOP');
});
