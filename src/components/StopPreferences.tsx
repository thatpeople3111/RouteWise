import { useState } from 'react';
import type { SuggestedStopCategory, SuggestedStopTiming } from '@/lib/types';
import type { StopTimeOfDay } from '@/lib/api-types';

export const stopCategories = [
	{ id: 'food', label: 'Food', icon: '🍽️', description: 'A quick bite or a full meal' },
	{ id: 'coffee', label: 'Coffee', icon: '☕', description: 'Coffee, tea, or a café break' },
	{ id: 'gas', label: 'Gas', icon: '⛽', description: 'Fuel up along the way' },
	{ id: 'groceries', label: 'Groceries', icon: '🛒', description: 'Pick up everyday essentials' },
	{ id: 'dessert', label: 'Dessert', icon: '🍰', description: 'Something sweet for the road' },
	{ id: 'pharmacy', label: 'Pharmacy', icon: '✚', description: 'Health and personal-care items' },
] as const;

export type StopCategory = SuggestedStopCategory;
export type StopLocation = SuggestedStopTiming;

export type StopPreference = {
	category: StopCategory;
	location: StopLocation | null;
	maxExtraTimeMinutes: number | null;
	maxExtraSpendingUsd: number | null;
};

export type StopPreferenceSubmission =
	| { skip: true }
	| {
			skip: false;
			category: StopCategory;
			timing: StopLocation;
			maxExtraMinutes?: number;
			maxExtraBudget?: number;
		};

type StopPreferencesProps = {
	value: StopPreference | null;
	availableCategories?: SuggestedStopCategory[];
	recommendedCategories?: SuggestedStopCategory[];
	timeOfDay?: StopTimeOfDay | null;
	onChange: (preference: StopPreference | null) => void;
	onSubmit: (preference: StopPreferenceSubmission) => void;
};

const stopLocations: { id: StopLocation; label: string; description: string }[] = [
	{ id: 'ON_ROUTE', label: 'On the way', description: 'Look along your route' },
	{ id: 'DESTINATION', label: 'Near my destination', description: 'Look around where I am going' },
];

const extraTimeChoices: (number | null)[] = [5, 10, 15, 20, null];

export default function StopPreferences({ value, availableCategories, recommendedCategories, timeOfDay, onChange, onSubmit }: StopPreferencesProps) {
	const [validationError, setValidationError] = useState('');
	const recommendedOrder = (recommendedCategories ?? []).filter(category =>
		!availableCategories?.length || availableCategories.includes(category),
	);
	const orderedStopCategories = [
		...recommendedOrder.map(id => stopCategories.find(category => category.id === id)).filter((category): category is typeof stopCategories[number] => category !== undefined),
		...stopCategories.filter(category => !recommendedOrder.includes(category.id)),
	];

	function findStop() {
		if (!value?.category) {
			setValidationError('Choose a stop category to find a stop.');
			return;
		}
		if (!value.location) {
			setValidationError('Choose where the stop should be: on the way or near your destination.');
			return;
		}

		setValidationError('');
		onSubmit({
			skip: false,
			category: value.category,
			timing: value.location,
			...(value.maxExtraTimeMinutes !== null ? { maxExtraMinutes: value.maxExtraTimeMinutes } : {}),
			...(value.maxExtraSpendingUsd !== null ? { maxExtraBudget: value.maxExtraSpendingUsd } : {}),
		});
	}

	return (
		<section className="route-results p-5 sm:p-8" aria-labelledby="stop-preferences-title">
			<div className="mb-6 max-w-2xl">
				<span className="eyebrow">OPTIONAL STOP</span>
				<h2 id="stop-preferences-title" className="font-serif text-2xl font-medium leading-tight text-[#192923] sm:text-3xl">
					Want to grab something along the way?
				</h2>
				<p id="stop-preferences-hint" className="mt-2 text-sm leading-6 text-[#68766f]">
					Choose one category, or continue without adding a stop.
				</p>
				{timeOfDay && <p className="mt-2 text-xs text-[#68766f]">Priorities for {timeOfDay.toLowerCase().replace('_', ' ')} are shown first; all supported categories remain available.</p>}
			</div>

			<fieldset aria-describedby="stop-preferences-hint">
				<legend className="sr-only">Choose one stop category</legend>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
									{orderedStopCategories.map(category => {
						const selected = value?.category === category.id;
						return (
							<button
								key={category.id}
								type="button"
								aria-pressed={selected}
								aria-label={`${category.label}${selected ? ', selected' : ''}`}
								onClick={() => {
									setValidationError('');
									onChange(selected ? null : {
									category: category.id,
									location: value?.location ?? null,
									maxExtraTimeMinutes: value?.maxExtraTimeMinutes ?? null,
									maxExtraSpendingUsd: value?.maxExtraSpendingUsd ?? null,
									});
								}}
								className={`group relative flex min-h-28 min-w-0 flex-col items-start justify-between gap-4 rounded-md border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e77958] sm:min-h-32 sm:p-5 ${selected ? 'border-[#24634d] bg-[#edf3e9] ring-1 ring-[#24634d]' : 'border-[#dce5dc] bg-white hover:border-[#24634d]/50 hover:bg-[#f8faf6]'}`}
							>
								<span className="flex size-10 items-center justify-center rounded-md bg-[#edf3e9] text-xl transition-transform group-hover:scale-105" aria-hidden="true">
									{category.icon}
								</span>
								<span className="min-w-0">
									<span className="block text-sm font-semibold text-[#192923]">{category.label}</span>
									<span className="mt-1 block text-xs leading-5 text-[#68766f]">{category.description}</span>
								</span>
								{selected && <span className="absolute right-3 top-3 size-2 rounded-full bg-[#24634d]" aria-hidden="true" />}
							</button>
						);
					})}
				</div>
			</fieldset>

			{value && (
				<fieldset className="mt-6 border-t border-[#dce5dc] pt-5" aria-describedby="stop-location-hint">
					<legend className="text-sm font-semibold text-[#192923]">Where should the stop be?</legend>
					<p id="stop-location-hint" className="mb-3 mt-1 text-xs text-[#68766f]">Choose one location for your {value.category} stop.</p>
					<div className="grid gap-2 sm:grid-cols-2">
						{stopLocations.map(location => {
							const selected = value.location === location.id;
							return (
								<label
									key={location.id}
									className={`stop-preference-selection flex min-h-16 cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#e77958] ${selected ? 'border-[#24634d] bg-[#edf3e9] ring-1 ring-[#24634d]' : 'border-[#dce5dc] bg-white hover:border-[#24634d]/50 hover:bg-[#f8faf6]'}`}
								>
									<input
										className="size-4 shrink-0 accent-[#24634d]"
										type="radio"
										name="stop-location"
										value={location.id}
										checked={selected}
										onChange={() => {
											setValidationError('');
											onChange({ ...value, location: location.id });
										}}
									/>
									<span className="min-w-0">
										<span className="block text-sm font-semibold text-[#192923]">{location.label}</span>
										<span className="mt-0.5 block text-xs leading-5 text-[#68766f]">{location.description}</span>
									</span>
								</label>
							);
						})}
					</div>
				</fieldset>
			)}

			{value && (
				<div className="mt-6 grid gap-6 border-t border-[#dce5dc] pt-5 sm:grid-cols-2 sm:gap-8">
					<fieldset aria-describedby="extra-time-hint">
						<legend className="text-sm font-semibold text-[#192923]">How much extra time is okay?</legend>
						<p id="extra-time-hint" className="mb-3 mt-1 text-xs leading-5 text-[#68766f]">
							Additional time caused by this stop, not your total trip duration.
						</p>
						<div className="grid grid-cols-3 gap-2 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Maximum extra stop time">
							{extraTimeChoices.map(minutes => {
								const selected = value.maxExtraTimeMinutes === minutes;
								const label = minutes === null ? 'No limit' : `${minutes} min`;
								return (
									<button
										key={label}
										type="button"
										aria-pressed={selected}
										onClick={() => onChange({ ...value, maxExtraTimeMinutes: minutes })}
										className={`min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e77958] ${selected ? 'border-[#24634d] bg-[#edf3e9] text-[#194b3a] ring-1 ring-[#24634d]' : 'border-[#dce5dc] bg-white text-[#43534b] hover:border-[#24634d]/50 hover:bg-[#f8faf6]'}`}
									>
										{label}
									</button>
								);
							})}
						</div>
					</fieldset>

					<fieldset>
						<legend className="text-sm font-semibold text-[#192923]">Maximum extra spending</legend>
						<label className="mt-1 block text-xs leading-5 text-[#68766f]" htmlFor="extra-stop-spending">
							Optional limit for extra travel and spending at this stop.
						</label>
						<div className="mt-3 flex h-11 items-center rounded-md border border-[#dce5dc] bg-white focus-within:border-[#24634d] focus-within:ring-2 focus-within:ring-[#24634d]/15">
							<span className="pl-3 text-sm text-[#68766f]" aria-hidden="true">$</span>
							<input
								id="extra-stop-spending"
								className="h-full min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm text-[#192923] outline-none"
								aria-label="Maximum extra spending for the stop in dollars"
								type="number"
								min="0"
								step="0.01"
								inputMode="decimal"
								placeholder="No limit"
								value={value.maxExtraSpendingUsd ?? ''}
								onChange={event => {
									const rawValue = event.currentTarget.value;
									if (rawValue === '') {
										onChange({ ...value, maxExtraSpendingUsd: null });
										return;
									}
									const amount = Number(rawValue);
									if (Number.isFinite(amount)) onChange({ ...value, maxExtraSpendingUsd: Math.max(0, amount) });
								}}
							/>
						</div>
						<p className="mt-2 text-xs text-[#68766f]">Stops with unknown costs may be excluded when a limit is set.</p>
					</fieldset>
				</div>
			)}

			{validationError && <p className="mt-5 rounded-sm border-l-4 border-[#e77958] bg-[#fff2ed] px-3 py-2 text-sm text-[#783d2d]" role="alert">{validationError}</p>}

			<div className="mt-6 flex flex-col-reverse gap-3 border-t border-[#dce5dc] pt-5 sm:flex-row sm:justify-end">
				<button
					type="button"
					onClick={() => {
						setValidationError('');
						onSubmit({ skip: true });
					}}
					className="min-h-11 rounded-md border border-[#dce5dc] bg-white px-4 py-2 text-sm font-semibold text-[#43534b] transition-colors hover:border-[#24634d]/50 hover:bg-[#f8faf6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e77958]"
				>
					No thanks — continue
				</button>
				<button
					type="button"
					onClick={findStop}
					className="submit-button min-h-11"
				>
					<span>Find a stop</span>
					<span aria-hidden="true">↗</span>
				</button>
			</div>
		</section>
	);
}
