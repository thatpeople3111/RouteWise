import { toNavigationPoint } from './navigationHandoff';
import type { NavigationHandoffRequest, NavigationPoint } from './navigationHandoff';
import type { NavigationPlatform } from './navigationPlatform';
import type { RideshareOption } from './types';

type WaymoOption = Pick<RideshareOption, 'provider' | 'available' | 'bookingUrl' | 'fare' | 'unavailableReason'>;
interface WaymoHandoffData {
  pickup: NavigationPoint;
  dropoff: NavigationPoint;
  /** No verified public endpoint-preload contract; never imply a booking was prepared. */
  exactRepresentation: false;
  endpointsPreloaded: false;
}
export type WaymoHandoffResult = WaymoHandoffData & (
  | { enabled: true; url: string; webFallbackUrl: string; flow: 'PROVIDER_LINK' | 'LANDING_FLOW' }
  | { enabled: false; url?: never; webFallbackUrl?: never; reason: string }
);

// Verified public flows only. A provider-hosted URL alone does not prove parameter support.
const supportedLinks = new Set([
  'https://waymo.com/waymo-one/', // Existing RouteWise provider URL.
  'https://waymo.com/rides/', 'https://www.waymo.com/rides/',
  'https://waymo.com/download/', 'https://www.waymo.com/download/',
  'https://waymo.smart.link/2wt03oz01', // Published Download and ride link on waymo.com/rides/.
]);

export function waymoProviderFlow(option: WaymoOption, platform: NavigationPlatform = 'UNKNOWN') {
  if (option.provider !== 'WAYMO' || option.available !== true) throw new Error('Waymo is unavailable for this trip.');
  const providerUrl = [option.fare?.bookingUrl, option.bookingUrl].find(url => url && supportedLinks.has(url));
  const webFallbackUrl = 'https://waymo.com/rides/';
  const mobile = platform === 'ANDROID' || platform === 'IOS' || platform === 'IPADOS';
  return { url: providerUrl ?? (mobile ? 'https://waymo.com/download/' : webFallbackUrl),
    webFallbackUrl, flow: providerUrl ? 'PROVIDER_LINK' as const : 'LANDING_FLOW' as const };
}

/** Availability comes from existing RouteWise service-area logic, never from this adapter.
 * Pure/SSR-safe: no network, location lookup, dispatch, booking or app-installed detection.
 */
export function buildWaymoHandoff(request: NavigationHandoffRequest, option: WaymoOption,
  platform: NavigationPlatform = 'UNKNOWN'): WaymoHandoffResult {
  if (option.provider !== 'WAYMO') throw new Error('Waymo handoff requires a Waymo option.');
  const data: WaymoHandoffData = {
    pickup: toNavigationPoint(request.rideshare?.pickup ?? request.origin),
    dropoff: toNavigationPoint(request.rideshare?.dropoff ?? request.destination),
    exactRepresentation: false, endpointsPreloaded: false,
  };
  if (option.available !== true) return {
    ...data, enabled: false, reason: option.unavailableReason ?? 'Waymo is unavailable for this trip.',
  };
  // Preserve the existing fare-booking-url precedence, but only for verified, unmodified links.
  return {
    ...data, enabled: true,
    ...waymoProviderFlow(option, platform),
  };
}
