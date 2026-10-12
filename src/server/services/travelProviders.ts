import type { Coordinates } from '../types/index';
import type { TravelHub } from '../types/longDistance';
import { distanceMeters } from './locationResolution';

export const travelProviderLogo = (id: string) => `/providers/${id}.${id === 'brightline' ? 'png' : ['hertz', 'sunrail'].includes(id) ? 'svg' : 'ico'}`;

const hub = (id: string, name: string, kind: TravelHub['kind'], latitude: number, longitude: number, sourceUrl: string): TravelHub =>
  ({ id, name, kind, coordinates: { latitude, longitude }, sourceUrl });
/** Maintained commercial passenger airports, not arbitrary Places 'airport' matches. */
export const AIRPORTS: readonly TravelHub[] = [
  hub('MIA', 'Miami International Airport', 'AIRPORT', 25.7959, -80.287, 'https://www.miami-airport.com/'),
  hub('FLL', 'Fort Lauderdale-Hollywood International Airport', 'AIRPORT', 26.0742, -80.1506, 'https://www.broward.org/airport/'),
  hub('MCO', 'Orlando International Airport', 'AIRPORT', 28.4312, -81.3081, 'https://orlandomco.com/'),
  hub('TPA', 'Tampa International Airport', 'AIRPORT', 27.9755, -82.5332, 'https://www.tampaairport.com/'),
  hub('ATL', 'Hartsfield-Jackson Atlanta International Airport', 'AIRPORT', 33.6407, -84.4277, 'https://www.atl.com/'),
  hub('JAX', 'Jacksonville International Airport', 'AIRPORT', 30.4941, -81.6879, 'https://www.flyjacksonville.com/'),
  hub('JFK', 'John F. Kennedy International Airport', 'AIRPORT', 40.6413, -73.7781, 'https://www.jfkairport.com/'),
  hub('LAX', 'Los Angeles International Airport', 'AIRPORT', 33.9416, -118.4085, 'https://www.flylax.com/'),
  hub('SFO', 'San Francisco International Airport', 'AIRPORT', 37.6213, -122.379, 'https://www.flysfo.com/'),
  hub('ORD', "Chicago O'Hare International Airport", 'AIRPORT', 41.9742, -87.9073, 'https://www.flychicago.com/'),
  hub('DFW', 'Dallas Fort Worth International Airport', 'AIRPORT', 32.8998, -97.0403, 'https://www.dfwairport.com/'),
  hub('DEN', 'Denver International Airport', 'AIRPORT', 39.8561, -104.6737, 'https://www.flydenver.com/'),
];
export function findNearbyAirports(point: Coordinates, radiusMeters = 100000): TravelHub[] {
  return AIRPORTS.filter(airport => distanceMeters(point, airport.coordinates) <= radiusMeters)
    .sort((a, b) => distanceMeters(point, a.coordinates) - distanceMeters(point, b.coordinates));
}
const brightlineUrl = 'https://www.gobrightline.com/train-stations';
const amtrakUrl = 'https://www.amtrak.com/routes/floridian-train';
const triRailUrl = 'https://www.tri-rail.com/pages/view/system-map';
const sunRailUrl = 'https://sunrail.com/maps-schedules/map/';
/** Station pairs are eligible only within the same documented service corridor. No schedule is inferred. */
export const RAIL_PROVIDERS = [
  { id: 'brightline', name: 'Brightline', url: brightlineUrl, radius: 40000, stations: [
    hub('bl-miami', 'MiamiCentral', 'TRAIN_STATION', 25.7798, -80.1959, brightlineUrl),
    hub('bl-aventura', 'Brightline Aventura', 'TRAIN_STATION', 25.9662, -80.1454, brightlineUrl),
    hub('bl-fort-lauderdale', 'Brightline Fort Lauderdale', 'TRAIN_STATION', 26.1223, -80.1435, brightlineUrl),
    hub('bl-boca', 'Brightline Boca Raton', 'TRAIN_STATION', 26.3531, -80.086, brightlineUrl),
    hub('bl-wpb', 'Brightline West Palm Beach', 'TRAIN_STATION', 26.7137, -80.0572, brightlineUrl),
    hub('bl-orlando', 'Brightline Orlando Airport', 'TRAIN_STATION', 28.4127, -81.2989, brightlineUrl),
  ] },
  { id: 'amtrak', name: 'Amtrak · Floridian', url: amtrakUrl, radius: 40000, stations: [
    hub('am-miami', 'Miami Amtrak Station', 'TRAIN_STATION', 25.8498, -80.2576, amtrakUrl),
    hub('am-wpb', 'West Palm Beach Amtrak Station', 'TRAIN_STATION', 26.7127, -80.062, amtrakUrl),
    hub('am-orlando', 'Orlando Amtrak Station', 'TRAIN_STATION', 28.5259, -81.3817, amtrakUrl),
    hub('am-tampa', 'Tampa Union Station', 'TRAIN_STATION', 27.9525, -82.4507, amtrakUrl),
    hub('am-jacksonville', 'Jacksonville Amtrak Station', 'TRAIN_STATION', 30.3655, -81.724, amtrakUrl),
  ] },
  { id: 'tri-rail', name: 'Tri-Rail', url: triRailUrl, radius: 20000, stations: [
    hub('tr-miami', 'Miami Airport Tri-Rail Station', 'TRAIN_STATION', 25.7972, -80.2583, triRailUrl),
    hub('tr-fll', 'Fort Lauderdale Airport Tri-Rail Station', 'TRAIN_STATION', 26.0611, -80.1652, triRailUrl),
    hub('tr-wpb', 'West Palm Beach Tri-Rail Station', 'TRAIN_STATION', 26.7127, -80.062, triRailUrl),
    hub('tr-mangonia', 'Mangonia Park Tri-Rail Station', 'TRAIN_STATION', 26.7584, -80.075, triRailUrl),
  ] },
  { id: 'sunrail', name: 'SunRail', url: sunRailUrl, radius: 20000, stations: [
    hub('sr-poinciana', 'Poinciana SunRail Station', 'TRAIN_STATION', 28.2581, -81.4893, sunRailUrl),
    hub('sr-orlando', 'Orlando Health / Amtrak SunRail Station', 'TRAIN_STATION', 28.5259, -81.3817, sunRailUrl),
    hub('sr-deland', 'DeLand / Amtrak SunRail Station', 'TRAIN_STATION', 29.0178, -81.3523, sunRailUrl),
  ] },
] as const;
export function discoverRail(origin: Coordinates, destination: Coordinates) {
  const nearest = (point: Coordinates, stations: readonly TravelHub[], radius: number) =>
    [...stations].filter(station => distanceMeters(point, station.coordinates) <= radius)
      .sort((a, b) => distanceMeters(point, a.coordinates) - distanceMeters(point, b.coordinates))[0];
  return RAIL_PROVIDERS.flatMap(provider => {
    const from = nearest(origin, provider.stations, provider.radius), to = nearest(destination, provider.stations, provider.radius);
    return from && to && from.id !== to.id ? [{ provider, from, to }] : [];
  });
}
export function isTransportationHub(point: Coordinates, types: readonly string[] = [], registry: readonly TravelHub[] = AIRPORTS): TravelHub | null {
  const nearest = [...registry].sort((a, b) => distanceMeters(point, a.coordinates) - distanceMeters(point, b.coordinates))[0];
  // A downtown/hotel near an airport is not a hub. Exact Places types are preferred.
  if (types.includes('airport')) return findNearbyAirports(point, 10000)[0] ?? null;
  if (types.some(type => ['train_station', 'transit_station', 'bus_station'].includes(type))) {
    return nearest && nearest.kind !== 'AIRPORT' && distanceMeters(point, nearest.coordinates) < 1500 ? nearest : null;
  }
  if (nearest && distanceMeters(point, nearest.coordinates) < 750 && types.length === 0) return nearest;
  return null;
}

export const RENTAL_PROVIDERS = {
  hertz: { name: 'Hertz', url: 'https://www.hertz.com/' },
  enterprise: { name: 'Enterprise', url: 'https://www.enterprise.com/' },
  avis: { name: 'Avis', url: 'https://www.avis.com/' },
  alamo: { name: 'Alamo', url: 'https://www.alamo.com/' },
  budget: { name: 'Budget', url: 'https://www.budget.com/' },
  national: { name: 'National', url: 'https://www.nationalcar.com/' },
} as const;
/** On-site agencies verified against official airport directories; this is not vehicle inventory. */
export const HUB_RENTALS: Record<string, { providers: (keyof typeof RENTAL_PROVIDERS)[]; sourceUrl: string }> = {
  MCO: { providers: ['enterprise', 'hertz', 'avis', 'alamo', 'budget', 'national'], sourceUrl: 'https://orlandomco.com/node/13' },
  TPA: { providers: ['hertz', 'avis', 'enterprise', 'alamo', 'budget', 'national'], sourceUrl: 'https://www.tampaairport.com/ground-transportation' },
  ATL: { providers: ['avis', 'enterprise', 'hertz', 'budget', 'national'], sourceUrl: 'https://www.atl.com/wp-content/uploads/2025/08/CAR-RENTAL-June-2025-Fiscal.pdf' },
};
