'use client';

import { useEffect, useState, type FormEvent } from 'react';
import RouteResults from '@/components/RouteResults';
import RideshareOptions from '@/components/RideshareOptions';
import SafeWaitPanel from '@/components/SafeWaitPanel';
import { findSafeWaitPlaces, planTrip } from '@/lib/api';
import { tripRequestSchema } from '@/lib/validation';
import type { Coordinates, SafeWaitCandidate, TripInput, TripPlan } from '@/lib/types';

type LocationState =
  | { status: 'locating' }
  | { status: 'ready'; coordinates: Coordinates }
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
  const [destination, setDestination] = useState('');
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [safeWait, setSafeWait] = useState<SafeWaitState>({ status: 'idle' });
  const [waitPlan, setWaitPlan] = useState<{ plan: TripPlan; place: SafeWaitCandidate } | null>(null);
  const [waitBusyPlaceId, setWaitBusyPlaceId] = useState<string | null>(null);
  const [waitError, setWaitError] = useState('');

  function retryCurrentLocation() {
    if (!navigator.geolocation) {
      setLocation({ status: 'error', message: 'Location is not supported by this browser.' });
      return;
    }

    setLocation({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocation({
        status: 'ready',
        coordinates: { latitude: coords.latitude, longitude: coords.longitude },
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
      const request: TripInput = tripRequestSchema.parse({
        origin: location.coordinates,
        destination: { address: destination.trim() },
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

  async function routeToWaitPlace(place: SafeWaitCandidate) {
    if (location.status !== 'ready' || waitBusyPlaceId) return;
    setWaitError('');
    setWaitBusyPlaceId(place.placeId);

    try {
      const request: TripInput = tripRequestSchema.parse({
        origin: location.coordinates,
        destination: place.coordinates ?? { address: place.address ?? place.name },
        departureTime: new Date().toISOString(),
        budgetUsd: 1000,
        maxWalkingMinutes: 180,
        hasCar: false,
        hasBike: false,
        allowTransit: true,
        allowWalking: true,
        preference: 'fastest',
        nearbyCategories: [],
        notes: 'RouteWise Stranded mode request: temporary route to a nearby safe waiting place.',
      });
      const result = await planTrip(request, { skip: true }, null);
      setWaitPlan({ plan: result, place });
    } catch (failure) {
      setWaitError(failure instanceof Error ? failure.message : 'Could not route to this location. Try again.');
    } finally {
      setWaitBusyPlaceId(null);
    }
  }

  if (plan && location.status === 'ready') {
    if (waitPlan) {
      return (
        <div className="stranded-results">
          <button className="stranded-back" type="button" onClick={() => setWaitPlan(null)}>
            <span aria-hidden="true">←</span> Continue to {destination.trim()}
          </button>
          <div className="stranded-results-meta" role="status">
            <span className="stranded-ready-dot" aria-hidden="true" />
            <span className="stranded-current-location">Current Location</span>
            <span aria-hidden="true" className="stranded-meta-sep">·</span>
            <span className="stranded-meta-destination">Original destination saved: <strong>{destination.trim()}</strong></span>
          </div>
          <p className="safe-wait-active-banner" role="status">
            Temporary route to {waitPlan.place.name}. Use the button above to continue to your original destination.
          </p>
          <RouteResults
            plan={waitPlan.plan}
            origin={location.coordinates}
            destination={waitPlan.place.coordinates ?? { address: waitPlan.place.address ?? waitPlan.place.name }}
            onEditTrip={() => setWaitPlan(null)}
          />
        </div>
      );
    }

    return (
      <div className="stranded-results">
        <button className="stranded-back" type="button" onClick={() => setPlan(null)}>
          <span aria-hidden="true">←</span> Back to destination
        </button>
        <div className="stranded-results-meta" role="status">
          <span className="stranded-ready-dot" aria-hidden="true" />
          <span className="stranded-current-location">Current Location</span>
          <span aria-hidden="true" className="stranded-meta-sep">·</span>
          <span className="stranded-meta-destination">Destination: <strong>{destination.trim()}</strong></span>
        </div>

        <section className="stranded-group" aria-labelledby="stranded-group-destination-title">
          <p className="stranded-group-label" id="stranded-group-destination-title">GET TO DESTINATION</p>
          <RouteResults
            plan={plan}
            origin={location.coordinates}
            destination={{ address: destination.trim() }}
            onEditTrip={() => setPlan(null)}
          />
          <RideshareOptions pickup={location.coordinates} destinationLabel={destination.trim()} />
        </section>

        <div className="stranded-divider" role="separator" aria-hidden="true"><span>OR</span></div>

        <section className="stranded-group" aria-labelledby="stranded-group-wait-title">
          <p className="stranded-group-label" id="stranded-group-wait-title">WAIT SOMEWHERE NEARBY</p>
          <SafeWaitPanel
            status={safeWait.status === 'idle' ? 'loading' : safeWait.status}
            best={safeWait.status === 'ready' ? safeWait.best : null}
            alternates={safeWait.status === 'ready' ? safeWait.alternates : []}
            errorMessage={safeWait.status === 'error' ? safeWait.message : undefined}
            busyPlaceId={waitBusyPlaceId}
            routeError={waitError}
            onRouteHere={routeToWaitPlace}
            onRetry={() => loadSafeWaitPlaces(location.coordinates)}
          />
        </section>
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
        {location.status === 'ready' && <><span className="stranded-ready-dot" aria-hidden="true" /><span className="stranded-current-location">Current Location</span></>}
        {location.status === 'error' && <span role="alert">{location.message}</span>}
      </div>

      {location.status === 'error' && (
        <button className="stranded-retry" type="button" onClick={retryCurrentLocation}>
          Try location again
        </button>
      )}

      {location.status === 'ready' && (
        <form className="stranded-form" onSubmit={submitDestination}>
          <label className="stranded-field" htmlFor="stranded-destination">
            <span>Where do you need to get to?</span>
            <input
              id="stranded-destination"
              autoComplete="street-address"
              maxLength={300}
              minLength={2}
              placeholder="Enter a destination"
              required
              value={destination}
              onChange={event => { setDestination(event.target.value); setError(''); }}
            />
          </label>
          {error && <p className="stranded-error" role="alert">{error}</p>}
          {busy && (
            <div className="stranded-location-state" role="status" aria-live="polite">
              <span className="planning-orb stranded-location-orb" aria-hidden="true"><span className="planning-orb-halo" /><span className="planning-orb-core" /><span className="planning-orb-glint" /></span>
              Calculating the fastest way out…
            </div>
          )}
          <button className="stranded-submit" type="submit" disabled={busy || destination.trim().length < 2}>
            <span>{busy ? 'Please wait…' : 'Find My Way'}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </form>
      )}
    </section>
  );
}
