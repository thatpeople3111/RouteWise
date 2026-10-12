import type { Coordinates } from '../types/index';

/**
 * Application-maintained Waymo One service-area data.
 *
 * Waymo does not expose a public service-area API, so these bounding boxes are maintained by the
 * app from published Waymo One service announcements. They are approximate coordinate zones, not
 * city-name matches, and should be updated separately from application logic as Waymo expands.
 */
export interface WaymoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface WaymoServiceArea {
  name: string;
  city: string;
  region: string;
  country: string;
  status: 'ACTIVE' | 'LIMITED' | 'UP_NEXT' | 'UNAVAILABLE';
  /** Approximate bounds, explicitly marked as fallback rather than authoritative polygons. */
  fallbackBounds?: WaymoBounds;
  /** City context alone never guarantees pickup support. */
  cityBounds?: WaymoBounds;
  polygons?: readonly { points: readonly Coordinates[]; reliable: boolean }[];
  excludedBounds?: readonly WaymoBounds[];
  notes?: string;
  sourceUrl?: string;
  reviewedAt?: string;
}

export const WAYMO_SERVICE_AREAS: ReadonlyArray<WaymoServiceArea> = [
  { name: 'Phoenix, AZ', city: 'Phoenix', region: 'AZ', country: 'US', status: 'ACTIVE', fallbackBounds: { minLat: 33.20, maxLat: 33.70, minLng: -112.35, maxLng: -111.85 } },
  { name: 'San Francisco Bay Area, CA', city: 'San Francisco Bay Area', region: 'CA', country: 'US', status: 'ACTIVE', fallbackBounds: { minLat: 37.35, maxLat: 37.85, minLng: -122.55, maxLng: -121.90 } },
  { name: 'Los Angeles, CA', city: 'Los Angeles', region: 'CA', country: 'US', status: 'ACTIVE', fallbackBounds: { minLat: 33.70, maxLat: 34.35, minLng: -118.70, maxLng: -118.00 } },
  { name: 'Austin, TX', city: 'Austin', region: 'TX', country: 'US', status: 'ACTIVE', fallbackBounds: { minLat: 30.10, maxLat: 30.55, minLng: -97.95, maxLng: -97.55 } },
  { name: 'Atlanta, GA', city: 'Atlanta', region: 'GA', country: 'US', status: 'ACTIVE', fallbackBounds: { minLat: 33.60, maxLat: 33.95, minLng: -84.55, maxLng: -84.25 } },
  {
    name: 'Miami, FL', city: 'Miami', region: 'FL', country: 'US', status: 'ACTIVE',
    // Bounded mainland core: Coral Gables through Brickell/Downtown to Design District.
    // Intentionally excludes the airport, outer Miami-Dade, and offshore neighborhoods.
    fallbackBounds: { minLat: 25.70, maxLat: 25.82, minLng: -80.29, maxLng: -80.185 },
    excludedBounds: [{ minLat: 25.775, maxLat: 25.805, minLng: -80.31, maxLng: -80.255 }],
    notes: 'Central Miami fallback; not an official service boundary. Confirm pickup in the Waymo app.',
    sourceUrl: 'https://waymo.com/blog/2026/04/floridas-new-way-to-ride/',
    reviewedAt: '2026-10-11',
  },
  {
    name: 'Tampa, FL', city: 'Tampa', region: 'FL', country: 'US', status: 'ACTIVE',
    fallbackBounds: { minLat: 27.925, maxLat: 28.02, minLng: -82.515, maxLng: -82.40 },
    cityBounds: { minLat: 27.90, maxLat: 28.10, minLng: -82.55, maxLng: -82.30 },
    notes: 'Conservative central Tampa fallback; confirm exact pickup and rider access in the Waymo app.',
    sourceUrl: 'https://www.waymo.com/blog/2026/09/ride-in-denver-san-diego-tampa/',
    reviewedAt: '2026-10-11',
  },
];

function validPoint(point: Coordinates | null): point is Coordinates {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}

function inBounds(point: Coordinates, bounds?: WaymoBounds): boolean {
  return !!bounds && point.latitude >= bounds.minLat && point.latitude <= bounds.maxLat
    && point.longitude >= bounds.minLng && point.longitude <= bounds.maxLng;
}

function inPolygon(point: Coordinates, vertices: readonly Coordinates[]): boolean {
  if (vertices.length < 3) return false;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i], b = vertices[j];
    const cross = (point.longitude - a.longitude) * (b.latitude - a.latitude)
      - (point.latitude - a.latitude) * (b.longitude - a.longitude);
    if (Math.abs(cross) < 1e-10 && point.latitude >= Math.min(a.latitude, b.latitude)
      && point.latitude <= Math.max(a.latitude, b.latitude) && point.longitude >= Math.min(a.longitude, b.longitude)
      && point.longitude <= Math.max(a.longitude, b.longitude)) return true;
    if ((a.latitude > point.latitude) !== (b.latitude > point.latitude)
      && point.longitude < (b.longitude - a.longitude) * (point.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) inside = !inside;
  }
  return inside;
}

function resolveEndpoint(point: Coordinates | null, areas: readonly WaymoServiceArea[]) {
  if (!validPoint(point)) return { area: null, supported: null, polygonMatch: null, fallbackMatch: false, confidence: 'UNKNOWN' as const };
  for (const area of areas) {
    const polygons = area.polygons?.filter(polygon => polygon.points.length >= 3 && polygon.points.every(validPoint)) ?? [];
    const reliable = polygons.filter(polygon => polygon.reliable);
    const polygonMatch = reliable.length ? reliable.some(polygon => inPolygon(point, polygon.points)) : null;
    const fallbackMatch = inBounds(point, area.fallbackBounds);
    const cityMatch = inBounds(point, area.cityBounds) || fallbackMatch || polygonMatch === true;
    if (!cityMatch) continue;
    const activeCity = area.status === 'ACTIVE' || area.status === 'LIMITED';
    if (!activeCity || area.excludedBounds?.some(bounds => inBounds(point, bounds))) {
      return { area, supported: false, polygonMatch, fallbackMatch, confidence: 'HIGH' as const };
    }
    // Reliable current polygons take priority. Missing/stale geometry permits fallback.
    if (polygonMatch !== null) return { area, supported: polygonMatch, polygonMatch, fallbackMatch, confidence: 'HIGH' as const };
    return { area, supported: fallbackMatch ? true : null, polygonMatch, fallbackMatch,
      confidence: fallbackMatch ? 'FALLBACK' as const : 'UNKNOWN' as const };
  }
  return { area: null, supported: false, polygonMatch: null, fallbackMatch: false, confidence: 'UNKNOWN' as const };
}

/** Coordinate lookup into the centralized rider-city registry. */
export function findWaymoServiceArea(point: Coordinates): string | null {
  const endpoint = resolveEndpoint(point, WAYMO_SERVICE_AREAS);
  return endpoint.supported ? endpoint.area?.name ?? null : null;
}

export type WaymoUnavailabilityReason =
  | 'DESTINATION_OUTSIDE'
  | 'ORIGIN_OUTSIDE'
  | 'TRIP_OUTSIDE'
  | 'UNVERIFIABLE';

export interface WaymoAvailability {
  available: boolean;
  confidence?: 'HIGH' | 'FALLBACK' | 'UNKNOWN';
  citySupported?: boolean;
  originInServiceArea?: boolean | 'UNKNOWN';
  destinationInServiceArea?: boolean | 'UNKNOWN';
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
function evaluateWaymoAvailability(
  originCoordinates: Coordinates | null,
  destinationCoordinates: Coordinates | null,
  areas: readonly WaymoServiceArea[],
): WaymoAvailability {
  const origin = resolveEndpoint(originCoordinates, areas);
  const destination = resolveEndpoint(destinationCoordinates, areas);
  const originArea = origin.area?.name ?? null;
  const destinationArea = destination.area?.name ?? null;
  const originSupported = origin.supported;
  const destinationSupported = destination.supported;

  if (originSupported === null || destinationSupported === null) {
    return {
      available: false,
      originSupported,
      destinationSupported,
      reason: 'UNVERIFIABLE',
      message: 'Unable to verify Waymo availability for this trip.',
      detail: 'Availability could not be verified. Location or current service-zone data is incomplete; confirm in the Waymo app.',
    };
  }

  if (originSupported && destinationSupported) {
    return {
      available: true,
      confidence: origin.confidence === 'HIGH' && destination.confidence === 'HIGH' ? 'HIGH' : 'FALLBACK',
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

/** Single decision path shared by normal and Stranded trip planning. */
export function checkWaymoAvailability(origin: Coordinates | null, destination: Coordinates | null,
  areas: readonly WaymoServiceArea[] = WAYMO_SERVICE_AREAS): WaymoAvailability {
  const originResult = resolveEndpoint(origin, areas), destinationResult = resolveEndpoint(destination, areas);
  const active = (area: WaymoServiceArea | null) => !!area && (area.status === 'ACTIVE' || area.status === 'LIMITED');
  const result = evaluateWaymoAvailability(origin, destination, areas);
  result.citySupported = active(originResult.area) && active(destinationResult.area);
  result.originInServiceArea = originResult.supported ?? 'UNKNOWN';
  result.destinationInServiceArea = destinationResult.supported ?? 'UNKNOWN';
  if (result.reason === 'UNVERIFIABLE') result.confidence = 'UNKNOWN';
  if (process.env.NODE_ENV === 'development') {
    const diagnostic = (point: Coordinates | null, endpoint: typeof originResult) => ({
      coordinates: point ? { latitude: point.latitude, longitude: point.longitude } : null,
      city: endpoint.area?.city ?? null, region: endpoint.area?.region ?? null,
      activeCity: active(endpoint.area), polygonMatch: endpoint.polygonMatch ?? 'UNKNOWN',
      fallbackMatch: endpoint.fallbackMatch,
    });
    console.debug('[RouteWise Waymo]', { origin: diagnostic(origin, originResult), destination: diagnostic(destination, destinationResult),
      available: result.available, decision: result.available ? 'available' : result.reason === 'UNVERIFIABLE' ? 'unknown' : 'unavailable',
      confidence: result.confidence, reason: result.reason });
  }
  return result;
}
