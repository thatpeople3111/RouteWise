'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { Coordinates } from '@/lib/types';
import type { TripDraft } from '@/lib/tripDraft';

type TripDetailsScreenProps = {
	draft: TripDraft;
	onChange: (patch: Partial<TripDraft>) => void;
	onBack: () => void;
	onContinue: () => void;
};

function toLocalDateTime(date: Date) {
	return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function TripDetailsScreen({ draft, onChange, onBack, onContinue }: TripDetailsScreenProps) {
	const locationRequest = useRef(0);
	const [locationMessage, setLocationMessage] = useState('');
	const [gettingLocation, setGettingLocation] = useState(false);
	const [error, setError] = useState('');

	function useCurrentLocation() {
		if (!navigator.geolocation) {
			setLocationMessage('Location is not supported by this browser. Enter a starting point below.');
			return;
		}
		const requestId = ++locationRequest.current;
		setGettingLocation(true);
		setLocationMessage('Getting your current location...');
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				if (requestId !== locationRequest.current) return;
				const current: Coordinates = { latitude: coords.latitude, longitude: coords.longitude };
				onChange({
					originCoordinates: current,
					originText: `Current location (${current.latitude.toFixed(4)}, ${current.longitude.toFixed(4)})`,
				});
				setLocationMessage('Using your current location. Coordinates are saved with this trip.');
				setGettingLocation(false);
			},
			locationError => {
				if (requestId !== locationRequest.current) return;
				onChange({ originCoordinates: null });
				const locationMessages: Record<number, string> = {
					1: 'Location permission was denied. Allow access or enter a starting point below.',
					2: 'Your location is unavailable right now. Check device location services or enter a starting point.',
					3: 'The location request timed out. Try again or enter a starting point below.',
				};
				setLocationMessage(locationMessages[locationError.code] ?? 'Could not get your location. Enter a starting point below.');
				setGettingLocation(false);
			},
			{ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
		);
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (gettingLocation) return;
		setError('');

		const hasOrigin = draft.originCoordinates !== null || draft.originText.trim().length >= 2;
		if (!hasOrigin) { setError('Enter your starting location.'); return; }
		if (draft.destinationText.trim().length < 2) { setError('Enter your destination.'); return; }
		const date = draft.departureNow && draft.scheduleMode === 'departure' ? new Date() : new Date(draft.scheduleTime);
		if (!Number.isFinite(date.getTime())) { setError('Choose a departure or arrival time.'); return; }
		if (!draft.departureNow && date.getTime() <= Date.now()) { setError('Choose a time in the future.'); return; }
		if (date.getTime() > Date.now() + 7 * 86400000) { setError('Choose a time within the next seven days.'); return; }
		onContinue();
	}

	return (
		<div className="planner-layout">
			<form className="trip-form" onSubmit={handleSubmit} onChange={() => setError('')}>
				<fieldset className="form-controls" disabled={gettingLocation}>
					<legend className="sr-only">Trip details</legend>
					<div className="form-topline">
						<div>
							<span className="eyebrow">YOUR NEXT TRIP</span>
							<h2>Plan your trip</h2>
						</div>
						<span className="step-count">Step 1 <span>/ 2</span></span>
					</div>
					<p className="step-progress" aria-hidden="true"><span className="step-dot is-active" /> Trip details <span className="step-sep">→</span> <span className="step-dot" /> Preferences</p>

					<section className="form-section location-section" aria-labelledby="locations-title">
						<div className="section-heading">
							<span className="section-index">A</span>
							<h3 id="locations-title">Where are you?</h3>
						</div>
						<div className="location-fields">
							<label className="field location-field">
								<span className="field-label">Starting point</span>
								<span className="input-with-action">
									<input
										aria-label="Starting point"
										minLength={2}
										maxLength={300}
										autoComplete="street-address"
										value={draft.originText}
										onChange={event => {
											locationRequest.current += 1;
											setGettingLocation(false);
											onChange({ originText: event.target.value, originCoordinates: null });
											setLocationMessage('');
										}}
										placeholder={draft.originCoordinates ? 'Current location selected' : 'Enter a starting place'}
										required={!draft.originCoordinates}
									/>
									<button className="location-button" type="button" onClick={useCurrentLocation} disabled={gettingLocation}>
										{gettingLocation ? 'Locating…' : 'Use my location'}
									</button>
								</span>
								<span className="field-hint" role="status">{locationMessage || 'Your location stays in this trip request.'}</span>
							</label>
							<label className="field">
								<span className="field-label">Where do you want to go?</span>
								<input
									aria-label="Destination"
									minLength={2}
									maxLength={300}
									autoComplete="off"
									value={draft.destinationText}
									onChange={event => onChange({ destinationText: event.target.value })}
									placeholder="Place, neighborhood, or landmark"
									required
								/>
								<span className="field-hint">A name is enough; no street address needed.</span>
							</label>
						</div>
					</section>

					<section className="form-section schedule-section" aria-labelledby="schedule-title">
						<div className="section-heading">
							<span className="section-index">B</span>
							<h3 id="schedule-title">When?</h3>
						</div>
						<div className="schedule-controls">
							<div className="schedule-mode" role="group" aria-label="Choose arrival or departure">
								<button type="button" aria-pressed={draft.scheduleMode === 'departure'} onClick={() => onChange({ scheduleMode: 'departure' })}>Leave at</button>
								<button type="button" aria-pressed={draft.scheduleMode === 'arrival'} onClick={() => onChange({ scheduleMode: 'arrival', departureNow: false })}>Arrive by</button>
							</div>
							<label className="field time-field">
								<span className="field-label">{draft.scheduleMode === 'arrival' ? 'Arrive by' : 'Leave at'}</span>
								<span className="time-input-row">
									<input
										type="datetime-local"
										value={draft.scheduleTime}
										onChange={event => onChange({ scheduleTime: event.target.value, departureNow: false })}
										required
									/>
									{draft.scheduleMode === 'departure' && (
										<button
											type="button"
											className="now-button"
											aria-pressed={draft.departureNow}
											onClick={() => onChange({ scheduleTime: toLocalDateTime(new Date()), departureNow: true })}
										>
											Now
										</button>
									)}
								</span>
							</label>
						</div>
						<p className="field-hint timezone-hint">Choose a time within the next seven days, in your device&apos;s local time zone.</p>
					</section>

					<div className="form-footer">
						<button type="button" className="location-button back-button" onClick={onBack}>Back</button>
						<button className="submit-button" type="submit" disabled={gettingLocation}>
							<span>Continue</span>
							<span aria-hidden="true">↗</span>
						</button>
					</div>
				</fieldset>
				{error && <p className="form-error" role="alert">{error}</p>}
			</form>
		</div>
	);
}
