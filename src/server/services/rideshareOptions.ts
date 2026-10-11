import type {
  Coordinates,
  FinalTripSelectedStop,
  Location,
  RideshareOption,
  RideshareProvider,
  TripRequest,
} from '../types/index';
import { estimateRideshareFare } from './ridesharePricing';
import { checkWaymoAvailability } from './waymoAvailability';

export const ALL_RIDESHARE_PROVIDERS: readonly RideshareProvider[] = ['LYFT', 'WAYMO', 'UBER'];

export const WAYMO_WEB_URL = 'https://waymo.com/waymo-one/';
const LYFT_RIDE_URL = 'https://ride.lyft.com/';
const UBER_DEEP_LINK_BASE = 'https://m.uber.com/ul/';

/**
 * App-maintained typical pickup waits, shown to users only as estimates.
 * Not live dispatch data.
 */
const TYPICAL_PICKUP_MINUTES: Record<RideshareProvider, number> = {
  LYFT: 5,
  WAYMO: 6,
  UBER: 5,
};

/** Factual route facts shared by every rideshare estimate for one trip. */
export interface RideshareRouteFacts {
  originCoordinates: Coordinates | null;
  destinationCoordinates: Coordinates | null;
  rideMinutes: number | null;
  distanceMeters: number | null;
}

export function describeLocation(location: Location): string {
  if ('address' in location) return location.address;
  if ('placeId' in location) return 'Selected place';
  return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
}

/** Builds Lyft's universal ride link with the trip prefilled where Lyft supports it. */
export function buildLyftRideLink(
  pickup: Coordinates | null,
  destination: Coordinates | null,
  destinationLabel: string,
): string {
  const params = new URLSearchParams({ id: 'lyft' });
  if (pickup) {
    params.set('pickup[latitude]', String(pickup.latitude));
    params.set('pickup[longitude]', String(pickup.longitude));
  }
  if (destination) {
    params.set('destination[latitude]', String(destination.latitude));
    params.set('destination[longitude]', String(destination.longitude));
  } else if (destinationLabel.trim().length > 0) {
    params.set('destination[address]', destinationLabel.trim());
  }
  return `${LYFT_RIDE_URL}?${params.toString()}`;
}

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

function budgetStatus(
  maxRideshareBudget: number | undefined,
  estimatedPriceLow: number | undefined,
): boolean | null {
  if (maxRideshareBudget === undefined) return null;
  if (estimatedPriceLow === undefined) return null;
  return estimatedPriceLow <= maxRideshareBudget;
}

function budgetNote(withinBudget: boolean | null, maxRideshareBudget: number | undefined): string[] {
  if (withinBudget !== false || maxRideshareBudget === undefined) return [];
  return [`The estimated fare is above your rideshare budget of $${maxRideshareBudget}.`];
}

/**
 * A rideshare may only take part in BEST/FASTEST ranking when it is available, has a verifiable
 * total time, and — whenever the user set a rideshare budget — has a known estimate within budget.
 */
export function isRideshareRankable(
  option: RideshareOption,
  maxRideshareBudget: number | undefined,
): boolean {
  if (!option.available) return false;
  if (typeof option.estimatedTotalMinutes !== 'number' || !Number.isFinite(option.estimatedTotalMinutes)) {
    return false;
  }
  if (maxRideshareBudget !== undefined) {
    if (typeof option.estimatedPriceLow !== 'number' || !Number.isFinite(option.estimatedPriceLow)) return false;
    if (option.estimatedPriceLow > maxRideshareBudget) return false;
  }
  return true;
}

function buildLyftOption(
  request: TripRequest,
  facts: RideshareRouteFacts,
  originLabel: string,
  destinationLabel: string,
): RideshareOption {
  const fare = estimateRideshareFare('LYFT', facts.distanceMeters, facts.rideMinutes);
  const withinBudget = budgetStatus(request.maxRideshareBudget, fare?.low);
  const notes: string[] = [
    'Fare and pickup time are RouteWise estimates from trip distance and typical rates — not a live Lyft quote. Live pricing is shown in the Lyft app.',
  ];
  if (!fare || facts.rideMinutes === null) {
    notes.push('Price and ride-time estimates are unavailable for this trip.');
  }
  notes.push(...budgetNote(withinBudget, request.maxRideshareBudget));

  return {
    id: 'rideshare-lyft',
    provider: 'LYFT',
    available: true,
    estimatedPickupMinutes: TYPICAL_PICKUP_MINUTES.LYFT,
    ...(facts.rideMinutes !== null ? { estimatedRideMinutes: facts.rideMinutes } : {}),
    ...(facts.rideMinutes !== null
      ? { estimatedTotalMinutes: facts.rideMinutes + TYPICAL_PICKUP_MINUTES.LYFT }
      : {}),
    ...(fare ? { estimatedPriceLow: fare.low, estimatedPriceHigh: fare.high, currency: fare.currency } : {}),
    priceSource: fare ? 'estimate' : 'unavailable',
    withinBudget,
    origin: originLabel,
    destination: destinationLabel,
    vehicleType: 'Standard Lyft ride',
    bookingUrl: buildLyftRideLink(facts.originCoordinates, facts.destinationCoordinates, destinationLabel),
    notes,
  };
}

function buildWaymoOption(
  request: TripRequest,
  facts: RideshareRouteFacts,
  originLabel: string,
  destinationLabel: string,
): RideshareOption {
  const availability = checkWaymoAvailability(facts.originCoordinates, facts.destinationCoordinates);

  if (!availability.available) {
    return {
      id: 'rideshare-waymo',
      provider: 'WAYMO',
      available: false,
      unavailableReason: availability.message ?? 'Waymo is unavailable for this trip',
      unavailableDetail: availability.detail,
      priceSource: 'unavailable',
      origin: originLabel,
      destination: destinationLabel,
      vehicleType: 'Waymo One — fully autonomous ride',
      notes: ['Service areas are app-maintained zone data based on published Waymo One coverage.'],
    };
  }

  const fare = estimateRideshareFare('WAYMO', facts.distanceMeters, facts.rideMinutes);
  const withinBudget = budgetStatus(request.maxRideshareBudget, fare?.low);
  const notes: string[] = [
    'Estimated fare is a RouteWise estimate from trip distance and typical reported Waymo rates — not a live Waymo quote.',
    availability.serviceAreaName
      ? `Pickup and destination are inside the ${availability.serviceAreaName} service area (app-maintained zone data).`
      : 'Service area match is based on app-maintained zone data.',
  ];
  if (!fare || facts.rideMinutes === null) {
    notes.push('Price and ride-time estimates are unavailable for this trip.');
  }
  notes.push(...budgetNote(withinBudget, request.maxRideshareBudget));

  return {
    id: 'rideshare-waymo',
    provider: 'WAYMO',
    available: true,
    estimatedPickupMinutes: TYPICAL_PICKUP_MINUTES.WAYMO,
    ...(facts.rideMinutes !== null ? { estimatedRideMinutes: facts.rideMinutes } : {}),
    ...(facts.rideMinutes !== null
      ? { estimatedTotalMinutes: facts.rideMinutes + TYPICAL_PICKUP_MINUTES.WAYMO }
      : {}),
    ...(fare ? { estimatedPriceLow: fare.low, estimatedPriceHigh: fare.high, currency: fare.currency } : {}),
    priceSource: fare ? 'estimate' : 'unavailable',
    withinBudget,
    origin: originLabel,
    destination: destinationLabel,
    vehicleType: 'Waymo One — fully autonomous ride',
    bookingUrl: WAYMO_WEB_URL,
    notes,
  };
}

function buildUberOption(
  facts: RideshareRouteFacts,
  originLabel: string,
  destinationLabel: string,
): RideshareOption {
  return {
    id: 'rideshare-uber',
    provider: 'UBER',
    available: true,
    priceSource: 'unavailable',
    withinBudget: null,
    origin: originLabel,
    destination: destinationLabel,
    ...(facts.originCoordinates
      ? { bookingUrl: buildUberRideLink(facts.originCoordinates, destinationLabel) }
      : {}),
    notes: ['Exact pricing, vehicle availability, and pickup time are shown in the Uber app.'],
  };
}

/**
 * Builds the rideshare section for a trip. Only requested providers are included; an enabled but
 * unavailable provider (e.g. Waymo outside its service area) is returned with an explicit
 * unavailable state instead of being silently dropped.
 */
export function buildRideshareOptions(
  request: TripRequest & { selectedStop?: FinalTripSelectedStop; skip?: boolean },
  facts: RideshareRouteFacts,
): RideshareOption[] {
  const requested = request.rideshareProviders ?? ALL_RIDESHARE_PROVIDERS;
  const originLabel = describeLocation(request.origin);
  const destinationLabel = describeLocation(request.destination);
  const hasSelectedStop = request.selectedStop !== undefined && request.skip !== true;

  const options: RideshareOption[] = [];
  for (const provider of requested) {
    if (provider === 'LYFT') options.push(buildLyftOption(request, facts, originLabel, destinationLabel));
    else if (provider === 'WAYMO') options.push(buildWaymoOption(request, facts, originLabel, destinationLabel));
    else if (provider === 'UBER') options.push(buildUberOption(facts, originLabel, destinationLabel));
  }

  if (hasSelectedStop) {
    for (const option of options) {
      option.notes = [
        ...(option.notes ?? []),
        'Rideshare estimates are for the direct trip and do not include your optional stop.',
      ];
    }
  }

  return options;
}
