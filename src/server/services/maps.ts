import type { Coordinates, Location, TripRequest, TollEstimate } from '../types/index';

const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTES_FIELD_MASK = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.travelAdvisory.transitFare',
  'routes.polyline.encodedPolyline',
  'routes.legs.endLocation.latLng',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.navigationInstruction.instructions',
  'routes.legs.steps.transitDetails.headsign',
  'routes.legs.steps.transitDetails.transitLine.name',
  'routes.legs.steps.transitDetails.transitLine.nameShort',
  'routes.legs.steps.transitDetails.stopDetails.departureStop.name',
  'routes.legs.steps.transitDetails.stopDetails.arrivalStop.name',
].join(',');

export type GoogleTravelMode = 'DRIVE' | 'TRANSIT' | 'WALK' | 'BICYCLE';

export interface GoogleTransitDetails {
  headsign?: string;
  line?: string;
  lineShortName?: string;
  departureStop?: string;
  arrivalStop?: string;
}

export interface GoogleRouteStep {
  travelMode: GoogleTravelMode;
  instruction?: string;
  durationSeconds?: number;
  distanceMeters?: number;
  transit?: GoogleTransitDetails;
}

export interface GoogleRouteCandidate {
  tolls?: TollEstimate;
  id: string;
  travelMode: GoogleTravelMode;
  durationSeconds: number;
  distanceMeters: number;
  estimatedCost?: {
    amount: number;
    currency: string;
    source: 'google_routes_estimate' | 'no_fare';
  };
  destinationCoordinates?: Coordinates;
  encodedPolyline?: string;
  steps: GoogleRouteStep[];
  warnings: string[];
}

export interface MapsServiceOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class GoogleRoutesApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = 'GoogleRoutesApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toWaypoint(location: Location): Record<string, unknown> {
  if ('address' in location) return { address: location.address };
  if ('placeId' in location) return { placeId: location.placeId };
  return {
    location: {
      latLng: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    },
  };
}

function parseDuration(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function parseTransitFare(value: unknown): GoogleRouteCandidate['estimatedCost'] {
  if (!isRecord(value) || typeof value.currencyCode !== 'string' || value.currencyCode.length !== 3) {
    return undefined;
  }
  const units = typeof value.units === 'string' || typeof value.units === 'number'
    ? Number(value.units)
    : 0;
  const nanos = typeof value.nanos === 'number' ? value.nanos : 0;
  const amount = units + nanos / 1_000_000_000;
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return { amount, currency: value.currencyCode, source: 'google_routes_estimate' };
}

function parseTravelMode(value: unknown, fallback: GoogleTravelMode): GoogleTravelMode {
  return value === 'DRIVE' || value === 'TRANSIT' || value === 'WALK' || value === 'BICYCLE'
    ? value
    : fallback;
}

function parseStep(value: unknown, fallbackMode: GoogleTravelMode): GoogleRouteStep | undefined {
  if (!isRecord(value)) return undefined;

  const step: GoogleRouteStep = {
    travelMode: parseTravelMode(value.travelMode, fallbackMode),
  };
  if (isRecord(value.navigationInstruction) && typeof value.navigationInstruction.instructions === 'string') {
    step.instruction = value.navigationInstruction.instructions;
  }
  const durationSeconds = parseDuration(value.staticDuration);
  if (durationSeconds !== undefined) step.durationSeconds = durationSeconds;
  if (typeof value.distanceMeters === 'number' && Number.isFinite(value.distanceMeters)) {
    step.distanceMeters = value.distanceMeters;
  }

  if (isRecord(value.transitDetails)) {
    const details = value.transitDetails;
    const transit: GoogleTransitDetails = {};
    if (typeof details.headsign === 'string') transit.headsign = details.headsign;
    if (isRecord(details.transitLine)) {
      if (typeof details.transitLine.name === 'string') transit.line = details.transitLine.name;
      if (typeof details.transitLine.nameShort === 'string') transit.lineShortName = details.transitLine.nameShort;
    }
    if (isRecord(details.stopDetails)) {
      if (isRecord(details.stopDetails.departureStop) && typeof details.stopDetails.departureStop.name === 'string') {
        transit.departureStop = details.stopDetails.departureStop.name;
      }
      if (isRecord(details.stopDetails.arrivalStop) && typeof details.stopDetails.arrivalStop.name === 'string') {
        transit.arrivalStop = details.stopDetails.arrivalStop.name;
      }
    }
    if (Object.keys(transit).length > 0) step.transit = transit;
  }

  return step;
}

function parseRoute(value: unknown, travelMode: GoogleTravelMode, index: number): GoogleRouteCandidate {
  if (!isRecord(value)) {
    throw new GoogleRoutesApiError('INVALID_RESPONSE', 'Google Routes API returned an invalid route.', 502);
  }

  const durationSeconds = parseDuration(value.duration);
  if (durationSeconds === undefined
    || typeof value.distanceMeters !== 'number'
    || !Number.isFinite(value.distanceMeters)
    || value.distanceMeters < 0) {
    throw new GoogleRoutesApiError('INVALID_RESPONSE', 'Google Routes API returned incomplete route metrics.', 502);
  }

  const steps: GoogleRouteStep[] = [];
  let destinationCoordinates: Coordinates | undefined;
  if (Array.isArray(value.legs)) {
    for (const leg of value.legs) {
      if (!isRecord(leg) || !Array.isArray(leg.steps)) continue;
      if (isRecord(leg.endLocation) && isRecord(leg.endLocation.latLng)
        && typeof leg.endLocation.latLng.latitude === 'number'
        && typeof leg.endLocation.latLng.longitude === 'number') {
        destinationCoordinates = {
          latitude: leg.endLocation.latLng.latitude,
          longitude: leg.endLocation.latLng.longitude,
        };
      }
      for (const rawStep of leg.steps) {
        const step = parseStep(rawStep, travelMode);
        if (step) steps.push(step);
      }
    }
  }

  return {
    id: `${travelMode.toLowerCase()}-${index + 1}`,
    ...(travelMode === 'DRIVE' ? { tolls: parseTolls(value.travelAdvisory) } : {}),
    travelMode,
    durationSeconds,
    distanceMeters: value.distanceMeters,
    ...(isRecord(value.travelAdvisory) && parseTransitFare(value.travelAdvisory.transitFare)
      ? { estimatedCost: parseTransitFare(value.travelAdvisory.transitFare) }
      : {}),
    ...(travelMode === 'WALK'
      ? { estimatedCost: { amount: 0, currency: 'USD', source: 'no_fare' as const } }
      : {}),
    ...(destinationCoordinates ? { destinationCoordinates } : {}),
    ...(isRecord(value.polyline) && typeof value.polyline.encodedPolyline === 'string'
      ? { encodedPolyline: value.polyline.encodedPolyline }
      : {}),
    steps,
    warnings: travelMode === 'WALK'
      ? ['Walking routes are in beta and may be missing clear sidewalks or pedestrian paths.']
      : travelMode === 'BICYCLE'
        ? ['Bicycle routes are in beta and may be missing clear bicycle paths.']
        : [],
  };
}

function getEnabledTravelModes(request: TripRequest): GoogleTravelMode[] {
  const modes: GoogleTravelMode[] = [];
  if (request.hasCar === true) modes.push('DRIVE');
  if (request.hasBike === true) modes.push('BICYCLE');
  if (request.allowTransit !== false) modes.push('TRANSIT');
  if (request.allowWalking !== false) modes.push('WALK');
  return modes;
}

async function requestRoutes(
  request: TripRequest,
  travelMode: GoogleTravelMode,
  apiKey: string,
  fetchImpl: typeof fetch,
  intermediateStops: Location[] = [],
): Promise<GoogleRouteCandidate[]> {
  const requestBody: Record<string, unknown> = {
    origin: toWaypoint(request.origin),
    destination: toWaypoint(request.destination),
    travelMode,
    units: 'METRIC',
  };
  if (travelMode === 'DRIVE') requestBody.extraComputations = ['TOLLS'];
  if (travelMode !== 'TRANSIT' && intermediateStops.length > 0) {
    requestBody.intermediates = intermediateStops.map(toWaypoint);
  }

  if (travelMode === 'DRIVE' && request.avoidTolls === true) {
    requestBody.routeModifiers = { avoidTolls: true };
  }
  if (travelMode === 'TRANSIT') {
    if (request.departureTime) requestBody.departureTime = request.departureTime;
    if (request.arrivalTime) requestBody.arrivalTime = request.arrivalTime;
    if (request.maxWalkingMinutes !== undefined) {
      requestBody.transitPreferences = { routingPreference: 'LESS_WALKING' };
    }
  }

  let response: Response;
  try {
    response = await fetchImpl(ROUTES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': ROUTES_FIELD_MASK + (travelMode === 'DRIVE' ? ',routes.travelAdvisory.tollInfo' : ''),
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GoogleRoutesApiError('NETWORK_ERROR', 'Could not reach Google Routes API.', 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GoogleRoutesApiError('INVALID_RESPONSE', 'Google Routes API returned invalid JSON.', 502, response.status);
  }

  if (!response.ok) {
    const upstreamMessage = isRecord(payload)
      && isRecord(payload.error)
      && typeof payload.error.message === 'string'
      ? payload.error.message
      : `Google Routes API returned HTTP ${response.status}.`;
    const message = upstreamMessage.split(apiKey).join('[redacted]');
    throw new GoogleRoutesApiError('UPSTREAM_ERROR', message, 502, response.status);
  }

  if (!isRecord(payload)) {
    throw new GoogleRoutesApiError('INVALID_RESPONSE', 'Google Routes API returned an invalid response object.', 502, response.status);
  }
  if (payload.routes === undefined) return [];
  if (!Array.isArray(payload.routes)) {
    throw new GoogleRoutesApiError('INVALID_RESPONSE', 'Google Routes API returned an invalid routes field.', 502, response.status);
  }

  return payload.routes.map((route, index) => parseRoute(route, travelMode, index));
}

export async function getCandidateRoutes(
  request: TripRequest,
  options: MapsServiceOptions = {},
): Promise<GoogleRouteCandidate[]> {
  const travelModes = getEnabledTravelModes(request);
  if (travelModes.length === 0) return [];

  const apiKey = (options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY)?.trim();
  if (!apiKey) {
    throw new GoogleRoutesApiError(
      'MISSING_API_KEY',
      'GOOGLE_MAPS_API_KEY is required to retrieve routes.',
      500,
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const routeGroups = await Promise.all(
    travelModes.map(mode => requestRoutes(request, mode, apiKey, fetchImpl)),
  );
  return routeGroups.flat();
}

export async function getCandidateRoutesViaStop(
  request: TripRequest,
  stop: Location,
  options: MapsServiceOptions = {},
): Promise<GoogleRouteCandidate[]> {
  const travelModes = getEnabledTravelModes(request);
  if (travelModes.length === 0) return [];

  const apiKey = (options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY)?.trim();
  if (!apiKey) {
    throw new GoogleRoutesApiError(
      'MISSING_API_KEY',
      'GOOGLE_MAPS_API_KEY is required to retrieve routes.',
      500,
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const routeGroups = await Promise.all(travelModes.map(async mode => {
    if (mode !== 'TRANSIT') {
      return requestRoutes(request, mode, apiKey, fetchImpl, [stop]);
    }

    let transitStartTime = request.departureTime;
    if (!transitStartTime && request.arrivalTime) {
      const originalTransitRoutes = await requestRoutes(request, mode, apiKey, fetchImpl);
      if (originalTransitRoutes.length === 0) return [];
      transitStartTime = new Date(
        Date.parse(request.arrivalTime) - originalTransitRoutes[0].durationSeconds * 1000,
      ).toISOString();
    }
    transitStartTime ??= new Date().toISOString();

    const firstLegRequest: TripRequest = {
      ...request,
      destination: stop,
      arrivalTime: undefined,
      departureTime: transitStartTime,
    };
    const firstLegRoutes = await requestRoutes(firstLegRequest, mode, apiKey, fetchImpl);
    if (firstLegRoutes.length === 0) return [];

    const firstLeg = firstLegRoutes[0];
    const secondLegRequest: TripRequest = {
      ...request,
      origin: stop,
      arrivalTime: undefined,
      departureTime: new Date(Date.parse(transitStartTime) + firstLeg.durationSeconds * 1000).toISOString(),
    };
    const secondLegRoutes = await requestRoutes(secondLegRequest, mode, apiKey, fetchImpl);
    if (secondLegRoutes.length === 0) return [];

    const secondLeg = secondLegRoutes[0];
    const combinedFare = firstLeg.estimatedCost
      && secondLeg.estimatedCost
      && firstLeg.estimatedCost.currency === secondLeg.estimatedCost.currency
      ? {
        amount: firstLeg.estimatedCost.amount + secondLeg.estimatedCost.amount,
        currency: firstLeg.estimatedCost.currency,
          source: firstLeg.estimatedCost.source === 'google_routes_estimate'
            || secondLeg.estimatedCost.source === 'google_routes_estimate'
            ? 'google_routes_estimate' as const
            : 'no_fare' as const,
      }
      : undefined;
    return [{
      id: 'transit-via-stop',
      travelMode: mode,
      durationSeconds: firstLeg.durationSeconds + secondLeg.durationSeconds,
      distanceMeters: firstLeg.distanceMeters + secondLeg.distanceMeters,
      ...(combinedFare ? { estimatedCost: combinedFare } : {}),
      ...(secondLeg.destinationCoordinates ? { destinationCoordinates: secondLeg.destinationCoordinates } : {}),
      steps: [...firstLeg.steps, ...secondLeg.steps],
      warnings: [...firstLeg.warnings, ...secondLeg.warnings],
    }];
  }));

  return routeGroups.flat();
}

function parseTolls(advisory: unknown): TollEstimate {
  if (!isRecord(advisory) || !isRecord(advisory.tollInfo)) {
    return { status: 'not_reported', prices: [] };
  }
  const values = advisory.tollInfo.estimatedPrice;
  const prices = Array.isArray(values)
    ? values.flatMap(value => {
      const money = parseTransitFare(value);
      return money ? [{ amount: money.amount, currency: money.currency }] : [];
    }) : [];
  return { status: prices.length > 0 ? 'estimated' : 'unknown', prices };
}
