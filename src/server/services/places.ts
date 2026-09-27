import type {
  Coordinates,
  PlaceBusinessStatus,
  PlaceCandidate,
  PlacePriceLevel,
  PlaceSearchRequest,
  SafeWaitCandidate,
  StopCategory,
} from '../types/index';

const PLACES_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACE_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.priceLevel',
  'places.businessStatus',
  'places.currentOpeningHours.openNow',
  'places.regularOpeningHours.openNow',
  'places.googleMapsUri',
].join(',');
const DEFAULT_RADIUS_METERS = 1500;
const DEFAULT_MAX_RESULTS = 20;
const MAX_ROUTE_SEARCH_POINTS = 6;
const VALID_PRICE_LEVELS: readonly PlacePriceLevel[] = [
  'PRICE_LEVEL_FREE',
  'PRICE_LEVEL_INEXPENSIVE',
  'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE',
  'PRICE_LEVEL_VERY_EXPENSIVE',
];
const VALID_BUSINESS_STATUSES: readonly PlaceBusinessStatus[] = [
  'OPERATIONAL',
  'CLOSED_TEMPORARILY',
  'CLOSED_PERMANENTLY',
];
const GOOGLE_PLACE_TYPES: Record<StopCategory, string> = {
  food: 'restaurant',
  coffee: 'cafe',
  gas: 'gas_station',
  groceries: 'grocery_store',
  dessert: 'dessert_shop',
  pharmacy: 'pharmacy',
};

export interface PlacesServiceOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class GooglePlacesApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = 'GooglePlacesApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCoordinates(value: unknown): value is Coordinates {
  return isRecord(value)
    && typeof value.latitude === 'number'
    && Number.isFinite(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && typeof value.longitude === 'number'
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180;
}

function decodePolyline(encoded: string): Coordinates[] {
  const points: Coordinates[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    const deltas: number[] = [];
    for (let coordinate = 0; coordinate < 2; coordinate += 1) {
      let result = 0;
      let shift = 0;
      let chunk: number;
      do {
        if (index >= encoded.length || shift > 30) {
          throw new GooglePlacesApiError('INVALID_ROUTE_POLYLINE', 'The route polyline is invalid.', 400);
        }
        chunk = encoded.charCodeAt(index) - 63;
        if (chunk < 0 || chunk > 63) {
          throw new GooglePlacesApiError('INVALID_ROUTE_POLYLINE', 'The route polyline is invalid.', 400);
        }
        index += 1;
        result |= (chunk & 0x1f) << shift;
        shift += 5;
      } while (chunk >= 0x20);

      deltas.push((result & 1) ? ~(result >> 1) : result >> 1);
    }

    latitude += deltas[0];
    longitude += deltas[1];
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }

  if (points.length < 2) {
    throw new GooglePlacesApiError('INVALID_ROUTE_POLYLINE', 'The route polyline must contain at least two points.', 400);
  }
  return points;
}

function haversineMeters(first: Coordinates, second: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function pointAtDistance(points: Coordinates[], segmentLengths: number[], distance: number): Coordinates {
  let traversed = 0;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (traversed + segmentLength >= distance || index === segmentLengths.length - 1) {
      const fraction = segmentLength === 0 ? 0 : Math.min(1, (distance - traversed) / segmentLength);
      return {
        latitude: points[index].latitude + (points[index + 1].latitude - points[index].latitude) * fraction,
        longitude: points[index].longitude + (points[index + 1].longitude - points[index].longitude) * fraction,
      };
    }
    traversed += segmentLength;
  }
  return points[points.length - 1];
}

function sampleRoute(encodedPolyline: string, radiusMeters: number): Coordinates[] {
  const points = decodePolyline(encodedPolyline);
  const segmentLengths = points.slice(1).map((point, index) => haversineMeters(points[index], point));
  const routeLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  const sampleCount = Math.min(
    MAX_ROUTE_SEARCH_POINTS,
    Math.max(2, Math.ceil(routeLength / (radiusMeters * 1.5))),
  );

  return Array.from({ length: sampleCount }, (_, index) => {
    const distance = routeLength * index / (sampleCount - 1);
    return pointAtDistance(points, segmentLengths, distance);
  });
}

function optionalEnum<T extends string>(value: unknown, values: readonly T[]): T | null {
  return typeof value === 'string' && values.includes(value as T) ? value as T : null;
}

function parsePlace(value: unknown, category: StopCategory): PlaceCandidate | null {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || value.id.length === 0
    || !isRecord(value.displayName)
    || typeof value.displayName.text !== 'string'
    || value.displayName.text.trim().length === 0) {
    return null;
  }

  const location = isCoordinates(value.location)
    ? value.location
    : isRecord(value.location) && isCoordinates(value.location.latLng)
      ? value.location.latLng
      : null;
  const openingHours = isRecord(value.currentOpeningHours)
    ? value.currentOpeningHours
    : isRecord(value.regularOpeningHours)
      ? value.regularOpeningHours
      : null;

  return {
    placeId: value.id,
    name: value.displayName.text,
    category,
    address: typeof value.formattedAddress === 'string' ? value.formattedAddress : null,
    coordinates: location,
    rating: typeof value.rating === 'number' && Number.isFinite(value.rating) ? value.rating : null,
    priceLevel: optionalEnum(value.priceLevel, VALID_PRICE_LEVELS),
    businessStatus: optionalEnum(value.businessStatus, VALID_BUSINESS_STATUSES),
    openNow: openingHours && typeof openingHours.openNow === 'boolean' ? openingHours.openNow : null,
    mapsUri: typeof value.googleMapsUri === 'string' ? value.googleMapsUri : null,
  };
}

function validateRequest(input: PlaceSearchRequest): { radiusMeters: number; maxResults: number } {
  if (!input || !['food', 'coffee', 'gas', 'groceries', 'dessert', 'pharmacy'].includes(input.category)) {
    throw new GooglePlacesApiError('INVALID_REQUEST', 'A supported stop category is required.', 400);
  }
  if (input.searchArea === 'DESTINATION' && !isCoordinates(input.destination)) {
    throw new GooglePlacesApiError('INVALID_REQUEST', 'Destination coordinates are required.', 400);
  }
  if (input.searchArea === 'ON_ROUTE' && typeof input.routePolyline !== 'string') {
    throw new GooglePlacesApiError('INVALID_REQUEST', 'An encoded route polyline is required for ON_ROUTE searches.', 400);
  }
  if (input.searchArea !== 'DESTINATION' && input.searchArea !== 'ON_ROUTE') {
    throw new GooglePlacesApiError('INVALID_REQUEST', 'Search area must be ON_ROUTE or DESTINATION.', 400);
  }

  const radiusMeters = input.radiusMeters ?? DEFAULT_RADIUS_METERS;
  const maxResults = input.maxResults ?? DEFAULT_MAX_RESULTS;
  if (!Number.isInteger(radiusMeters) || radiusMeters < 100 || radiusMeters > 50_000) {
    throw new GooglePlacesApiError('INVALID_REQUEST', 'radiusMeters must be an integer from 100 to 50000.', 400);
  }
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > DEFAULT_MAX_RESULTS) {
    throw new GooglePlacesApiError('INVALID_REQUEST', 'maxResults must be an integer from 1 to 20.', 400);
  }
  return { radiusMeters, maxResults };
}

async function searchNearby(
  center: Coordinates,
  input: PlaceSearchRequest,
  radiusMeters: number,
  maxResultCount: number,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<PlaceCandidate[]> {
  let response: Response;
  try {
    response = await fetchImpl(PLACES_NEARBY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': PLACE_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: [GOOGLE_PLACE_TYPES[input.category]],
        maxResultCount,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: {
            center: { latitude: center.latitude, longitude: center.longitude },
            radius: radiusMeters,
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GooglePlacesApiError('NETWORK_ERROR', 'Could not reach Google Places API.', 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GooglePlacesApiError('INVALID_RESPONSE', 'Google Places API returned invalid JSON.', 502, response.status);
  }

  if (!response.ok) {
    const upstreamMessage = isRecord(payload)
      && isRecord(payload.error)
      && typeof payload.error.message === 'string'
      ? payload.error.message
      : `Google Places API returned HTTP ${response.status}.`;
    throw new GooglePlacesApiError('UPSTREAM_ERROR', upstreamMessage.split(apiKey).join('[redacted]'), 502, response.status);
  }
  if (!isRecord(payload) || (payload.places !== undefined && !Array.isArray(payload.places))) {
    throw new GooglePlacesApiError('INVALID_RESPONSE', 'Google Places API returned an invalid places list.', 502, response.status);
  }

  return (Array.isArray(payload.places) ? payload.places : [])
    .map(place => parsePlace(place, input.category))
    .filter((place): place is PlaceCandidate => place !== null);
}

export async function searchPlaces(
  input: PlaceSearchRequest,
  options: PlacesServiceOptions = {},
): Promise<PlaceCandidate[]> {
  const { radiusMeters, maxResults } = validateRequest(input);
  const centers = input.searchArea === 'DESTINATION'
    ? [input.destination]
    : sampleRoute(input.routePolyline, radiusMeters);
  const apiKey = (options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY)?.trim();
  if (!apiKey) {
    throw new GooglePlacesApiError('MISSING_API_KEY', 'GOOGLE_MAPS_API_KEY is required to search places.', 500);
  }

  const resultGroups = await Promise.all(centers.map(center => searchNearby(
    center,
    input,
    radiusMeters,
    maxResults,
    apiKey,
    options.fetchImpl ?? fetch,
  )));

  const uniquePlaces = new Map<string, PlaceCandidate>();
  for (const place of resultGroups.flat()) {
    if (!uniquePlaces.has(place.placeId)) uniquePlaces.set(place.placeId, place);
    if (uniquePlaces.size >= maxResults) break;
  }
  return [...uniquePlaces.values()];
}

const SAFE_WAIT_PLACE_TYPES = ['lodging', 'cafe', 'convenience_store', 'transit_station', 'restaurant'] as const;
const SAFE_WAIT_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.businessStatus',
  'places.currentOpeningHours.openNow',
  'places.regularOpeningHours.openNow',
  'places.googleMapsUri',
  'places.primaryType',
  'places.types',
].join(',');
// Friendly labels for the Google place types we search for; unmatched types fall back to a generic label.
const SAFE_WAIT_TYPE_LABELS: Record<string, string> = {
  lodging: 'Hotel', hotel: 'Hotel', motel: 'Hotel',
  cafe: 'Coffee shop', coffee_shop: 'Coffee shop',
  restaurant: 'Restaurant', fast_food_restaurant: 'Restaurant', meal_takeaway: 'Restaurant',
  convenience_store: 'Convenience store',
  transit_station: 'Transit station', train_station: 'Transit station',
  subway_station: 'Transit station', bus_station: 'Transit station', light_rail_station: 'Transit station',
};
const DEFAULT_SAFE_WAIT_RADIUS_METERS = 2000;
const SAFE_WAIT_MAX_RESULTS = 20;
const SAFE_WAIT_MAX_ALTERNATES = 2;
const AVERAGE_WALKING_METERS_PER_MINUTE = 80;

function safeWaitTypeLabel(primaryType: unknown, types: unknown): string {
  if (typeof primaryType === 'string' && SAFE_WAIT_TYPE_LABELS[primaryType]) return SAFE_WAIT_TYPE_LABELS[primaryType];
  if (Array.isArray(types)) {
    for (const type of types) {
      if (typeof type === 'string' && SAFE_WAIT_TYPE_LABELS[type]) return SAFE_WAIT_TYPE_LABELS[type];
    }
  }
  return 'Public business';
}

function parseSafeWaitPlace(value: unknown, center: Coordinates): SafeWaitCandidate | null {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || value.id.length === 0
    || !isRecord(value.displayName)
    || typeof value.displayName.text !== 'string'
    || value.displayName.text.trim().length === 0) {
    return null;
  }

  const businessStatus = optionalEnum(value.businessStatus, VALID_BUSINESS_STATUSES);
  if (businessStatus === 'CLOSED_PERMANENTLY') return null;

  const location = isCoordinates(value.location)
    ? value.location
    : isRecord(value.location) && isCoordinates(value.location.latLng)
      ? value.location.latLng
      : null;
  const openingHours = isRecord(value.currentOpeningHours)
    ? value.currentOpeningHours
    : isRecord(value.regularOpeningHours)
      ? value.regularOpeningHours
      : null;
  const distanceMeters = location ? Math.round(haversineMeters(center, location)) : null;

  return {
    placeId: value.id,
    name: value.displayName.text,
    category: safeWaitTypeLabel(value.primaryType, value.types),
    address: typeof value.formattedAddress === 'string' ? value.formattedAddress : null,
    coordinates: location,
    rating: typeof value.rating === 'number' && Number.isFinite(value.rating) ? value.rating : null,
    openNow: openingHours && typeof openingHours.openNow === 'boolean' ? openingHours.openNow : null,
    businessStatus,
    mapsUri: typeof value.googleMapsUri === 'string' ? value.googleMapsUri : null,
    distanceMeters,
    walkingMinutes: distanceMeters !== null ? Math.max(1, Math.round(distanceMeters / AVERAGE_WALKING_METERS_PER_MINUTE)) : null,
  };
}

// Lower score is better: prioritizes places that are open now, well rated, and close by.
function safeWaitScore(place: SafeWaitCandidate): number {
  const openPenalty = place.openNow === false ? 6000 : place.openNow === null ? 1500 : 0;
  const ratingPenalty = place.rating !== null ? (5 - place.rating) * 400 : 900;
  const distancePenalty = place.distanceMeters ?? 4000;
  return openPenalty + ratingPenalty + distancePenalty;
}

export async function searchSafeWaitPlaces(
  center: Coordinates,
  radiusMeters: number = DEFAULT_SAFE_WAIT_RADIUS_METERS,
  options: PlacesServiceOptions = {},
): Promise<{ best: SafeWaitCandidate | null; alternates: SafeWaitCandidate[]; warnings: string[] }> {
  if (!isCoordinates(center)) {
    throw new GooglePlacesApiError('INVALID_REQUEST', 'Valid latitude and longitude are required.', 400);
  }
  if (!Number.isInteger(radiusMeters) || radiusMeters < 100 || radiusMeters > 5000) {
    throw new GooglePlacesApiError('INVALID_REQUEST', 'radiusMeters must be an integer from 100 to 5000.', 400);
  }

  const apiKey = (options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY)?.trim();
  if (!apiKey) {
    throw new GooglePlacesApiError('MISSING_API_KEY', 'GOOGLE_MAPS_API_KEY is required to search places.', 500);
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(PLACES_NEARBY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': SAFE_WAIT_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: [...SAFE_WAIT_PLACE_TYPES],
        maxResultCount: SAFE_WAIT_MAX_RESULTS,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: { center: { latitude: center.latitude, longitude: center.longitude }, radius: radiusMeters },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GooglePlacesApiError('NETWORK_ERROR', 'Could not reach Google Places API.', 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GooglePlacesApiError('INVALID_RESPONSE', 'Google Places API returned invalid JSON.', 502, response.status);
  }

  if (!response.ok) {
    const upstreamMessage = isRecord(payload)
      && isRecord(payload.error)
      && typeof payload.error.message === 'string'
      ? payload.error.message
      : `Google Places API returned HTTP ${response.status}.`;
    throw new GooglePlacesApiError('UPSTREAM_ERROR', upstreamMessage.split(apiKey).join('[redacted]'), 502, response.status);
  }
  if (!isRecord(payload) || (payload.places !== undefined && !Array.isArray(payload.places))) {
    throw new GooglePlacesApiError('INVALID_RESPONSE', 'Google Places API returned an invalid places list.', 502, response.status);
  }

  const candidates = (Array.isArray(payload.places) ? payload.places : [])
    .map(place => parseSafeWaitPlace(place, center))
    .filter((place): place is SafeWaitCandidate => place !== null)
    .sort((first, second) => safeWaitScore(first) - safeWaitScore(second));

  if (candidates.length === 0) {
    return { best: null, alternates: [], warnings: ['No suitable nearby waiting location was found.'] };
  }
  return { best: candidates[0], alternates: candidates.slice(1, 1 + SAFE_WAIT_MAX_ALTERNATES), warnings: [] };
}

