'use client';

import { useState, type FormEvent } from 'react';
import type { RideshareProvider } from '@/lib/types';
import type { TripDraft } from '@/lib/tripDraft';
import SliderNumberInput from '@/components/SliderNumberInput';

type ConstraintsScreenProps = {
	draft: TripDraft;
	onChange: (patch: Partial<TripDraft>) => void;
	onBack: () => void;
	onStart: () => void;
};

export default function ConstraintsScreen({ draft, onChange, onBack, onStart }: ConstraintsScreenProps) {
	const [error, setError] = useState('');

	function setProvider(provider: RideshareProvider, enabled: boolean) {
		const next = enabled
			? [...new Set([...draft.rideshareProviders, provider])]
			: draft.rideshareProviders.filter(item => item !== provider);
		onChange({ rideshareProviders: next });
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError('');
		if (!Number.isFinite(draft.budgetUsd) || draft.budgetUsd < 0 || draft.budgetUsd > 1000) {
			setError('Enter a trip budget between $0 and $1000.');
			return;
		}
		if (draft.maxRideshareBudget !== undefined && (!Number.isFinite(draft.maxRideshareBudget) || draft.maxRideshareBudget < 0 || draft.maxRideshareBudget > 1000)) {
			setError('Enter a rideshare budget between $0 and $1000.'); return;
		}
		onStart();
	}


	return (
		<div className="planner-layout">
			<form className="trip-form" onSubmit={handleSubmit} onChange={() => setError('')}>
				<fieldset className="form-controls">
					<legend className="sr-only">Trip preferences</legend>
					<div className="form-topline">
						<div>
							<span className="eyebrow">YOUR PREFERENCES</span>
							<h2>What matters to you?</h2>
						</div>
						<span className="step-count">Step 2 <span>/ 2</span></span>
					</div>
					<p className="step-progress" aria-hidden="true"><span className="step-dot" /> Trip details <span className="step-sep">→</span> <span className="step-dot is-active" /> Preferences</p>
					{draft.destinationPlace && <p className="field-hint">Destination: <strong>{draft.destinationPlace.name}</strong> · {draft.destinationPlace.formattedAddress}</p>}

					<section className="form-section preferences-section" aria-labelledby="preferences-title">
						<div className="section-heading">
							<span className="section-index">A</span>
							<h3 id="preferences-title">Budget and walking</h3>
						</div>
						<div className="preference-grid">
                            <SliderNumberInput label="Trip budget" value={draft.budgetUsd} min={0} max={1000} sliderMax={200} prefix="$"
                              hint="USD, including transit fare. Type amounts up to $1000."
                              onChange={value => { if (value !== undefined) onChange({ budgetUsd: value }); }} />
                            <SliderNumberInput label="Maximum walking time" value={draft.allowWalking ? draft.maxWalkingMinutes : 0} min={0} max={180} unit="min" disabled={!draft.allowWalking}
                              hint={draft.allowWalking ? 'Total walking along the route.' : 'No walking: routes must have zero walking minutes.'}
                              onChange={value => { if (value !== undefined) onChange({ maxWalkingMinutes: value }); }} />
						</div>
					</section>

					<section className="form-section" aria-labelledby="transport-title">
						<div className="section-heading">
							<span className="section-index">B</span>
							<h3 id="transport-title">Transportation</h3>
						</div>
						<div className="preference-grid">
							<fieldset className="choice-field">
								<legend className="field-label">Allow walking</legend>
								<div className="choice-control" role="group" aria-label="Walking preference">
									<button type="button" aria-pressed={draft.allowWalking} onClick={() => onChange({ allowWalking: true })}>Yes</button>
									<button type="button" aria-pressed={!draft.allowWalking} onClick={() => onChange({ allowWalking: false })}>No</button>
								</div>
							</fieldset>
							<fieldset className="choice-field">
								<legend className="field-label">I have a car</legend>
								<div className="choice-control" role="group" aria-label="Car availability">
									<button type="button" aria-pressed={draft.hasCar} onClick={() => onChange({ hasCar: true })}>Yes</button>
									<button type="button" aria-pressed={!draft.hasCar} onClick={() => onChange({ hasCar: false })}>No</button>
								</div>
							</fieldset>
							{draft.hasCar && (
								<label className="field flex items-center gap-2">
									<input type="checkbox" checked={draft.avoidTolls} onChange={event => onChange({ avoidTolls: event.target.checked })} />
									<span className="field-label">Prefer routes without tolls</span>
								</label>
							)}
							<fieldset className="choice-field">
								<legend className="field-label">Allow public transit</legend>
								<div className="choice-control" role="group" aria-label="Public transit preference">
									<button type="button" aria-pressed={draft.allowTransit} onClick={() => onChange({ allowTransit: true })}>Yes</button>
									<button type="button" aria-pressed={!draft.allowTransit} onClick={() => onChange({ allowTransit: false })}>No</button>
								</div>
							</fieldset>
						</div>
					</section>

					<section className="form-section" aria-labelledby="rideshare-title">
						<div className="section-heading">
							<span className="section-index">C</span>
							<h3 id="rideshare-title">Rideshare</h3>
						</div>
						<div className="preference-grid">
							<fieldset className="choice-field">
								<legend className="field-label">Rideshare options</legend>
								<div className="rideshare-provider-toggles" role="group" aria-label="Rideshare providers">
									<label className="flex items-center gap-2">
										<input type="checkbox" checked={draft.rideshareProviders.includes('LYFT')} onChange={event => setProvider('LYFT', event.target.checked)} />
										<span className="field-label">Lyft</span>
									</label>
									<label className="flex items-center gap-2">
										<input type="checkbox" checked={draft.rideshareProviders.includes('WAYMO')} onChange={event => setProvider('WAYMO', event.target.checked)} />
										<span className="field-label">Waymo</span>
									</label>
									<label className="flex items-center gap-2">
										<input type="checkbox" checked={draft.rideshareProviders.includes('UBER')} onChange={event => setProvider('UBER', event.target.checked)} />
										<span className="field-label">Uber</span>
									</label>
								</div>
								<span className="field-hint">Show these ride options alongside your routes. Unavailable providers stay visible with the reason.</span>
							</fieldset>
                            <SliderNumberInput label="Maximum rideshare price" value={draft.maxRideshareBudget} min={0} max={1000} sliderMax={200} prefix="$" optional
                              hint="Separate from your trip and stop budgets. Type amounts up to $1000."
                              onChange={value => onChange({ maxRideshareBudget: value })} />
						</div>
					</section>

					<section className="form-section" aria-labelledby="notes-title">
						<div className="section-heading">
							<span className="section-index">D</span>
							<h3 id="notes-title">Anything else?</h3>
						</div>
						<label className="field notes-field">
							<span className="field-label">Extra notes <span className="optional-label">Optional</span></span>
							<textarea value={draft.notes} onChange={event => onChange({ notes: event.target.value })} maxLength={1000} placeholder="I'd rather spend 10 more minutes than pay for expensive parking." rows={3} />
							<span className="field-hint">Notes are included when personalized route ranking is available.</span>
						</label>
					</section>

					<div className="form-footer">
						<button type="button" className="location-button back-button" onClick={onBack}>Back</button>
						<button className="submit-button" type="submit">
							<span>Let&apos;s go!</span>
							<span aria-hidden="true">↗</span>
						</button>
					</div>
				</fieldset>
				{error && <p className="form-error" role="alert">{error}</p>}
			</form>
		</div>
	);
}
