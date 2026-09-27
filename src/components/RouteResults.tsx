import RouteCard, { type RouteCardLabel } from '@/components/RouteCard';
import Map from '@/components/Map';
import type { Location, RouteOption, SuggestedStop, TripPlan } from '@/lib/types';

type RouteResultsProps = {
	plan: TripPlan;
	origin: Location;
	destination: Location;
	onEditTrip: () => void;
	selectedStop?: SuggestedStop | null;
};

type RankedRoute = {
	route: RouteOption;
	labels: RouteCardLabel[];
};

function getRankedRoutes(plan: TripPlan): RankedRoute[] {
	const rankings: { id: string | null; label: RouteCardLabel }[] = [
		{ id: plan.best, label: 'BEST' },
		{ id: plan.fastest, label: 'FASTEST' },
		{ id: plan.cheapest, label: 'CHEAPEST' },
	];
	const grouped: RankedRoute[] = [];

	for (const ranking of rankings) {
		if (!ranking.id) continue;
		const route = plan.routes.find(candidate => candidate.id === ranking.id);
		if (!route) continue;

		const existing = grouped.find(entry => entry.route.id === route.id);
		if (existing) existing.labels.push(ranking.label);
		else grouped.push({ route, labels: [ranking.label] });
	}

	for (const route of plan.routes) {
		if (!grouped.some(entry => entry.route.id === route.id)) grouped.push({ route, labels: [] });
	}
	return grouped;
}

function routeReason(labels: readonly RouteCardLabel[], plan: TripPlan) {
	if (labels.length === 0) return undefined;
	if (labels.includes('BEST')) return plan.recommendation.reason;
	if (labels.includes('FASTEST') && labels.includes('CHEAPEST')) {
		return 'This option has the shortest duration and lowest known cost among the returned routes.';
	}
	if (labels.includes('FASTEST')) return 'This option has the shortest estimated travel time among the returned routes.';
	return 'This option has the lowest known cost among the returned routes.';
}

export default function RouteResults({ plan, origin, destination, onEditTrip, selectedStop }: RouteResultsProps) {
	const rankedRoutes = getRankedRoutes(plan);
	const bestRoute = rankedRoutes.find(entry => entry.labels.includes('BEST'));
	const otherRoutes = rankedRoutes.filter(entry => entry !== bestRoute);
	const bestRouteGeometry = plan.routes.find(route => route.id === plan.best)?.encodedPolyline ?? null;

	return (
		<section className="route-results route-results-page grid min-w-0 gap-5" aria-labelledby="route-results-title">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<span className="eyebrow">YOUR ROUTE OPTIONS</span>
					<h1 id="route-results-title" className="font-serif text-2xl font-medium text-[#192923] sm:text-3xl">Compare your routes</h1>
				</div>
				<span className={`rounded-sm px-2.5 py-1 text-[10px] font-semibold ${plan.dataMode === 'demo' ? 'bg-[#fff0cf] text-[#78521b]' : 'bg-[#edf3e9] text-[#194b3a]'}`}>
					{plan.dataMode === 'demo' ? 'DEMO DATA' : 'LIVE DATA'}
				</span>
			</header>

			<p className="text-sm text-[#43534b]" role="status">
				{plan.routes.length} route {plan.routes.length === 1 ? 'option' : 'options'} · {plan.recommendation.source === 'gemini' ? 'Ranked with Gemini' : 'Ranked using route facts'}
			</p>

			{plan.dataMode === 'demo' && (
				<p className="rounded-sm border-l-4 border-[#e2ad42] bg-[#fff9e9] px-3 py-2 text-xs leading-5 text-[#715522]">
					These sample routes are fictional and are not directions, fares, or travel advice.
				</p>
			)}

			<Map origin={origin} destination={destination} selectedStop={selectedStop} routePolyline={bestRouteGeometry} />

			{bestRoute && (
				<section aria-labelledby="best-route-heading" className="grid gap-3">
					<h2 id="best-route-heading" className="text-xs font-bold uppercase tracking-wide text-[#43534b]">Best match</h2>
					<RouteCard
						route={bestRoute.route}
						labels={bestRoute.labels}
						summary={bestRoute.route.steps[0]?.instruction}
						whyChosen={routeReason(bestRoute.labels, plan)}
						selectedStop={selectedStop}
					/>
				</section>
			)}

			{otherRoutes.length > 0 && (
				<section aria-labelledby="other-routes-heading" className="grid gap-3">
					<h2 id="other-routes-heading" className="text-xs font-bold uppercase tracking-wide text-[#68766f]">All other options</h2>
					<div className="grid min-w-0 gap-4 md:grid-cols-2">
						{otherRoutes.map(entry => (
							<RouteCard
								key={entry.route.id}
								route={entry.route}
								labels={entry.labels}
								summary={entry.route.steps[0]?.instruction}
								whyChosen={routeReason(entry.labels, plan)}
								selectedStop={selectedStop}
							/>
						))}
					</div>
				</section>
			)}

			{rankedRoutes.length === 0 && (
				<p className="rounded-sm border-l-4 border-[#dce5dc] bg-white px-4 py-3 text-sm text-[#68766f]" role="status">
					No ranked route options are available for this trip yet.
				</p>
			)}

			{plan.warnings.length > 0 && (
				<ul className="grid gap-1 rounded-sm bg-white px-4 py-3 text-xs leading-5 text-[#715522]">
					{plan.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
				</ul>
			)}

			{plan.attribution && <p className="text-[10px] text-[#87928a]">{plan.attribution}</p>}

			<div className="flex justify-start border-t border-[#dce5dc] pt-4">
				<button
					type="button"
					onClick={onEditTrip}
					className="min-h-11 rounded-md border border-[#dce5dc] bg-white px-4 py-2 text-sm font-semibold text-[#43534b] transition-colors hover:border-[#24634d]/50 hover:bg-[#f8faf6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e77958]"
				>
					Edit trip
				</button>
			</div>
		</section>
	);
}
