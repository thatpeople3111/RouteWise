import type { RouteOption } from './types';
import { buildTransitJourneyLabel } from './transitDisplay';

const USER_CONSTRAINTS = new Set(['WALKING_LIMIT_EXCEEDED', 'BUDGET_EXCEEDED', 'EXTRA_TIME_EXCEEDED', 'EXTRA_BUDGET_EXCEEDED']);

export function routeAvailabilityCategory(availability?: { available: boolean; reasonCode?: string }) {
  if (availability?.available !== false) return 'AVAILABLE';
  return USER_CONSTRAINTS.has(availability.reasonCode ?? '') ? 'USER_CONSTRAINT' : 'SYSTEM_UNAVAILABLE';
}

/** Presentation copies only: preserve original geometry, metadata and rankings. */
export function partitionLocalRoutes(routes: readonly RouteOption[]) {
  const available: RouteOption[] = [], restricted: RouteOption[] = [];
  for (const route of routes) {
    if (!['DRIVE', 'WALK', 'TRANSIT'].includes(route.mode)) { available.push(route); continue; }
    if (route.mode === 'TRANSIT' && route.transitAlternatives?.length) {
      for (const category of ['AVAILABLE', 'USER_CONSTRAINT'] as const) {
        const alternatives = route.transitAlternatives.filter(alt => routeAvailabilityCategory(alt.availability) === category);
        if (!alternatives.length) continue;
        const primary = alternatives.find(alt => alt.recommended) ?? alternatives[0];
        const copy = { ...route, id: category === 'USER_CONSTRAINT' ? `${route.id}-non-recommended` : route.id,
          label: buildTransitJourneyLabel(primary.steps), transitAlternatives: alternatives, availability: primary.availability,
          durationMinutes: primary.durationMinutes, distanceMeters: primary.distanceMeters, walkingMinutes: primary.walkingMinutes,
          cost: { ...route.cost, amount: primary.estimatedTransportationCost?.amount ?? null,
            currency: primary.estimatedTransportationCost?.currency ?? route.cost.currency,
            complete: primary.estimatedTransportationCost != null }, fare: primary.fare,
          steps: primary.steps, encodedPolyline: primary.encodedPolyline ?? null };
        (category === 'AVAILABLE' ? available : restricted).push(copy);
      }
    } else {
      const category = routeAvailabilityCategory(route.availability);
      if (category === 'AVAILABLE') available.push(route);
      if (category === 'USER_CONSTRAINT') restricted.push(route);
    }
  }
  return { available, restricted };
}
