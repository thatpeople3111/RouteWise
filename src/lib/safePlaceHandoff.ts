import { buildNavigationHandoffFromRoute, isValidNavigationPoint, toNavigationPoint } from './navigationHandoff';
import type { NavigationHandoffRequest, NavigationPoint, NavigationPointSource } from './navigationHandoff';
import type { SafeWaitCandidate, RouteOption, Coordinates, RideshareOption } from './types';
import { checkWaymoAvailability } from '../server/services/waymoAvailability';
import type { NavigationPlatform } from './navigationPlatform';
import { canStartRoute, prepareNavigationProviderHandoff } from './startNavigation';

/** Local continuation context. No arrival detection or main-route recalculation. */
export interface SafePlaceContinuationContext {
  /** New first-leg attempts reset child GPS/link state even for the same Safe Place. */
  legId?: number;
  originalDestination: NavigationPoint;
  firstLegOrigin: NavigationPoint;
  activeSafePlace: NavigationPoint;
  safePlaceLegStarted: true;
  selectedContinuationRoute?: { routeId: string; mode: RouteOption['mode'] };
  refreshedPickup?: NavigationPoint;
}

export function safePlaceRideEndpoints(context: SafePlaceContinuationContext) {
  return { pickup: isValidNavigationPoint(context.refreshedPickup) ? context.refreshedPickup! : context.activeSafePlace,
    dropoff: context.originalDestination, context: 'STRANDED_RESUME' as const };
}

export function safePlaceRideshareOptions(context: SafePlaceContinuationContext, options: readonly RideshareOption[]) {
  const endpoints = safePlaceRideEndpoints(context);
  return options.map(option => {
    if (option.provider !== 'WAYMO') return option;
    const availability = checkWaymoAvailability(endpoints.pickup, endpoints.dropoff);
    // Do not promote a previously unavailable option or reuse an old area match as a new one.
    return availability.available ? option : { ...option, available: false,
      unavailableReason: availability.message ?? 'Waymo is unavailable for this trip.', unavailableDetail: availability.detail };
  });
}

export function prepareSafePlaceContinuation(context: SafePlaceContinuationContext, route: RouteOption,
  refreshedLocation?: Coordinates, platform?: NavigationPlatform) {
  if (!canStartRoute(route)) throw new Error('This continuation route is unavailable.');
  const origin = isValidNavigationPoint(refreshedLocation)
    ? toNavigationPoint({ ...refreshedLocation, label: 'Current location' }) : context.activeSafePlace;
  const request = buildNavigationHandoffFromRoute({
    route, origin, destination: context.originalDestination,
    context: 'STRANDED_RESUME', safePlace: context.activeSafePlace,
  });
  return prepareNavigationProviderHandoff(request, platform);
}

export function safePlaceContinuationRoutes(routes: readonly RouteOption[]): RouteOption[] {
  return routes.flatMap(route => route.mode === 'TRANSIT' && route.transitAlternatives?.length
    ? route.transitAlternatives.map(alt => ({ ...route, id: alt.id, label: alt.title,
      availability: alt.availability, durationMinutes: alt.durationMinutes, distanceMeters: alt.distanceMeters,
      steps: alt.steps, encodedPolyline: alt.encodedPolyline ?? null })) : [route]).filter(canStartRoute);
}

export function prepareSafePlaceNavigation(origin: NavigationPointSource,
  originalDestination: NavigationPointSource, place: SafeWaitCandidate, platform?: NavigationPlatform) {
  const firstLegOrigin = toNavigationPoint(origin);
  const finalDestination = toNavigationPoint(originalDestination);
  const activeSafePlace = toNavigationPoint(place);
  const request: NavigationHandoffRequest = {
    origin: firstLegOrigin, destination: finalDestination, safePlaceFirstLeg: activeSafePlace,
    orderedStops: [], travelMode: 'WALKING', context: 'STRANDED_SAFE_PLACE_LEG',
  };
  return {
    ...prepareNavigationProviderHandoff(request, platform),
    continuationContext: {
      originalDestination: finalDestination, firstLegOrigin, activeSafePlace, safePlaceLegStarted: true as const,
    } satisfies SafePlaceContinuationContext,
  };
}
