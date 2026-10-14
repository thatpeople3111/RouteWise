import { isValidNavigationPoint, toNavigationPoint } from './navigationHandoff';
import type { NavigationHandoffRequest, NavigationPointSource } from './navigationHandoff';
import { detectNavigationPlatform } from './navigationPlatform';
import type { NavigationPlatform } from './navigationPlatform';
import type { Location, RideshareOption } from './types';
import { buildUberHandoff } from './uberHandoff';
import { buildWaymoHandoff, waymoProviderFlow } from './waymoHandoff';
import { buildLyftRideLink } from '../server/services/rideshareOptions';
import { validateExternalHandoffUrl } from './externalHandoff';

export interface RideshareNavigationEndpoints {
  context?: 'STRANDED_RESUME';
  pickup?: NavigationPointSource | Location;
  dropoff?: NavigationPointSource | Location;
}
function resolved(source: RideshareNavigationEndpoints['pickup']) {
  if (!source) return undefined;
  if (isValidNavigationPoint(source) || 'coordinates' in source || 'location' in source) {
    return toNavigationPoint(source as NavigationPointSource);
  }
  return undefined;
}
type ActionResult = { url: string; webFallbackUrl?: string; notice?: string; pickupLabel?: string; dropoffLabel?: string };
type ProviderBuilder = (request: NavigationHandoffRequest | undefined, option: RideshareOption, platform: NavigationPlatform) => ActionResult;
// Central dispatch: future providers can add an adapter without changing card markup.
const builders: Partial<Record<RideshareOption['provider'], ProviderBuilder>> = {
  LYFT: (request, option) => request
    ? { url: buildLyftRideLink(request.origin, request.destination, request.destination.label ?? request.destination.address ?? '') }
    : { url: option.fare?.bookingUrl ?? option.bookingUrl ?? 'https://ride.lyft.com/' },
  UBER: (request, _option, platform) => request ? buildUberHandoff(request, platform)
    : { url: 'https://m.uber.com/', notice: 'Choose your pickup and destination in Uber; resolved locations are unavailable.' },
  WAYMO: (request, option, platform) => {
    if (!request) return { ...waymoProviderFlow(option, platform), notice: 'Enter your pickup and destination in Waymo.' };
    const result = buildWaymoHandoff(request, option, platform);
    if (!result.enabled) throw new Error(result.reason);
    return { ...result, notice: 'Enter your pickup and destination in Waymo; this link cannot preload them.' };
  },
};
export function hasRideshareProviderAction(option: RideshareOption, variant: 'results' | 'stranded' = 'results', endpoints?: RideshareNavigationEndpoints) {
  return option.available && ((variant === 'results' && option.provider !== 'LYFT' || endpoints?.context === 'STRANDED_RESUME') && !!builders[option.provider] || !!(option.fare?.bookingUrl ?? option.bookingUrl));
}
export function prepareRideshareProviderAction(option: RideshareOption, endpoints?: RideshareNavigationEndpoints,
  variant: 'results' | 'stranded' = 'results', platform: NavigationPlatform = detectNavigationPlatform()): ActionResult {
  if (!option.available) throw new Error('This rideshare provider is unavailable for this trip.');
  const resume = endpoints?.context === 'STRANDED_RESUME';
  const builder = resume || variant === 'results' && option.provider !== 'LYFT' ? builders[option.provider] : undefined;
  if (builder) {
    let pickup, dropoff;
    try { pickup = resolved(endpoints?.pickup); dropoff = resolved(endpoints?.dropoff); } catch { /* Provider landing remains usable without coordinate prefill. */ }
    const request: NavigationHandoffRequest | undefined = pickup && dropoff ? {
      origin: pickup, destination: dropoff, orderedStops: [], travelMode: 'DRIVING', context: resume ? 'STRANDED_RESUME' : 'NORMAL',
      rideshare: { pickup, dropoff }, routeId: option.id,
    } : undefined;
    const result = builder(request, option, platform);
    return { ...result, url: validateExternalHandoffUrl(result.url, option.provider),
      ...(result.webFallbackUrl ? { webFallbackUrl: validateExternalHandoffUrl(result.webFallbackUrl, option.provider) } : {}),
      pickupLabel: pickup?.label ?? pickup?.address ?? (pickup ? `${pickup.latitude}, ${pickup.longitude}` : undefined),
      dropoffLabel: dropoff?.label ?? dropoff?.address ?? (dropoff ? `${dropoff.latitude}, ${dropoff.longitude}` : undefined) };
  }
  const url = option.fare?.bookingUrl ?? option.bookingUrl;
  if (!url) throw new Error('No provider link is available.');
  try { return { url: validateExternalHandoffUrl(url, option.provider) }; }
  catch {
    const fallback = option.provider === 'UBER' ? 'https://m.uber.com/' : option.provider === 'WAYMO' ? 'https://waymo.com/rides/' : 'https://ride.lyft.com/';
    return { url: fallback, notice: 'Provider prefill is unavailable. Enter your pickup and destination in the provider app.' };
  }
}
