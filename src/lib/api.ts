import { z } from 'zod';
import type { FinalTripRequest, SuggestedPlaceCandidate, SuggestedStopCategory, SuggestStopsRequest } from './api-types';
import type { RouteOption, SuggestedStop, TripInput, TripPlan } from './types';
import type { StopPreferenceSubmission } from '../components/StopPreferences';
import { routeSchema } from './view-contracts';

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
const nonnegative = z.number().nonnegative();
const category = z.enum(['food', 'coffee', 'gas', 'groceries', 'dessert', 'pharmacy']);
const availableCategoriesSchema = z.array(category);
const candidateSchema = z.object({
  placeId: z.string().min(1), name: z.string(), category,
  address: z.string().nullable(),
  coordinates: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
  rating: z.number().nullable(),
  priceLevel: z.enum(['PRICE_LEVEL_FREE', 'PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE']).nullable(),
  businessStatus: z.enum(['OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY']).nullable(),
  openNow: z.boolean().nullable(), mapsUri: z.string().nullable(),
  extraStopMinutes: nonnegative.nullable(),
  comparisonMode: z.enum(['DRIVE', 'TRANSIT', 'WALK', 'BICYCLE']).nullable(),
  routeWalkingMinutes: nonnegative.nullable(),
  budgetStatus: z.enum(['not_requested', 'within_limit', 'exceeds_limit', 'unknown']),
});
const suggestionsSchema = z.object({
  dataMode: z.literal('live'),
  availableCategories: availableCategoriesSchema,
  recommendedCategories: availableCategoriesSchema,
  timeOfDay: z.enum(['MORNING', 'MIDDAY', 'EVENING', 'LATE_NIGHT']),
  stops: z.array(z.unknown()),
  candidates: z.array(candidateSchema),
  warnings: z.array(z.string()).optional(),
});
const mode = z.enum(['DRIVE', 'TRANSIT', 'WALK', 'BICYCLE']);
const constraint = z.enum(['met', 'exceeded', 'unknown', 'not_requested']);
const planSchema = z.object({
  id: z.string(), generatedAt: z.string(), dataMode: z.literal('live'),
  routeOptions: z.array(z.object({
    tolls: routeSchema.shape.tolls,
    parking: routeSchema.shape.parking,
    id: z.string(), mode, durationMinutes: nonnegative, distanceMeters: nonnegative,
    encodedPolyline: z.string().nullable().optional(),
    walkingMinutes: nonnegative.nullable(), extraStopMinutes: nonnegative.nullable(),
    estimatedTransportationCost: z.object({ amount: nonnegative, currency: z.string(), source: z.enum(['google_routes_estimate', 'no_fare', 'demo']) }).nullable(),
    steps: z.array(z.object({
      mode, instruction: z.string().optional(), durationMinutes: nonnegative.optional(), distanceMeters: nonnegative.optional(),
      transit: z.object({ headsign: z.string().optional(), line: z.string().optional(), lineShortName: z.string().optional(), departureStop: z.string().optional(), arrivalStop: z.string().optional() }).optional(),
    })),
    constraints: z.object({ budget: constraint, walking: constraint, extraTime: constraint, extraBudget: constraint, eligible: z.literal(true) }),
    warnings: z.array(z.string()),
  })),
  rankings: z.object({ best: z.string().nullable(), fastest: z.string().nullable(), cheapest: z.string().nullable() }),
  recommendationSource: z.enum(['gemini', 'rules']), warnings: z.array(z.string()),
}).superRefine((plan, ctx) => {
  const ids = new Set(plan.routeOptions.map(route => route.id));
  if (ids.size !== plan.routeOptions.length || Object.values(plan.rankings).some(id => id !== null && !ids.has(id))) {
    ctx.addIssue({ code: 'custom', message: 'Backend returned invalid route ranking IDs.' });
  }
});

async function post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error('The trip service could not be reached or timed out. Check that the backend is running and try again.');
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error('The trip service returned an unreadable response. Please try again.'); }
  if (!response.ok) {
    const parsed = z.object({ error: z.union([z.string(), z.object({ message: z.string() })]) }).safeParse(payload);
    const message = parsed.success ? (typeof parsed.data.error === 'string' ? parsed.data.error : parsed.data.error.message) : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error('The trip service response does not match the current app. Check that the latest backend is running on port 4000.');
  return parsed.data;
}

export function buildSuggestRequest(trip: TripInput, preference: Exclude<StopPreferenceSubmission, { skip: true }>): SuggestStopsRequest {
  return { ...trip, category: preference.category, searchArea: preference.timing,
    ...(preference.maxExtraMinutes !== undefined ? { maxExtraMinutes: preference.maxExtraMinutes } : {}),
    ...(preference.maxExtraBudget !== undefined ? { maxExtraBudget: preference.maxExtraBudget } : {}),
  };
}

const supportedStopCategories: readonly SuggestedStopCategory[] = [
  'food', 'coffee', 'gas', 'groceries', 'dessert', 'pharmacy',
];

export function buildInitialSuggestPreference(trip: TripInput): Exclude<StopPreferenceSubmission, { skip: true }> {
  const requestedCategory = trip.nearbyCategories?.find(value =>
    supportedStopCategories.includes(value as SuggestedStopCategory),
  );
  const category: SuggestedStopCategory = requestedCategory
    && supportedStopCategories.includes(requestedCategory as SuggestedStopCategory)
    ? requestedCategory as SuggestedStopCategory
    : 'food';
  return { skip: false, category, timing: 'ON_ROUTE' };
}

export function buildPlanRequest(trip: TripInput, preference: StopPreferenceSubmission | null, stop: SuggestedStop | null): FinalTripRequest {
  if (!stop) return { ...trip, skip: true };
  if (!stop.candidate) throw new Error('Choose a live stop before planning.');
  return { ...trip, skip: false, selectedStop: stop.candidate,
    ...(preference && !preference.skip ? {
      ...(preference.maxExtraMinutes !== undefined ? { maxExtraMinutes: preference.maxExtraMinutes } : {}),
      ...(preference.maxExtraBudget !== undefined ? { maxExtraBudget: preference.maxExtraBudget } : {}),
    } : {}),
  };
}

export function toSuggestedStop(candidate: SuggestedPlaceCandidate, timing: SuggestedStop['timing']): SuggestedStop {
  return { id: candidate.placeId, name: candidate.name, category: candidate.category,
    address: candidate.address ?? 'Address unavailable', rating: candidate.rating,
    estimatedExtraMinutes: candidate.extraStopMinutes, timing, dataMode: 'live', candidate };
}

export async function suggestStops(trip: TripInput, preference: Exclude<StopPreferenceSubmission, { skip: true }>) {
  const response = await post('suggest-stops', buildSuggestRequest(trip, preference), suggestionsSchema);
  return {
    availableCategories: response.availableCategories,
    recommendedCategories: response.recommendedCategories,
    timeOfDay: response.timeOfDay,
    stops: response.candidates.map(candidate => toSuggestedStop(candidate, preference.timing)),
    warnings: response.warnings ?? [],
  };
}

export function toTripPlan(payload: unknown, includesStop = false): TripPlan {
  const plan = planSchema.parse(payload);
  const labels = { DRIVE: 'Driving', TRANSIT: 'Public transit', WALK: 'Walking', BICYCLE: 'Cycling' };
  const routes: RouteOption[] = plan.routeOptions.map(route => ({
    tolls: route.tolls, parking: route.parking,
    id: route.id, mode: route.mode, label: labels[route.mode], durationMinutes: route.durationMinutes,
    distanceMeters: route.distanceMeters, walkingMinutes: route.walkingMinutes,
    includesStop, extraStopMinutes: route.extraStopMinutes,
    cost: { amount: route.estimatedTransportationCost?.amount ?? null, currency: route.estimatedTransportationCost?.currency ?? 'USD',
      kind: route.estimatedTransportationCost?.source === 'no_fare' ? 'no_fare' : route.estimatedTransportationCost ? 'provider_fare' : 'unknown',
      complete: route.estimatedTransportationCost !== null && route.mode !== 'DRIVE',
      note: route.estimatedTransportationCost
        ? (includesStop ? 'Transportation estimate; purchases and time spent at the stop are not included.' : 'Transportation estimate.')
        : route.mode === 'TRANSIT' ? 'Google did not return a fare for this trip. Check the transit operator before travelling.'
        : route.mode === 'DRIVE' ? 'Total driving cost is unavailable. Tolls are listed separately.'
        : 'Transportation price was not returned for this route.',
    },
    // Preserve directions even when Google omits a step's duration or distance.
    steps: route.steps.map(step => ({
      mode: step.mode, instruction: step.instruction ?? '', durationMinutes: step.durationMinutes ?? null, distanceMeters: step.distanceMeters ?? null,
      transit: step.transit ? { line: step.transit.line ?? step.transit.lineShortName ?? '', headsign: step.transit.headsign ?? null,
        departureStop: step.transit.departureStop ?? null, arrivalStop: step.transit.arrivalStop ?? null, departureTime: null, arrivalTime: null, agencies: [] } : null,
    })),
    encodedPolyline: route.encodedPolyline ?? null, destination: null, mapsUrl: '', departureTime: null, arrivalTime: null, timing: 'estimated_now',
    constraints: { budget: route.constraints.budget === 'not_requested' ? 'unknown' : route.constraints.budget,
      walking: route.constraints.walking === 'not_requested' ? 'unknown' : route.constraints.walking, arrival: 'unknown', eligible: true },
    warnings: route.warnings,
  }));
  return { id: plan.id, generatedAt: plan.generatedAt, dataMode: plan.dataMode, routes,
    ...plan.rankings, recommendation: { source: plan.recommendationSource,
      reason: plan.recommendationSource === 'gemini' ? 'Gemini ranked the eligible routes using the supplied travel facts and preferences.' : 'Ranked using available route times, walking estimates, and transportation costs.' },
    nearby: [], groundedGuidance: null,
    warnings: [...new Set([...plan.warnings, ...routes.flatMap(route => route.warnings)])], attribution: 'Routes and places provided by Google Maps.',
  };
}

export async function planTrip(trip: TripInput, preference: StopPreferenceSubmission | null, stop: SuggestedStop | null) {
  const response = await post('plan-trip', buildPlanRequest(trip, preference, stop), planSchema);
  return toTripPlan(response, stop !== null);
}
