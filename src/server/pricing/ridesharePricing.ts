import type { RideshareOption, TripRequest } from '../types/index';
import type { RideshareRouteFacts } from '../services/rideshareOptions';
import { pricingService } from './pricingService';
import { fareUpperBound } from './types';
export async function resolveRidesharePricing(request: TripRequest, facts: RideshareRouteFacts, options: RideshareOption[]): Promise<RideshareOption[]> {
  return Promise.all(options.map(async option => {
    const fare = option.available ? await pricingService.getFare({ provider: option.provider, origin: facts.originCoordinates ?? request.origin,
      destination: facts.destinationCoordinates ?? request.destination, departureTime: request.departureTime, arrivalTime: request.arrivalTime,
      durationMinutes: facts.rideMinutes, distanceMeters: facts.distanceMeters, providerMetadata: { bookingUrl: option.bookingUrl } })
      : { provider: option.provider, currency: 'USD' as const, sourceType: 'UNAVAILABLE' as const, confidence: 'LOW' as const,
        kind: 'UNAVAILABLE' as const, appliesToTrip: false, label: 'Price unavailable', retrievedAt: new Date().toISOString() };
    const upper = fareUpperBound(fare);
    const low = upper === null ? undefined : fare.exactPrice ?? fare.priceLow;
    return { ...option, fare, estimatedPriceLow: low, estimatedPriceHigh: upper ?? undefined,
      currency: fare.currency, priceSource: upper === null ? 'unavailable' as const : fare.sourceType === 'LIVE_API' ? 'provider' as const : 'estimate' as const,
      withinBudget: request.maxRideshareBudget === undefined || low === undefined ? null : low <= request.maxRideshareBudget };
  }));
}
