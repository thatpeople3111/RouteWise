import type { Location, RouteOption, SuggestedStop } from '@/lib/types';
import Map from '@/components/Map';
import TransitTabs from '@/components/TransitTabs';

export type RouteCardLabel = 'BEST' | 'FASTEST' | 'CHEAPEST';

type RouteCardProps = {
	route: RouteOption;
	labels?: readonly RouteCardLabel[];
	summary?: string;
	whyChosen?: string;
	selectedStop?: SuggestedStop | null;
	extraStopMinutes?: number;
	/** Trip origin/destination for the embedded map. */
	origin?: Location;
	destination?: Location;
	/** Whether this card's route is currently drawn on the map. */
	selected?: boolean;
	/** Called with the unique route ID (never just the travel mode). */
	onSelectRoute?: (routeId: string) => void;
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
	origin,
	destination,
	selected = false,
	onSelectRoute,
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
	const unavailable = route.availability && route.availability.available === false;

	// Driving: build the estimated total from the known parts only (vehicle cost + tolls + parking).
	const recommendedLot = route.mode === 'DRIVE'
		? (route.parking?.locations.find(lot => lot.recommended) ?? route.parking?.locations[0])
		: undefined;
	const tollTotal = route.mode === 'DRIVE' && route.tolls?.status === 'estimated'
		? route.tolls.prices.reduce((sum, price) => sum + price.amount, 0)
		: null;
	const parkingCost = recommendedLot?.priceAmount ?? null;
	const driveCostParts = [
		route.cost.amount !== null ? route.cost.amount : null,
		tollTotal,
		parkingCost,
	].filter((value): value is number => value !== null);
	const drivingEstimatedTotal = route.mode === 'DRIVE' && driveCostParts.length > 0
		? driveCostParts.reduce((sum, value) => sum + value, 0)
		: null;
	const drivingTotalIsPartial = route.mode === 'DRIVE' && drivingEstimatedTotal !== null && route.cost.amount === null;

	const transitFareKnown = route.mode === 'TRANSIT' && route.cost.amount !== null;

	return (
		<article
			className={`min-w-0 overflow-hidden rounded-md border bg-white transition-shadow ${unavailable ? 'border-[#e2ad42] opacity-95' : selected ? 'border-[#24634d] ring-2 ring-[#24634d]/40 shadow-[0_10px_28px_rgba(36,99,77,0.13)]' : best ? 'border-[#24634d] shadow-[0_10px_28px_rgba(36,99,77,0.13)]' : 'border-[#dce5dc] shadow-sm'}`}
			aria-labelledby={titleId}
		>
			<div className={`h-1 ${unavailable ? 'bg-[#e2ad42]' : selected || best ? 'bg-[#24634d]' : 'bg-[#dce5dc]'}`} aria-hidden="true" />
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
					<div className="flex items-center gap-2">
						{onSelectRoute && (
							<button
								type="button"
								aria-pressed={selected}
								onClick={() => onSelectRoute(route.id)}
								className="view-route-button"
							>
								{selected ? 'Viewing route' : 'View route'}
							</button>
						)}
						<span className="text-xs font-medium text-[#68766f]">{modeLabels[route.mode]}</span>
					</div>
				</div>

				<div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						<h2 id={titleId} className="break-words text-lg font-semibold leading-snug text-[#192923] sm:text-xl">
							{routeTitle}
						</h2>
						{unavailable && route.availability?.message && (
							<p className="mt-1 rounded-sm border-l-2 border-[#e2ad42] bg-[#fff9e9] px-2 py-1 text-sm leading-5 text-[#715522]" role="status">
								{route.availability.message}
							</p>
						)}
						{summary && <p className="mt-1 text-sm leading-5 text-[#68766f]">{summary}</p>}
					</div>
					<div className="shrink-0 sm:text-right">
						<p className="text-3xl font-semibold leading-none tabular-nums text-[#192923]">{Math.round(totalMinutes)} <span className="text-sm font-medium text-[#68766f]">min</span></p>
						<p className="mt-1 text-[10px] text-[#87928a]">Estimated total travel time</p>
						{selectedStop && <p className="mt-1 text-xs text-[#68766f]">{route.includesStop ? 'Includes travel via your stop; time spent there is extra.' : 'Includes estimated stop time.'}</p>}
					</div>
				</div>

				{/* Per-route compact map: this option's own geometry only. Transit shows tabs + per-option map. */}
				{route.mode === 'TRANSIT' && route.transitAlternatives && route.transitAlternatives.length > 0 ? (
					<TransitTabs route={route} origin={origin!} destination={destination!} />
				) : origin && destination ? (
					<div className="mt-4">
						<Map origin={origin} destination={destination} selectedRoute={route} selectedStop={selectedStop} variant="compact" />
					</div>
				) : null}

				<dl className="mt-5 grid grid-cols-2 gap-3 border-y border-[#dce5dc] py-4 sm:grid-cols-3">
					<div className="min-w-0">
						<dt className="text-[10px] font-medium text-[#87928a]">{route.mode === 'TRANSIT' ? 'Fare' : 'Transportation cost'}</dt>
						<dd className="mt-1 break-words text-sm font-semibold text-[#192923]">
							{route.mode === 'TRANSIT'
								? transitFareKnown
									? `Fare: ${formatMoney(route.cost.amount!, route.cost.currency)}`
									: 'Fare unavailable'
								: route.mode === 'DRIVE'
									? drivingEstimatedTotal !== null
										? `Estimated total: ${formatMoney(drivingEstimatedTotal, route.cost.currency)}`
										: 'Price unavailable'
									: estimatedTotalCost !== null
										? `${formatMoney(estimatedTotalCost, route.cost.currency)} total`
										: route.cost.amount !== null
											? `${formatMoney(route.cost.amount, route.cost.currency)} route fare`
											: 'Price unavailable'}
						</dd>
						{route.mode === 'TRANSIT' && transitFareKnown && route.cost.note && (
							<dd className="mt-1 text-[10px] leading-4 text-[#87928a]">{route.cost.note}</dd>
						)}
						{route.mode === 'TRANSIT' && !transitFareKnown && (
							<dd className="mt-1 text-[10px] leading-4 text-[#87928a]">Route and travel time are still shown.</dd>
						)}
						{route.mode === 'DRIVE' && drivingEstimatedTotal !== null && (
							<dd className="mt-1 text-[10px] leading-4 text-[#87928a]">
								{drivingTotalIsPartial
									? 'Tolls and recommended parking; drive cost not returned.'
									: 'Includes tolls and recommended parking.'}
							</dd>
						)}
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

				{route.cost.note && route.mode !== 'TRANSIT' && <p className="mt-3 text-xs leading-5 text-[#68766f]">{route.cost.note}</p>}
				{route.mode === 'DRIVE' && (
					<p className="mt-1 text-xs leading-5 text-[#68766f]">Tolls and the recommended parking are included in the estimated total. Fuel is not included; toll charges may vary by payment method.</p>
				)}

				{route.mode === 'DRIVE' && (
					<section className="mt-4 rounded-sm border border-[#dce5dc] bg-[#f8faf6] p-3" aria-label="Parking near final destination">
						<h3 className="text-sm font-semibold text-[#192923]">Parking near your destination</h3>
						{route.parking?.status === 'available' ? (
							<>
								<p className="mt-1 text-xs text-[#68766f]">Up to 3 nearby lots/garages. Walking times are from the lot to your destination.</p>
								<ul className="mt-3 grid gap-3">
									{route.parking.locations.slice(0, 3).map(place => (
										<li key={place.placeId} className="rounded-sm border border-[#e3eae3] bg-white p-2.5 text-xs leading-5 text-[#43534b]">
											<div className="flex flex-wrap items-center justify-between gap-2">
												<a href={place.mapsUri} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">{place.name} ↗</a>
												{place.recommended && (
													<span className="rounded-sm bg-[#edf3e9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#194b3a]">Recommended</span>
												)}
											</div>
											<p className="mt-1">
												{place.priceSource === 'official_config' && place.priceAmount !== null && place.priceAmount !== undefined
													? `Parking: ${formatMoney(place.priceAmount, place.priceCurrency ?? 'USD')}`
													: 'Parking price unavailable'}
											</p>
											<p>
												{place.walkingMinutes !== null && place.walkingMinutes !== undefined
													? `${Math.round(place.walkingMinutes)} min walk`
													: 'Walk time unavailable'}
												{place.walkingDistanceMeters !== null && place.walkingDistanceMeters !== undefined
													? ` · ${(place.walkingDistanceMeters / 1609.344).toFixed(1)} mi from destination`
													: ` · ${place.distanceMeters} m from destination`}
											</p>
											{place.address && <p className="text-[#87928a]">{place.address}</p>}
										</li>
									))}
								</ul>
								{route.parking.locations.some(place => place.priceSource === 'official_config') && (
									<p className="mt-2 text-[10px] text-[#87928a]">Parking prices are maintained from official published rates; confirm before arrival.</p>
								)}
							</>
						) : (
							<p className="mt-1 text-xs text-[#68766f]">
								{route.parking?.status === 'none'
									? 'No parking locations were returned near your destination.'
									: 'Parking search is unavailable right now. Your driving route is still available.'}
							</p>
						)}
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

				{route.warnings.length > 0 && (
					<ul className="mt-4 grid gap-1 rounded-sm border-l-4 border-[#e2ad42] bg-[#fff9e9] px-3 py-2 text-xs leading-5 text-[#715522]">
						{route.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
					</ul>
				)}
			</div>
		</article>
	);
}
