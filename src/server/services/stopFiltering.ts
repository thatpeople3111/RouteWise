import type {
  GoogleRouteCandidate,
  GoogleTravelMode,
} from './maps';
import { getCandidateRoutes, getCandidateRoutesViaStop } from './maps';
import type {
  PlaceCandidate,
  PurchaseCostEstimate,
  TripRequest,
} from '../types/index';

export interface FilterableStopCandidate extends PlaceCandidate {
  purchaseCostEstimate?: PurchaseCostEstimate;
}

export interface StopRestrictions {
  maxExtraMinutes?: number;
  maxExtraBudget?: number;
  maxWalkingMinutes?: number;
}

export interface StopFilterOptions {
  getOriginalRoutes?: (request: TripRequest) => Promise<GoogleRouteCandidate[]>;
  getRoutesViaStop?: (request: TripRequest, candidate: PlaceCandidate) => Promise<GoogleRouteCandidate[]>;
}

export type StopBudgetStatus = 'not_requested' | 'within_limit' | 'exceeds_limit' | 'unknown';
export type StopRejectionReason = 'EXTRA_TIME_LIMIT' | 'EXTRA_TIME_UNAVAILABLE' | 'EXTRA_BUDGET_LIMIT'
  | 'WALKING_LIMIT' | 'WALKING_UNAVAILABLE';

export interface EvaluatedStopCandidate extends FilterableStopCandidate {
  extraStopMinutes: number | null;
  comparisonMode: GoogleTravelMode | null;
  routeWalkingMinutes: number | null;
  budgetStatus: StopBudgetStatus;
}

export interface RejectedStopCandidate extends EvaluatedStopCandidate {
  rejectionReasons: StopRejectionReason[];
}

export interface StopFilterResult {
  accepted: EvaluatedStopCandidate[];
  rejected: RejectedStopCandidate[];
}

function validateRestriction(name: string, value: number | undefined): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

interface RouteComparison {
  minutes: number;
  mode: GoogleTravelMode;
  walkingMinutes: number | null;
}

function getWalkingMinutes(route: GoogleRouteCandidate): number | null {
  if (route.travelMode === 'WALK') return route.durationSeconds / 60;
  const walkingSteps = route.steps.filter(step => step.travelMode === 'WALK');
  if (walkingSteps.length === 0) return route.steps.length > 0 ? 0 : null;
  if (walkingSteps.some(step => step.durationSeconds === undefined)) return null;
  return walkingSteps.reduce((total, step) => total + (step.durationSeconds ?? 0), 0) / 60;
}

function estimateExtraMinutes(
  originalRoutes: GoogleRouteCandidate[],
  viaStopRoutes: GoogleRouteCandidate[],
): RouteComparison[] {
  const originalByMode = new Map(originalRoutes.map(route => [route.travelMode, route]));
  return viaStopRoutes.flatMap(viaRoute => {
    const originalRoute = originalByMode.get(viaRoute.travelMode);
    return originalRoute
      ? [{
        minutes: (viaRoute.durationSeconds - originalRoute.durationSeconds) / 60,
        mode: viaRoute.travelMode,
        walkingMinutes: getWalkingMinutes(viaRoute),
      }]
      : [];
  }).sort((first, second) => first.minutes - second.minutes);
}

function getBudgetStatus(
  estimate: PurchaseCostEstimate | undefined,
  maxExtraBudget: number | undefined,
): StopBudgetStatus {
  if (maxExtraBudget === undefined) return 'not_requested';
  if (!estimate
    || !Number.isFinite(estimate.amount)
    || estimate.amount < 0
    || estimate.currency.toUpperCase() !== 'USD'
    || !['estimated', 'exact'].includes(estimate.precision)
    || estimate.source.trim().length === 0) {
    return 'unknown';
  }
  return estimate.amount <= maxExtraBudget ? 'within_limit' : 'exceeds_limit';
}

export async function filterStopCandidates(
  request: TripRequest,
  candidates: FilterableStopCandidate[],
  restrictions: StopRestrictions = {},
  options: StopFilterOptions = {},
): Promise<StopFilterResult> {
  validateRestriction('maxExtraMinutes', restrictions.maxExtraMinutes);
  validateRestriction('maxExtraBudget', restrictions.maxExtraBudget);
  validateRestriction('maxWalkingMinutes', restrictions.maxWalkingMinutes);
  if (candidates.length === 0) return { accepted: [], rejected: [] };

  const routeableCandidates = candidates.filter(candidate => candidate.coordinates !== null);
  const originalRoutes = routeableCandidates.length > 0
    ? await (options.getOriginalRoutes ?? getCandidateRoutes)(request)
    : [];
  const accepted: EvaluatedStopCandidate[] = [];
  const rejected: RejectedStopCandidate[] = [];
  const calculateViaStop = options.getRoutesViaStop ?? ((trip: TripRequest, candidate: PlaceCandidate) => {
    if (!candidate.coordinates) return Promise.resolve([]);
    return getCandidateRoutesViaStop(trip, candidate.coordinates);
  });

  for (let start = 0; start < candidates.length; start += 3) {
    const batch = candidates.slice(start, start + 3);
    const evaluatedBatch = await Promise.all(batch.map(async candidate => {
      let comparisons: RouteComparison[] = [];
      if (candidate.coordinates) {
        const baselineTransit = originalRoutes.find(route => route.travelMode === 'TRANSIT');
        const viaStopRequest = request.arrivalTime && !request.departureTime && baselineTransit
          ? {
            ...request,
            arrivalTime: undefined,
            departureTime: new Date(Date.parse(request.arrivalTime) - baselineTransit.durationSeconds * 1000).toISOString(),
          }
          : request;
        const viaStopRoutes = await calculateViaStop(viaStopRequest, candidate);
        comparisons = estimateExtraMinutes(originalRoutes, viaStopRoutes);
      }

      const walkingFeasible = restrictions.maxWalkingMinutes === undefined
        ? comparisons
        : comparisons.filter(comparison => comparison.walkingMinutes !== null
          && comparison.walkingMinutes <= restrictions.maxWalkingMinutes!);
      const timeFeasible = restrictions.maxExtraMinutes === undefined
        ? comparisons
        : comparisons.filter(comparison => comparison.minutes <= restrictions.maxExtraMinutes!);
      const feasibleComparisons = restrictions.maxWalkingMinutes !== undefined && restrictions.maxExtraMinutes !== undefined
        ? walkingFeasible.filter(comparison => timeFeasible.includes(comparison))
        : restrictions.maxWalkingMinutes !== undefined
          ? walkingFeasible
          : timeFeasible;
      const comparison = feasibleComparisons[0] ?? comparisons[0] ?? null;
      const budgetStatus = getBudgetStatus(candidate.purchaseCostEstimate, restrictions.maxExtraBudget);
      const evaluated: EvaluatedStopCandidate = {
        ...candidate,
        extraStopMinutes: comparison ? Math.max(0, comparison.minutes) : null,
        comparisonMode: comparison?.mode ?? null,
        routeWalkingMinutes: comparison?.walkingMinutes ?? null,
        budgetStatus,
      };
      const rejectionReasons: StopRejectionReason[] = [];
      if (restrictions.maxExtraMinutes !== undefined) {
        if (comparisons.length === 0) rejectionReasons.push('EXTRA_TIME_UNAVAILABLE');
        else if (timeFeasible.length === 0) rejectionReasons.push('EXTRA_TIME_LIMIT');
      }
      if (restrictions.maxWalkingMinutes !== undefined) {
        if (comparisons.length === 0 || comparisons.every(item => item.walkingMinutes === null)) {
          rejectionReasons.push('WALKING_UNAVAILABLE');
        } else if (walkingFeasible.length === 0) {
          rejectionReasons.push('WALKING_LIMIT');
        }
      }
      if (budgetStatus === 'exceeds_limit') rejectionReasons.push('EXTRA_BUDGET_LIMIT');

      return { evaluated, rejectionReasons };
    }));

    for (const { evaluated, rejectionReasons } of evaluatedBatch) {
      if (rejectionReasons.length > 0) {
        rejected.push({ ...evaluated, rejectionReasons });
      } else {
        accepted.push(evaluated);
      }
    }
  }

  return { accepted, rejected };
}