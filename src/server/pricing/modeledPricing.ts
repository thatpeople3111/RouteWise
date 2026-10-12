import { estimateFare } from '../services/fareEstimation';
import { unavailableFare, type FareEstimate, type FareRequest } from './types';
import { BRIGHTLINE_MODEL, RENTAL_MODELS, HERTZ_ATL_MONTHLY, HERTZ_ATL_SOURCE, RENTAL_TIME_ADJUSTMENTS } from './modelConfig';
import { getPricingTimeContext } from './timeContext';
import { railStations } from './railPricing';
import { findNearbyAirports, HUB_RENTALS } from '../services/travelProviders';
import { checkWaymoAvailability } from '../services/waymoAvailability';
export function estimateModeledFare(request: FareRequest): FareEstimate {
  const origin = 'latitude' in request.origin ? request.origin : null;
  const time = getPricingTimeContext(request.departureTime ?? request.arrivalTime, origin);
  const passengers = request.passengers ?? 1;
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 9) return unavailableFare(request);
  if (['UBER', 'LYFT', 'WAYMO'].includes(request.provider) && origin && (origin.latitude < 24 || origin.latitude > 49
    || origin.longitude < -125 || origin.longitude > -67)) return unavailableFare(request);
  if (request.provider === 'WAYMO' && (!origin || !('latitude' in request.destination)
    || !checkWaymoAvailability(origin, request.destination).available)) return unavailableFare(request);
  const ranged = (baseline: number, low: number, high: number, sourceUrl: string, methodology: string,
    metadata: Record<string, unknown>, appliesToTrip = true): FareEstimate => ({ ...unavailableFare(request),
    priceLow: Math.max(1, Math.round(baseline * low)), priceHigh: Math.max(1, Math.ceil(baseline * high)),
    kind: 'RANGE', sourceType: 'MODELED', confidence: 'LOW', appliesToTrip, label: 'Estimated fare', sourceUrl, methodology, metadata });
  if (request.provider === 'BRIGHTLINE') {
    const pair = railStations(request);
    if (!pair || ![pair.from.id, pair.to.id].includes('bl-orlando')) return unavailableFare(request);
    const adjustment = time?.dayType === 'WEEKEND' ? BRIGHTLINE_MODEL.weekend
      : time && ['AM_PEAK', 'PM_PEAK'].includes(time.timeBand) ? BRIGHTLINE_MODEL.peak : 1;
    return ranged(BRIGHTLINE_MODEL.baseline * passengers * adjustment, BRIGHTLINE_MODEL.low, BRIGHTLINE_MODEL.high,
      BRIGHTLINE_MODEL.source, 'Historical Brightline full-fare long-haul benchmark with a wide RouteWise planning band. Weekend/peak adjustments are model assumptions. Not a fare quote or train schedule.',
      { priceUnit: 'TRIP', passengers, timeContext: time, originStation: pair.from.id, destinationStation: pair.to.id, benchmarkYear: 2025 });
  }
  if (request.provider === 'RENTAL_CAR') {
    const id = request.providerMetadata?.rentalProvider ?? '';
    const hubId = request.providerMetadata?.pickupHubId ?? (origin ? findNearbyAirports(origin, 5000)[0]?.id : undefined);
    const hub = hubId ? HUB_RENTALS[hubId] : undefined, model = RENTAL_MODELS[id];
    const days = request.providerMetadata?.rentalDays;
    if (!origin || !hub || !model || !hub.providers.some(provider => provider === id)
      || days !== undefined && (!Number.isInteger(days) || days < 1 || days > 90)) return unavailableFare(request);
    let baseline = model.baseline, source = model.source, note = model.note;
    if (id === 'hertz' && hubId === 'ATL' && time) { baseline = HERTZ_ATL_MONTHLY[time.month - 1]; source = HERTZ_ATL_SOURCE;
      note = 'Hertz ATL historical monthly daily-rate data; vehicle mix may differ from your selection.'; }
    const factor = time?.dayType === 'WEEKEND' ? RENTAL_TIME_ADJUSTMENTS.weekend : RENTAL_TIME_ADJUSTMENTS.baseline;
    const fare = ranged(baseline * factor, model.low, model.high, source,
      `${note} Range and weekend adjustment are RouteWise planning assumptions, not inventory pricing.${request.providerMetadata?.pickupDateIsApproximate ? ' Pickup date uses an approximate travel-date proxy.' : ''} Taxes, fees, insurance, and vehicle class may change the cost.`,
      { priceUnit: 'DAY', pickupHubId: hubId, rentalDays: days, vehicleCategory: request.providerMetadata?.vehicleCategory ?? 'unspecified', timeContext: time }, false);
    if (days) fare.metadata = { ...fare.metadata, rentalTotalLow: fare.priceLow! * days, rentalTotalHigh: fare.priceHigh! * days };
    return fare;
  }
  const estimate = estimateFare({ providerType: 'RIDESHARE', provider: request.provider,
    distanceMeters: request.distanceMeters, durationMinutes: request.durationMinutes,
    departureTime: request.departureTime, arrivalTime: request.arrivalTime,
    origin: 'latitude' in request.origin ? request.origin : null });
  if (estimate.priceLow === null || estimate.priceHigh === null) return unavailableFare(request);
  return { ...unavailableFare(request), priceLow: estimate.priceLow, priceHigh: estimate.priceHigh,
    sourceType: 'MODELED', kind: 'RANGE', appliesToTrip: true, label: 'Estimated fare', methodology: estimate.methodology };
}
