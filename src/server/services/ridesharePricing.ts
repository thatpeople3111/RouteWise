import type { RideshareProvider } from '../types/index';
import { estimateFare, type FareContext } from './fareEstimation';
export interface RideshareFareEstimate {
  low: number; high: number; currency: string; source: 'routewise_estimate'; methodology: string;
}
/** Compatibility adapter for the centralized, explicitly modeled fare service. */
export function estimateRideshareFare(provider: RideshareProvider, distanceMeters: number | null,
  rideMinutes: number | null, context: FareContext = {}): RideshareFareEstimate | null {
  const estimate = estimateFare({ ...context, providerType: 'RIDESHARE', provider, distanceMeters, durationMinutes: rideMinutes });
  return estimate.priceLow === null || estimate.priceHigh === null ? null : {
    low: estimate.priceLow, high: estimate.priceHigh, currency: estimate.currency, source: 'routewise_estimate', methodology: estimate.methodology,
  };
}
