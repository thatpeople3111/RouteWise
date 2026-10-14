import type { ReactNode } from 'react';
import { formatDuration } from '@/lib/formatDuration';
import type { SafeWaitCandidate } from '@/lib/types';

type SafeWaitPanelProps = {
  selectedActionLabel?: string;
  status: 'loading' | 'ready' | 'error';
  best: SafeWaitCandidate | null;
  alternates: SafeWaitCandidate[];
  errorMessage?: string;
  selectedPlaceId: string | null;
  routeDetails?: ReactNode;
  onRouteHere: (place: SafeWaitCandidate) => void;
  onRetry: () => void;
};

function distanceLabel(place: SafeWaitCandidate) {
  if (place.distanceMeters === null) return null;
  return place.distanceMeters >= 1000 ? `${(place.distanceMeters / 1000).toFixed(1)} km away` : `${place.distanceMeters} m away`;
}

function SafeWaitCard({ place, prominent, selected, routeDetails, onRouteHere, selectedActionLabel }: {
  selectedActionLabel?: string;
  place: SafeWaitCandidate;
  prominent: boolean;
  selected: boolean;
  routeDetails?: ReactNode;
  onRouteHere: (place: SafeWaitCandidate) => void;
}) {
  return (
    <article className={`safe-wait-card ${prominent ? 'safe-wait-card-best' : ''}`}>
      <header className="safe-wait-card-header">
        <div className="min-w-0">
          {prominent && <span className="safe-wait-badge">RECOMMENDED</span>}
          <h3>{place.name}</h3>
          <p className="safe-wait-category">{place.category}</p>
        </div>
        <span className={`safe-wait-open ${place.openNow ? 'is-open' : place.openNow === false ? 'is-closed' : ''}`}>
          {place.openNow === true ? 'Open now' : place.openNow === false ? 'Closed now' : 'Hours unknown'}
        </span>
      </header>
      <dl className="safe-wait-facts">
        {distanceLabel(place) && <div><dt>Distance</dt><dd>{distanceLabel(place)}</dd></div>}
        {place.walkingMinutes !== null && <div><dt>Walk</dt><dd>~{formatDuration(place.walkingMinutes)}</dd></div>}
        <div><dt>Rating</dt><dd>{place.rating === null ? 'Unavailable' : place.rating.toFixed(1)}</dd></div>
      </dl>
      {place.address && <p className="safe-wait-address">{place.address}</p>}
      <button
        type="button"
        className="safe-wait-route-button"
        aria-expanded={selected}
        onClick={() => onRouteHere(place)}
      >
        {selected ? selectedActionLabel ?? 'Hide route' : 'Route me here'}
      </button>
      {selected && routeDetails}
    </article>
  );
}

export default function SafeWaitPanel({ status, best, alternates, errorMessage, selectedPlaceId, routeDetails, onRouteHere, onRetry, selectedActionLabel }: SafeWaitPanelProps) {
  return (
    <section className="safe-wait-panel" aria-labelledby="safe-wait-title">
      <h2 id="safe-wait-title">Safe Places to Wait</h2>
      <p className="safe-wait-disclaimer">
        These are recommended public places to wait, based on distance, ratings, and open hours &mdash; not a guarantee of personal safety.
      </p>

      {status === 'loading' && (
        <div className="safe-wait-status" role="status" aria-live="polite">
          <span className="planning-orb stranded-location-orb" aria-hidden="true"><span className="planning-orb-halo" /><span className="planning-orb-core" /><span className="planning-orb-glint" /></span>
          <span>Looking for nearby places to wait…</span>
        </div>
      )}

      {status === 'error' && (
        <div className="safe-wait-status is-error" role="alert">
          <span>{errorMessage ?? 'Could not search for nearby waiting locations.'}</span>
          <button type="button" className="stranded-retry" onClick={onRetry}>Try again</button>
        </div>
      )}

      {status === 'ready' && !best && (
        <p className="safe-wait-status" role="status">No suitable nearby waiting location was found.</p>
      )}

      {status === 'ready' && best && (
        <div className="safe-wait-list">
          <SafeWaitCard place={best} prominent selected={selectedPlaceId === best.placeId} routeDetails={routeDetails} onRouteHere={onRouteHere} selectedActionLabel={selectedActionLabel} />
          {alternates.filter(place => place.placeId !== best.placeId).slice(0, 2).map(place => (
            <SafeWaitCard key={place.placeId} place={place} prominent={false} selected={selectedPlaceId === place.placeId} routeDetails={routeDetails} onRouteHere={onRouteHere} selectedActionLabel={selectedActionLabel} />
          ))}
        </div>
      )}

    </section>
  );
}
