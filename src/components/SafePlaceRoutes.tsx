'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { formatDuration } from '@/lib/formatDuration';
import SafeWaitPanel from './SafeWaitPanel';
import Map from './Map';
import { findSafePlaceRoute, type SafePlaceRoute } from '@/lib/safePlaceRoute';
import type { Coordinates, SafeWaitCandidate, RouteOption } from '@/lib/types';
import SafePlaceContinuation from './SafePlaceContinuation';
import type { NavigationPointSource } from '@/lib/navigationHandoff';
import { prepareSafePlaceNavigation, type SafePlaceContinuationContext } from '@/lib/safePlaceHandoff';
import { openExternalHandoff } from '@/lib/externalHandoff';
import HandoffFallbackLinks from './HandoffFallbackLinks';

type RouteState = { placeId: string; status: 'loading' } |
  { placeId: string; status: 'ready'; value: SafePlaceRoute } |
  { placeId: string; status: 'error'; message: string };

export default function SafePlaceRoutes({ origin, originalDestination, continuationRoutes = [], onContinuationChange, ...panelProps }:
  Omit<ComponentProps<typeof SafeWaitPanel>, 'selectedPlaceId' | 'routeDetails' | 'onRouteHere'> & {
    origin: Coordinates; originalDestination?: NavigationPointSource; continuationRoutes?: readonly RouteOption[];
    onContinuationChange?: (context: SafePlaceContinuationContext | null) => void;
  }) {
  const [state, setState] = useState<RouteState | null>(null);
  const [continuation, setContinuation] = useState<SafePlaceContinuationContext | null>(null);
  const [external, setExternal] = useState<ReturnType<typeof prepareSafePlaceNavigation> | null>(null);
  const continuationRef = useRef(continuation);
  const requestId = useRef(0);
  function updateContinuation(value: SafePlaceContinuationContext | null) { continuationRef.current = value; setContinuation(value); onContinuationChange?.(value); }
  useEffect(() => () => { requestId.current++; }, []);

  async function routeHere(place: SafeWaitCandidate) {
    const id = ++requestId.current;
    if (originalDestination) {
      try {
        const handoff = prepareSafePlaceNavigation(origin, originalDestination, place);
        // Launch in the click gesture, before the independent inline route fetch.
        setExternal(handoff);
        openExternalHandoff(handoff.url);
        updateContinuation({ ...handoff.continuationContext, legId: id });
      } catch {
        setState({ placeId: place.placeId, status: 'error', message: 'Navigation needs valid Safe Place coordinates. Your original trip is unchanged.' });
        return;
      }
    } else if (state?.placeId === place.placeId) { setState(null); return; }
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
      {continuation && <p>Temporary Safe Place leg started: {continuation.activeSafePlace.label ?? 'Selected Safe Place'}. Original destination: {continuation.originalDestination.label ?? continuation.originalDestination.address ?? 'Your original destination'}.</p>}
      {external && <HandoffFallbackLinks url={external.url} webFallbackUrl={external.webFallbackUrl} />}
      {continuation && <SafePlaceContinuation key={`${continuation.activeSafePlace.placeId}:${continuation.legId ?? ''}`} context={continuation} routes={continuationRoutes}
        onSelect={route => updateContinuation({ ...continuation, selectedContinuationRoute: { routeId: route.id, mode: route.mode } })}
        onPickupChange={point => { if (continuationRef.current) updateContinuation({ ...continuationRef.current, refreshedPickup: point }); }}
        onClear={() => { requestId.current++; updateContinuation(null); setExternal(null); setState(null); }} />}
    </div>
  );
  return <SafeWaitPanel {...panelProps} selectedActionLabel={originalDestination ? 'Route Me Here' : undefined} selectedPlaceId={state?.placeId ?? null} routeDetails={details} onRouteHere={routeHere} />;
}
