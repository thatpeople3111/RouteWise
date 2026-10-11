import type { RideshareProvider } from '../types/index';

/**
 * RouteWise-internal rideshare fare estimates.
 *
 * No live Lyft or Waymo pricing API is wired into this project, so fares are estimated from
 * app-maintained typical urban rate assumptions (base + distance + time) and returned as a range.
 * These are NEVER exact provider quotes; UI must label them as estimates via `priceSource`.
 */

export interface RideshareFareEstimate {
  low: number;
  high: number;
  currency: string;
  source: 'routewise_estimate';
}

interface RateAssumption {
  base: number;
  perMile: number;
  perMinute: number;
  /** Low/high multipliers forming the estimate range around the midpoint. */
  lowFactor: number;
  highFactor: number;
}

const ESTIMABLE_PROVIDERS = ['LYFT', 'WAYMO'] as const;
type EstimableProvider = (typeof ESTIMABLE_PROVIDERS)[number];

const RATE_ASSUMPTIONS: Record<EstimableProvider, RateAssumption> = {
  LYFT: { base: 3.5, perMile: 1.35, perMinute: 0.25, lowFactor: 0.85, highFactor: 1.2 },
  WAYMO: { base: 4.0, perMile: 1.5, perMinute: 0.28, lowFactor: 0.85, highFactor: 1.2 },
};

const METERS_PER_MILE = 1609.344;

function roundToDollar(amount: number): number {
  return Math.max(1, Math.round(amount));
}

/**
 * Estimates a fare range for a provider from factual route distance and duration.
 * Returns null when the inputs needed for an estimate are missing, so callers can show
 * "Estimate unavailable" instead of an invented price.
 */
export function estimateRideshareFare(
  provider: RideshareProvider,
  distanceMeters: number | null,
  rideMinutes: number | null,
): RideshareFareEstimate | null {
  if (!ESTIMABLE_PROVIDERS.includes(provider as EstimableProvider)) return null;
  if (distanceMeters === null || rideMinutes === null) return null;
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(rideMinutes)) return null;
  if (distanceMeters < 0 || rideMinutes < 0) return null;

  const rates = RATE_ASSUMPTIONS[provider as EstimableProvider];
  const midpoint = rates.base
    + (distanceMeters / METERS_PER_MILE) * rates.perMile
    + rideMinutes * rates.perMinute;
  const low = roundToDollar(midpoint * rates.lowFactor);
  const high = Math.max(low, roundToDollar(midpoint * rates.highFactor));
  return { low, high, currency: 'USD', source: 'routewise_estimate' };
}
