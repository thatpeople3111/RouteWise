import type { SafeWaitCandidate } from '@/lib/types';

type SafeWaitPanelProps = {
  status: 'loading' | 'ready' | 'error';
  best: SafeWaitCandidate | null;
  alternates: SafeWaitCandidate[];
  errorMessage?: string;
  busyPlaceId: string | null;
  routeError: string;
  onRouteHere: (place: SafeWaitCandidate) => void;
  onRetry: () => void;
};

function distanceLabel(place: SafeWaitCandidate) {
  if (place.distanceMeters === null) return null;
  return place.distanceMeters >= 1000 ? `${(place.distanceMeters / 1000).toFixed(1)} km away` : `${place.distanceMeters} m away`;
}

function SafeWaitCard({ place, prominent, busy, onRouteHere }: {
  place: SafeWaitCandidate;
  prominent: boolean;
  busy: boolean;
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
        {place.walkingMinutes !== null && <div><dt>Walk</dt><dd>~{place.walkingMinutes} min</dd></div>}
        <div><dt>Rating</dt><dd>{place.rating === null ? 'Unavailable' : place.rating.toFixed(1)}</dd></div>
      </dl>
      {place.address && <p className="safe-wait-address">{place.address}</p>}
      <button
        type="button"
        className="safe-wait-route-button"
        disabled={busy}
        onClick={() => onRouteHere(place)}
      >
        {busy ? 'Routing…' : 'Route Me Here'}
      </button>
    </article>
  );
}

export default function SafeWaitPanel({ status, best, alternates, errorMessage, busyPlaceId, routeError, onRouteHere, onRetry }: SafeWaitPanelProps) {
  return (
    <section className="safe-wait-panel" aria-labelledby="safe-wait-title">
      <h2 id="safe-wait-title">Safe Place to Wait Nearby</h2>
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
          <SafeWaitCard place={best} prominent busy={busyPlaceId === best.placeId} onRouteHere={onRouteHere} />
          {alternates.map(place => (
            <SafeWaitCard key={place.placeId} place={place} prominent={false} busy={busyPlaceId === place.placeId} onRouteHere={onRouteHere} />
          ))}
        </div>
      )}

      {routeError && <p className="stranded-error" role="alert">{routeError}</p>}
    </section>
  );
}
