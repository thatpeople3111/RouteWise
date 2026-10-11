'use client';

import type { RideshareOption } from '@/lib/types';
import type { RouteCardLabel } from '@/components/RouteCard';

type RideshareCardProps = {
	option: RideshareOption;
	labels?: readonly RouteCardLabel[];
	variant?: 'results' | 'stranded';
};

const providerMeta: Record<RideshareOption['provider'], { name: string; mark: string; actionLabel: string }> = {
	LYFT: { name: 'Lyft', mark: 'L', actionLabel: 'Open Lyft' },
	WAYMO: { name: 'Waymo', mark: 'W', actionLabel: 'Open Waymo' },
	UBER: { name: 'Uber', mark: 'U', actionLabel: 'Open Uber' },
};

function formatMoney(amount: number, currency: string) {
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
	} catch {
		return `$${Math.round(amount)}`;
	}
}

function formatMinutes(minutes: number | undefined) {
	return minutes === undefined ? 'Unavailable' : `${Math.round(minutes)} min`;
}

function openExternal(url: string) {
	window.open(url, '_blank', 'noopener,noreferrer');
}

function badgeStyle(label: RouteCardLabel) {
	if (label === 'BEST') return 'bg-[#d5ef72] text-[#194b3a]';
	return 'bg-[#edf3e9] text-[#43534b]';
}

/** Rideshare prices are estimates unless the backend marks them as provider-supplied. */
function pricePresentation(option: RideshareOption): { text: string; caption: string } {
	const hasRange = typeof option.estimatedPriceLow === 'number' && typeof option.estimatedPriceHigh === 'number';
	if (hasRange) {
		const currency = option.currency ?? 'USD';
		const text = option.estimatedPriceLow === option.estimatedPriceHigh
			? formatMoney(option.estimatedPriceLow!, currency)
			: `${formatMoney(option.estimatedPriceLow!, currency)}–${formatMoney(option.estimatedPriceHigh!, currency)}`;
		return {
			text,
			caption: option.priceSource === 'provider' ? 'Live provider price' : 'Estimated fare',
		};
	}
	return {
		text: option.provider === 'UBER' ? 'Price unavailable' : 'Estimate unavailable',
		caption: option.provider === 'UBER' ? 'Shown in the Uber app' : 'Estimate could not be calculated',
	};
}

export default function RideshareCard({ option, labels = [], variant = 'results' }: RideshareCardProps) {
	const meta = providerMeta[option.provider];
	const titleId = `rideshare-card-${option.id}-title`;
	const providerKey = option.provider.toLowerCase();
	const notes = option.notes ?? [];

	if (!option.available) {
		return (
			<article
				className={`rideshare-option-card rideshare-option-${providerKey} is-unavailable rideshare-option-${variant}`}
				aria-labelledby={titleId}
			>
				<header className="rideshare-option-head">
					<span className="rideshare-option-mark" aria-hidden="true">{meta.mark}</span>
					<div className="min-w-0">
						<h3 id={titleId} className="rideshare-option-name">{meta.name}</h3>
						{option.vehicleType && <p className="rideshare-option-vehicle">{option.vehicleType}</p>}
					</div>
				</header>
				<p className="rideshare-option-unavailable" role="status">
					{option.unavailableReason ?? 'Unavailable for this trip'}
				</p>
				{option.unavailableDetail && (
					<p className="rideshare-option-unavailable-detail">{option.unavailableDetail}</p>
				)}
				{notes.length > 0 && (
					<ul className="rideshare-option-notes">
						{notes.map(note => <li key={note}>{note}</li>)}
					</ul>
				)}
			</article>
		);
	}

	const price = pricePresentation(option);

	return (
		<article
			className={`rideshare-option-card rideshare-option-${providerKey} rideshare-option-${variant}`}
			aria-labelledby={titleId}
		>
			<header className="rideshare-option-head">
				<span className="rideshare-option-mark" aria-hidden="true">{meta.mark}</span>
				<div className="min-w-0">
					<h3 id={titleId} className="rideshare-option-name">{meta.name}</h3>
					{option.vehicleType && <p className="rideshare-option-vehicle">{option.vehicleType}</p>}
				</div>
				{labels.length > 0 && (
					<div className="flex flex-wrap gap-2" aria-label="Rideshare distinctions">
						{labels.map(label => (
							<span key={label} className={`rounded-sm px-2.5 py-1 text-[10px] font-bold tracking-wide ${badgeStyle(label)}`}>
								{label}
							</span>
						))}
					</div>
				)}
			</header>

			<div className="rideshare-option-price-row">
				<p className="rideshare-option-price">{price.text}</p>
				{price.caption && <p className="rideshare-option-price-caption">{price.caption}</p>}
			</div>

			<dl className="rideshare-option-stats">
				<div className="min-w-0">
					<dt>Pickup</dt>
					<dd>{formatMinutes(option.estimatedPickupMinutes)}</dd>
				</div>
				<div className="min-w-0">
					<dt>Ride</dt>
					<dd>{formatMinutes(option.estimatedRideMinutes)}</dd>
				</div>
				<div className="min-w-0">
					<dt>Total</dt>
					<dd>{formatMinutes(option.estimatedTotalMinutes)}</dd>
				</div>
			</dl>

			{option.withinBudget === false && (
				<p className="rideshare-option-overbudget" role="status">Above your rideshare budget</p>
			)}

			{notes.length > 0 && (
				<ul className="rideshare-option-notes">
					{notes.map(note => <li key={note}>{note}</li>)}
				</ul>
			)}

			{option.bookingUrl && (
				<button
					type="button"
					className="rideshare-option-action"
					onClick={() => openExternal(option.bookingUrl!)}
				>
					{meta.actionLabel}
				</button>
			)}
		</article>
	);
}
