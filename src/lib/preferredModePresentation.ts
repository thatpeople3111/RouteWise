import type { RouteOption, TripPlan } from './types';
import type { TransportModePreference } from './preferences';

export function isValidPresentationRoute(route: RouteOption): boolean {
  return route.availability?.available !== false && route.constraints.eligible !== false
    && !Object.values(route.constraints).some(value => value === 'exceeded' || value === 'missed');
}

/** Soft presentation bias only; never changes route facts or backend ranking IDs. */
export function preferredModePresentation(plan: TripPlan, available: readonly RouteOption[], mode?: TransportModePreference) {
  const routeMode = mode === 'PUBLIC_TRANSIT' ? 'TRANSIT' : mode === 'DRIVING' ? 'DRIVE' : mode === 'WALKING' ? 'WALK' : null;
  const reference = available.find(route => route.id === plan.best && isValidPresentationRoute(route));
  const referenceRide = plan.rideshares?.find(ride => ride.id === plan.best && ride.available);
  const baselineMinutes = reference?.durationMinutes ?? referenceRide?.estimatedTotalMinutes;
  const comparableTime = (minutes?: number | null) => typeof minutes === 'number' && Number.isFinite(minutes)
    && (baselineMinutes === undefined || (Number.isFinite(baselineMinutes) && minutes <= baselineMinutes + Math.max(5, baselineMinutes * .2)));
  const comparableCost = (route: RouteOption) => {
    if (!reference || reference.id === route.id) return true;
    // Unknown/incomparable costs cannot justify promoting an alternative over others.
    return route.cost.complete && reference.cost.complete && route.cost.amount !== null && reference.cost.amount !== null
      && route.cost.currency === reference.cost.currency
      && route.cost.amount <= reference.cost.amount + Math.max(5, reference.cost.amount * .2);
  };
  const candidate = routeMode ? available.find(route => route.mode === routeMode && route.id !== plan.best
    && isValidPresentationRoute(route) && comparableTime(route.durationMinutes) && comparableCost(route)) : undefined;
  const promoteRideshare = mode === 'RIDESHARE' && !!plan.rideshares?.some(ride => ride.available
    && (ride.id === plan.best || ride.id === plan.fastest) && comparableTime(ride.estimatedTotalMinutes));
  return { routeMode, preferredRouteId: candidate?.id ?? null, promoteRideshare };
}
