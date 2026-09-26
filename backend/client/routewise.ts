import type { Location, NearbyRequest, NearbyResponse, TripRequest, TripResponse } from '../shared/contracts.js';
export type { Location, NearbyRequest, NearbyResponse, TripRequest, TripResponse };
export class RouteWiseError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
export function createRouteWiseClient(baseUrl = 'http://localhost:3001') {
  async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    const data = await response.json();
    if (!response.ok) throw new RouteWiseError(data.error?.code ?? 'REQUEST_FAILED', data.error?.message ?? 'Request failed.', response.status);
    return data as T;
  }
  return {
    planTrip: (request: TripRequest, signal?: AbortSignal) => post<TripResponse>('/api/v1/trips/plan', request, signal),
    nearby: (request: NearbyRequest, signal?: AbortSignal) => post<NearbyResponse>('/api/v1/places/nearby', request, signal),
    searchPlaces: (query: string, signal?: AbortSignal) => post<NearbyResponse>('/api/v1/places/search', { query }, signal),
  };
}
