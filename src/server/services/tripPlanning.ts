import type { FinalTripRequest, FinalTripSelectedStop, Location, RideshareOption, TransitAlternative, TripPlan, TripPlanRankings, TripPlanRouteOption, TripPlanStep } from '../types/index';
import { getCandidateRoutes, getCandidateRoutesViaStop, getDirectDriveRoute, getWalkRoute, type GoogleRouteCandidate } from './maps';
import { normalizeRouteCandidate, type CandidateRoute } from './routing';
import { rankRoutesWithGemini } from './gemini';
import { findDestinationParking } from './parking';
import { lookupTransitFare } from './transitFares';
import {
  ALL_RIDESHARE_PROVIDERS,
  buildRideshareOptions,
  isRideshareRankable,
  type RideshareRouteFacts,
} from './rideshareOptions';

export interface TripPlanningOptions {
  getParking?: typeof findDestinationParking;
  getRoutes?: (request: FinalTripRequest) => Promise<GoogleRouteCandidate[]>;
  getRoutesViaStop?: (request: FinalTripRequest, stop: Location) => Promise<GoogleRouteCandidate[]>;
  getRideshareRoute?: (request: FinalTripRequest) => Promise<GoogleRouteCandidate | null>;
  rankWithGemini?: (input: Parameters<typeof rankRoutesWithGemini>[0]) => Promise<TripPlanRankings | null>;
}

interface ConstraintEvaluation {
  budget: TripPlanRouteOption['constraints']['budget'];
  walking: TripPlanRouteOption['constraints']['walking'];
  extraTime: TripPlanRouteOption['constraints']['extraTime'];
  extraBudget: TripPlanRouteOption['constraints']['extraBudget'];
  extraStopMinutes: number | null;
  rejectionReasons: string[];
}

function getSelectedStopLocation(stop: FinalTripSelectedStop): Location | null {
  if ('location' in stop) return stop.location;
  if (stop.coordinates) return stop.coordinates;
  return { placeId: stop.placeId };
}

function getPurchaseEstimate(stop: FinalTripSelectedStop | undefined): { amount: number; currency: string; precision: 'estimated' | 'exact'; source: string } | undefined {
  if (!stop || !('purchaseCostEstimate' in stop)) return undefined;
  return stop.purchaseCostEstimate;
}

function routeDetourMinutes(
  original: GoogleRouteCandidate[],
  withStop: GoogleRouteCandidate,
): number | null {
  const baseline = original.find(route => route.travelMode === withStop.travelMode);
  if (!baseline) return null;
  return Math.max(0, (withStop.durationSeconds - baseline.durationSeconds) / 60);
}

function walkingMinutes(route: CandidateRoute): number | null {
  return route.walkingMinutes;
}

function evaluateConstraints(
  route: CandidateRoute,
  request: FinalTripRequest,
  extraStopMinutes: number | null,
  purchaseEstimate: ReturnType<typeof getPurchaseEstimate>,
  baselineRoutes: GoogleRouteCandidate[],
  rawRoute: GoogleRouteCandidate,
): ConstraintEvaluation {
  const rejectionReasons: string[] = [];
  let budget: TripPlanRouteOption['constraints']['budget'] = 'not_requested';
  let walking: TripPlanRouteOption['constraints']['walking'] = 'not_requested';
  let extraTime: TripPlanRouteOption['constraints']['extraTime'] = 'not_requested';
  let extraBudget: TripPlanRouteOption['constraints']['extraBudget'] = 'not_requested';

  if (request.budgetUsd !== undefined) {
    const cost = route.estimatedTransportationCost;
    if (!cost || cost.currency !== 'USD') {
      budget = 'unknown';
    } else if (cost.amount > request.budgetUsd) {
      budget = 'exceeded';
      rejectionReasons.push('BUDGET_LIMIT');
    } else {
      budget = 'met';
    }
  }

  if (request.maxWalkingMinutes !== undefined) {
    const minutes = walkingMinutes(route);
    if (minutes === null) {
      walking = 'unknown';
      rejectionReasons.push('WALKING_UNVERIFIABLE');
    } else if (minutes > request.maxWalkingMinutes) {
      walking = 'exceeded';
      rejectionReasons.push('WALKING_LIMIT');
    } else {
      walking = 'met';
    }
  }

  if (request.selectedStop && request.skip !== true && request.maxExtraMinutes !== undefined) {
    if (extraStopMinutes === null) {
      extraTime = 'unknown';
      rejectionReasons.push('EXTRA_TIME_UNVERIFIABLE');
    } else if (extraStopMinutes > request.maxExtraMinutes) {
      extraTime = 'exceeded';
      rejectionReasons.push('EXTRA_TIME_LIMIT');
    } else {
      extraTime = 'met';
    }
  }

  if (request.selectedStop && request.skip !== true && request.maxExtraBudget !== undefined) {
    const viaCost = rawRoute.estimatedCost;
    const baseline = baselineRoutes.find(item => item.travelMode === rawRoute.travelMode)?.estimatedCost;
    if (!purchaseEstimate || purchaseEstimate.currency !== 'USD'
      || (rawRoute.travelMode !== 'WALK' && (!viaCost || !baseline))
      || (viaCost && viaCost.currency !== 'USD')
      || (baseline && baseline.currency !== 'USD')) {
      extraBudget = 'unknown';
    } else {
      const extraTransportationCost = viaCost && baseline
        ? Math.max(0, viaCost.amount - baseline.amount)
        : 0;
      const totalExtraCost = purchaseEstimate.amount + extraTransportationCost;
      if (totalExtraCost > request.maxExtraBudget) {
        extraBudget = 'exceeded';
        rejectionReasons.push('EXTRA_BUDGET_LIMIT');
      } else {
        extraBudget = 'met';
      }
    }
  }

  return { budget, walking, extraTime, extraBudget, extraStopMinutes, rejectionReasons };
}

function toPlanStep(step: CandidateRoute['steps'][number]): TripPlanStep {
  const normalized: TripPlanStep = { mode: step.mode };
  if (step.instruction !== undefined) normalized.instruction = step.instruction;
  if (step.durationMinutes !== undefined) normalized.durationMinutes = step.durationMinutes;
  if (step.distanceMeters !== undefined) normalized.distanceMeters = step.distanceMeters;
  if (step.encodedPolyline !== undefined) normalized.encodedPolyline = step.encodedPolyline;
  if (step.transit !== undefined) normalized.transit = step.transit;
  return normalized;
}

/** Short human label for a transit alternative from its actual vehicle types. */
function transitAltTitle(steps: CandidateRoute['steps']): string {
  const modes: string[] = [];
  for (const step of steps) {
    if (step.mode !== 'TRANSIT' || !step.transit) continue;
    const vehicle = step.transit.vehicleType ?? step.transit.line ?? 'TRANSIT';
    const label = /rail|metro|subway|train/i.test(vehicle) ? 'Rail'
      : /bus/i.test(vehicle) ? 'Bus'
      : /tram|light/i.test(vehicle) ? 'Tram'
      : step.transit.lineShortName ?? step.transit.line ?? 'Transit';
    if (!modes.includes(label)) modes.push(label);
  }
  return modes.length > 0 ? modes.join(' + ') : 'Transit';
}

/** Transfers = number of transit vehicle segments minus one (initial boarding is not a transfer). */
function countTransfers(steps: CandidateRoute['steps']): number {
  const transitLegs = steps.filter(step => step.mode === 'TRANSIT' && step.transit).length;
  return Math.max(0, transitLegs - 1);
}

/** Per-alternative availability: walking limit evaluated against that option's own walking. */
function transitAltAvailability(
  walkingMinutes: number | null,
  request: FinalTripRequest,
): TransitAlternative['availability'] | undefined {
  if (request.maxWalkingMinutes !== undefined && walkingMinutes !== null && walkingMinutes > request.maxWalkingMinutes) {
    return {
      available: false,
      reasonCode: 'WALKING_LIMIT_EXCEEDED',
      message: `This option needs about ${Math.round(walkingMinutes)} minutes of walking, over your ${request.maxWalkingMinutes}-minute limit.`,
    };
  }
  return undefined;
}

function toTransitAlternative(
  route: CandidateRoute,
  evaluation: ConstraintEvaluation,
  request: FinalTripRequest,
): TransitAlternative {
  const alt: TransitAlternative = {
    id: route.id,
    title: transitAltTitle(route.steps),
    durationMinutes: route.durationMinutes,
    distanceMeters: route.distanceMeters,
    walkingMinutes: route.walkingMinutes,
    estimatedTransportationCost: route.estimatedTransportationCost as TransitAlternative['estimatedTransportationCost'],
    ...(route.encodedPolyline ? { encodedPolyline: route.encodedPolyline } : {}),
    steps: route.steps.map(toPlanStep),
    transfers: countTransfers(route.steps),
    warnings: [...route.warnings],
  };
  const availability = evaluation.rejectionReasons.length > 0
    ? routeAvailability(route, evaluation, request)
    : transitAltAvailability(route.walkingMinutes, request);
  if (availability) alt.availability = availability;
  return alt;
}

/** Builds a user-facing reason a route is excluded from ranking, or null when eligible. */
function routeAvailability(
  route: CandidateRoute,
  evaluation: ConstraintEvaluation,
  request: FinalTripRequest,
): TripPlanRouteOption['availability'] | undefined {
  const mode = route.mode === 'WALK' ? 'Walking'
    : route.mode === 'TRANSIT' ? 'Public transit'
    : route.mode === 'DRIVE' ? 'Driving' : 'Cycling';
  const reasons = evaluation.rejectionReasons;
  if (reasons.includes('WALKING_LIMIT')) {
    return {
      available: false,
      reasonCode: 'WALKING_LIMIT_EXCEEDED',
      message: route.walkingMinutes !== null && request.maxWalkingMinutes !== undefined
        ? `This trip requires about ${Math.round(route.walkingMinutes)} minutes of walking, which exceeds your ${request.maxWalkingMinutes}-minute limit.`
        : 'This route exceeds your walking limit.',
    };
  }
  if (reasons.includes('BUDGET_LIMIT')) {
    return {
      available: false,
      reasonCode: 'BUDGET_EXCEEDED',
      message: route.estimatedTransportationCost && request.budgetUsd !== undefined
        ? `The estimated fare is $${route.estimatedTransportationCost.amount.toFixed(2)}, above your $${request.budgetUsd} trip budget.`
        : 'This option is above your trip budget.',
    };
  }
  if (reasons.includes('EXTRA_TIME_LIMIT')) {
    return { available: false, reasonCode: 'EXTRA_TIME_EXCEEDED', message: 'Adding your stop takes longer than your extra-time limit allows.' };
  }
  if (reasons.includes('EXTRA_BUDGET_LIMIT')) {
    return { available: false, reasonCode: 'EXTRA_BUDGET_EXCEEDED', message: 'This stop would exceed your extra-spending limit.' };
  }
  if (reasons.includes('WALKING_UNVERIFIABLE')) {
    return { available: false, reasonCode: 'WALKING_UNVERIFIABLE', message: `${mode} walking time could not be verified against your limit.` };
  }
  if (reasons.includes('EXTRA_TIME_UNVERIFIABLE') || reasons.includes('EXTRA_BUDGET_UNVERIFIABLE')) {
    return { available: false, reasonCode: 'NO_ROUTE', message: 'This route could not be verified against your stop limits.' };
  }
  return undefined;
}

function toPlanOption(
  route: CandidateRoute,
  evaluation: ConstraintEvaluation,
  request: FinalTripRequest,
  rawRoute: GoogleRouteCandidate,
): TripPlanRouteOption {
  const availability = evaluation.rejectionReasons.length > 0
    ? routeAvailability(route, evaluation, request)
    : undefined;
  return {
    id: route.id,
    ...(route.encodedPolyline ? { encodedPolyline: route.encodedPolyline } : {}),
    ...(route.tolls ? { tolls: route.tolls } : {}),
    mode: route.mode,
    durationMinutes: route.durationMinutes,
    distanceMeters: route.distanceMeters,
    walkingMinutes: route.walkingMinutes,
    estimatedTransportationCost: route.estimatedTransportationCost,
    ...(rawRoute.originCoordinates ? { originCoordinates: rawRoute.originCoordinates } : {}),
    steps: route.steps.map(toPlanStep),
    origin: route.origin,
    destination: route.destination,
    extraStopMinutes: evaluation.extraStopMinutes,
    ...(availability ? { availability } : {}),
    constraints: {
      budget: evaluation.budget,
      walking: evaluation.walking,
      extraTime: evaluation.extraTime,
      extraBudget: evaluation.extraBudget,
      eligible: true,
    },
    warnings: [...route.warnings],
  };
}

function rankDeterministically(
  candidates: TripPlanRouteOption[],
  request: FinalTripRequest,
  rideshares: RideshareOption[] = [],
): TripPlanRankings {
  // FASTEST compares factual route durations with rideshare pickup+ride totals.
  const timedEntries = [
    ...candidates.map(route => ({ id: route.id, minutes: route.durationMinutes })),
    ...rideshares.flatMap(option => typeof option.estimatedTotalMinutes === 'number'
      && Number.isFinite(option.estimatedTotalMinutes)
      ? [{ id: option.id, minutes: option.estimatedTotalMinutes }]
      : []),
  ];
  const fastest = timedEntries.sort((first, second) => first.minutes - second.minutes)[0] ?? null;
  // CHEAPEST stays route-only: rideshare prices are estimates, not comparable factual costs.
  const knownCosts = candidates.filter(route => route.estimatedTransportationCost !== null);
  const currencies = new Set(knownCosts.map(route => route.estimatedTransportationCost?.currency));
  const cheapest = knownCosts.length === candidates.length && currencies.size === 1
    ? [...knownCosts].sort((first, second) => first.estimatedTransportationCost!.amount - second.estimatedTransportationCost!.amount)[0]
    : null;

  let bestId = fastest?.id ?? null;
  if (request.preference === 'cheapest' && cheapest) bestId = cheapest.id;
  else if (request.preference === 'least_walking') {
    bestId = [...candidates]
      .filter(route => route.walkingMinutes !== null)
      .sort((first, second) => first.walkingMinutes! - second.walkingMinutes! || first.durationMinutes - second.durationMinutes)[0]?.id ?? bestId;
  } else if (request.preference === 'balanced' && candidates.length > 0) {
    bestId = [...candidates].sort((first, second) => {
      const score = (route: TripPlanRouteOption) => route.durationMinutes
        + (route.walkingMinutes ?? 0) * 1.5
        + (currencies.size === 1 ? route.estimatedTransportationCost?.amount ?? 0 : 0) * 3
        + (route.extraStopMinutes ?? 0) * 0.5;
      return score(first) - score(second);
    })[0]?.id ?? bestId;
  }

  return { best: bestId, fastest: fastest?.id ?? null, cheapest: cheapest?.id ?? null };
}

function combineWarnings(routes: TripPlanRouteOption[], request: FinalTripRequest): string[] {
  const warnings = new Set(routes.flatMap(route => route.warnings));
  if (request.budgetUsd !== undefined && routes.some(route => route.constraints.budget === 'unknown')) {
    warnings.add('Transportation cost is unavailable for some routes, so their budget status is unknown.');
  }
  if (request.maxExtraBudget !== undefined && request.selectedStop && routes.some(route => route.constraints.extraBudget === 'unknown')) {
    warnings.add('The selected stop or detour cost is unavailable, so extra-budget status is unknown for some routes.');
  }
  return [...warnings];
}

/**
 * Resolves the factual drive-route facts shared by every rideshare estimate. Rideshares always use
 * the direct origin → destination trip (never the optional-stop detour), so baseline routes are
 * preferred. When the user has no car, a dedicated DRIVE route is fetched; failures degrade
 * gracefully to coordinate-only facts so the Waymo service-area check can still run.
 */
async function resolveRideshareFacts(
  request: FinalTripRequest,
  baselineRoutes: GoogleRouteCandidate[],
  options: TripPlanningOptions,
): Promise<RideshareRouteFacts> {
  const fallbackOrigin = 'latitude' in request.origin ? request.origin : null;
  const fallbackDestination = 'latitude' in request.destination ? request.destination : null;
  let drive = baselineRoutes.find(route => route.travelMode === 'DRIVE') ?? null;
  if (!drive) {
    try {
      drive = await (options.getRideshareRoute ?? (trip => getDirectDriveRoute(trip)))(request);
    } catch {
      drive = null;
    }
  }
  return {
    originCoordinates: drive?.originCoordinates ?? fallbackOrigin,
    destinationCoordinates: drive?.destinationCoordinates ?? fallbackDestination,
    rideMinutes: drive ? drive.durationSeconds / 60 : null,
    distanceMeters: drive ? drive.distanceMeters : null,
  };
}

export async function createTripPlan(
  request: FinalTripRequest,
  options: TripPlanningOptions = {},
): Promise<TripPlan> {
  const getRoutes = options.getRoutes ?? (trip => getCandidateRoutes(trip));
  const baselineRoutes = await getRoutes(request);
  const selectedStop = request.skip === true ? undefined : request.selectedStop;
  const stopLocation = selectedStop ? getSelectedStopLocation(selectedStop) : null;
  const rawRoutes = selectedStop && stopLocation
    ? await (options.getRoutesViaStop ?? ((trip, stop) => getCandidateRoutesViaStop(trip, stop)))(request, stopLocation)
    : baselineRoutes;

  const purchaseEstimate = getPurchaseEstimate(selectedStop);
  const candidates: TripPlanRouteOption[] = [];
  const displayOnlyRoutes: TripPlanRouteOption[] = [];
  const rejectedConstraintNames: string[] = [];

  // Build normalized options per raw route, tracking constraint status.
  interface BuiltRoute { option: TripPlanRouteOption; rejected: boolean; evaluation: ConstraintEvaluation; route: CandidateRoute; raw: GoogleRouteCandidate }
  const built: BuiltRoute[] = [];
  for (const rawRoute of rawRoutes) {
    const route = normalizeRouteCandidate(rawRoute, request);
    const extraStopMinutes = selectedStop && stopLocation
      ? routeDetourMinutes(baselineRoutes, rawRoute)
      : null;
    const evaluation = evaluateConstraints(route, request, extraStopMinutes, purchaseEstimate, baselineRoutes, rawRoute);
    built.push({ option: toPlanOption(route, evaluation, request, rawRoute), rejected: evaluation.rejectionReasons.length > 0, evaluation, route, raw: rawRoute });
    if (evaluation.rejectionReasons.length > 0) rejectedConstraintNames.push(...evaluation.rejectionReasons);
  }

  // Group all TRANSIT routes into one tile with per-option alternatives; other modes stay separate.
  const transitBuilt = built.filter(entry => entry.option.mode === 'TRANSIT');
  const nonTransitBuilt = built.filter(entry => entry.option.mode !== 'TRANSIT');

  // Non-transit modes: keep the existing keep-displayable behavior.
  for (const entry of nonTransitBuilt) {
    if (entry.rejected) {
      const displayable = entry.evaluation.rejectionReasons.every(reason =>
        ['WALKING_LIMIT', 'BUDGET_LIMIT', 'EXTRA_TIME_LIMIT', 'EXTRA_BUDGET_LIMIT'].includes(reason));
      if (displayable) displayOnlyRoutes.push(entry.option);
    } else {
      candidates.push(entry.option);
    }
  }

  // Transit alternatives with per-option availability and fare fallback.
  let transitAlternatives: TransitAlternative[] = [];
  if (transitBuilt.length > 0) {
    transitAlternatives = transitBuilt.map(entry => {
      const alt = toTransitAlternative(entry.route, entry.evaluation, request);
      if (!alt.estimatedTransportationCost) {
        const lines = entry.route.steps.flatMap(step => step.transit?.line ? [step.transit.line, step.transit.lineShortName ?? null] : []);
        const fallback = lookupTransitFare({ lines, origin: entry.option.originCoordinates ?? null, destination: null });
        if (fallback.fareAvailable && fallback.amount !== undefined) {
          alt.estimatedTransportationCost = {
            amount: fallback.amount, currency: fallback.currency, source: 'agency_official', sourceName: fallback.sourceName,
          };
          alt.warnings.push(`Fare is the published ${fallback.sourceName ?? 'agency'} base fare and may vary with transfers or passes.`);
        }
      }
      return alt;
    });
    // Recommended alternative: available, then fastest, then least walking, then cheapest known fare.
    const available = transitAlternatives.filter(alt => !alt.availability || alt.availability.available !== false);
    const pool = available.length > 0 ? available : transitAlternatives;
    const recommended = [...pool].sort((a, b) =>
      (a.durationMinutes - b.durationMinutes)
      || ((a.walkingMinutes ?? 999) - (b.walkingMinutes ?? 999))
      || ((a.estimatedTransportationCost?.amount ?? 9999) - (b.estimatedTransportationCost?.amount ?? 9999)))[0];
    for (const alt of transitAlternatives) alt.recommended = alt.id === recommended.id;

    // Representative card = recommended option; carries all alternatives for the tab UI.
    const repEntry = transitBuilt.find(entry => entry.route.id === recommended.id) ?? transitBuilt[0];
    const anyAvailable = available.length > 0;
    const representative: TripPlanRouteOption = {
      ...repEntry.option,
      ...(recommended.encodedPolyline ? { encodedPolyline: recommended.encodedPolyline } : {}),
      durationMinutes: recommended.durationMinutes,
      distanceMeters: recommended.distanceMeters,
      walkingMinutes: recommended.walkingMinutes,
      estimatedTransportationCost: recommended.estimatedTransportationCost,
      steps: recommended.steps,
      transitAlternatives,
      availability: anyAvailable ? undefined : (repEntry.option.availability ?? {
        available: false, reasonCode: 'NO_ROUTE', message: 'No public-transit route meets your current limits.',
      }),
    };
    // The representative participates in ranking when at least one alternative is usable.
    if (anyAvailable && !repEntry.rejected) candidates.push(representative);
    else displayOnlyRoutes.push(representative);
  }

  const rankedRouteOptions = candidates;
  const allDisplayRoutes = [...candidates, ...displayOnlyRoutes];
  const drivingCandidates = allDisplayRoutes.filter(route => route.mode === 'DRIVE');
  const destinationCoordinates = rawRoutes.find(route => route.travelMode === 'DRIVE')?.destinationCoordinates
    ?? ('latitude' in request.destination ? request.destination : undefined);
  const parkingPromise = drivingCandidates.length > 0 && destinationCoordinates
    ? (options.getParking ?? findDestinationParking)(destinationCoordinates)
      .catch(() => ({ status: 'unavailable' as const, locations: [] }))
    : Promise.resolve({ status: 'unavailable' as const, locations: [] });

  // Per-lot walking legs: one bounded batch of WALK routes from each lot to the destination.
  const parkingWalkPromise = (async () => {
    const parking = await parkingPromise;
    if (!destinationCoordinates || parking.locations.length === 0) return parking;
    const enriched = await Promise.all(parking.locations.map(async lot => {
      try {
        const leg = await getWalkRoute(
          { origin: lot.coordinates, destination: destinationCoordinates },
        );
        if (leg) {
          lot.walkingMinutes = leg.durationSeconds / 60;
          lot.walkingDistanceMeters = leg.distanceMeters;
        }
      } catch { /* leave walking fields unset on failure */ }
      return lot;
    }));
    // Recommended lot: cheapest known price, then shortest walk, then closest.
    const withPrices = enriched.filter(lot => lot.priceAmount !== null && lot.priceAmount !== undefined);
    let recommended: string | undefined;
    if (withPrices.length > 0) {
      recommended = [...withPrices].sort((a, b) =>
        (a.priceAmount! - b.priceAmount!)
        || ((a.walkingMinutes ?? 999) - (b.walkingMinutes ?? 999))
        || (a.distanceMeters - b.distanceMeters))[0].placeId;
    } else if (enriched.length > 0) {
      recommended = [...enriched].sort((a, b) =>
        ((a.walkingMinutes ?? 999) - (b.walkingMinutes ?? 999)) || (a.distanceMeters - b.distanceMeters))[0].placeId;
    }
    for (const lot of enriched) lot.recommended = lot.placeId === recommended;
    return { ...parking, locations: enriched };
  })().catch(() => ({ status: 'unavailable' as const, locations: [] }));

  const requestedRideshareProviders = request.rideshareProviders ?? ALL_RIDESHARE_PROVIDERS;
  let rideshares: RideshareOption[] | undefined;
  if (requestedRideshareProviders.length > 0) {
    const facts = await resolveRideshareFacts(request, baselineRoutes, options);
    rideshares = buildRideshareOptions(request, facts);
  }
  const rankableRideshares = (rideshares ?? []).filter(option =>
    isRideshareRankable(option, request.maxRideshareBudget));

  // Ranking stays anchored to eligible routes: when every route is rejected by hard constraints,
  // rankings stay null (existing contract) and rideshares remain a display-only parallel section.
  const fallback = rankDeterministically(rankedRouteOptions, request, rankedRouteOptions.length > 0 ? rankableRideshares : []);
  let rankings = fallback;
  let recommendationSource: TripPlan['recommendationSource'] = 'rules';
  if (rankedRouteOptions.length > 0) {
    const geminiRankings = await (options.rankWithGemini ?? rankRoutesWithGemini)({
      request,
      candidates: rankedRouteOptions,
      rideshares: rankableRideshares,
      maxExtraMinutes: request.maxExtraMinutes,
      maxExtraBudget: request.maxExtraBudget,
    });
    if (geminiRankings) {
      rankings = {
        best: geminiRankings.best ?? fallback.best,
        fastest: geminiRankings.fastest ?? fallback.fastest,
        cheapest: geminiRankings.cheapest ?? fallback.cheapest,
      };
      recommendationSource = 'gemini';
    }
  }

  const parking = await parkingWalkPromise;
  for (const route of drivingCandidates) route.parking = parking;
  // Driving total time includes the final walk from the recommended parking lot when known.
  for (const route of drivingCandidates) {
    const recommendedLot = route.parking?.locations.find(lot => lot.recommended)
      ?? route.parking?.locations[0];
    if (recommendedLot?.walkingMinutes !== null && recommendedLot?.walkingMinutes !== undefined) {
      route.durationMinutes += recommendedLot.walkingMinutes;
      if (route.walkingMinutes !== null) route.walkingMinutes += recommendedLot.walkingMinutes;
      route.warnings.push('Total time includes the walk from the recommended parking to your destination.');
    }
  }

  const warnings = combineWarnings(rankedRouteOptions, request);
  const budgetExcludedRideshares = (rideshares ?? []).filter(option => option.available
    && typeof option.estimatedTotalMinutes === 'number'
    && !rankableRideshares.includes(option));
  if (budgetExcludedRideshares.length > 0) {
    warnings.push('Some rideshare options were not ranked because their estimated fares exceed your rideshare budget.');
  }
  if (rankedRouteOptions.length > 0 && recommendationSource === 'rules') {
    warnings.push('Gemini ranking is unavailable for this request. Route options are ranked using travel facts.');
  }
  if (rejectedConstraintNames.includes('WALKING_UNVERIFIABLE')) {
    warnings.push('Routes without verifiable walking duration were omitted because a walking limit was set.');
  }
  if (rejectedConstraintNames.includes('EXTRA_BUDGET_UNVERIFIABLE')) {
    warnings.push('Routes without verifiable extra transportation and stop cost were omitted because an extra budget limit was set.');
  }
  if (rejectedConstraintNames.includes('EXTRA_TIME_UNVERIFIABLE')) {
    warnings.push('Routes without a comparable baseline detour time were omitted because an extra-time limit was set.');
  }
  if (rejectedConstraintNames.length > 0) {
    warnings.push(`Routes excluded by constraints: ${[...new Set(rejectedConstraintNames)].join(', ')}.`);
  }
  if (candidates.length === 0 && rejectedConstraintNames.length > 0) {
    warnings.push('No routes satisfy all verifiable hard trip constraints.');
  }
  if (rankedRouteOptions.length > 0 && rankings.cheapest === null) {
    warnings.push('Cheapest route is unavailable because no comparable factual transportation cost was returned.');
  }

  return {
    id: `trip-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    dataMode: 'live',
    origin: request.origin,
    destination: request.destination,
    selectedStop: selectedStop ?? null,
    routeOptions: allDisplayRoutes,
    rankings,
    ...(rideshares !== undefined ? { rideshares } : {}),
    recommendationSource,
    warnings,
  };
}
