import type { FinalTripRequest, FinalTripSelectedStop, Location, TripPlan, TripPlanRankings, TripPlanRouteOption, TripPlanStep } from '../types/index';
import { getCandidateRoutes, getCandidateRoutesViaStop, type GoogleRouteCandidate } from './maps';
import { normalizeRouteCandidate, type CandidateRoute } from './routing';
import { rankRoutesWithGemini } from './gemini';
import { findDestinationParking } from './parking';

export interface TripPlanningOptions {
  getParking?: typeof findDestinationParking;
  getRoutes?: (request: FinalTripRequest) => Promise<GoogleRouteCandidate[]>;
  getRoutesViaStop?: (request: FinalTripRequest, stop: Location) => Promise<GoogleRouteCandidate[]>;
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
  if (step.transit !== undefined) normalized.transit = step.transit;
  return normalized;
}

function toPlanOption(route: CandidateRoute, evaluation: ConstraintEvaluation): TripPlanRouteOption {
  return {
    id: route.id,
    ...(route.encodedPolyline ? { encodedPolyline: route.encodedPolyline } : {}),
    ...(route.tolls ? { tolls: route.tolls } : {}),
    mode: route.mode,
    durationMinutes: route.durationMinutes,
    distanceMeters: route.distanceMeters,
    walkingMinutes: route.walkingMinutes,
    estimatedTransportationCost: route.estimatedTransportationCost,
    steps: route.steps.map(toPlanStep),
    origin: route.origin,
    destination: route.destination,
    extraStopMinutes: evaluation.extraStopMinutes,
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
): TripPlanRankings {
  const fastest = [...candidates].sort((first, second) => first.durationMinutes - second.durationMinutes)[0] ?? null;
  const knownCosts = candidates.filter(route => route.estimatedTransportationCost !== null);
  const currencies = new Set(knownCosts.map(route => route.estimatedTransportationCost?.currency));
  const cheapest = knownCosts.length === candidates.length && currencies.size === 1
    ? [...knownCosts].sort((first, second) => first.estimatedTransportationCost!.amount - second.estimatedTransportationCost!.amount)[0]
    : null;

  let best = fastest;
  if (request.preference === 'cheapest' && cheapest) best = cheapest;
  else if (request.preference === 'least_walking') {
    best = [...candidates]
      .filter(route => route.walkingMinutes !== null)
      .sort((first, second) => first.walkingMinutes! - second.walkingMinutes! || first.durationMinutes - second.durationMinutes)[0] ?? fastest;
  } else if (request.preference === 'balanced') {
    best = [...candidates].sort((first, second) => {
      const score = (route: TripPlanRouteOption) => route.durationMinutes
        + (route.walkingMinutes ?? 0) * 1.5
        + (currencies.size === 1 ? route.estimatedTransportationCost?.amount ?? 0 : 0) * 3
        + (route.extraStopMinutes ?? 0) * 0.5;
      return score(first) - score(second);
    })[0] ?? null;
  }

  return { best: best?.id ?? null, fastest: fastest?.id ?? null, cheapest: cheapest?.id ?? null };
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
  const rejectedConstraintNames: string[] = [];
  for (const rawRoute of rawRoutes) {
    const route = normalizeRouteCandidate(rawRoute, request);
    const extraStopMinutes = selectedStop && stopLocation
      ? routeDetourMinutes(baselineRoutes, rawRoute)
      : null;
    const evaluation = evaluateConstraints(route, request, extraStopMinutes, purchaseEstimate, baselineRoutes, rawRoute);
    if (evaluation.rejectionReasons.length > 0) {
      rejectedConstraintNames.push(...evaluation.rejectionReasons);
      continue;
    }
    candidates.push(toPlanOption(route, evaluation));
  }

  const drivingCandidates = candidates.filter(route => route.mode === 'DRIVE');
  const destinationCoordinates = rawRoutes.find(route => route.travelMode === 'DRIVE')?.destinationCoordinates
    ?? ('latitude' in request.destination ? request.destination : undefined);
  const parkingPromise = drivingCandidates.length > 0 && destinationCoordinates
    ? (options.getParking ?? findDestinationParking)(destinationCoordinates)
      .catch(() => ({ status: 'unavailable' as const, locations: [] }))
    : Promise.resolve({ status: 'unavailable' as const, locations: [] });

  const fallback = rankDeterministically(candidates, request);
  let rankings = fallback;
  let recommendationSource: TripPlan['recommendationSource'] = 'rules';
  if (candidates.length > 0) {
    const geminiRankings = await (options.rankWithGemini ?? rankRoutesWithGemini)({
      request,
      candidates,
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

  const parking = await parkingPromise;
  for (const route of drivingCandidates) route.parking = parking;
  const warnings = combineWarnings(candidates, request);
  if (candidates.length > 0 && recommendationSource === 'rules') {
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
  if (candidates.length > 0 && rankings.cheapest === null) {
    warnings.push('Cheapest route is unavailable because no comparable factual transportation cost was returned.');
  }

  return {
    id: `trip-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    dataMode: 'live',
    origin: request.origin,
    destination: request.destination,
    selectedStop: selectedStop ?? null,
    routeOptions: candidates,
    rankings,
    recommendationSource,
    warnings,
  };
}
