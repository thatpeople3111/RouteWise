'use client';

import { useState } from 'react';
import type { Location, RouteOption, TransitAlternative } from '@/lib/types';
import Map from '@/components/Map';

type TransitTabsProps = {
	route: RouteOption;
	origin: Location;
	destination: Location;
};

function formatMoney(amount: number, currency: string) {
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
	} catch {
		return `${amount.toFixed(2)} ${currency}`;
	}
}

function lineLabel(alt: TransitAlternative): string {
	return alt.title;
}

function fareText(alt: TransitAlternative): string {
	if (!alt.estimatedTransportationCost) return 'Fare unavailable';
	return `Fare: ${formatMoney(alt.estimatedTransportationCost.amount, alt.estimatedTransportationCost.currency)}`;
}

function stepInstruction(step: TransitAlternative['steps'][number]): string {
	if (step.mode === 'WALK') {
		const minutes = step.durationMinutes !== null && step.durationMinutes !== undefined ? Math.round(step.durationMinutes) : null;
		return minutes !== null ? `Walk ${minutes} min` : 'Walk';
	}
	if (step.mode === 'TRANSIT' && step.transit) {
		const line = step.transit.line ?? step.transit.lineShortName ?? step.transit.vehicleName ?? '';
		const rawVehicle = step.transit.vehicleType ?? step.transit.vehicleName ?? '';
		const modeLabel = /subway|metro|rail|train/i.test(rawVehicle) ? 'Rail'
			: /bus/i.test(rawVehicle) ? 'Bus'
			: /tram|light/i.test(rawVehicle) ? 'Tram'
			: 'Transit';
		return line ? `${modeLabel} ${line}` : modeLabel;
	}
	return step.instruction || (step.mode === 'TRANSIT' ? 'Transit' : step.mode);
}

export default function TransitTabs({ route, origin, destination }: TransitTabsProps) {
	const alternatives = route.transitAlternatives ?? [];
	const [selectedId, setSelectedId] = useState<string>(() =>
		alternatives.find(alt => alt.recommended)?.id ?? alternatives[0]?.id ?? '',
	);
	const selected = alternatives.find(alt => alt.id === selectedId) ?? alternatives[0];
	const showTabs = alternatives.length > 1;
	// Map expects a RouteOption; shape one from the selected alternative's own geometry/data.
	const mapRoute: RouteOption = selected
		? { ...route, encodedPolyline: selected.encodedPolyline ?? route.encodedPolyline, steps: selected.steps }
		: route;

	if (!selected) {
		return (
			<div className="transit-tabs">
				{origin && destination && (
					<div className="mt-4">
						<Map origin={origin} destination={destination} selectedRoute={route} variant="compact" />
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="transit-tabs">
			{showTabs && (
				<div className="transit-tab-bar" role="tablist" aria-label="Transit options">
					{alternatives.map(alt => {
						const selectedAlt = alt.id === selected.id;
						return (
							<button
								key={alt.id}
								type="button"
								role="tab"
								aria-selected={selectedAlt}
								className={`transit-tab ${selectedAlt ? 'is-selected' : ''} ${alt.availability?.available === false ? 'is-unavailable' : ''}`}
								onClick={() => setSelectedId(alt.id)}
							>
								<span className="transit-tab-title">{lineLabel(alt)}</span>
								<span className="transit-tab-sub">
									{Math.round(alt.durationMinutes)} min
									{alt.walkingMinutes !== null ? ` · ${Math.round(alt.walkingMinutes)} min walk` : ''}
								</span>
								{alt.availability?.available === false && (
									<span className="transit-tab-unavailable">Unavailable</span>
								)}
								{alt.recommended && <span className="transit-tab-badge">Recommended</span>}
							</button>
						);
					})}
				</div>
			)}

			{selected.availability?.available === false && selected.availability.message && (
				<p className="transit-option-unavailable" role="status">{selected.availability.message}</p>
			)}
			{/* Surface unavailable reasons for non-selected options too, so no constraint is hidden. */}
			{alternatives.filter(alt => alt.id !== selected.id && alt.availability?.available === false).map(alt => (
				<p key={alt.id} className="transit-option-unavailable" role="status">{alt.title}: {alt.availability?.message}</p>
			))}

			{origin && destination && (
				<div className="mt-3">
					<Map origin={origin} destination={destination} selectedRoute={mapRoute} variant="compact" />
				</div>
			)}

			<div className="transit-option-summary">
				<span>{Math.round(selected.durationMinutes)} min total</span>
				{selected.walkingMinutes !== null && <span> · Walking: {Math.round(selected.walkingMinutes)} min</span>}
				<span> · {fareText(selected)}</span>
				<span> · Transfers: {selected.transfers}</span>
			</div>

			<ol className="transit-timeline" aria-label="Journey steps">
				{selected.steps.map((step, index) => {
					const isTransit = step.mode === 'TRANSIT' && step.transit;
					const isTransfer = isTransit && index > 0 && selected.steps[index - 1].mode === 'TRANSIT';
					return (
						<li key={`${index}-${step.instruction}`} className={`transit-timeline-step ${isTransit ? 'is-transit' : 'is-walk'}`}>
							{isTransfer && <span className="transit-transfer">Transfer</span>}
							<span className="transit-step-label">
								{stepInstruction(step)}
								{step.transit?.departureStop && <span className="transit-stop"> at {step.transit.departureStop}</span>}
								{step.transit?.arrivalStop && <span className="transit-stop"> → {step.transit.arrivalStop}</span>}
								{step.transit?.stopCount !== null && step.transit?.stopCount !== undefined && step.transit.stopCount > 0 && (
									<span className="transit-stop"> · {step.transit.stopCount} stops</span>
								)}
							</span>
							{step.durationMinutes !== null && step.durationMinutes !== undefined && (
								<span className="transit-step-time">{Math.round(step.durationMinutes)} min</span>
							)}
						</li>
					);
				})}
			</ol>

			{selected.warnings.length > 0 && (
				<ul className="transit-warnings">
					{selected.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
				</ul>
			)}
		</div>
	);
}
