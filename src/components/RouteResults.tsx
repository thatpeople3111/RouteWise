import RouteCard, { type RouteCardLabel } from '@/components/RouteCard';
import LongDistanceResults from '@/components/LongDistanceResults';
import RideshareOptions, { rideshareLabelsById } from '@/components/RideshareOptions';
import type { Location, RouteOption, SuggestedStop, TripPlan } from '@/lib/types';
import { getGlobalWarnings } from '@/lib/routeWarnings';
import { partitionLocalRoutes } from '@/lib/routeAvailability';
import NonRecommendedRoutes from './NonRecommendedRoutes';
import type { TransportModePreference } from '@/lib/preferences';
import { preferredModePresentation, isValidPresentationRoute } from '@/lib/preferredModePresentation';
import type { NormalNavigationEndpoints } from '@/lib/startNavigation';

type RouteResultsProps = {
	navigation?: NormalNavigationEndpoints;
	preferredTransportMode?: TransportModePreference;
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
		if (!route || !isValidPresentationRoute(route)) continue;

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

export default function RouteResults({ plan, origin, destination, onEditTrip, selectedStop, preferredTransportMode, navigation = {} }: RouteResultsProps) {
  if (plan.tripScope === 'LONG_DISTANCE' && plan.longDistance) return <LongDistanceResults plan={plan} origin={origin} destination={destination} onEditTrip={onEditTrip} selectedStop={selectedStop} navigation={navigation} />;
	const { available, restricted } = partitionLocalRoutes(plan.routes);
	const { routeMode: preferredMode, preferredRouteId, promoteRideshare } = preferredModePresentation(plan, available, preferredTransportMode);
	const rankedRoutes = getRankedRoutes({ ...plan, routes: available });
	const bestRoute = rankedRoutes.find(entry => entry.labels.includes('BEST'));
	const otherRoutes = rankedRoutes.filter(entry => entry !== bestRoute);
	if (preferredRouteId) otherRoutes.sort((a, b) => Number(b.route.id === preferredRouteId) - Number(a.route.id === preferredRouteId));
	const horizontalSecondary = !!bestRoute && otherRoutes.length === 1
		&& available.length === 2 && available.every(route => ['DRIVE', 'WALK', 'TRANSIT'].includes(route.mode));
	const rideshareLabels = rideshareLabelsById(plan);
	const pageWarnings = getGlobalWarnings(plan);
	const rideshareSection = (plan.rideshares ?? []).length > 0
		? <RideshareOptions options={plan.rideshares ?? []} labelsById={rideshareLabels} preferred={promoteRideshare}
      endpoints={{ pickup: navigation.origin ?? origin, dropoff: navigation.destination ?? destination }} /> : null;

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
				{available.length} route {available.length === 1 ? 'option' : 'options'} · {plan.recommendation.source === 'gemini' ? 'Ranked with Gemini' : 'Ranked using route facts'}
			</p>

			{plan.dataMode === 'demo' && (
				<p className="rounded-sm border-l-4 border-[#e2ad42] bg-[#fff9e9] px-3 py-2 text-xs leading-5 text-[#715522]">
					These sample routes are fictional and are not directions, fares, or travel advice.
				</p>
			)}

			{bestRoute && (
				<section aria-labelledby="best-route-heading" className="grid gap-3">
					<h2 id="best-route-heading" className="text-xs font-bold uppercase tracking-wide text-[#43534b]">Best match</h2>
					<RouteCard
						navigation={navigation}
						route={bestRoute.route}
						preferred={bestRoute.route.mode === preferredMode}
						labels={bestRoute.labels}
						summary={bestRoute.route.steps[0]?.instruction}
						whyChosen={routeReason(bestRoute.labels, plan)}
						selectedStop={selectedStop}
						origin={origin}
						destination={destination}
						selected
					/>
				</section>
			)}

			{promoteRideshare && rideshareSection}
			{otherRoutes.length > 0 && (
				<section aria-labelledby="other-routes-heading" className="grid gap-3">
					<h2 id="other-routes-heading" className="text-xs font-bold uppercase tracking-wide text-[#68766f]">All other options</h2>
					{preferredRouteId && <p className="field-hint">Your preferred mode is shown first among comparable alternatives. Best match keeps its factual ranking.</p>}
					<div className={`grid min-w-0 gap-4 ${horizontalSecondary ? '' : 'md:grid-cols-2'}`}>
						{otherRoutes.map(entry => (
							<RouteCard
								navigation={navigation}
								key={entry.route.id}
								layout={horizontalSecondary ? 'horizontal' : 'vertical'}
								route={entry.route}
								preferred={entry.route.mode === preferredMode}
								labels={entry.labels}
								summary={entry.route.steps[0]?.instruction}
								whyChosen={routeReason(entry.labels, plan)}
								selectedStop={selectedStop}
								origin={origin}
								destination={destination}
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

			{!promoteRideshare && rideshareSection}

			<NonRecommendedRoutes routes={restricted} origin={origin} destination={destination} selectedStop={selectedStop} navigation={navigation} />
			{pageWarnings.length > 0 && (
				<ul className="grid gap-1 rounded-sm bg-white px-4 py-3 text-xs leading-5 text-[#715522]">
					{pageWarnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
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
