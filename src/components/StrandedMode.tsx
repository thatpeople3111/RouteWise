'use client';

import { useEffect, useState, type FormEvent } from 'react';
import StrandedResults from '@/components/StrandedResults';
import SafePlaceRoutes from '@/components/SafePlaceRoutes';
import { findSafeWaitPlaces, planTrip, resolveLocation } from '@/lib/api';
import type { SelectedTripPlace } from '@/lib/tripDraft';
import { tripRequestSchema } from '@/lib/validation';
import type { Coordinates, SafeWaitCandidate, TripInput, TripPlan } from '@/lib/types';
import { resolveCurrentLocationName } from '@/lib/currentLocation';
import type { SafePlaceContinuationContext } from '@/lib/safePlaceHandoff';

type LocationState =
  | { status: 'locating' }
  | { status: 'ready'; coordinates: Coordinates; accuracyMeters?: number }
  | { status: 'error'; message: string };

type SafeWaitState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; best: SafeWaitCandidate | null; alternates: SafeWaitCandidate[] }
  | { status: 'error'; message: string };

type StrandedModeProps = {
  onExit: () => void;
};

function locationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location permission was denied. Allow location access and try again to get help from where you are.';
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'Your current location is unavailable. Check device location services and try again.';
  }
  if (error.code === error.TIMEOUT) {
    return 'Finding your location took too long. Try again when you have a clearer signal.';
  }
  return 'Could not get your current location. Try again.';
}

export default function StrandedMode({ onExit }: StrandedModeProps) {
  const [location, setLocation] = useState<LocationState>({ status: 'locating' });
  const [locationLabel, setLocationLabel] = useState('Current location');
  const [destination, setDestination] = useState('');
  const [destinationPlace, setDestinationPlace] = useState<SelectedTripPlace | null>(null);
  const [destinationChoices, setDestinationChoices] = useState<SelectedTripPlace[]>([]);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [safeWait, setSafeWait] = useState<SafeWaitState>({ status: 'idle' });
  const [safePlaceContinuation, setSafePlaceContinuation] = useState<SafePlaceContinuationContext | null>(null);
  const currentCoordinates = location.status === 'ready' ? location.coordinates : null;
  const currentAccuracy = location.status === 'ready' ? location.accuracyMeters : undefined;
  useEffect(() => {
    let active = true;
    if (currentCoordinates) {
      void resolveCurrentLocationName(currentCoordinates, currentAccuracy).then(name => { if (active) setLocationLabel(name); });
    }
    return () => { active = false; };
  }, [currentCoordinates, currentAccuracy]);

  function retryCurrentLocation() {
    setLocationLabel('Current location');
    if (!navigator.geolocation) {
      setLocation({ status: 'error', message: 'Location is not supported by this browser.' });
      return;
    }

    setLocation({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocation({
        status: 'ready',
        coordinates: { latitude: coords.latitude, longitude: coords.longitude },
        accuracyMeters: coords.accuracy,
      }),
      geolocationError => setLocation({ status: 'error', message: locationErrorMessage(geolocationError) }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  useEffect(() => {
    let active = true;
    if (!navigator.geolocation) {
      queueMicrotask(() => {
        if (active) setLocation({ status: 'error', message: 'Location is not supported by this browser.' });
      });
      return () => { active = false; };
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!active) return;
        setLocation({
          status: 'ready',
          coordinates: { latitude: coords.latitude, longitude: coords.longitude },
          accuracyMeters: coords.accuracy,
        });
      },
      geolocationError => {
        if (active) setLocation({ status: 'error', message: locationErrorMessage(geolocationError) });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );

    return () => { active = false; };
  }, []);

  async function loadSafeWaitPlaces(coordinates: Coordinates) {
    setSafeWait({ status: 'loading' });
    try {
      const result = await findSafeWaitPlaces(coordinates);
      setSafeWait({ status: 'ready', best: result.best, alternates: result.alternates });
    } catch (failure) {
      setSafeWait({ status: 'error', message: failure instanceof Error ? failure.message : 'Could not search for nearby waiting locations.' });
    }
  }

  async function submitDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (location.status !== 'ready' || busy) return;
    setError('');
    setBusy(true);

    try {
      let selected = destinationPlace;
      if (!selected) {
        const resolved = await resolveLocation(destination, location.coordinates);
        if (!resolved.place) { setDestinationChoices(resolved.alternatives); setError('Choose a destination below, or add a more specific location.'); return; }
        selected = resolved.place; setDestinationPlace(selected);
      }
      const request: TripInput = tripRequestSchema.parse({
        origin: location.coordinates,
        destination: { placeId: selected.placeId },
        departureTime: new Date().toISOString(),
        budgetUsd: 1000,
        maxWalkingMinutes: 180,
        hasCar: false,
        hasBike: false,
        allowTransit: true,
        allowWalking: true,
        preference: 'fastest',
        nearbyCategories: [],
        // Marks the request's origin for the backend since the trip schema has no dedicated source field.
        notes: 'RouteWise Stranded mode request.',
      });
      const result = await planTrip(request, { skip: true }, null);
      setPlan(result);
      void loadSafeWaitPlaces(location.coordinates);
    } catch (failure) {
      console.error('[RouteWise stranded mode] Emergency trip request failed.', failure);
      setError(failure instanceof Error ? failure.message : 'Could not find a route. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (plan && location.status === 'ready') {
    return (
      <div className="stranded-results">
        <button className="stranded-back" type="button" onClick={() => { setSafePlaceContinuation(null); setPlan(null); }}>
          <span aria-hidden="true">←</span> Back to destination
        </button>
        <div className="stranded-results-meta" role="status">
          <span className="stranded-ready-dot" aria-hidden="true" />
          <span className="stranded-current-location">{locationLabel}</span>
          <span aria-hidden="true" className="stranded-meta-sep">·</span>
          <span className="stranded-meta-destination">Destination: <strong>{destination.trim()}</strong></span>
        </div>
        <StrandedResults
          safePlaceContinuation={safePlaceContinuation}
          navigation={{
            origin: { ...location.coordinates, label: locationLabel },
            destination: destinationPlace ?? undefined,
          }}
          plan={plan}
          origin={location.coordinates}
          destination={destinationPlace ? { placeId: destinationPlace.placeId } : { address: destination.trim() }}
          safePlaces={(
            <SafePlaceRoutes
              onContinuationChange={setSafePlaceContinuation}
              continuationRoutes={plan.routes}
              originalDestination={destinationPlace ?? undefined}
              origin={location.coordinates}
              status={safeWait.status === 'idle' ? 'loading' : safeWait.status}
              best={safeWait.status === 'ready' ? safeWait.best : null}
              alternates={safeWait.status === 'ready' ? safeWait.alternates : []}
              errorMessage={safeWait.status === 'error' ? safeWait.message : undefined}
              onRetry={() => loadSafeWaitPlaces(location.coordinates)}
            />
          )}
        />
      </div>
    );
  }

  return (
    <section className="stranded-panel" aria-labelledby="stranded-title">
      <header className="stranded-panel-header">
        <div className="stranded-signal" aria-hidden="true"><span>!</span></div>
        <div className="min-w-0">
          <p className="stranded-eyebrow">ROUTEWISE PRIORITY</p>
          <h2 id="stranded-title">I’m stranded</h2>
          <p className="stranded-copy">We’ll use your current location to find a way out.</p>
        </div>
        <button className="stranded-close" type="button" onClick={onExit} aria-label="Exit stranded mode">×</button>
      </header>
      <div className={`stranded-location-state ${location.status === 'error' ? 'is-error' : ''}`} role="status" aria-live="polite">
        {location.status === 'locating' && <><span className="planning-orb stranded-location-orb" aria-hidden="true"><span className="planning-orb-halo" /><span className="planning-orb-core" /><span className="planning-orb-glint" /></span>Getting your current location…</>}
        {location.status === 'ready' && <><span className="stranded-ready-dot" aria-hidden="true" /><span className="stranded-current-location">{locationLabel}</span></>}
        {location.status === 'error' && <span role="alert">{location.message}</span>}
      </div>
      {location.status === 'error' && <button className="stranded-retry" type="button" onClick={retryCurrentLocation}>Try location again</button>}
      {location.status === 'ready' && (
        <form className="stranded-form" onSubmit={submitDestination}>
          <label className="stranded-field" htmlFor="stranded-destination">
            <span>Where do you need to get to?</span>
            <input id="stranded-destination" autoComplete="street-address" maxLength={300} minLength={2} placeholder="Enter a destination" required value={destination} disabled={busy}
              onChange={event => { setDestination(event.target.value); setDestinationPlace(null); setDestinationChoices([]); setError(''); }} />
          </label>
          {destinationPlace && <p className="field-hint">{destinationPlace.name} · {destinationPlace.formattedAddress}</p>}
          {destinationChoices.map(place => <button type="button" className="stranded-retry" key={place.placeId} onClick={() => { setDestinationPlace(place); setDestinationChoices([]); setError(''); }}>{place.name} · {place.formattedAddress}</button>)}
          {error && <p className="stranded-error" role="alert">{error}</p>}
          {busy && <div className="stranded-location-state" role="status" aria-live="polite">
            <span className="planning-orb stranded-location-orb" aria-hidden="true"><span className="planning-orb-halo" /><span className="planning-orb-core" /><span className="planning-orb-glint" /></span>
            Calculating the fastest way out…
          </div>}
          <button className="stranded-submit" type="submit" disabled={busy || destination.trim().length < 2}>
            <span>{busy ? 'Please wait…' : 'Find My Way'}</span><span aria-hidden="true">↗</span>
          </button>
        </form>
      )}
    </section>
  );
}

