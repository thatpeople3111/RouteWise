export type HandoffProvider = 'GOOGLE' | 'APPLE' | 'UBER' | 'LYFT' | 'WAYMO';
const policies = {
  'www.google.com': { provider: 'GOOGLE', paths: ['/maps/dir/'], keys: ['api', 'origin', 'origin_place_id', 'destination', 'destination_place_id', 'travelmode', 'dir_action', 'waypoints', 'waypoint_place_ids'] },
  'maps.apple.com': { provider: 'APPLE', paths: ['/', '/directions'], keys: ['saddr', 'daddr', 'dirflg', 'source', 'destination', 'mode', 'waypoint'] },
  'm.uber.com': { provider: 'UBER', paths: ['/', '/looking', '/looking/', '/ul/'], keys: ['pickup', 'drop[0]', 'action', 'pickup[latitude]', 'pickup[longitude]', 'pickup[nickname]', 'pickup[formatted_address]', 'dropoff[latitude]', 'dropoff[longitude]', 'dropoff[nickname]', 'dropoff[formatted_address]'] },
  'ride.lyft.com': { provider: 'LYFT', paths: ['/'], keys: ['id', 'pickup[latitude]', 'pickup[longitude]', 'destination[latitude]', 'destination[longitude]', 'destination[address]'] },
  'waymo.com': { provider: 'WAYMO', paths: ['/waymo-one/', '/rides/', '/download/'], keys: [] },
  'www.waymo.com': { provider: 'WAYMO', paths: ['/waymo-one/', '/rides/', '/download/'], keys: [] },
  'waymo.smart.link': { provider: 'WAYMO', paths: ['/2wt03oz01'], keys: [] },
} satisfies Record<string, { provider: HandoffProvider; paths: string[]; keys: string[] }>;

/** Exact provider hosts/paths/query fields only; no redirect or credential parameters. */
export function validateExternalHandoffUrl(value: unknown, provider?: HandoffProvider): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('No valid external navigation link is available.');
  if (/[\u0000-\u0020\\]/.test(value)) throw new Error('No valid external navigation link is available.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('No valid external navigation link is available.'); }
  const policy = (policies as Record<string, { provider: HandoffProvider; paths: string[]; keys: string[] }>)[url.hostname];
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
    || !policy || provider && policy.provider !== provider || !policy.paths.includes(url.pathname)
    || [...url.searchParams.keys()].some(key => !policy.keys.includes(key))) {
    throw new Error('No valid external navigation link is available.');
  }
  for (const [key, queryValue] of url.searchParams) {
    if (/\[(latitude|longitude)\]$/.test(key)) {
      const limit = key.endsWith('[latitude]') ? 90 : 180;
      if (!queryValue.trim() || !Number.isFinite(Number(queryValue)) || Math.abs(Number(queryValue)) > limit) {
        throw new Error('No valid external navigation link is available.');
      }
    }
    if (policy.provider === 'UBER' && (key === 'pickup' || key === 'drop[0]')) {
      let point: Record<string, unknown>;
      try { point = JSON.parse(queryValue); } catch { throw new Error('No valid external navigation link is available.'); }
      if (!isValidNavigationPoint(point) || Object.keys(point).some(field => !['latitude', 'longitude', 'addressLine1', 'addressLine2'].includes(field))
        || ['addressLine1', 'addressLine2'].some(field => (point as Record<string, unknown>)[field] !== undefined && typeof (point as Record<string, unknown>)[field] !== 'string')) {
        throw new Error('No valid external navigation link is available.');
      }
    }
  }
  return url.toString();
}

/** With noopener, null can mean either success or blocking. Never infer app installation. */
export function openExternalHandoff(value: unknown): { message?: string } {
  const url = validateExternalHandoffUrl(value);
  if (typeof window === 'undefined') return { message: 'Open the link below in your browser.' };
  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    return opened ? {} : { message: 'If the app did not open, use a link below.' };
  } catch {
    return { message: 'The browser could not open the app. Use a link below.' };
  }
}
import { isValidNavigationPoint } from './navigationHandoff';

