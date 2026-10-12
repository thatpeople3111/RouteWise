import { getPricingTimeContext } from '../pricing/timeContext';
import { PROVIDER_PRICING_MODELS, TIME_ADJUSTMENTS } from '../pricing/modelConfig';
import type { Coordinates } from '../types/index';

export interface FareContext {
  departureTime?: string;
  arrivalTime?: string;
  origin?: Coordinates | null;
}
export interface FareEstimate {
  priceLow: number | null;
  priceHigh: number | null;
  currency: 'USD';
  sourceType: 'MODELED' | 'UNAVAILABLE';
  label: string;
  methodology: string;
}
/** Maintained model assumptions, not provider rate cards or measured surge.
 * Keep unsupported providers/modes unavailable instead of extrapolating rates.
 */
export function estimateFare(input: FareContext & { providerType: 'RIDESHARE' | 'RAIL' | 'FLIGHT' | 'RENTAL'; provider: string;
  distanceMeters?: number | null; durationMinutes?: number | null }): FareEstimate {
  const rate = input.providerType === 'RIDESHARE' ? PROVIDER_PRICING_MODELS[input.provider as keyof typeof PROVIDER_PRICING_MODELS] : undefined;
  const distance = input.distanceMeters, duration = input.durationMinutes;
  if (!rate || distance == null || duration == null || !Number.isFinite(distance) || !Number.isFinite(duration) || distance < 0 || duration < 0) {
    return { priceLow: null, priceHigh: null, currency: 'USD', sourceType: 'UNAVAILABLE', label: 'Fare unavailable',
      methodology: 'No reliable configured pricing baseline or usable route facts.' };
  }
  const time = getPricingTimeContext(input.departureTime ?? input.arrivalTime, input.origin);
  const weekend = time?.dayType === 'WEEKEND';
  const band = time?.timeBand === 'LATE_NIGHT' || time?.timeBand === 'EARLY_MORNING' ? 'late night'
    : time && !weekend && ['AM_PEAK', 'PM_PEAK'].includes(time.timeBand) ? 'weekday commute'
      : weekend ? 'weekend' : 'daytime';
  const factor = !time ? TIME_ADJUSTMENTS.baseline : band === 'late night' ? TIME_ADJUSTMENTS.lateNight : band === 'weekday commute' ? TIME_ADJUSTMENTS.commute : band === 'weekend' ? TIME_ADJUSTMENTS.weekend : TIME_ADJUSTMENTS.baseline;
  const midpoint = (rate.base + distance / 1609.344 * rate.perMile + duration * rate.perMinute) * factor;
  const low = Math.max(1, Math.round(midpoint * TIME_ADJUSTMENTS.low));
  return { priceLow: low, priceHigh: Math.max(low, Math.round(midpoint * TIME_ADJUSTMENTS.high)), currency: 'USD', sourceType: 'MODELED', label: 'Estimated fare',
    methodology: `RouteWise distance/time model${time ? `; ${band} planning factor ${factor}` : '; travel-time context unavailable, baseline range used'}. Factors are uncalibrated planning assumptions, not provider surge or a live quote. Taxes, tolls, and fees may differ.` };
}
