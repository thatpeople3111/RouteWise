import { buildNavigationHandoffFromRoute, isValidNavigationPoint } from './navigationHandoff';
import type { NavigationPointSource, NavigationHandoffRequest } from './navigationHandoff';
import { detectNavigationPlatform } from './navigationPlatform';
import type { NavigationPlatform } from './navigationPlatform';
import { buildGoogleMapsNavigationUrl } from './googleMapsNavigation';
import { buildAppleMapsNavigationUrl } from './appleMapsNavigation';
import { routeAvailabilityCategory } from './routeAvailability';
import type { Location, RouteOption, SuggestedStop } from './types';

export interface NormalNavigationEndpoints {
  /** Main trips and explicitly supplied Safe Place continuation endpoints. */
  context?: 'NORMAL' | 'STRANDED' | 'STRANDED_RESUME';
  safePlace?: NavigationPointSource;
  /** User-requested schedule from TripInput, not an estimated segment time. */
  departureTime?: string;
  arrivalTime?: string;
  origin?: NavigationPointSource;
  destination?: NavigationPointSource;
  /** Exact selected stops, already ordered by RouteWise. Current planner supplies one. */
  optionalStops?: readonly (NavigationPointSource | SuggestedStop)[];
}
export interface NormalRouteNavigationInput extends NormalNavigationEndpoints {
  route: RouteOption;
  tripOrigin?: Location;
  tripDestination?: Location;
  selectedStop?: SuggestedStop | null;
}
export function canStartRoute(route: RouteOption): boolean {
  return ['DRIVE', 'WALK', 'TRANSIT'].includes(route.mode)
    && routeAvailabilityCategory(route.availability) !== 'SYSTEM_UNAVAILABLE'
    && Number.isFinite(route.durationMinutes) && route.durationMinutes > 0
    && Number.isFinite(route.distanceMeters) && route.distanceMeters > 0;
}
export function prepareNormalRouteNavigation(input: NormalRouteNavigationInput,
  platform: NavigationPlatform = detectNavigationPlatform()) {
  if (!canStartRoute(input.route)) throw new Error('This route is unavailable for navigation.');
  if (input.departureTime && input.arrivalTime) throw new Error('Choose either departure or arrival timing.');
  const context = input.context ?? 'NORMAL';
  const destination = input.destination ?? (isValidNavigationPoint(input.tripDestination) ? input.tripDestination : undefined);
  if (context !== 'NORMAL' && !destination) throw new Error('The original stranded destination requires resolved coordinates.');
  if (context === 'STRANDED_RESUME' && !input.safePlace) throw new Error('Safe Place continuation requires the selected Safe Place.');
  const request = buildNavigationHandoffFromRoute({
    route: input.route,
    ...(context === 'STRANDED_RESUME' ? { context, safePlace: input.safePlace! } : { context }),
    ...(input.route.mode === 'TRANSIT' && (input.departureTime || input.arrivalTime)
      ? { requestedTiming: { kind: input.departureTime ? 'DEPARTURE' as const : 'ARRIVAL' as const,
        time: (input.departureTime ?? input.arrivalTime)! } } : {}),
    origin: input.origin ?? (isValidNavigationPoint(input.tripOrigin) ? input.tripOrigin : undefined),
    destination,
    optionalStops: input.route.includesStop ? input.optionalStops ?? (input.selectedStop ? [input.selectedStop] : []) : [],
  });
  return prepareNavigationProviderHandoff(request, platform);
}

/** Shared provider dispatch for main trips and isolated Safe Place legs. */
export function prepareNavigationProviderHandoff(request: NavigationHandoffRequest,
  platform: NavigationPlatform = detectNavigationPlatform()) {
  const result = platform === 'IOS' || platform === 'IPADOS'
    ? buildAppleMapsNavigationUrl(request)
    : buildGoogleMapsNavigationUrl(request, { target: platform === 'DESKTOP' ? 'DESKTOP' : 'MOBILE_OR_UNKNOWN' });
  const omittedStops = 'omittedStops' in result ? result.omittedStops : result.unsupportedStops;
  const webFallbackUrl = buildGoogleMapsNavigationUrl(request, { target: platform === 'DESKTOP' ? 'DESKTOP' : 'MOBILE_OR_UNKNOWN' }).url;
  return { ...result, webFallbackUrl, omittedStops, request, platform };
}
