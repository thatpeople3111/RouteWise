import type { RouteOption, SuggestedStop } from '@/lib/types';

export type RouteCardLabel = 'BEST' | 'FASTEST' | 'CHEAPEST';

type RouteCardProps = {
	route: RouteOption;
	labels?: readonly RouteCardLabel[];
	summary?: string;
	whyChosen?: string;
	selectedStop?: SuggestedStop | null;
	extraStopMinutes?: number;
};

const modeLabels: Record<RouteOption['mode'], string> = {
	TRANSIT: 'Public transit',
	DRIVE: 'Driving',
	WALK: 'Walking',
	BICYCLE: 'Cycling',
};

function formatMoney(amount: number, currency: string) {
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
	} catch {
		return `${amount.toFixed(2)} ${currency}`;
	}
}

function badgeStyle(label: RouteCardLabel) {
	if (label === 'BEST') return 'bg-[#d5ef72] text-[#194b3a]';
	return 'bg-[#edf3e9] text-[#43534b]';
}

export default function RouteCard({
	route,
	labels = [],
	summary,
	whyChosen,
	selectedStop,
	extraStopMinutes,
}: RouteCardProps) {
	const best = labels.includes('BEST');
	const stopMinutes = selectedStop ? extraStopMinutes ?? (route.includesStop ? route.extraStopMinutes : selectedStop.estimatedExtraMinutes) ?? null : 0;
	const totalMinutes = route.durationMinutes + (route.includesStop ? 0 : stopMinutes ?? 0);
	const stopCost = selectedStop?.estimatedCost;
	const canShowEstimatedTotal = route.cost.amount !== null
		&& route.cost.complete
		&& (!selectedStop || (stopCost !== undefined && route.cost.currency === 'USD'));
	const estimatedTotalCost = canShowEstimatedTotal
		? route.cost.amount! + (stopCost ?? 0)
		: null;
	const stopCategoryLabel = selectedStop
		? `${selectedStop.category[0].toUpperCase()}${selectedStop.category.slice(1)}`
		: '';
	const routeTitle = selectedStop ? `${route.label} + ${stopCategoryLabel} Stop` : route.label;
	const titleId = `route-card-${route.id}-title`;

	return (
		<article
			className={`min-w-0 overflow-hidden rounded-md border bg-white transition-shadow ${best ? 'border-[#24634d] shadow-[0_10px_28px_rgba(36,99,77,0.13)]' : 'border-[#dce5dc] shadow-sm'}`}
			aria-labelledby={titleId}
		>
			<div className={`h-1 ${best ? 'bg-[#24634d]' : 'bg-[#dce5dc]'}`} aria-hidden="true" />
			<div className="p-5 sm:p-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					{labels.length > 0 ? (
						<div className="flex flex-wrap gap-2" aria-label="Route distinctions">
							{labels.map(label => (
								<span key={label} className={`rounded-sm px-2.5 py-1 text-[10px] font-bold tracking-wide ${badgeStyle(label)}`}>
									{label}
								</span>
							))}
						</div>
					) : <span />}
					<span className="text-xs font-medium text-[#68766f]">{modeLabels[route.mode]}</span>
				</div>

				<div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						<h2 id={titleId} className="break-words text-lg font-semibold leading-snug text-[#192923] sm:text-xl">
							{routeTitle}
						</h2>
						{summary && <p className="mt-1 text-sm leading-5 text-[#68766f]">{summary}</p>}
					</div>
					<div className="shrink-0 sm:text-right">
						<p className="text-3xl font-semibold leading-none tabular-nums text-[#192923]">{Math.round(totalMinutes)} <span className="text-sm font-medium text-[#68766f]">min</span></p>
						<p className="mt-1 text-[10px] text-[#87928a]">Estimated total travel time</p>
						{selectedStop && <p className="mt-1 text-xs text-[#68766f]">{route.includesStop ? 'Includes travel via your stop; time spent there is extra.' : 'Includes estimated stop time.'}</p>}
					</div>
				</div>

				<dl className="mt-5 grid grid-cols-2 gap-3 border-y border-[#dce5dc] py-4 sm:grid-cols-3">
					<div className="min-w-0">
						<dt className="text-[10px] font-medium text-[#87928a]">{route.mode === 'TRANSIT' ? 'Transportation fare' : 'Transportation cost'}</dt>
						<dd className="mt-1 break-words text-sm font-semibold text-[#192923]">
							{estimatedTotalCost !== null
								? `${formatMoney(estimatedTotalCost, route.cost.currency)} total`
								: route.cost.amount !== null
									? `${formatMoney(route.cost.amount, route.cost.currency)} route fare`
									: 'Price unavailable'}
						</dd>
					</div>
					{route.mode === 'DRIVE' && (
						<div className="min-w-0">
							<dt className="text-[10px] font-medium text-[#87928a]">Estimated tolls</dt>
							<dd className="mt-1 text-sm font-semibold text-[#192923]">
								{route.tolls?.status === 'estimated'
									? route.tolls.prices.map(price => formatMoney(price.amount, price.currency)).join(' + ')
									: route.tolls?.status === 'unknown' ? 'Tolls apply · price unavailable'
										: route.tolls?.status === 'not_reported' ? 'No tolls reported' : 'Unavailable'}
							</dd>
						</div>
					)}
					<div className="min-w-0">
						<dt className="text-[10px] font-medium text-[#87928a]">Walking</dt>
						<dd className="mt-1 text-sm font-semibold text-[#192923]">
							{route.walkingMinutes === null ? 'Unavailable' : `${Math.round(route.walkingMinutes)} min`}
						</dd>
					</div>
					{selectedStop && (
						<div className="col-span-2 min-w-0 sm:col-span-1">
							<dt className="text-[10px] font-medium text-[#87928a]">Stop estimate</dt>
							<dd className="mt-1 break-words text-sm font-semibold text-[#192923]">
								{stopCost === undefined ? selectedStop.name : `${selectedStop.name} · ${formatMoney(stopCost, 'USD')}`}
							</dd>
							<p className="mt-0.5 text-xs text-[#68766f]">{stopMinutes === null ? 'Extra travel time unknown' : `+${Math.round(stopMinutes)} min · estimated detour`}</p>
						</div>
					)}
				</dl>

				{route.cost.note && <p className="mt-3 text-xs leading-5 text-[#68766f]">{route.cost.note}</p>}
				{route.mode === 'DRIVE' && <p className="mt-1 text-xs leading-5 text-[#68766f]">Tolls are shown separately. Fuel and parking prices are not included; toll charges may vary by payment method.</p>}

				{route.mode === 'DRIVE' && (
					<section className="mt-4 rounded-sm border border-[#dce5dc] bg-[#f8faf6] p-3" aria-label="Parking near final destination">
						<h3 className="text-sm font-semibold text-[#192923]">Parking near your destination</h3>
						{route.parking?.status === 'available' ? (
							<>
								<p className="mt-1 text-xs text-[#68766f]">Within 1 km · straight-line distances. Check rates, access and space availability before arrival.</p>
								<ul className="mt-3 grid gap-3">
									{route.parking.locations.map(place => (
										<li key={place.placeId} className="text-xs leading-5 text-[#43534b]">
											<a href={place.mapsUri} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">{place.name} ↗</a>
											<p>{place.distanceMeters} m from destination{place.openNow === null ? '' : place.openNow ? ' · Open now' : ' · Currently closed'}</p>
											{place.address && <p>{place.address}</p>}
										</li>
									))}
								</ul>
							</>
						) : <p className="mt-1 text-xs text-[#68766f]">{route.parking?.status === 'none' ? 'No parking locations were returned within 1 km of your destination.' : 'Parking search is unavailable right now. Your driving route is still available.'}</p>}
					</section>
				)}

				{route.steps.length > 0 && (
					<details className="mt-4 text-sm text-[#43534b]">
						<summary className="cursor-pointer font-semibold">Route directions ({route.steps.length} steps)</summary>
						<ol className="mt-2 list-decimal space-y-2 pl-5 text-xs leading-5">
							{route.steps.map((step, index) => <li key={index}>{step.instruction || modeLabels[step.mode]}{step.transit?.line ? ` · ${step.transit.line}` : ''}</li>)}
						</ol>
					</details>
				)}

				{whyChosen && (
					<div className="mt-4 rounded-sm border-l-4 border-[#d5ef72] bg-[#f7faef] px-3 py-2.5">
						<p className="text-[10px] font-bold uppercase tracking-wide text-[#43534b]">Why this route</p>
						<p className="mt-1 text-sm leading-5 text-[#43534b]">{whyChosen}</p>
					</div>
				)}
			</div>
		</article>
	);
}
