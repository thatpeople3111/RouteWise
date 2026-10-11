'use client';

import { useState, type FormEvent } from 'react';
import type { RideshareProvider } from '@/lib/types';
import type { TripDraft } from '@/lib/tripDraft';

type ConstraintsScreenProps = {
	draft: TripDraft;
	onChange: (patch: Partial<TripDraft>) => void;
	onBack: () => void;
	onStart: () => void;
};

type RideshareBudgetChoice = 'none' | '15' | '25' | '40' | 'custom';

function rideshareBudgetChoice(draft: TripDraft): RideshareBudgetChoice {
	if (draft.maxRideshareBudget === undefined) return 'none';
	if (draft.maxRideshareBudget === 15) return '15';
	if (draft.maxRideshareBudget === 25) return '25';
	if (draft.maxRideshareBudget === 40) return '40';
	return 'custom';
}

export default function ConstraintsScreen({ draft, onChange, onBack, onStart }: ConstraintsScreenProps) {
	const [error, setError] = useState('');
	const [customRideshareBudget, setCustomRideshareBudget] = useState(
		draft.maxRideshareBudget !== undefined && ![15, 25, 40].includes(draft.maxRideshareBudget)
			? String(draft.maxRideshareBudget)
			: '',
	);
	const budgetChoice = rideshareBudgetChoice(draft);

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
		if (budgetChoice === 'custom') {
			const customAmount = Number(customRideshareBudget);
			if (!Number.isFinite(customAmount) || customAmount < 0 || customAmount > 1000) {
				setError('Enter a custom rideshare budget between $0 and $1000.');
				return;
			}
		}
		onStart();
	}

	const walkingOptions = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180];

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

					<section className="form-section preferences-section" aria-labelledby="preferences-title">
						<div className="section-heading">
							<span className="section-index">A</span>
							<h3 id="preferences-title">Budget and walking</h3>
						</div>
						<div className="preference-grid">
							<label className="field">
								<span className="field-label">Trip budget</span>
								<span className="number-input">
									<span aria-hidden="true">$</span>
									<input
										type="number" min="0" max="1000" step="0.01"
										value={String(draft.budgetUsd)}
										onChange={event => onChange({ budgetUsd: Number(event.target.value) })}
										required
									/>
								</span>
								<span className="field-hint">USD, including transit fare</span>
							</label>
							<label className="field">
								<span className="field-label">Maximum walking</span>
								<select
									disabled={!draft.allowWalking}
									value={draft.allowWalking ? String(draft.maxWalkingMinutes) : '0'}
									onChange={event => onChange({ maxWalkingMinutes: Number(event.target.value) })}
								>
									{walkingOptions.map(minutes => (
										<option key={minutes} value={String(minutes)}>{minutes === 0 ? 'No walking' : `${minutes} minutes`}</option>
									))}
								</select>
								<span className="field-hint">{draft.allowWalking ? 'Total walking along the route' : 'No walking: routes must have zero walking minutes.'}</span>
							</label>
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
							<label className="field">
								<span className="field-label">Maximum rideshare price</span>
								<select
									value={budgetChoice}
									onChange={event => {
										const choice = event.target.value as RideshareBudgetChoice;
										onChange({ maxRideshareBudget: choice === 'none' ? undefined : choice === 'custom' ? draft.maxRideshareBudget : Number(choice) });
									}}
								>
									<option value="none">No rideshare budget</option>
									<option value="15">Under $15</option>
									<option value="25">Under $25</option>
									<option value="40">Under $40</option>
									<option value="custom">Custom</option>
								</select>
								<span className="field-hint">Separate from your overall trip budget and any optional-stop budget.</span>
							</label>
							{budgetChoice === 'custom' && (
								<label className="field">
									<span className="field-label">Custom rideshare budget</span>
									<span className="number-input">
										<span aria-hidden="true">$</span>
										<input type="number" min="0" max="1000" step="0.01" value={customRideshareBudget} onChange={event => setCustomRideshareBudget(event.target.value)} required />
									</span>
									<span className="field-hint">USD, rideshares only</span>
								</label>
							)}
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
