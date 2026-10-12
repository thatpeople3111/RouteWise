import { pricingService } from '../pricing/pricingService';
import { fareUpperBound, type FareProvider } from '../pricing/types';
import { resolveRidesharePricing } from '../pricing/ridesharePricing';
import type { Coordinates, FinalTripRequest, TripPlan, TripPlanRouteOption } from '../types/index';
import type { JourneyConnection, JourneyCost, LongDistanceJourney, LongDistancePlan, TravelHub } from '../types/longDistance';
import { getDirectDriveRoute, getCandidateRoutesViaStop, type GoogleRouteCandidate } from './maps';
import { buildRideshareOptions, isRideshareRankable } from './rideshareOptions';
import { distanceMeters, getLocationMetadata } from './locationResolution';
import { discoverRail, findNearbyAirports, HUB_RENTALS, isTransportationHub, RENTAL_PROVIDERS, RAIL_PROVIDERS, travelProviderLogo } from './travelProviders';
import { findDestinationParking } from './parking';

export interface LongDistanceOptions {
  getDrive?: typeof getDirectDriveRoute;
  getViaStop?: typeof getCandidateRoutesViaStop;
  getParking?: typeof findDestinationParking;
  destinationTypes?: string[];
}
/** Verified airport agencies also serve Brightline's Orlando airport arrival.
 * Other stations require their own directory; proximity alone is insufficient.
 */
function arrivalRentals(hub: TravelHub): LongDistancePlan['rentals'] {
  const pickupHub = hub.id === 'bl-orlando' ? findNearbyAirports(hub.coordinates)[0] : hub;
  const config = pickupHub ? HUB_RENTALS[pickupHub.id] : undefined;
  return config?.providers.slice(0, 3).map(id => ({ id, provider: RENTAL_PROVIDERS[id].name,
    logo: travelProviderLogo(id), pickup: pickupHub!.name, bookingUrl: RENTAL_PROVIDERS[id].url,
    sourceUrl: config.sourceUrl, priceUsdPerDay: null })) ?? [];
}
export function sumJourneyCost(components: JourneyCost['components']): JourneyCost {
  components = components.map(component => component.fare ? { ...component, amountUsd: fareUpperBound(component.fare) } : component);
  const valid = (amount: number | null) => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
  const complete = components.length > 0 && components.every(component => valid(component.amountUsd));
  const sum = (low: boolean) => Math.round(components.reduce((total, component) => total + (valid(component.amountUsd)
    ? low && component.fare?.appliesToTrip ? component.fare.exactPrice ?? component.fare.priceLow ?? component.amountUsd! : component.amountUsd! : 0), 0) * 100) / 100;
  const knownSubtotalUsd = sum(false);
  return { components, knownSubtotalUsd, knownSubtotalLowUsd: sum(true), totalUsd: complete ? knownSubtotalUsd : null, complete,
    priceLowUsd: complete ? sum(true) : null, priceHighUsd: complete ? knownSubtotalUsd : null };

}

/** Only complete time/cost data participates; a last-mile ride is never a top-level journey. */
export function rankLongDistanceJourneys(journeys: LongDistanceJourney[], request: FinalTripRequest) {
  const usable = journeys.filter(journey => journey.status !== 'search_only'
    && (journey.mode !== 'DRIVING' || request.hasCar === true)
    && journey.durationMinutes !== null
    && !journey.warnings.some(warning => warning.startsWith('Constraint:'))
    && (request.budgetUsd === undefined || (journey.cost.complete && journey.cost.totalUsd! <= request.budgetUsd))
    && (!request.arrivalTime || (request.departureTime !== undefined
      && Date.parse(request.departureTime) + journey.durationMinutes! * 60000 <= Date.parse(request.arrivalTime))));
  const fastest = [...usable].sort((a, b) => a.durationMinutes! - b.durationMinutes!)[0];
  const cheapest = [...usable].filter(journey => journey.cost.complete)
    .sort((a, b) => a.cost.totalUsd! - b.cost.totalUsd!)[0];
  const cheapestCertain = cheapest && usable.filter(other => other.id !== cheapest.id && other.cost.complete).every(other =>
    (cheapest.cost.priceHighUsd ?? cheapest.cost.totalUsd!) <= (other.cost.priceLowUsd ?? other.cost.totalUsd!)) ? cheapest : undefined;
  const best = request.preference === 'cheapest' ? cheapestCertain ?? fastest : fastest;
  for (const journey of journeys) journey.labels = [
    ...(best?.id === journey.id ? ['BEST' as const] : []),
    ...(fastest?.id === journey.id ? ['FASTEST' as const] : []),
    ...(cheapestCertain?.id === journey.id ? ['CHEAPEST' as const] : []),
  ];
  return { best: best?.id ?? null, fastest: fastest?.id ?? null, cheapest: cheapestCertain?.id ?? null };
}

async function connection(request: FinalTripRequest, from: Coordinates, to: Coordinates, fromName: string, toName: string,
  options: LongDistanceOptions, fareTime: { departureTime?: string; arrivalTime?: string } = request): Promise<JourneyConnection> {
  if (distanceMeters(from, to) < 300) return { from: fromName, to: toName, mode: 'AT_HUB', durationMinutes: 0, costUsd: 0, rideshares: [] };
  let route: GoogleRouteCandidate | null = null;
  try { route = await (options.getDrive ?? getDirectDriveRoute)({ ...request, origin: from, destination: to,
    arrivalTime: undefined, departureTime: request.departureTime ?? new Date().toISOString() }); } catch { /* Connection stays visibly unavailable. */ }
  const connectionRequest = { ...request, departureTime: fareTime.departureTime, arrivalTime: fareTime.arrivalTime, origin: from, destination: to, selectedStop: undefined, skip: true };
  const facts = { originCoordinates: from, destinationCoordinates: to, rideMinutes: route ? route.durationSeconds / 60 : null, distanceMeters: route?.distanceMeters ?? null };
  const rideshares = await resolveRidesharePricing(connectionRequest, facts, buildRideshareOptions({ ...request, departureTime: fareTime.departureTime, arrivalTime: fareTime.arrivalTime, origin: from, destination: to, selectedStop: undefined, skip: true }, {
    originCoordinates: from, destinationCoordinates: to, rideMinutes: route ? route.durationSeconds / 60 : null, distanceMeters: route?.distanceMeters ?? null,
  }));
  const recommended = rideshares.filter(ride => isRideshareRankable(ride, request.maxRideshareBudget))
    .sort((a, b) => a.estimatedTotalMinutes! - b.estimatedTotalMinutes!)[0];
  return { from: fromName, to: toName, mode: 'RIDESHARE', durationMinutes: recommended?.estimatedTotalMinutes ?? null,
    costUsd: recommended?.estimatedPriceHigh ?? null, fare: recommended?.fare, rideshares };
}

function routeView(raw: GoogleRouteCandidate, request: FinalTripRequest): TripPlanRouteOption {
  return { id: 'long-drive', mode: 'DRIVE', durationMinutes: raw.durationSeconds / 60, distanceMeters: raw.distanceMeters,
    origin: request.origin, destination: request.destination,
    walkingMinutes: 0, estimatedTransportationCost: raw.estimatedCost ?? null, extraStopMinutes: null,
    encodedPolyline: raw.encodedPolyline, tolls: raw.tolls,
    steps: raw.steps.map(step => ({ mode: step.travelMode, instruction: step.instruction, durationMinutes: step.durationSeconds === undefined ? undefined : step.durationSeconds / 60,
      distanceMeters: step.distanceMeters, encodedPolyline: step.encodedPolyline, transit: step.transit })),
    constraints: { budget: 'unknown', walking: 'met', extraTime: 'not_requested', extraBudget: 'not_requested', eligible: true }, warnings: raw.warnings };
}

export async function createLongDistancePlan(request: FinalTripRequest, origin: Coordinates, destination: Coordinates,
  originalRoutes: GoogleRouteCandidate[], rawRoutes: GoogleRouteCandidate[], options: LongDistanceOptions = {}): Promise<TripPlan> {
  const metadata = options.destinationTypes ? null : await getLocationMetadata(request.destination).catch(() => null);
  let destinationHub = isTransportationHub(metadata?.coordinates ?? destination, options.destinationTypes ?? metadata?.types,
    [...findNearbyAirports(destination), ...RAIL_PROVIDERS.flatMap(provider => [...provider.stations])]);
  if (!destinationHub && metadata) {
    const kind = metadata.types.includes('airport') ? 'AIRPORT' : metadata.types.includes('train_station') ? 'TRAIN_STATION'
      : metadata.types.some(type => ['transit_station', 'bus_station'].includes(type)) ? 'TRANSIT_HUB' : null;
    if (kind) destinationHub = { id: 'selected-hub', name: metadata.name, kind, coordinates: metadata.coordinates, sourceUrl: 'https://www.google.com/maps/' };
  }
  const journeys: LongDistanceJourney[] = [];
  let drive = rawRoutes.find(route => route.travelMode === 'DRIVE') ?? null;
  if (!drive) {
    try {
      const selected = request.skip ? undefined : request.selectedStop;
      if (selected) {
        const stop = 'location' in selected ? selected.location : selected.coordinates ?? { placeId: selected.placeId };
        drive = (await (options.getViaStop ?? getCandidateRoutesViaStop)({ ...request, hasCar: true, allowTransit: false, allowWalking: false }, stop))
          .find(route => route.travelMode === 'DRIVE') ?? null;
      } else drive = await (options.getDrive ?? getDirectDriveRoute)(request);
    } catch { /* Rail/flight discovery can continue without a road route. */ }
  }
  if (drive) {
    const route = routeView(drive, request);
    if (!destinationHub && request.hasCar) {
      try { route.parking = await (options.getParking ?? findDestinationParking)(destination); } catch { route.parking = { status: 'unavailable', locations: [] }; }
    }
    const lot = route.parking?.locations.find(place => place.recommended) ?? route.parking?.locations[0];
    route.durationMinutes += lot?.walkingMinutes ?? 0;
    route.walkingMinutes = lot?.walkingMinutes ?? 0;
    const travelDate = new Date(request.departureTime ?? request.arrivalTime ?? Date.now());
    // A vehicle-cost proxy, not a fuel-price quote. No separate fuel component is added.
    const mileageRate = travelDate.getUTCFullYear() === 2026 ? (travelDate.getUTCMonth() < 6 ? 0.725 : 0.76) : null;
    const vehicleCost = mileageRate === null ? null : drive.distanceMeters / 1609.344 * mileageRate;
    const tolls = drive.tolls?.status === 'estimated' && drive.tolls.prices.every(price => price.currency === 'USD')
      ? drive.tolls.prices.reduce((sum, price) => sum + price.amount, 0) : drive.tolls?.status === 'not_reported' ? 0 : null;
    const cost = sumJourneyCost([
      { label: 'Vehicle cost (fuel included)', amountUsd: vehicleCost, source: vehicleCost === null ? 'unavailable' : 'estimated',
        note: 'Vehicle-cost proxy based on the IRS 2026 business mileage allowance; not a fuel quote.' },
      { label: 'Tolls', amountUsd: tolls, source: tolls === null ? 'unavailable' : 'live' },
      ...(!destinationHub ? [{ label: 'Destination parking', amountUsd: lot?.priceAmount ?? null,
        source: lot?.priceAmount !== undefined && lot.priceAmount !== null ? 'official' as const : 'unavailable' as const }] : []),
      ...(request.selectedStop && !request.skip ? [{ label: 'Stop purchases', amountUsd: 'purchaseCostEstimate' in request.selectedStop
        && request.selectedStop.purchaseCostEstimate?.currency === 'USD' ? request.selectedStop.purchaseCostEstimate.amount : null, source: 'estimated' as const }] : []),
    ]);
    const baseline = originalRoutes.find(route => route.travelMode === 'DRIVE');
    const detour = baseline ? Math.max(0, (drive.durationSeconds - baseline.durationSeconds) / 60) : null;
    const warnings = [
      ...(!request.hasCar ? ['Driving requires access to a vehicle.'] : []),
      ...(destinationHub ? ['Parking at the hub is not included; confirm charges if leaving a vehicle.'] : []),
      ...(request.arrivalTime ? ['An arrive-by schedule requires provider departure confirmation before this journey can be ranked.'] : []),
      ...(request.maxExtraMinutes !== undefined && request.selectedStop && !request.skip && (detour === null || detour > request.maxExtraMinutes)
        ? ['Constraint: The optional-stop detour exceeds or cannot verify your added-time limit.'] : []),
      ...(request.maxWalkingMinutes !== undefined && lot && (lot.walkingMinutes === undefined || lot.walkingMinutes === null || lot.walkingMinutes > request.maxWalkingMinutes)
        ? ['Constraint: Parking walking time exceeds or cannot verify your walking limit.'] : []),
      ...(request.maxExtraBudget !== undefined && request.selectedStop && !request.skip
        ? ['Constraint: Extra stop transportation and purchases cannot be fully verified against the added-spending limit.'] : []),
    ];
    journeys.push({ id: 'long-drive', mode: 'DRIVING', provider: 'Driving', durationMinutes: drive.durationSeconds / 60 + (lot?.walkingMinutes ?? 0),
      rideMinutes: drive.durationSeconds / 60, bufferMinutes: 0, route, cost, bookingUrl: 'https://www.google.com/maps/dir/?api=1',
      sourceUrl: 'https://www.irs.gov/tax-professionals/standard-mileage-rates', status: 'route_estimate', labels: [], warnings });
  }

  const cached = new Map<string, Promise<JourneyConnection>>();
  const connect = (from: Coordinates, to: Coordinates, fromName: string, toName: string, fareTime: { departureTime?: string; arrivalTime?: string }) => {
    const key = JSON.stringify([from, to, fareTime]);
    if (!cached.has(key)) cached.set(key, connection(request, from, to, fromName, toName, options, fareTime));
    return cached.get(key)!;
  };
  const makeJourney = async (id: string, mode: 'RAIL' | 'FLIGHT', provider: string, from: TravelHub, to: TravelHub,
    sourceUrl: string, bookingUrl: string, rideMinutes: number | null, status: LongDistanceJourney['status']) => {
    const bufferMinutes = mode === 'FLIGHT' ? 150 : 30;
    const firstMile = await connect(origin, from.coordinates, 'Your origin', from.name, { departureTime: request.departureTime });
    // A flight search has no scheduled arrival: never reuse origin departure as last-mile pickup.
    const lastPickup = request.departureTime && rideMinutes !== null && firstMile.durationMinutes !== null
      ? new Date(Date.parse(request.departureTime) + (firstMile.durationMinutes + bufferMinutes + rideMinutes) * 60000).toISOString() : undefined;
    const lastMile = destinationHub?.id === to.id
      ? { from: to.name, to: 'Your destination', mode: 'AT_HUB' as const, durationMinutes: 0, costUsd: 0, rideshares: [] }
      : await connect(to.coordinates, destination, to.name, 'Your destination', { departureTime: lastPickup, arrivalTime: request.arrivalTime });
    const durationMinutes = rideMinutes !== null && firstMile.durationMinutes !== null && lastMile.durationMinutes !== null
      ? firstMile.durationMinutes + bufferMinutes + rideMinutes + lastMile.durationMinutes : null;
    const pricingProvider: FareProvider = mode === 'FLIGHT' ? 'FLIGHT' : id === 'tri-rail' ? 'TRIRAIL' : id.toUpperCase() as FareProvider;
    const pricingDepartureTime = request.departureTime && firstMile.durationMinutes !== null
      ? new Date(Date.parse(request.departureTime) + (firstMile.durationMinutes + (mode === 'FLIGHT' ? 120 : 30)) * 60000).toISOString() : request.departureTime;
    const fare = await pricingService.getFare({ provider: pricingProvider, origin: from.coordinates, destination: to.coordinates,
      departureTime: pricingDepartureTime, arrivalTime: request.arrivalTime, durationMinutes: rideMinutes,
      providerMetadata: { sourceUrl, bookingUrl, originName: from.name, destinationName: to.name, originStationId: from.id, destinationStationId: to.id, departureAirport: mode === 'FLIGHT' ? from.id : undefined, arrivalAirport: mode === 'FLIGHT' ? to.id : undefined } });
    const rentals = await Promise.all(arrivalRentals(to).map(async rental => {
      const rentalFare = await pricingService.getFare({ provider: 'RENTAL_CAR', origin: to.coordinates, destination,
        departureTime: lastPickup ?? request.departureTime, arrivalTime: request.arrivalTime,
        providerMetadata: { sourceUrl: rental.sourceUrl, bookingUrl: rental.bookingUrl, rentalProvider: rental.id, originName: rental.pickup, pickupHubId: to.id === 'bl-orlando' ? 'MCO' : to.id, pickupDateIsApproximate: !lastPickup } });
      return { ...rental, fare: rentalFare };
    }));
    journeys.push({ id, mode, provider, ...(mode === 'RAIL' ? { logo: travelProviderLogo(id) } : {}), originHub: from, destinationHub: to,
      rentals, fare,
      firstMile, lastMile, rideMinutes: mode === 'FLIGHT' && fare.appliesToTrip && typeof fare.metadata?.durationMinutes === 'number' ? fare.metadata.durationMinutes : rideMinutes, bufferMinutes, durationMinutes, status, bookingUrl, sourceUrl, labels: [],
      cost: sumJourneyCost([
        { label: 'First-mile ride', fare: 'fare' in firstMile ? firstMile.fare : undefined, amountUsd: firstMile.costUsd, source: firstMile.costUsd === null ? 'unavailable' : 'estimated' },
        { label: mode === 'RAIL' ? 'Rail fare (one way)' : 'Airfare (one way)', fare, amountUsd: fareUpperBound(fare),
          source: fareUpperBound(fare) === null ? 'unavailable' : fare.sourceType === 'LIVE_API' ? 'live' : fare.sourceType === 'OFFICIAL' ? 'official' : 'estimated' },
        { label: 'Last-mile ride', fare: 'fare' in lastMile ? lastMile.fare : undefined, amountUsd: lastMile.costUsd, source: lastMile.costUsd === null ? 'unavailable' : 'estimated' },
      ]), warnings: [
        fare.sourceType === 'LIVE_API' && fare.appliesToTrip ? 'Offer pricing and flight details came from the shopping API; confirm availability and reprice before booking. Door-to-door timetable remains unverified.' : 'Fares and departures must be confirmed with the provider; no live ticket inventory is connected.',
        mode === 'FLIGHT' ? fare.sourceType === 'LIVE_API' && fare.appliesToTrip ? 'Airport arrival and exit buffers are modeled. Flight duration is supplied by the offer; the complete journey is not ranked without a verified timetable.' : 'Timing includes a modeled 2 hr airport arrival buffer and 30 min exit allowance. Flight time is unavailable.'
          : 'Timing includes a modeled 30 min station arrival buffer. Scheduled departures are not verified.',
        ...(rideMinutes !== null ? ['Rail ride time uses the published Miami–Orlando 3 hr 30 min benchmark; confirm your departure.'] : []),
        ...(request.selectedStop && !request.skip ? ['Your optional roadway stop applies to Driving only.'] : []),
        ...(firstMile.durationMinutes === null || lastMile.durationMinutes === null ? ['A connection is unavailable or exceeds your rideshare limits; the complete journey cannot be ranked.'] : []),
      ] });
  };
  if (request.allowTransit !== false) await Promise.all(discoverRail(origin, destination).map(({ provider, from, to }) =>
    makeJourney(provider.id, 'RAIL', provider.name, from, to, provider.url, provider.url,
      provider.id === 'brightline' && [from.id, to.id].includes('bl-miami') && [from.id, to.id].includes('bl-orlando') ? 210 : null, 'configured_service')));
  const fromAirports = findNearbyAirports(origin).slice(0, 2), toAirport = findNearbyAirports(destination)[0];
  if (toAirport) await Promise.all(fromAirports.filter(from => from.id !== toAirport.id && distanceMeters(from.coordinates, toAirport.coordinates) >= 150000)
    .map(from => makeJourney(`flight-${from.id}-${toAirport.id}`, 'FLIGHT', `${from.id} → ${toAirport.id}`, from, toAirport,
      from.sourceUrl, `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${from.id} to ${toAirport.id}`)}`,
      null, 'search_only')));

  const rentalConfig = destinationHub ? HUB_RENTALS[destinationHub.id] : undefined;
  journeys.sort((a, b) => ['DRIVING', 'RAIL', 'FLIGHT'].indexOf(a.mode) - ['DRIVING', 'RAIL', 'FLIGHT'].indexOf(b.mode)
    || (a.originHub ? distanceMeters(origin, a.originHub.coordinates) : 0) - (b.originHub ? distanceMeters(origin, b.originHub.coordinates) : 0));
  const rentals: LongDistancePlan['rentals'] = rentalConfig?.providers.slice(0, 3).map(id => ({ id, provider: RENTAL_PROVIDERS[id].name,
    logo: travelProviderLogo(id), pickup: destinationHub!.name, bookingUrl: RENTAL_PROVIDERS[id].url, sourceUrl: rentalConfig.sourceUrl, priceUsdPerDay: null })) ?? [];
  const rankings = rankLongDistanceJourneys(journeys, request);
  const longDistance: LongDistancePlan = { journeys, destinationHub, rentals, rankings, warnings: [
    'Flight searches without API offers are not verified flights. Modeled fare ranges are planning estimates, not bookable quotes.',
    'Rail discovery is limited to configured corridors; connections use current road estimates, not scheduled arrival-time quotes.',
    ...(destinationHub && !rentalConfig ? ['No verified rental-provider directory is configured for this hub.'] : []),
    ...(!rankings.best ? ['No complete journey can be ranked within the current budget and scheduling constraints; missing fares are not treated as free.'] : []),
  ] };
  return { id: `trip-${Date.now()}`, generatedAt: new Date().toISOString(), dataMode: 'live', origin: request.origin, destination: request.destination,
    selectedStop: request.skip ? null : request.selectedStop ?? null, routeOptions: journeys.flatMap(journey => journey.route ? [journey.route] : []),
    rankings: { best: null, fastest: null, cheapest: null }, rideshares: [], recommendationSource: 'rules', warnings: [],
    tripScope: 'LONG_DISTANCE', longDistance };
}
