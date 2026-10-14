export type NavigationPlatform = 'ANDROID' | 'IOS' | 'IPADOS' | 'DESKTOP' | 'UNKNOWN';

/** Minimal runtime signals, injectable for tests without replacing browser globals. */
export interface NavigationPlatformSignals {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string; mobile?: boolean };
}

/** Call in a client event or effect, not during the initial React render.
 * No browser globals are read at module initialization. SSR returns UNKNOWN.
 * Classification is a best-effort hint, not proof of device or installed apps.
 */
export function detectNavigationPlatform(signals?: NavigationPlatformSignals): NavigationPlatform {
  if (signals === undefined) {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'UNKNOWN';
    signals = navigator as Navigator & NavigationPlatformSignals;
  }
  const ua = signals.userAgent ?? '';
  const platform = signals.platform ?? '';
  const hintedPlatform = signals.userAgentData?.platform?.trim().toLowerCase();

  // Client Hints report the OS even when the UA is reduced or desktop mode is enabled.
  if (hintedPlatform === 'android') return 'ANDROID';
  if (/\biPad\b/i.test(ua) || /^iPad$/i.test(platform)) return 'IPADOS';
  if (/\b(?:iPhone|iPod)\b/i.test(ua) || /^(?:iPhone|iPod)$/i.test(platform)) return 'IOS';
  if (/\bAndroid\b/i.test(ua)) return 'ANDROID';

  // iPadOS desktop browsing identifies as a Mac, but exposes multiple touch points.
  const macLike = hintedPlatform === 'macos' || /^Mac/i.test(platform) || /\bMacintosh\b/i.test(ua);
  if (macLike && (signals.maxTouchPoints ?? 0) > 1) return 'IPADOS';
  if (hintedPlatform === 'ios') return 'IOS';

  // A generic mobile token is insufficient to choose Android or Apple navigation.
  if (signals.userAgentData?.mobile === true || /\b(?:Mobile|Windows Phone)\b/i.test(ua)) return 'UNKNOWN';
  if (['windows', 'macos', 'linux', 'chrome os'].includes(hintedPlatform ?? '')) return 'DESKTOP';
  if (macLike || /^(?:Win32|Win64|Windows|Linux|CrOS)/i.test(platform)
    || /\b(?:Windows NT|X11|CrOS)\b/i.test(ua)) return 'DESKTOP';
  return 'UNKNOWN';
}
