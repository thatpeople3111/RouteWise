import { planTrip } from './api';
import type { Coordinates, Location, RouteOption, SafeWaitCandidate, TripPlan } from './types';

export type SafePlaceRoute = {
  safePlaceId: string;
  origin: Coordinates;
  destination: Location;
  route: RouteOption;
};

/** Reuse the existing routing API, but return only this local walking route.
 * The response never enters the main stranded TripPlan state.
 */
export async function findSafePlaceRoute(origin: Coordinates, place: SafeWaitCandidate,
  requestPlan: typeof planTrip = planTrip): Promise<SafePlaceRoute> {
  const destination = place.coordinates ?? { placeId: place.placeId };
  const result: TripPlan = await requestPlan({
    origin, destination, departureTime: new Date().toISOString(),
    budgetUsd: 1000, maxWalkingMinutes: 180, hasCar: false, hasBike: false,
    allowTransit: false, allowWalking: true, avoidTolls: false, preference: 'least_walking',
    nearbyCategories: [], rideshareProviders: [],
    notes: 'RouteWise Stranded mode request: isolated safe-place walking route.',
  }, { skip: true }, null);
  const route = result.routes.find(candidate => candidate.mode === 'WALK' && candidate.availability?.available !== false);
  if (!route) throw new Error("We couldn't create a walking route to this location.");
  return { safePlaceId: place.placeId, origin, destination, route };
}
