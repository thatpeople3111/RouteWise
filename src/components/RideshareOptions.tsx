'use client';

import RideshareCard from '@/components/RideshareCard';
import type { RouteCardLabel } from '@/components/RouteCard';
import type { RideshareOption, TripPlan } from '@/lib/types';
import type { RideshareNavigationEndpoints } from '@/lib/rideshareProviderAction';

type RideshareOptionsProps = {
  endpoints?: RideshareNavigationEndpoints;
  preferred?: boolean;
  options: RideshareOption[];
  labelsById?: Partial<Record<string, readonly RouteCardLabel[]>>;
  variant?: 'results' | 'stranded';
};

/** Maps plan rankings onto option IDs so a winning rideshare can display its BEST/FASTEST labels. */
export function rideshareLabelsById(
  plan: Pick<TripPlan, 'best' | 'fastest' | 'cheapest'>,
): Partial<Record<string, RouteCardLabel[]>> {
  const labels: Partial<Record<string, RouteCardLabel[]>> = {};
  const rankings: { id: string | null; label: RouteCardLabel }[] = [
    { id: plan.best, label: 'BEST' },
    { id: plan.fastest, label: 'FASTEST' },
    { id: plan.cheapest, label: 'CHEAPEST' },
  ];
  for (const ranking of rankings) {
    if (!ranking.id) continue;
    labels[ranking.id] = [...(labels[ranking.id] ?? []), ranking.label];
  }
  return labels;
}

/**
 * Renders the backend-supplied rideshare options for a trip. Available providers show estimated
 * price/time plus an open-provider action; unavailable providers stay visible with the reason.
 */
export default function RideshareOptions({ options, labelsById = {}, variant = 'results', headingId = 'rideshare-options-heading', preferred = false, endpoints }: RideshareOptionsProps & { headingId?: string }) {
  const orderedOptions = [...options.filter(option => option.provider !== 'WAYMO' || option.available),
    ...options.filter(option => option.provider === 'WAYMO' && !option.available)];
  if (variant === 'stranded') {
    return (
      <section className="rideshare-panel" aria-labelledby="rideshare-title">
        <h2 id="rideshare-title">Rideshare Options</h2>
        {endpoints?.context === 'STRANDED_RESUME' && <p className="field-hint">Rideshare pickup now uses your Safe Place or refreshed position, with your original destination as drop-off. Displayed prices and times remain estimates from the original trip; confirm updated details in the provider app.</p>}
        <p className="rideshare-disclaimer">
          An additional way to get there. Fares shown here are estimates unless marked as provider prices — exact pricing, vehicle availability, and pickup time are shown by each app once you open it.
        </p>
        {options.length === 0 && (
          <p className="rideshare-status" role="status">No rideshare options could be prepared right now.</p>
        )}
        {options.length > 0 && (
          <div className="rideshare-list">
            {orderedOptions.map(option => (
              <RideshareCard
                key={option.id}
                option={option}
                labels={labelsById[option.id] ?? []}
                variant="stranded"
                endpoints={endpoints}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  if (options.length === 0) return null;

  return (
    <section className="rideshare-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xs font-bold uppercase tracking-wide text-[#68766f]">Rideshare options</h2>
      {preferred && <p className="field-hint">Your preferred mode</p>}
      <p className="rideshare-section-disclaimer">
        Another way to make this trip. Fares are RouteWise estimates, not live provider quotes; exact pricing and pickup are confirmed in each provider&apos;s app.
      </p>
      <div className="rideshare-grid">
        {orderedOptions.map(option => (
          <RideshareCard
            key={option.id}
            option={option}
            labels={labelsById[option.id] ?? []}
            variant="results"
            endpoints={endpoints}
          />
        ))}
      </div>
    </section>
  );
}

