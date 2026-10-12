import { unavailableFare, type FareEstimate } from './types';
import type { TripRequest } from '../types/index';
/** Preserve Google/official agency facts without refetching or changing numeric fares. */
export function normalizeKnownTransitFare(request: TripRequest,
  cost: { amount: number; currency: string; source: string; sourceName?: string } | null): FareEstimate {
  const base = unavailableFare({ ...request, provider: 'TRANSIT' });
  if (!cost || cost.currency !== 'USD' || !Number.isFinite(cost.amount) || cost.amount < 0
    || !['google_routes_estimate', 'agency_official'].includes(cost.source)) return base;
  const official = cost.source === 'agency_official';
  return { ...base, exactPrice: cost.amount, kind: 'EXACT', sourceType: official ? 'OFFICIAL' : 'LIVE_API',
    confidence: official ? 'MEDIUM' : 'HIGH', label: official ? 'Official published base fare' : 'Google Routes fare estimate',
    appliesToTrip: !official, metadata: { sourceName: cost.sourceName, priceUnit: 'TRIP' },
    methodology: official ? 'Maintained agency base fare; transfers, zones, discounts, and passes may change the complete fare.' : 'Fare returned by Google Routes; confirm with the agency.' };
}
