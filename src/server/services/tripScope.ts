import type { Coordinates } from '../types/index';
import type { TripScope } from '../types/longDistance';
import { distanceMeters } from './locationResolution';

/** Traffic alone cannot turn a short city trip into intercity travel. */
export function determineTripScope(origin: Coordinates | null, destination: Coordinates | null,
  drivingDistanceMeters?: number, drivingMinutes?: number): TripScope {
  const straightDistance = origin && destination ? distanceMeters(origin, destination) : null;
  return (straightDistance !== null && straightDistance >= 100000)
    || (drivingDistanceMeters !== undefined && drivingDistanceMeters >= 150000)
    || (drivingMinutes !== undefined && drivingMinutes >= 150 && (straightDistance ?? drivingDistanceMeters ?? 0) >= 75000)
    ? 'LONG_DISTANCE' : 'LOCAL';
}
