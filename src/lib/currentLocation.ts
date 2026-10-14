import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import type { Coordinates, Location } from './types';

const labels = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const resolved = new Map<string, { label: string; expires: number }>();
const keyFor = (point: Coordinates) => `${point.latitude},${point.longitude}`;

export type NearbyLocationCandidate = {
  placeId: string; name: string; coordinates: Coordinates; types: readonly string[];
};

function distanceMeters(a: Coordinates, b: Coordinates): number {
  const radians = (value: number) => value * Math.PI / 180;
  const latitude = radians(b.latitude - a.latitude), longitude = radians(b.longitude - a.longitude);
  const value = Math.sin(latitude / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

/** Require a close, named establishment and a clear lead over competing establishments. */
export function selectBestNearbyPlace({ userCoordinates, accuracyMeters, candidates }: {
  userCoordinates: Coordinates; accuracyMeters?: number; candidates: readonly NearbyLocationCandidate[];
}): (NearbyLocationCandidate & { distanceMeters: number }) | null {
  const accuracy = accuracyMeters ?? 25;
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50) return null;
  const excludedTypes = new Set(['political', 'country', 'locality', 'neighborhood', 'route', 'street_address', 'parking']);
  const eligible = candidates.filter(candidate => candidate.name.trim() && candidate.placeId
    && !/^(?:unnamed\b|building\s+\d+\b|parking\s+(?:lot|garage)\b)/i.test(candidate.name)
    && candidate.types.length && !candidate.types.some(type => excludedTypes.has(type))
    && Number.isFinite(candidate.coordinates.latitude) && Number.isFinite(candidate.coordinates.longitude))
    .map(candidate => ({ ...candidate, distanceMeters: distanceMeters(userCoordinates, candidate.coordinates) }))
    .filter(candidate => candidate.distanceMeters <= 50)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .filter((candidate, index, all) => all.findIndex(other => other.placeId === candidate.placeId) === index);
  const best = eligible[0];
  if (!best || best.distanceMeters > 35 || best.distanceMeters + accuracy > 50) return null;
  if (eligible[1] && eligible[1].distanceMeters - best.distanceMeters < Math.max(10, accuracy / 2)) return null;
  return best;
}

export function locationDisplayName(location: Location): string {
  if ('address' in location) return location.address;
  if ('placeId' in location) return 'Selected place';
  return labels.get(keyFor(location)) ?? 'Current location';
}

export function chooseReverseGeocodeLabel(results: readonly { types: readonly string[]; formatted_address: string; address_components?: readonly { long_name: string; types: readonly string[] }[] }[], allowPlaceName = true): string {
  const poi = results.find(result => result.types.some(type => ['establishment', 'point_of_interest', 'premise'].includes(type)));
  const name = poi?.address_components?.find(component => component.types.some(type => ['establishment', 'point_of_interest', 'premise'].includes(type)))?.long_name;
  if (allowPlaceName && name?.trim()) return name.trim();
  const address = results.find(result => result.types.some(type => ['street_address', 'subpremise', 'premise'].includes(type))) ?? poi
    ?? results.find(result => result.types.some(type => ['neighborhood', 'locality', 'sublocality'].includes(type)));
  return address?.formatted_address?.trim() || 'Current location';
}

/** Display lookup only; never substitutes a geocoded point for the browser coordinates. */
export function resolveCurrentLocationName(point: Coordinates, accuracyMeters?: number): Promise<string> {
  const coordinateKey = keyFor(point);
  const key = `${coordinateKey}:${accuracyMeters ?? 'unknown'}`;
  const cached = resolved.get(key);
  if (cached && cached.expires > Date.now()) {
    labels.set(coordinateKey, cached.label);
    return Promise.resolve(cached.label);
  }
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    let candidateCount = 0;
    let best: ReturnType<typeof selectBestNearbyPlace> = null;
    let label = 'Current location';
    let source = 'FALLBACK';
    try {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!apiKey) return 'Current location';
      setOptions({ key: apiKey, v: 'weekly' });
      if (accuracyMeters === undefined || (Number.isFinite(accuracyMeters) && accuracyMeters >= 0 && accuracyMeters <= 50)) {
        try {
          const { Place, SearchNearbyRankPreference } = await importLibrary('places');
          const nearby = await Place.searchNearby({ fields: ['id', 'displayName', 'location', 'types'],
            locationRestriction: { center: { lat: point.latitude, lng: point.longitude }, radius: 50 },
            rankPreference: SearchNearbyRankPreference.DISTANCE, maxResultCount: 20 });
          const candidates = nearby.places.flatMap(place => place.location && place.displayName && place.id ? [{
            placeId: place.id, name: place.displayName, types: place.types ?? [],
            coordinates: { latitude: place.location.lat(), longitude: place.location.lng() },
          }] : []);
          candidateCount = candidates.length;
          best = selectBestNearbyPlace({ userCoordinates: point, accuracyMeters, candidates });
        } catch { /* Places permissions/failure must not prevent the address fallback. */ }
      }
      if (best) { label = best.name.trim(); source = 'PLACE'; }
      else {
        const { Geocoder } = await importLibrary('geocoding');
        const response = await new Geocoder().geocode({ location: { lat: point.latitude, lng: point.longitude } });
        label = chooseReverseGeocodeLabel(response.results, false);
        source = label === 'Current location' ? 'FALLBACK'
          : response.results.some(result => result.formatted_address === label && result.types.some(type => ['street_address', 'subpremise', 'premise'].includes(type))) ? 'ADDRESS' : 'LOCALITY';
      }
    } catch { /* Routing remains usable with coordinates and the fallback label. */ }
    if (process.env.NODE_ENV === 'development') console.debug('[RouteWise current location]', {
      coordinates: 'available', accuracyMeters: accuracyMeters ?? 'unknown', candidates: candidateCount,
      bestPlace: best?.name ?? 'none', distanceMeters: best ? Math.round(best.distanceMeters) : null,
      confidence: best ? 'high' : 'no confident place match', displaySource: source,
    });
    labels.set(coordinateKey, label);
    resolved.set(key, { label, expires: Date.now() + (source === 'FALLBACK' ? 30000 : 5 * 60000) });
    if (resolved.size > 100) resolved.delete(resolved.keys().next().value!);
    if (labels.size > 100) labels.delete(labels.keys().next().value!);
    return label;
  })();
  pending.set(key, request);
  void request.finally(() => pending.delete(key));
  return request;
}
