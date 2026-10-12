import type { ReactNode } from 'react';
import RouteCard from './RouteCard';
import RideshareOptions, { rideshareLabelsById } from './RideshareOptions';
import type { Location, TripPlan } from '@/lib/types';

/** Stranded presentation reuses the existing route cards and factual plan data. */
export default function StrandedResults({ plan, origin, destination, safePlaces }: {
  plan: TripPlan;
  origin: Location;
  destination: Location;
  safePlaces?: ReactNode;
}) {
  return (
    <div className="stranded-priority-results">
      <RideshareOptions options={plan.rideshares ?? []} labelsById={rideshareLabelsById(plan)} variant="stranded" />
      {safePlaces}
      {(['TRANSIT', 'WALK'] as const).map(mode => (
        <section key={mode} className="stranded-group" aria-labelledby={`stranded-${mode}-title`}>
          <h2 id={`stranded-${mode}-title`} className="stranded-group-label">{mode === 'TRANSIT' ? 'PUBLIC TRANSIT' : 'WALKING'}</h2>
          <div className="grid min-w-0 gap-4">
            {plan.routes.filter(route => route.mode === mode).map(route => (
              <RouteCard key={route.id} route={route} origin={origin} destination={destination} variant="stranded" />
            ))}
            {!plan.routes.some(route => route.mode === mode) && <p role="status">No {mode === 'TRANSIT' ? 'public transit' : 'walking'} route was returned for this trip.</p>}
          </div>
        </section>
      ))}
      {plan.warnings.length > 0 && <ul className="stranded-result-warnings">{plan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      {plan.attribution && <p className="text-xs">{plan.attribution}</p>}
    </div>
  );
}
