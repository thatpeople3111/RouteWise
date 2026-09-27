import type { FinalTripRequest, TripPlan, TripPlanRouteOption } from '../types/index';

export const DEMO_TRIP_ROUTE_OPTIONS: TripPlanRouteOption[] = [
  {
    id: 'demo-best',
    mode: 'TRANSIT',
    durationMinutes: 38,
    distanceMeters: 12400,
    walkingMinutes: null,
    estimatedTransportationCost: { amount: 2.25, currency: 'USD', source: 'demo' },
    steps: [],
    origin: { address: 'Demo origin' },
    destination: { address: 'Demo destination' },
    extraStopMinutes: null,
    constraints: { budget: 'unknown', walking: 'unknown', extraTime: 'not_requested', extraBudget: 'not_requested', eligible: true },
    warnings: [],
  },
  {
    id: 'demo-fastest',
    mode: 'DRIVE',
    durationMinutes: 24,
    distanceMeters: 15100,
    walkingMinutes: null,
    estimatedTransportationCost: null,
    steps: [],
    origin: { address: 'Demo origin' },
    destination: { address: 'Demo destination' },
    extraStopMinutes: null,
    constraints: { budget: 'unknown', walking: 'unknown', extraTime: 'not_requested', extraBudget: 'not_requested', eligible: true },
    warnings: [],
  },
  {
    id: 'demo-cheapest',
    mode: 'TRANSIT',
    durationMinutes: 51,
    distanceMeters: 13800,
    walkingMinutes: null,
    estimatedTransportationCost: { amount: 2.25, currency: 'USD', source: 'demo' },
    steps: [],
    origin: { address: 'Demo origin' },
    destination: { address: 'Demo destination' },
    extraStopMinutes: null,
    constraints: { budget: 'unknown', walking: 'unknown', extraTime: 'not_requested', extraBudget: 'not_requested', eligible: true },
    warnings: [],
  },
];

export function createDemoTripPlan(request: FinalTripRequest): TripPlan {
  return {
    id: 'demo-trip-plan',
    generatedAt: new Date().toISOString(),
    dataMode: 'demo',
    origin: request.origin,
    destination: request.destination,
    selectedStop: request.skip === true ? null : request.selectedStop ?? null,
    routeOptions: DEMO_TRIP_ROUTE_OPTIONS,
    rankings: { best: 'demo-best', fastest: 'demo-fastest', cheapest: 'demo-cheapest' },
    recommendationSource: 'rules',
    warnings: ['This plan contains demo route data.'],
  };
}