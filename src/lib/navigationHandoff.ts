import type { Coordinates, Location, RouteOption, SuggestedStop } from './types';
import type { FinalTripSelectedStop, ParkingLocation, SafeWaitCandidate, TripPlanRouteOption } from './api-types';
import type { SelectedTripPlace } from './tripDraft';

export type NavigationTravelMode = 'DRIVING' | 'WALKING' | 'TRANSIT';
export type NavigationRequestedTiming = { kind: 'DEPARTURE' | 'ARRIVAL'; time: string };
export interface NavigationPoint extends Coordinates {
  label?: string;
  address?: string;
  placeId?: string;
}
export interface NavigationStop extends NavigationPoint {
  kind: 'OPTIONAL_STOP' | 'PARKING' | 'SAFE_PLACE' | 'OTHER';
}
export interface NavigationHandoffRequest {
  origin: NavigationPoint;
  /** Intermediate points only: optional stops in supplied order, then parking. */
  orderedStops: NavigationStop[];
  parkingLocation?: NavigationPoint;
  /** Normal driving routes end at parking before this separate pedestrian leg. */
  parkingContinuation?: { origin: NavigationPoint; destination: NavigationPoint; travelMode: 'WALKING' };
  /** Always the original final destination, including during a safe-place first leg. */
  destination: NavigationPoint;
  travelMode: NavigationTravelMode;
  requestedTiming?: NavigationRequestedTiming;
  context: 'NORMAL' | 'STRANDED' | 'STRANDED_SAFE_PLACE_LEG' | 'STRANDED_RESUME';
  safePlaceFirstLeg?: NavigationPoint;
  rideshare?: { pickup?: NavigationPoint; dropoff?: NavigationPoint };
  /** Selected route, or selected continuation route for STRANDED_RESUME. */
  routeId?: string;
}

/** Existing coordinate-bearing values; no network resolution or geometry inference. */
export type NavigationPointSource = NavigationPoint | SelectedTripPlace | FinalTripSelectedStop
  | ParkingLocation | SafeWaitCandidate;

export function isValidNavigationPoint(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<Coordinates>;
  return typeof point.latitude === 'number' && Number.isFinite(point.latitude)
    && Math.abs(point.latitude) <= 90
    && typeof point.longitude === 'number' && Number.isFinite(point.longitude)
    && Math.abs(point.longitude) <= 180;
}

/** Whitelist point metadata so prices, URLs, API payloads and secrets cannot leak through. */
export function toNavigationPoint(source: NavigationPointSource): NavigationPoint {
  if (!source || typeof source !== 'object') throw new Error('Navigation requires valid resolved coordinates.');
  const coordinates = 'coordinates' in source ? source.coordinates
    : 'location' in source ? source.location : source;
  if (!isValidNavigationPoint(coordinates)) throw new Error('Navigation requires valid resolved coordinates.');
  const label = 'name' in source ? source.name : 'label' in source ? source.label : undefined;
  const address = 'formattedAddress' in source ? source.formattedAddress
    : 'address' in source ? source.address : undefined;
  const placeId = 'placeId' in source ? source.placeId : undefined;
  if ([label, address, placeId].some(value => value != null && typeof value !== 'string')) {
    throw new Error('Navigation location metadata must be text.');
  }
  return {
    latitude: coordinates.latitude, longitude: coordinates.longitude,
    ...(label ? { label } : {}), ...(address ? { address } : {}),
    ...('placeId' in source && source.placeId ? { placeId: source.placeId } : {}),
  };
}

type StrandedContext =
  | { context?: 'NORMAL'; safePlace?: never }
  | { context: 'STRANDED'; safePlace?: NavigationPointSource }
  | { context: 'STRANDED_SAFE_PLACE_LEG' | 'STRANDED_RESUME'; safePlace: NavigationPointSource };

export type NavigationHandoffInput = StrandedContext & {
  requestedTiming?: NavigationRequestedTiming;
  route: RouteOption | TripPlanRouteOption;
  /** Supply retained draft/place data when UI routes lack resolved endpoints. */
  origin?: NavigationPointSource;
  destination?: NavigationPointSource;
  /** Only stops actually included in this selected route, in trip order. */
  optionalStops?: readonly (NavigationPointSource | SuggestedStop)[];
  /** Explicit user selection takes precedence over a route's recommended lot. */
  parkingLocation?: ParkingLocation;
  rideshare?: { pickup?: NavigationPointSource; dropoff?: NavigationPointSource };
};

function endpoint(source: NavigationPointSource | undefined, location: Location | null | undefined,
  coordinates?: Coordinates): NavigationPoint {
  if (source) return toNavigationPoint(source);
  const resolved = coordinates ?? (isValidNavigationPoint(location) ? location : undefined);
  if (!resolved) throw new Error('Navigation endpoint coordinates are unavailable; supply the retained resolved place.');
  return toNavigationPoint({ ...resolved,
    ...(location && 'address' in location ? { address: location.address } : {}),
    ...(location && 'placeId' in location ? { placeId: location.placeId } : {}),
  });
}

export function buildNavigationHandoffFromRoute(input: NavigationHandoffInput): NavigationHandoffRequest {
  const { route } = input;
  if (input.requestedTiming && (!['DEPARTURE', 'ARRIVAL'].includes(input.requestedTiming.kind)
    || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(input.requestedTiming.time)
    || !Number.isFinite(Date.parse(input.requestedTiming.time)))) {
    throw new Error('Navigation timing requires a valid timestamp with timezone.');
  }
  if (route.mode === 'BICYCLE') throw new Error('Cycling navigation handoff is not supported in this stage.');
  const context = input.context ?? 'NORMAL';
  const safePlaceFirstLeg = input.safePlace ? toNavigationPoint(input.safePlace) : undefined;
  if ((context === 'STRANDED_SAFE_PLACE_LEG' || context === 'STRANDED_RESUME') && !safePlaceFirstLeg) {
    throw new Error('Stranded safe-place navigation requires the selected safe place.');
  }
  if (context === 'STRANDED_SAFE_PLACE_LEG' && route.mode !== 'WALK') {
    throw new Error('A safe-place first leg must use a walking route.');
  }
  // A safe-place route's destination is temporary; never use it as the final destination.
  if (context === 'STRANDED_SAFE_PLACE_LEG' && !input.destination) {
    throw new Error('Supply the original stranded destination for a safe-place first leg.');
  }
  const origin = endpoint(input.origin, 'origin' in route ? route.origin : undefined,
    'originCoordinates' in route ? route.originCoordinates : undefined);
  const destination = endpoint(input.destination, route.destination);
  const parking = context !== 'STRANDED_SAFE_PLACE_LEG' && route.mode === 'DRIVE'
    ? input.parkingLocation ?? route.parking?.locations.find(location => location.recommended) : undefined;
  const parkingLocation = parking ? toNavigationPoint(parking) : undefined;
  const orderedStops: NavigationStop[] = context === 'STRANDED_SAFE_PLACE_LEG' ? []
    : (input.optionalStops ?? []).map(stop => {
      if ('candidate' in stop || 'timing' in stop) {
        if (!stop.candidate) throw new Error('Selected stop coordinates are unavailable.');
        return { ...toNavigationPoint(stop.candidate), kind: 'OPTIONAL_STOP' };
      }
      return { ...toNavigationPoint(stop), kind: 'OPTIONAL_STOP' };
    });
  if (parkingLocation) orderedStops.push({ ...parkingLocation, kind: 'PARKING' });
  return {
    origin, destination, orderedStops, context, routeId: route.id,
    ...(input.requestedTiming ? { requestedTiming: { ...input.requestedTiming } } : {}),
    travelMode: route.mode === 'DRIVE' ? 'DRIVING' : route.mode === 'WALK' ? 'WALKING' : 'TRANSIT',
    ...(parkingLocation ? { parkingLocation } : {}),
    ...(context === 'NORMAL' && parkingLocation
      && (parkingLocation.latitude !== destination.latitude || parkingLocation.longitude !== destination.longitude)
      ? { parkingContinuation: { origin: { ...parkingLocation }, destination: { ...destination }, travelMode: 'WALKING' as const } } : {}),
    ...(safePlaceFirstLeg ? { safePlaceFirstLeg } : {}),
    ...(input.rideshare ? { rideshare: {
      ...(input.rideshare.pickup ? { pickup: toNavigationPoint(input.rideshare.pickup) } : {}),
      ...(input.rideshare.dropoff ? { dropoff: toNavigationPoint(input.rideshare.dropoff) } : {}),
    } } : {}),
  };
}

/** Temporary leg terminates at the safe place; all other contexts retain trip order. */
export function navigationLegPoints(request: NavigationHandoffRequest): NavigationPoint[] {
  if (request.context === 'STRANDED_SAFE_PLACE_LEG') {
    if (!request.safePlaceFirstLeg) throw new Error('Safe-place first leg is missing its endpoint.');
    return [request.origin, request.safePlaceFirstLeg];
  }
  return [request.origin, ...request.orderedStops, request.destination];
}
