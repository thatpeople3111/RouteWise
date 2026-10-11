import type { Coordinates } from '../types/index';

/**
 * Application-maintained Waymo One service-area data.
 *
 * Waymo does not expose a public service-area API, so these bounding boxes are maintained by the
 * app from published Waymo One service announcements. They are approximate coordinate zones, not
 * city-name matches, and should be updated separately from application logic as Waymo expands.
 */
export interface WaymoServiceArea {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export const WAYMO_SERVICE_AREAS: ReadonlyArray<WaymoServiceArea> = [
  { name: 'Phoenix, AZ', minLat: 33.20, maxLat: 33.70, minLng: -112.35, maxLng: -111.85 },
  { name: 'San Francisco Bay Area, CA', minLat: 37.35, maxLat: 37.85, minLng: -122.55, maxLng: -121.90 },
  { name: 'Los Angeles, CA', minLat: 33.70, maxLat: 34.35, minLng: -118.70, maxLng: -118.00 },
  { name: 'Austin, TX', minLat: 30.10, maxLat: 30.55, minLng: -97.95, maxLng: -97.55 },
  { name: 'Atlanta, GA', minLat: 33.60, maxLat: 33.95, minLng: -84.55, maxLng: -84.25 },
];

/** Returns the name of the app-maintained Waymo service area containing the point, or null. */
export function findWaymoServiceArea(point: Coordinates): string | null {
  const match = WAYMO_SERVICE_AREAS.find(area =>
    point.latitude >= area.minLat && point.latitude <= area.maxLat
    && point.longitude >= area.minLng && point.longitude <= area.maxLng);
  return match?.name ?? null;
}

export type WaymoUnavailabilityReason =
  | 'DESTINATION_OUTSIDE'
  | 'ORIGIN_OUTSIDE'
  | 'TRIP_OUTSIDE'
  | 'UNVERIFIABLE';

export interface WaymoAvailability {
  available: boolean;
  /** null when the point could not be located and support cannot be verified. */
  originSupported: boolean | null;
  destinationSupported: boolean | null;
  reason?: WaymoUnavailabilityReason;
  /** Short user-facing headline when unavailable. */
  message?: string;
  /** User-facing explanation when unavailable. */
  detail?: string;
  /** Name of the matching service area when both points are supported. */
  serviceAreaName?: string;
}

const UNAVAILABLE_HEADLINE = 'Waymo is unavailable for this trip';

/**
 * Coordinate-based Waymo availability check. Both the pickup and the destination must fall inside
 * an app-maintained Waymo service area. Availability is never assumed when a point is missing.
 */
export function checkWaymoAvailability(
  originCoordinates: Coordinates | null,
  destinationCoordinates: Coordinates | null,
): WaymoAvailability {
  const originArea = originCoordinates ? findWaymoServiceArea(originCoordinates) : null;
  const destinationArea = destinationCoordinates ? findWaymoServiceArea(destinationCoordinates) : null;
  const originSupported = originCoordinates ? originArea !== null : null;
  const destinationSupported = destinationCoordinates ? destinationArea !== null : null;

  if (originSupported === null || destinationSupported === null) {
    return {
      available: false,
      originSupported,
      destinationSupported,
      reason: 'UNVERIFIABLE',
      message: 'Unable to verify Waymo availability for this trip.',
      detail: 'The pickup or destination could not be located precisely enough to check the Waymo service area.',
    };
  }

  if (originSupported && destinationSupported) {
    return {
      available: true,
      originSupported,
      destinationSupported,
      serviceAreaName: originArea ?? destinationArea ?? undefined,
    };
  }

  if (!originSupported && !destinationSupported) {
    return {
      available: false,
      originSupported,
      destinationSupported,
      reason: 'TRIP_OUTSIDE',
      message: UNAVAILABLE_HEADLINE,
      detail: 'This trip is outside the current Waymo service area.',
    };
  }

  if (!originSupported) {
    return {
      available: false,
      originSupported,
      destinationSupported,
      reason: 'ORIGIN_OUTSIDE',
      message: UNAVAILABLE_HEADLINE,
      detail: 'Your pickup location is outside the current Waymo service area.',
    };
  }

  return {
    available: false,
    originSupported,
    destinationSupported,
    reason: 'DESTINATION_OUTSIDE',
    message: UNAVAILABLE_HEADLINE,
    detail: 'Your destination is outside the current Waymo service area.',
  };
}
