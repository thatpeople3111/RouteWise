'use client';

import { useRef, useState, type FormEvent } from 'react';
import { tripRequestSchema } from '@/lib/validation';
import type { Coordinates, TripInput, TripRequest } from '@/lib/types';

type ScheduleMode = 'arrival' | 'departure';

type TripFormProps = {
	onSubmitTrip: (trip: TripInput) => void;
};

function toLocalDateTime(date: Date) {
	return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function TripForm({ onSubmitTrip }: TripFormProps) {
	const locationRequest = useRef(0);
	const [allowWalking, setAllowWalking] = useState(true);
	const [origin, setOrigin] = useState<Coordinates | null>(null);
	const [originText, setOriginText] = useState('');
	const [locationMessage, setLocationMessage] = useState('');
	const [gettingLocation, setGettingLocation] = useState(false);
	const [destination, setDestination] = useState('');
	const [budget, setBudget] = useState('25.00');
	const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('departure');
	const [scheduleTime, setScheduleTime] = useState('');
	const [departureNow, setDepartureNow] = useState(false);
	const [walkingLimit, setWalkingLimit] = useState('15');
	const [hasCar, setHasCar] = useState(false);
	const [avoidTolls, setAvoidTolls] = useState(false);
	const [allowTransit, setAllowTransit] = useState(true);
	const [notes, setNotes] = useState('');
	const [error, setError] = useState('');

	function useCurrentLocation() {
		if (!navigator.geolocation) {
			setLocationMessage('Location is not supported by this browser. Enter a starting point below.');
			return;
		}
		const requestId = ++locationRequest.current;
		const hadCurrentLocation = origin !== null;
		if (hadCurrentLocation) {
			setOrigin(null);
			setOriginText('');
		}
		setGettingLocation(true);
		setLocationMessage('Getting your current location...');
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				if (requestId !== locationRequest.current) return;
				const current = { latitude: coords.latitude, longitude: coords.longitude };
				setOrigin(current);
				setOriginText(`Current location (${current.latitude.toFixed(4)}, ${current.longitude.toFixed(4)})`);
				setLocationMessage('Using your current location. Coordinates are saved with this trip.');
				setGettingLocation(false);
			},
			locationError => {
				if (requestId !== locationRequest.current) return;
				setOrigin(null);
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

	function submitTrip(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (gettingLocation) return;
		setError('');

		try {
			const date = departureNow && scheduleMode === 'departure' ? new Date() : new Date(scheduleTime);
			if (!Number.isFinite(date.getTime()) || (!departureNow && date.getTime() <= Date.now()) || date.getTime() > Date.now() + 7 * 86400000) {
				throw new Error('Choose a time in the future and within the next seven days.');
			}
			if ((!origin && originText.trim().length < 2) || destination.trim().length < 2) {
				throw new Error('Enter a starting point and destination with at least two characters each.');
			}
			const timestamp = date.toISOString();
			const request: TripRequest = {
				origin: origin ?? { address: originText.trim() },
				destination: { address: destination.trim() },
				...(scheduleMode === 'arrival' ? { arrivalTime: timestamp } : { departureTime: timestamp }),
				budgetUsd: Number(budget),
				maxWalkingMinutes: allowWalking ? Number(walkingLimit) : 0,
				hasCar,
				avoidTolls: hasCar && avoidTolls,
				allowTransit,
				allowWalking,
				preference: 'balanced',
				nearbyCategories: [],
				...(notes.trim() ? { notes: notes.trim() } : {}),
			};

			const validated = tripRequestSchema.safeParse(request);
			if (!validated.success) throw new Error(validated.error.issues[0].message);
			onSubmitTrip(validated.data);
		} catch (submissionError) {
			setError(submissionError instanceof Error ? submissionError.message : 'Could not reach the RouteWise planner.');
		}
	}

	return (
		<div className="planner-layout">
			<form className="trip-form" onSubmit={submitTrip} onChange={() => setError('')} onClick={event => { if ((event.target as HTMLElement).closest('button[type="button"]')) setError(''); }}>
				<fieldset className="form-controls" disabled={gettingLocation}>
					<legend className="sr-only">Trip details</legend>
					<div className="form-topline">
						<div>
							<span className="eyebrow">YOUR NEXT TRIP</span>
							<h2>Set the essentials</h2>
						</div>
						<span className="step-count">01 <span>/ 01</span></span>
					</div>

					<section className="form-section location-section" aria-labelledby="locations-title">
						<div className="section-heading">
							<span className="section-index">A</span>
							<h3 id="locations-title">From and to</h3>
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
										value={originText}
										onChange={event => {
											locationRequest.current += 1;
											setGettingLocation(false);
											setOriginText(event.target.value);
											setOrigin(null);
											setLocationMessage('');
										}}
										placeholder={origin ? 'Current location selected' : 'Enter a starting place'}
										required={!origin}
									/>
									<button className="location-button" type="button" onClick={useCurrentLocation} disabled={gettingLocation}>
										{gettingLocation ? 'Locating…' : 'Use my location'}
									</button>
								</span>
								<span className="field-hint" role="status">{locationMessage || 'Your location stays in this trip request.'}</span>
							</label>
							<label className="field">
								<span className="field-label">Destination</span>
								<input
									aria-label="Destination"
									minLength={2}
									maxLength={300}
									autoComplete="off"
									value={destination}
									onChange={event => setDestination(event.target.value)}
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
							<h3 id="schedule-title">When are you going?</h3>
						</div>
						<div className="schedule-controls">
							<div className="schedule-mode" role="group" aria-label="Choose arrival or departure">
								<button type="button" aria-pressed={scheduleMode === 'departure'} onClick={() => setScheduleMode('departure')}>Depart</button>
								<button type="button" aria-pressed={scheduleMode === 'arrival'} onClick={() => { setScheduleMode('arrival'); setDepartureNow(false); }}>Arrive</button>
							</div>
							<label className="field time-field">
								<span className="field-label">{scheduleMode === 'arrival' ? 'Arrive by' : 'Leave at'}</span>
								<span className="time-input-row">
									<input
										type="datetime-local"
										value={scheduleTime}
										onChange={event => { setScheduleTime(event.target.value); setDepartureNow(false); }}
										required
									/>
									{scheduleMode === 'departure' && (
										<button
											type="button"
											className="now-button"
											aria-pressed={departureNow}
											onClick={() => { setScheduleTime(toLocalDateTime(new Date())); setDepartureNow(true); }}
										>
											Now
										</button>
									)}
								</span>
							</label>
						</div>
						<p className="field-hint timezone-hint">Choose a time within the next seven days, in your device&apos;s local time zone.</p>
					</section>

					<section className="form-section preferences-section" aria-labelledby="preferences-title">
						<div className="section-heading">
							<span className="section-index">C</span>
							<h3 id="preferences-title">Your preferences</h3>
						</div>
						<div className="preference-grid">
							<label className="field">
								<span className="field-label">Budget</span>
								<span className="number-input">
									<span aria-hidden="true">$</span>
									<input type="number" min="0" max="1000" step="0.01" value={budget} onChange={event => setBudget(event.target.value)} required />
								</span>
								<span className="field-hint">USD, including transit fare</span>
							</label>
							<label className="field">
								<span className="field-label">Maximum walking</span>
								<select disabled={!allowWalking} value={allowWalking ? walkingLimit : '0'} onChange={event => setWalkingLimit(event.target.value)}>
									<option value="0">No walking</option>
									<option value="5">5 minutes</option>
									<option value="10">10 minutes</option>
									<option value="15">15 minutes</option>
									<option value="20">20 minutes</option>
									<option value="30">30 minutes</option>
									<option value="45">45 minutes</option>
									<option value="60">60 minutes</option>
									<option value="90">90 minutes</option>
									<option value="120">120 minutes</option>
									<option value="180">180 minutes</option>
								</select>
								<span className="field-hint">{allowWalking ? 'Total walking along the route' : 'No walking: routes must have zero walking minutes.'}</span>
							</label>
							<fieldset className="choice-field">
								<legend className="field-label">Allow walking</legend>
								<div className="choice-control" role="group" aria-label="Walking preference">
									<button type="button" aria-pressed={allowWalking} onClick={() => setAllowWalking(true)}>Yes</button>
									<button type="button" aria-pressed={!allowWalking} onClick={() => setAllowWalking(false)}>No</button>
								</div>
							</fieldset>
							<fieldset className="choice-field">
								<legend className="field-label">I have a car</legend>
								<div className="choice-control" role="group" aria-label="Car availability">
									<button type="button" aria-pressed={hasCar} onClick={() => setHasCar(true)}>Yes</button>
									<button type="button" aria-pressed={!hasCar} onClick={() => setHasCar(false)}>No</button>
								</div>
							</fieldset>
							{hasCar && <label className="field flex items-center gap-2">
								<input type="checkbox" checked={avoidTolls} onChange={event => setAvoidTolls(event.target.checked)} />
								<span className="field-label">Prefer routes without tolls</span>
							</label>}
							<fieldset className="choice-field">
								<legend className="field-label">Allow public transit</legend>
								<div className="choice-control" role="group" aria-label="Public transit preference">
									<button type="button" aria-pressed={allowTransit} onClick={() => setAllowTransit(true)}>Yes</button>
									<button type="button" aria-pressed={!allowTransit} onClick={() => setAllowTransit(false)}>No</button>
								</div>
							</fieldset>
						</div>
						<label className="field notes-field">
							<span className="field-label">Extra notes <span className="optional-label">Optional</span></span>
							<textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} placeholder="Anything else to add?" rows={3} />
							<span className="field-hint">Notes are included when personalized route ranking is available.</span>
						</label>
					</section>

					<div className="form-footer">
						<p>Route options are estimates. Check live schedules before leaving.</p>
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
