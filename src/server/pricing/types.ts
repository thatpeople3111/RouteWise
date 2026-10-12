import type { Location } from '../types/index';

export type FareProvider = 'UBER' | 'LYFT' | 'WAYMO' | 'BRIGHTLINE' | 'AMTRAK' | 'TRIRAIL' | 'SUNRAIL' | 'FLIGHT' | 'RENTAL_CAR' | 'PARKING' | 'TRANSIT';
export type FareSourceType = 'LIVE_API' | 'OFFICIAL' | 'PUBLIC_BOOKING_PAGE' | 'GEMINI_GROUNDED' | 'MODELED' | 'UNAVAILABLE';
export interface FareEstimate {
  provider: FareProvider;
  exactPrice?: number;
  priceLow?: number;
  priceHigh?: number;
  currency: 'USD';
  sourceType: FareSourceType;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  label: string;
  kind: 'EXACT' | 'RANGE' | 'FROM' | 'UNAVAILABLE';
  /** False for advertised starting prices/reference rates, not complete trip quotes. */
  appliesToTrip: boolean;
  retrievedAt: string;
  bookingUrl?: string;
  sourceUrl?: string;
  methodology?: string;
  metadata?: Record<string, unknown>;
}
export interface FareRequest {
  provider: FareProvider;
  origin: Location;
  destination: Location;
  departureTime?: string;
  arrivalTime?: string;
  passengers?: number;
  durationMinutes?: number | null;
  distanceMeters?: number | null;
  providerMetadata?: { sourceUrl?: string; bookingUrl?: string; originName?: string; destinationName?: string;
    facilityName?: string; rentalDays?: number; rentalProvider?: string; vehicleCategory?: string;
    originStationId?: string; destinationStationId?: string; departureAirport?: string; arrivalAirport?: string; pickupHubId?: string;
    pickupDateIsApproximate?: boolean };
}
export type FareAdapter = (request: FareRequest) => Promise<FareEstimate | null>;
export const unavailableFare = (request: FareRequest, now = Date.now()): FareEstimate => ({
  provider: request.provider, currency: 'USD', sourceType: 'UNAVAILABLE', confidence: 'LOW', label: 'Price unavailable',
  kind: 'UNAVAILABLE', appliesToTrip: false, retrievedAt: new Date(now).toISOString(), bookingUrl: request.providerMetadata?.bookingUrl,
});
export function validFare(value: FareEstimate | null, request: FareRequest): value is FareEstimate {
  if (!value || value.provider !== request.provider || value.currency !== 'USD' || value.sourceType === 'UNAVAILABLE') return false;
  if (!['LIVE_API', 'OFFICIAL', 'PUBLIC_BOOKING_PAGE', 'GEMINI_GROUNDED', 'MODELED'].includes(value.sourceType)
    || !['HIGH', 'MEDIUM', 'LOW'].includes(value.confidence) || typeof value.label !== 'string'
    || typeof value.appliesToTrip !== 'boolean' || !Number.isFinite(Date.parse(value.retrievedAt))
    || value.kind === 'FROM' && value.appliesToTrip) return false;
  const numeric = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  return value.kind === 'EXACT' ? numeric(value.exactPrice)
    : value.kind === 'FROM' ? numeric(value.priceLow)
      : value.kind === 'RANGE' && numeric(value.priceLow) && numeric(value.priceHigh) && value.priceHigh >= value.priceLow;
}
/** Conservatively converts a complete single-trip fare to legacy numeric fields. */
export function fareUpperBound(fare: FareEstimate): number | null {
  if (!fare.appliesToTrip || fare.kind === 'FROM' || fare.sourceType === 'UNAVAILABLE') return null;
  return fare.exactPrice ?? fare.priceHigh ?? null;
}
