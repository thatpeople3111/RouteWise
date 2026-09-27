import type { Coordinates } from './types';

export type RideshareProviderId = 'uber' | 'waymo';

const UBER_DEEP_LINK_BASE = 'https://m.uber.com/ul/';

// Rough bounding boxes for metro areas with a published Waymo One service, used only to decide
// whether the card is worth surfacing. This is not a live availability check.
const WAYMO_SERVICE_AREAS: ReadonlyArray<{
  name: string; minLat: number; maxLat: number; minLng: number; maxLng: number;
}> = [
  { name: 'Phoenix, AZ', minLat: 33.20, maxLat: 33.70, minLng: -112.35, maxLng: -111.85 },
  { name: 'San Francisco Bay Area, CA', minLat: 37.35, maxLat: 37.85, minLng: -122.55, maxLng: -121.90 },
  { name: 'Los Angeles, CA', minLat: 33.70, maxLat: 34.35, minLng: -118.70, maxLng: -118.00 },
  { name: 'Austin, TX', minLat: 30.10, maxLat: 30.55, minLng: -97.95, maxLng: -97.55 },
  { name: 'Atlanta, GA', minLat: 33.60, maxLat: 33.95, minLng: -84.55, maxLng: -84.25 },
];

export const WAYMO_WEB_URL = 'https://waymo.com/waymo-one/';

/** Builds an Uber universal deep link that opens the Uber app (or web checkout) with the trip prefilled. */
export function buildUberRideLink(pickup: Coordinates, destinationLabel: string): string {
  const params = new URLSearchParams({
    action: 'setPickup',
    'pickup[latitude]': String(pickup.latitude),
    'pickup[longitude]': String(pickup.longitude),
    'pickup[nickname]': 'Current location',
  });
  if (destinationLabel.trim().length > 0) params.set('dropoff[formatted_address]', destinationLabel.trim());
  return `${UBER_DEEP_LINK_BASE}?${params.toString()}`;
}

/** Returns the name of a metro area with published Waymo service if the pickup roughly falls within it, otherwise null. */
export function findWaymoServiceArea(pickup: Coordinates): string | null {
  const match = WAYMO_SERVICE_AREAS.find(area =>
    pickup.latitude >= area.minLat && pickup.latitude <= area.maxLat
    && pickup.longitude >= area.minLng && pickup.longitude <= area.maxLng);
  return match?.name ?? null;
}
