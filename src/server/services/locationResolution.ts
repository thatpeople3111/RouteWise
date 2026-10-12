import type { Coordinates, Location } from '../types/index';
import { GooglePlacesApiError, type PlacesServiceOptions } from './places';
import { stopCategoryConfig } from './stopCategoryConfig';

export interface ResolvedPlace {
  placeId: string;
  name: string;
  formattedAddress: string;
  coordinates: Coordinates;
  distanceMeters?: number;
  types?: string[];
}
export interface LocationResolution {
  resolved: boolean;
  place: ResolvedPlace | null;
  alternatives: ResolvedPlace[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export function splitLocationQuery(query: string) {
  const match = query.trim().match(/^(.+?)\s+(?:across\s+from|next\s+to|close\s+to|near|by)\s+(.+)$/i);
  return { searchTerm: match?.[1].trim() ?? query.trim(), reference: match?.[2].trim() ?? null };
}
export function distanceMeters(a: Coordinates, b: Coordinates) {
  const rad = Math.PI / 180;
  const h = Math.sin((a.latitude - b.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((a.longitude - b.longitude) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export async function searchLocationPlaces(query: string, bias: Coordinates | undefined,
  options: PlacesServiceOptions = {}): Promise<ResolvedPlace[]> {
  const category = Object.entries(stopCategoryConfig).find(([key, config]) =>
    [key, config.type.replaceAll('_', ' '), config.textQuery].includes(query.toLowerCase().trim()))?.[1];
  const apiKey = options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new GooglePlacesApiError('MISSING_API_KEY', 'Location search is unavailable right now.', 503);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.types' },
      body: JSON.stringify({ textQuery: query, pageSize: 8,
        ...(category && category.type !== 'dessert_shop' ? { includedType: category.type, strictTypeFiltering: true } : {}),
        ...(bias ? { locationBias: { circle: { center: bias, radius: 10000 } } } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new GooglePlacesApiError('NETWORK_ERROR', 'Could not load places right now. Try again.', 502); }
  if (!response.ok) throw new GooglePlacesApiError('UPSTREAM_ERROR', 'Could not load places right now. Try again.', 502);
  const payload = await response.json();
  if (payload.places !== undefined && !Array.isArray(payload.places)) throw new GooglePlacesApiError('INVALID_RESPONSE', 'Location search returned an unreadable response. Try again.', 502);
  return (payload.places ?? []).filter((place: { id?: string; displayName?: { text?: string }; location?: Coordinates; businessStatus?: string }) =>
    typeof place.id === 'string' && typeof place.displayName?.text === 'string' && place.businessStatus !== 'CLOSED_PERMANENTLY'
    && Number.isFinite(place.location?.latitude) && Math.abs(place.location!.latitude) <= 90
    && Number.isFinite(place.location?.longitude) && Math.abs(place.location!.longitude) <= 180)
    .map((place: { id: string; displayName: { text: string }; formattedAddress?: string; location: Coordinates; types?: string[] }) => ({
      placeId: place.id, name: place.displayName.text, formattedAddress: place.formattedAddress ?? '', coordinates: place.location,
      ...(Array.isArray(place.types) ? { types: place.types } : {}),
    }));
}

/** Primary business and reference landmark are searched separately; the landmark never replaces the business. */
export async function resolveUserLocationQuery(input: { query: string; selectedPlace?: ResolvedPlace;
  userCurrentLocation?: Coordinates; tripOrigin?: Coordinates }, options: PlacesServiceOptions = {}): Promise<LocationResolution> {
  if (input.selectedPlace) return { resolved: true, place: input.selectedPlace, alternatives: [], confidence: 'HIGH' };
  const parsed = splitLocationQuery(input.query);
  let bias = input.userCurrentLocation ?? input.tripOrigin;
  if (parsed.reference) {
    const references = await searchLocationPlaces(parsed.reference, bias, options);
    if (!references.length) return { resolved: false, place: null, alternatives: [], confidence: 'LOW' };
    // Without geographic evidence, multiple reference campuses/airports need clarification too.
    if (references.length > 1 && !bias) return { resolved: false, place: null, alternatives: [], confidence: 'LOW' };
    const rankedReferences = bias ? references.sort((a, b) => distanceMeters(a.coordinates, bias!) - distanceMeters(b.coordinates, bias!)) : references;
    bias = rankedReferences[0].coordinates;
  }
  let places = await searchLocationPlaces(parsed.searchTerm, bias, options);
  const category = Object.entries(stopCategoryConfig).find(([key, config]) =>
    [key, config.type.replaceAll('_', ' '), config.textQuery].includes(parsed.searchTerm.toLowerCase()))?.[1];
  const words = parsed.searchTerm.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const matches = places.filter(place => words.every(word => place.name.toLowerCase().includes(word)));
  if (category) places = places.filter(place => place.types?.includes(category.type)
    || (category.type === 'dessert_shop' && place.types?.some(type => ['bakery', 'ice_cream_shop', 'confectionery'].includes(type))));
  else if (parsed.reference || matches.length) places = matches;
  places = [...new Map(places.map(place => [place.placeId, place])).values()].map(place => ({ ...place,
    ...(bias ? { distanceMeters: Math.round(distanceMeters(place.coordinates, bias)) } : {}),
  })).sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  if (parsed.reference) places = places.filter(place => (place.distanceMeters ?? Infinity) <= 10000);
  const best = places[0];
  const ambiguous = places.length > 1 && (!bias || (matches.length > 0 && (best.distanceMeters ?? 0) > 10000)
    || (places[1].distanceMeters ?? 0) - (best.distanceMeters ?? 0) < 500);
  return { resolved: !!best && !ambiguous, place: best && !ambiguous ? best : null,
    alternatives: places.slice(0, 4), confidence: ambiguous || !best ? 'LOW' : 'MEDIUM' };
}

export async function resolveTripLocations<T extends { origin: Location; destination: Location }>(trip: T): Promise<T> {
  let origin = trip.origin;
  let originCoordinates = 'latitude' in origin ? origin : undefined;
  if ('address' in origin) {
    const result = await resolveUserLocationQuery({ query: origin.address });
    if (!result.place) throw new GooglePlacesApiError('LOCATION_AMBIGUOUS', 'Choose a specific starting place in Trip Details.', 422);
    origin = { placeId: result.place.placeId }; originCoordinates = result.place.coordinates;
  }
  let destination = trip.destination;
  if ('address' in destination) {
    const result = await resolveUserLocationQuery({ query: destination.address, tripOrigin: originCoordinates });
    if (!result.place) throw new GooglePlacesApiError('LOCATION_AMBIGUOUS', 'Choose a specific destination before planning.', 422);
    destination = { placeId: result.place.placeId };
  }
  return { ...trip, origin, destination };
}

/** Exact selected-place metadata for hub detection; never replaces a selected ID with text geocoding. */
export async function getLocationMetadata(location: Location, options: PlacesServiceOptions = {}) {
  if (!('placeId' in location)) return null;
  const apiKey = options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const response = await (options.fetchImpl ?? fetch)(`https://places.googleapis.com/v1/places/${encodeURIComponent(location.placeId)}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'id,displayName,location,types' }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const place = await response.json();
  if (!Number.isFinite(place.location?.latitude) || !Number.isFinite(place.location?.longitude)) return null;
  return { coordinates: place.location as Coordinates, types: Array.isArray(place.types) ? place.types as string[] : [],
    name: typeof place.displayName?.text === 'string' ? place.displayName.text : '' };
}
