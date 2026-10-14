'use client';

import { useState } from 'react';
import { canStartRoute, prepareNormalRouteNavigation } from '@/lib/startNavigation';
import type { NormalRouteNavigationInput } from '@/lib/startNavigation';
import { openExternalHandoff } from '@/lib/externalHandoff';
import HandoffFallbackLinks from './HandoffFallbackLinks';

const pointName = (point: { label?: string; address?: string; latitude: number; longitude: number }) =>
  point.label ?? point.address ?? `${point.latitude}, ${point.longitude}`;

export default function RouteStart(props: NormalRouteNavigationInput) {
  const [error, setError] = useState('');
  const [handoff, setHandoff] = useState<ReturnType<typeof prepareNormalRouteNavigation> | null>(null);
  if (!canStartRoute(props.route)) return null;
  function start() {
    try {
      const result = prepareNormalRouteNavigation(props);
      setError('');
      setHandoff(result);
      // Open directly within the click, without awaiting work, and keep the trip in this tab.
      const opened = openExternalHandoff(result.url);
      if (opened.message) setError(opened.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open navigation. Please try again.');
    }
  }
  function walkFromParking() {
    if (!handoff?.continuation) return;
    try {
      const result = prepareNormalRouteNavigation({
        route: { ...props.route, id: `${props.route.id}-parking-walk`, mode: 'WALK', label: 'Walking', includesStop: false },
        origin: handoff.continuation.origin, destination: handoff.continuation.destination,
      });
      // Preserve the complete driving itinerary/omission metadata while offering the walk link.
      setHandoff({ ...handoff, url: result.url, webFallbackUrl: result.webFallbackUrl });
      setError('');
      const opened = openExternalHandoff(result.url);
      if (opened.message) setError(opened.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open walking directions.');
    }
  }
  return <div className="mt-3">
    <button type="button" className="submit-button min-h-11" aria-label={`Start ${props.route.label} route`} onClick={start}>Start</button>
    <p className="mt-1 text-xs text-[#68766f]">Opens Maps. Keep your RouteWise itinerary for stops and any walking continuation.</p>
    {props.route.mode === 'TRANSIT' && <p className="mt-1 text-xs text-[#68766f]">Your navigation app may recalculate the exact transit combination.</p>}
    {handoff && <div className="mt-2 text-xs text-[#43534b]" role="status">
      <HandoffFallbackLinks url={handoff.url} webFallbackUrl={handoff.webFallbackUrl} />
      {(!handoff.exactRepresentation || handoff.transit) && <p>Your navigation app may simplify this trip. Your full RouteWise itinerary is still shown here.</p>}
      {handoff.transit && handoff.request.requestedTiming && <p>
        Requested {handoff.request.requestedTiming.kind === 'DEPARTURE' ? 'departure' : 'arrival'}: {new Date(handoff.request.requestedTiming.time).toLocaleString()}. Set this time in Maps; it could not be preloaded.
      </p>}
      {handoff.omittedStops.length > 0 && <p>Some RouteWise stops could not be preloaded into this navigation app.</p>}
      {(handoff.omittedStops.length > 0 || handoff.continuation) && <>
        <p className="mt-1">Your itinerary: {[handoff.request.origin, ...handoff.request.orderedStops, handoff.request.destination].map(pointName).join(' → ')}</p>
        {handoff.continuation && <>
          <p className="mt-1">Drive to {pointName(handoff.continuation.origin)}, then walk to {pointName(handoff.continuation.destination)}.</p>
          <button type="button" className="location-button mt-2" onClick={walkFromParking}>Walking directions from parking</button>
        </>}
      </>}
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
