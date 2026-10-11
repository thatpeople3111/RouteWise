import type {
  FinalTripRequest,
  RideshareOption,
  TripPlanRankings,
  TripPlanRouteOption,
} from '../types/index';

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiRankingInput {
  request: FinalTripRequest;
  candidates: TripPlanRouteOption[];
  /** Available, budget-compliant rideshare options Gemini may pick for best/fastest. */
  rideshares?: RideshareOption[];
  maxExtraMinutes?: number;
  maxExtraBudget?: number;
}

export interface GeminiRankingOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateGeminiRankings(
  value: unknown,
  candidates: TripPlanRouteOption[],
  rideshares: RideshareOption[] = [],
): TripPlanRankings | null {
  if (!isRecord(value)
    || Object.keys(value).length !== 3
    || !['best', 'fastest', 'cheapest'].every(key => key in value)) return null;

  const rideshareMinutes = new Map(
    rideshares.flatMap(option => typeof option.estimatedTotalMinutes === 'number'
      && Number.isFinite(option.estimatedTotalMinutes)
      ? [[option.id, option.estimatedTotalMinutes] as const]
      : []),
  );
  const allowedIds = new Set([...candidates.map(candidate => candidate.id), ...rideshareMinutes.keys()]);
  const rankingValues = [value.best, value.fastest, value.cheapest];
  if (rankingValues.some(id => id !== null && (typeof id !== 'string' || !allowedIds.has(id)))) return null;

  if (allowedIds.size > 0 && typeof value.best !== 'string') return null;
  const durations = [
    ...candidates.map(candidate => candidate.durationMinutes),
    ...rideshareMinutes.values(),
  ];
  const shortestDuration = Math.min(...durations);
  const fastestMinutes = candidates.find(candidate => candidate.id === value.fastest)?.durationMinutes
    ?? rideshareMinutes.get(value.fastest as string);
  if (typeof value.fastest !== 'string' || fastestMinutes !== shortestDuration) return null;

  // Cheapest is judged on factual route costs only. Rideshare fares are estimates, so a rideshare
  // ID is never a valid cheapest choice.
  if (typeof value.cheapest === 'string' && rideshareMinutes.has(value.cheapest)) return null;
  const pricedRoutes = candidates.filter(candidate => candidate.estimatedTransportationCost !== null);
  const currencies = new Set(pricedRoutes.map(candidate => candidate.estimatedTransportationCost?.currency));
  if (pricedRoutes.length !== candidates.length || currencies.size !== 1) {
    if (value.cheapest !== null) return null;
  } else {
    const lowestCost = Math.min(...pricedRoutes.map(candidate => candidate.estimatedTransportationCost!.amount));
    if (typeof value.cheapest !== 'string'
      || candidates.find(candidate => candidate.id === value.cheapest)?.estimatedTransportationCost?.amount !== lowestCost) return null;
  }

  return {
    best: value.best as string | null,
    fastest: value.fastest as string | null,
    cheapest: value.cheapest as string | null,
  };
}

function responseSchema(candidateIds: string[]): Record<string, unknown> {
  const idSchema = { anyOf: [{ type: 'string', enum: candidateIds }, { type: 'null' }] };
  return {
    type: 'object',
    properties: {
      best: idSchema,
      fastest: idSchema,
      cheapest: idSchema,
    },
    required: ['best', 'fastest', 'cheapest'],
    additionalProperties: false,
  };
}

export async function rankRoutesWithGemini(
  input: GeminiRankingInput,
  options: GeminiRankingOptions = {},
): Promise<TripPlanRankings | null> {
  const rideshareOptions = input.rideshares ?? [];
  if (input.candidates.length === 0 && rideshareOptions.length === 0) {
    return { best: null, fastest: null, cheapest: null };
  }
  const apiKey = (options.apiKey ?? process.env.GEMINI_API_KEY)?.trim();
  if (!apiKey) return null;

  const candidates = input.candidates.map(route => ({
    id: route.id,
    kind: 'route',
    mode: route.mode,
    durationMinutes: route.durationMinutes,
    distanceMeters: route.distanceMeters,
    walkingMinutes: route.walkingMinutes,
    transportationCost: route.estimatedTransportationCost,
    extraStopMinutes: route.extraStopMinutes,
    constraints: route.constraints,
  }));
  const rideshareCandidates = rideshareOptions.map(option => ({
    id: option.id,
    kind: 'rideshare',
    provider: option.provider,
    durationMinutes: option.estimatedTotalMinutes ?? null,
    pickupMinutes: option.estimatedPickupMinutes ?? null,
    rideMinutes: option.estimatedRideMinutes ?? null,
    priceEstimate: typeof option.estimatedPriceLow === 'number' && typeof option.estimatedPriceHigh === 'number'
      ? {
        low: option.estimatedPriceLow,
        high: option.estimatedPriceHigh,
        currency: option.currency ?? 'USD',
        kind: 'routewise_estimate',
      }
      : null,
    withinBudget: option.withinBudget ?? null,
  }));
  const context = {
    trip: {
      origin: input.request.origin,
      destination: input.request.destination,
      departureTime: input.request.departureTime ?? null,
      arrivalTime: input.request.arrivalTime ?? null,
      userBudgetUsd: input.request.budgetUsd ?? null,
      maxRideshareBudget: input.request.maxRideshareBudget ?? null,
      maxWalkingMinutes: input.request.maxWalkingMinutes ?? null,
      notes: input.request.notes ?? null,
      preference: input.request.preference ?? 'balanced',
      selectedStop: input.request.skip === true ? null : input.request.selectedStop ?? null,
      maxExtraMinutes: input.maxExtraMinutes ?? null,
      maxExtraBudget: input.maxExtraBudget ?? null,
    },
    candidates,
    rideshareCandidates,
  };
  const prompt = [
    'Rank the supplied transportation route candidates for the user.',
    'The candidate list is the complete factual source of routes. Do not invent or change businesses, route IDs, durations, costs, distances, stops, or steps.',
    'Choose one supplied candidate ID for best and the shortest-duration ID for fastest. Candidates marked kind "rideshare" may be chosen for best or fastest using their supplied total duration (pickup + ride). For cheapest, consider only route candidates: return null if any route transportation cost is unknown or currencies differ; otherwise choose the lowest-cost route ID. Rideshare prices are estimates, never exact quotes, so a rideshare ID is never a valid cheapest choice. You may reuse an ID for multiple labels.',
    'Compare only supplied facts. Null cost or walking values are unknown; do not infer exact costs. Rideshare priceEstimate values are app estimates, not live provider quotes.',
    'Maps and rideshare services provide the facts. Never invent Lyft or Waymo prices, pickup times, availability, or service areas.',
    'Known hard-constraint violations have already been removed by code. Unknown constraints remain unknown; do not claim they are met. Do not add candidates or override eligibility.',
    'Return only the requested structured JSON object.',
    JSON.stringify(context),
  ].join('\n\n');

  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(
      `${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseFormat: {
              text: {
                // generateContent expects the enum, unlike the Interactions API.
                mimeType: 'APPLICATION_JSON',
                schema: responseSchema([
                  ...input.candidates.map(candidate => candidate.id),
                  ...rideshareOptions.map(option => option.id),
                ]),
              },
            },
            temperature: 0.1,
            maxOutputTokens: 2048,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.candidates)) return null;
    const firstCandidate = payload.candidates[0];
    if (isRecord(firstCandidate) && firstCandidate.finishReason && firstCandidate.finishReason !== 'STOP') return null;
    if (!isRecord(firstCandidate) || !isRecord(firstCandidate.content) || !Array.isArray(firstCandidate.content.parts)) return null;
    const textPart = firstCandidate.content.parts.find(part => isRecord(part) && typeof part.text === 'string');
    if (!isRecord(textPart) || typeof textPart.text !== 'string') return null;
    return validateGeminiRankings(JSON.parse(textPart.text) as unknown, input.candidates, rideshareOptions);
  } catch {
    return null;
  }
}
