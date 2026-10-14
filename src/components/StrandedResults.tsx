import type { ReactNode } from 'react';
import RouteCard from './RouteCard';
import RideshareOptions, { rideshareLabelsById } from './RideshareOptions';
import type { Location, TripPlan } from '@/lib/types';
import { getGlobalWarnings } from '@/lib/routeWarnings';
import { partitionLocalRoutes } from '@/lib/routeAvailability';
import NonRecommendedRoutes from './NonRecommendedRoutes';
import type { NormalNavigationEndpoints } from '@/lib/startNavigation';
import { safePlaceRideEndpoints, safePlaceRideshareOptions, type SafePlaceContinuationContext } from '@/lib/safePlaceHandoff';

/** Stranded presentation reuses the existing route cards and factual plan data. */
export default function StrandedResults({ plan, origin, destination, safePlaces, navigation = {}, safePlaceContinuation }: {
  safePlaceContinuation?: SafePlaceContinuationContext | null;
  navigation?: NormalNavigationEndpoints;
  plan: TripPlan;
  origin: Location;
  destination: Location;
  safePlaces?: ReactNode;
}) {
  const strandedNavigation: NormalNavigationEndpoints = safePlaceContinuation ? {
    ...navigation, context: 'STRANDED_RESUME',
    origin: safePlaceRideEndpoints(safePlaceContinuation).pickup,
    destination: safePlaceContinuation.originalDestination,
    safePlace: safePlaceContinuation.activeSafePlace,
  } : { ...navigation, context: 'STRANDED' };
  const pageWarnings = getGlobalWarnings(plan, plan.routes.filter(route => route.mode === 'TRANSIT' || route.mode === 'WALK'));
  const { available, restricted } = partitionLocalRoutes(plan.routes.filter(route => route.mode === 'TRANSIT' || route.mode === 'WALK'));
  return (
    <div className="stranded-priority-results">
      <RideshareOptions options={safePlaceContinuation ? safePlaceRideshareOptions(safePlaceContinuation, plan.rideshares ?? []) : plan.rideshares ?? []}
        endpoints={safePlaceContinuation ? safePlaceRideEndpoints(safePlaceContinuation) : undefined}
        labelsById={rideshareLabelsById(plan)} variant="stranded" />
      {safePlaces}
      {(['TRANSIT', 'WALK'] as const).filter(mode => available.some(route => route.mode === mode)).map(mode => (
        <section key={mode} className="stranded-group" aria-labelledby={`stranded-${mode}-title`}>
          <h2 id={`stranded-${mode}-title`} className="stranded-group-label">{mode === 'TRANSIT' ? 'PUBLIC TRANSIT' : 'WALKING'}</h2>
          <div className="grid min-w-0 gap-4">
            {available.filter(route => route.mode === mode).map(route => (
              <RouteCard key={route.id} route={route} origin={origin} destination={destination} variant="stranded" navigation={strandedNavigation} />
            ))}
          </div>
        </section>
      ))}
      {pageWarnings.length > 0 && <ul className="stranded-result-warnings">{pageWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      <NonRecommendedRoutes routes={restricted} origin={origin} destination={destination} variant="stranded" navigation={strandedNavigation} />
      {plan.attribution && <p className="text-xs">{plan.attribution}</p>}
    </div>
  );
}
