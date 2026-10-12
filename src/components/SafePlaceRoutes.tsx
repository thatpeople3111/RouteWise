'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { formatDuration } from '@/lib/formatDuration';
import SafeWaitPanel from './SafeWaitPanel';
import Map from './Map';
import { findSafePlaceRoute, type SafePlaceRoute } from '@/lib/safePlaceRoute';
import type { Coordinates, SafeWaitCandidate } from '@/lib/types';

type RouteState = { placeId: string; status: 'loading' } |
  { placeId: string; status: 'ready'; value: SafePlaceRoute } |
  { placeId: string; status: 'error'; message: string };

export default function SafePlaceRoutes({ origin, ...panelProps }:
  Omit<ComponentProps<typeof SafeWaitPanel>, 'selectedPlaceId' | 'routeDetails' | 'onRouteHere'> & { origin: Coordinates }) {
  const [state, setState] = useState<RouteState | null>(null);
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current++; }, []);

  async function routeHere(place: SafeWaitCandidate) {
    const id = ++requestId.current;
    if (state?.placeId === place.placeId) { setState(null); return; }
    setState({ placeId: place.placeId, status: 'loading' });
    try {
      const value = await findSafePlaceRoute(origin, place);
      if (id === requestId.current) setState({ placeId: place.placeId, status: 'ready', value });
    } catch {
      if (id === requestId.current) setState({ placeId: place.placeId, status: 'error', message: "We couldn't create a walking route to this location. Hide the route and try again." });
    }
  }

  const details = state && (
    <div className="safe-place-route stranded-route-card" aria-live="polite">
      {state.status === 'loading' && <p role="status">Finding route…</p>}
      {state.status === 'error' && <p className="stranded-error" role="alert">{state.message}</p>}
      {state.status === 'ready' && <>
        <h4>WALKING ROUTE</h4>
        <p>{formatDuration(state.value.route.durationMinutes)} · {(state.value.route.distanceMeters / 1609.344).toFixed(1)} mi</p>
        <Map origin={state.value.origin} destination={state.value.destination} selectedRoute={state.value.route} variant="compact" />
        <ol>{state.value.route.steps.filter(step => step.instruction.trim()).map((step, index) => <li key={index}>{step.instruction}</li>)}</ol>
        {state.value.route.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
        <p className="safe-place-attribution">Routes provided by Google Maps.</p>
      </>}
    </div>
  );
  return <SafeWaitPanel {...panelProps} selectedPlaceId={state?.placeId ?? null} routeDetails={details} onRouteHere={routeHere} />;
}
