'use client';

import FarePrice from './FarePrice';

import Image from 'next/image';
import { formatDuration } from '@/lib/formatDuration';
import type { RideshareOption } from '@/lib/types';
import type { RouteCardLabel } from '@/components/RouteCard';

type RideshareCardProps = {
	option: RideshareOption;
	labels?: readonly RouteCardLabel[];
	variant?: 'results' | 'stranded';
};

const providerMeta: Record<RideshareOption['provider'], { name: string; logo: string; actionLabel: string }> = {
	LYFT: { name: 'Lyft', logo: '/providers/lyft.png', actionLabel: 'Open Lyft' },
	WAYMO: { name: 'Waymo', logo: '/providers/waymo.png', actionLabel: 'Open Waymo' },
	UBER: { name: 'Uber', logo: '/providers/uber.jpg', actionLabel: 'Open Uber' },
};

function formatMinutes(minutes: number | undefined) {
	return formatDuration(minutes);
}

function openExternal(url: string) {
	window.open(url, '_blank', 'noopener,noreferrer');
}

function badgeStyle(label: RouteCardLabel) {
	if (label === 'BEST') return 'bg-[#d5ef72] text-[#194b3a]';
	return 'bg-[#edf3e9] text-[#43534b]';
}

/** Rideshare prices are estimates unless the backend marks them as provider-supplied. */
function legacyFare(option: RideshareOption): import('@/lib/pricing').FareEstimate {
  const base: import('@/lib/pricing').FareEstimate = { provider: option.provider, currency: 'USD', sourceType: 'UNAVAILABLE',
    confidence: 'LOW', label: 'Price unavailable', kind: 'UNAVAILABLE', appliesToTrip: false, retrievedAt: '' };
  const low = option.estimatedPriceLow, high = option.estimatedPriceHigh;
  if ((option.currency ?? 'USD') !== 'USD' || typeof low !== 'number' || typeof high !== 'number' || !Number.isFinite(low)
    || !Number.isFinite(high) || low < 0 || high < low || option.priceSource === 'unavailable') return base;
  return { ...base, priceLow: low, priceHigh: high, kind: 'RANGE', sourceType: option.priceSource === 'provider' ? 'LIVE_API' : 'MODELED',
    label: option.priceSource === 'provider' ? 'Live provider price' : 'Estimated fare', appliesToTrip: true };
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
					<span className="rideshare-option-mark" aria-hidden="true"><Image src={meta.logo} alt="" width={26} height={26} className="rideshare-provider-logo" /></span>
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

	const fare = option.fare ?? legacyFare(option);

	return (
		<article
			className={`rideshare-option-card rideshare-option-${providerKey} rideshare-option-${variant}`}
			aria-labelledby={titleId}
		>
			<header className="rideshare-option-head">
				<span className="rideshare-option-mark" aria-hidden="true"><Image src={meta.logo} alt="" width={26} height={26} className="rideshare-provider-logo" /></span>
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
				<FarePrice fare={fare} />
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

			{(fare.bookingUrl ?? option.bookingUrl) && (
				<button
					type="button"
					className="rideshare-option-action"
					onClick={() => openExternal((fare.bookingUrl ?? option.bookingUrl)!)}
				>
					{meta.actionLabel}
				</button>
			)}
		</article>
	);
}
