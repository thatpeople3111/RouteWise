import type { Coordinates, DestinationParking, ParkingLocation } from '../types/index';
import type { PlacesServiceOptions } from './places';

const radiusMeters = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function distanceBetween(first: Coordinates, second: Coordinates): number {
  const radians = Math.PI / 180;
  const a = Math.sin((second.latitude - first.latitude) * radians / 2) ** 2
    + Math.cos(first.latitude * radians) * Math.cos(second.latitude * radians)
    * Math.sin((second.longitude - first.longitude) * radians / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a))));
}

/** One bounded search per trip; parking failures must not hide usable routes. */
export async function findDestinationParking(
  destination: Coordinates,
  options: PlacesServiceOptions = {},
): Promise<DestinationParking> {
  const apiKey = (options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY)?.trim();
  if (!apiKey) return { status: 'unavailable', locations: [] };
  try {
    const response = await (options.fetchImpl ?? fetch)('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.businessStatus,places.currentOpeningHours.openNow',
      },
      body: JSON.stringify({
        includedTypes: ['parking'], maxResultCount: 5, rankPreference: 'DISTANCE',
        locationRestriction: { circle: { center: destination, radius: radiusMeters } },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { status: 'unavailable', locations: [] };
    const payload: unknown = await response.json();
    if (!isRecord(payload) || (payload.places !== undefined && !Array.isArray(payload.places))) {
      return { status: 'unavailable', locations: [] };
    }
    const locations: ParkingLocation[] = [];
    for (const value of (payload.places ?? []) as unknown[]) {
      if (!isRecord(value) || typeof value.id !== 'string'
        || !isRecord(value.displayName) || typeof value.displayName.text !== 'string'
        || !isRecord(value.location)
        || typeof value.location.latitude !== 'number' || !Number.isFinite(value.location.latitude)
        || typeof value.location.longitude !== 'number' || !Number.isFinite(value.location.longitude)
        || Math.abs(value.location.latitude) > 90 || Math.abs(value.location.longitude) > 180
        || (value.businessStatus !== undefined && value.businessStatus !== 'OPERATIONAL')) continue;
      const coordinates = { latitude: value.location.latitude, longitude: value.location.longitude };
      const distanceMeters = distanceBetween(destination, coordinates);
      if (distanceMeters > radiusMeters || locations.some(place => place.placeId === value.id)) continue;
      locations.push({
        placeId: value.id, name: value.displayName.text,
        address: typeof value.formattedAddress === 'string' ? value.formattedAddress : null,
        coordinates, distanceMeters,
        mapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value.displayName.text)}&query_place_id=${encodeURIComponent(value.id)}`,
        openNow: isRecord(value.currentOpeningHours) && typeof value.currentOpeningHours.openNow === 'boolean'
          ? value.currentOpeningHours.openNow : null,
      });
    }
    locations.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return { status: locations.length ? 'available' : 'none', locations };
  } catch {
    return { status: 'unavailable', locations: [] };
  }
}
