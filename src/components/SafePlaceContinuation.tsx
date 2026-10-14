'use client';

import { useEffect, useRef, useState } from 'react';
import type { Coordinates, RouteOption } from '@/lib/types';
import { isValidNavigationPoint } from '@/lib/navigationHandoff';
import { resolveCurrentLocationName } from '@/lib/currentLocation';
import { openExternalHandoff } from '@/lib/externalHandoff';
import HandoffFallbackLinks from './HandoffFallbackLinks';
import { prepareSafePlaceContinuation, safePlaceContinuationRoutes, type SafePlaceContinuationContext } from '@/lib/safePlaceHandoff';

export default function SafePlaceContinuation({ context, routes, onSelect, onClear, onPickupChange }: {
  onPickupChange?: (point: SafePlaceContinuationContext['refreshedPickup']) => void;
  context: SafePlaceContinuationContext; routes: readonly RouteOption[];
  onSelect: (route: RouteOption) => void; onClear: () => void;
}) {
  const choices = safePlaceContinuationRoutes(routes);
  const selected = choices.find(route => route.id === context?.selectedContinuationRoute?.routeId) ?? choices[0];
  const [location, setLocation] = useState<Coordinates | undefined>();
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const [external, setExternal] = useState<ReturnType<typeof prepareSafePlaceContinuation> | null>(null);
  const refreshId = useRef(0);
  useEffect(() => () => { refreshId.current++; }, []);
  function refresh() {
    const id = ++refreshId.current;
    setLocation(undefined); onPickupChange?.(undefined); setMessage('');
    if (!navigator.geolocation) { setMessage('Location unavailable. Start will use the Safe Place.'); return; }
    setLocating(true);
    const failed = () => { if (id === refreshId.current) { setLocating(false); setMessage('Location unavailable. Start will use the Safe Place.'); } };
    try { navigator.geolocation.getCurrentPosition(position => {
      if (id !== refreshId.current) return;
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      if (!isValidNavigationPoint(point) || !Number.isFinite(position.coords.accuracy) || position.coords.accuracy < 0 || position.coords.accuracy > 100) { failed(); return; }
      setLocation(point); setLocating(false); setMessage('Refreshed location will be used for this continuation.');
      onPickupChange?.({ ...point, label: 'Current location' });
      void resolveCurrentLocationName(point, position.coords.accuracy).then(label => {
        if (id === refreshId.current) onPickupChange?.({ ...point, label });
      });
    }, failed, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }); } catch { failed(); }
  }
  function start() {
    if (!selected) return;
    try {
      const result = prepareSafePlaceContinuation(context, selected, location);
      onSelect(selected);
      setExternal(result);
      const opened = openExternalHandoff(result.url);
      setMessage(opened.message ?? (selected.mode === 'TRANSIT' ? 'Your navigation app may recalculate the exact transit combination.' : 'Continuation opened. Your original trip is unchanged.'));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not open continuation.'); }
  }
  if (!isValidNavigationPoint(context?.activeSafePlace) || !isValidNavigationPoint(context?.originalDestination)) {
    return <section className="mt-3" aria-label="Safe Place continuation">
      <p role="alert">Safe Place continuation is incomplete. Clear this leg and choose a Safe Place again.</p>
      <button type="button" className="location-button" onClick={onClear}>Clear Safe Place leg</button>
    </section>;
  }
  return <section className="mt-3 grid gap-2" aria-label="Safe Place continuation">
    <h4>Continue to your destination</h4>
    <p>From {location ? 'your refreshed location' : context.activeSafePlace.label ?? 'the selected Safe Place'} to {context.originalDestination.label ?? context.originalDestination.address ?? 'your original destination'}.</p>
    <p className="field-hint">Maps will calculate the remaining route. Your original RouteWise route details stay unchanged.</p>
    {selected ? <>
      <label>Continue by <select value={selected.id} onChange={event => {
        const route = choices.find(choice => choice.id === event.target.value); if (route) onSelect(route);
      }}>{choices.map(route => <option key={route.id} value={route.id}>{route.label}</option>)}</select></label>
      <button type="button" className="submit-button" disabled={locating} onClick={start}>Start continuation</button>
    </> : <p>No transportation route is available for continuation.</p>}
    <button type="button" className="location-button" disabled={locating} onClick={refresh}>{locating ? 'Refreshing location…' : 'Refresh current location'}</button>
    <button type="button" className="location-button" onClick={onClear}>Clear Safe Place leg</button>
    {message && <p role="status">{message}</p>}
    {external && <HandoffFallbackLinks url={external.url} webFallbackUrl={external.webFallbackUrl} />}
  </section>;
}
