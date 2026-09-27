import type { Location, TripRequest } from '../types/index';
import type { GoogleRouteCandidate, GoogleRouteStep, GoogleTravelMode } from './maps';

export interface CandidateRouteStep {
  mode: GoogleTravelMode;
  instruction?: string;
  durationMinutes?: number;
  distanceMeters?: number;
  transit?: GoogleRouteStep['transit'];
}

export interface CandidateRoute {
  encodedPolyline?: string;
  tolls?: GoogleRouteCandidate['tolls'];
  id: string;
  mode: GoogleTravelMode;
  durationMinutes: number;
  distanceMeters: number;
  walkingMinutes: number | null;
  estimatedTransportationCost: {
    amount: number;
    currency: string;
    source: 'google_routes_estimate' | 'no_fare';
  } | null;
  steps: CandidateRouteStep[];
  origin: Location;
  destination: Location;
  warnings: string[];
}

function secondsToMinutes(seconds: number): number {
  return seconds / 60;
}

function normalizeStep(step: GoogleRouteStep): CandidateRouteStep {
  const normalized: CandidateRouteStep = { mode: step.travelMode };
  if (step.instruction !== undefined) normalized.instruction = step.instruction;
  if (step.durationSeconds !== undefined) {
    normalized.durationMinutes = secondsToMinutes(step.durationSeconds);
  }
  if (step.distanceMeters !== undefined) normalized.distanceMeters = step.distanceMeters;
  if (step.transit !== undefined) normalized.transit = step.transit;
  return normalized;
}

function calculateWalkingMinutes(
  route: GoogleRouteCandidate,
  steps: CandidateRouteStep[],
): number | null {
  if (route.travelMode === 'WALK') return secondsToMinutes(route.durationSeconds);
  if (route.travelMode === 'DRIVE') return 0;

  const walkingSteps = steps.filter(step => step.mode === 'WALK');
  if (walkingSteps.length === 0) return steps.length > 0 ? 0 : null;
  if (walkingSteps.some(step => step.durationMinutes === undefined)) {
    return null;
  }

  return walkingSteps.reduce((total, step) => total + (step.durationMinutes ?? 0), 0);
}

export function normalizeRouteCandidate(
  route: GoogleRouteCandidate,
  request: Pick<TripRequest, 'origin' | 'destination'>,
): CandidateRoute {
  const steps = route.steps.map(normalizeStep);

  return {
    id: route.id,
    ...(route.encodedPolyline ? { encodedPolyline: route.encodedPolyline } : {}),
    ...(route.tolls ? { tolls: route.tolls } : {}),
    mode: route.travelMode,
    durationMinutes: secondsToMinutes(route.durationSeconds),
    distanceMeters: route.distanceMeters,
    walkingMinutes: calculateWalkingMinutes(route, steps),
    estimatedTransportationCost: route.estimatedCost ?? null,
    steps,
    origin: request.origin,
    destination: request.destination,
    warnings: [...route.warnings],
  };
}

export function normalizeRouteCandidates(
  routes: GoogleRouteCandidate[],
  request: Pick<TripRequest, 'origin' | 'destination'>,
): CandidateRoute[] {
  return routes.map(route => normalizeRouteCandidate(route, request));
}
