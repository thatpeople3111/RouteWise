import type { Coordinates, RideshareOption, TripPlanRouteOption } from './index';

export type TripScope = 'LOCAL' | 'LONG_DISTANCE';
export interface TravelHub {
  id: string;
  name: string;
  kind: 'AIRPORT' | 'TRAIN_STATION' | 'TRANSIT_HUB';
  coordinates: Coordinates;
  sourceUrl: string;
}
export interface JourneyConnection {
  from: string;
  to: string;
  mode: 'RIDESHARE' | 'AT_HUB';
  durationMinutes: number | null;
  costUsd: number | null;
  rideshares: RideshareOption[];
  fare?: import('../pricing/types').FareEstimate;
}
export interface JourneyCost {
  components: { label: string; amountUsd: number | null; source: 'live' | 'official' | 'estimated' | 'unavailable'; note?: string; fare?: import('../pricing/types').FareEstimate }[];
  priceLowUsd?: number | null;
  priceHighUsd?: number | null;
  knownSubtotalUsd: number;
  knownSubtotalLowUsd?: number;
  totalUsd: number | null;
  complete: boolean;
}
export interface LongDistanceJourney {
  id: string;
  mode: 'DRIVING' | 'RAIL' | 'FLIGHT';
  provider: string;
  fare?: import('../pricing/types').FareEstimate;
  logo?: string;
  originHub?: TravelHub;
  destinationHub?: TravelHub;
  firstMile?: JourneyConnection;
  lastMile?: JourneyConnection;
  rentals?: LongDistancePlan['rentals'];
  durationMinutes: number | null;
  rideMinutes: number | null;
  bufferMinutes: number;
  departureTime?: string;
  arrivalTime?: string;
  airline?: string;
  stops?: number;
  transfers?: number;
  cost: JourneyCost;
  route?: TripPlanRouteOption;
  bookingUrl: string;
  sourceUrl: string;
  status: 'configured_service' | 'route_estimate' | 'search_only';
  labels: ('BEST' | 'FASTEST' | 'CHEAPEST')[];
  warnings: string[];
}
export interface LongDistancePlan {
  rankings: { best: string | null; fastest: string | null; cheapest: string | null };
  journeys: LongDistanceJourney[];
  destinationHub: TravelHub | null;
  rentals: { id: string; provider: string; logo: string; pickup: string; bookingUrl: string; sourceUrl: string; priceUsdPerDay: number | null; fare?: import('../pricing/types').FareEstimate }[];
  warnings: string[];
}
