'use client';

import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { useEffect, useRef, useState } from 'react';
import type { Location, RouteOption, SuggestedStop } from '@/lib/types';
import { locationDisplayName } from '@/lib/currentLocation';

type MapProps = {
	origin: Location;
	destination: Location;
	/** The one selected route whose own geometry is drawn. Never a shared cross-mode route. */
	selectedRoute?: RouteOption | null;
	/** Show the stop marker only when the selected route actually includes it. */
	selectedStop?: SuggestedStop | null;
	/** 'compact' renders a small tile map for embedding inside a route card. */
	variant?: 'full' | 'compact';
};

type MapPoint = {
	id: string;
	label: string;
	markerLabel: string;
	location: Location;
};

type ResolvedMapPoint = Omit<MapPoint, 'location'> & {
	position: google.maps.LatLngLiteral;
};

type MapStatus = 'loading' | 'ready' | 'unavailable';

const modeLabels: Record<RouteOption['mode'], string> = {
	TRANSIT: 'Transit',
	DRIVE: 'Driving',
	WALK: 'Walking',
	BICYCLE: 'Cycling',
};

let mapsLibrariesPromise: Promise<{
	Map: typeof google.maps.Map;
	Polyline: typeof google.maps.Polyline;
	Geocoder: typeof google.maps.Geocoder;
	decodePath: typeof google.maps.geometry.encoding.decodePath;
}> | null = null;

function loadGoogleMaps(apiKey: string) {
	if (!mapsLibrariesPromise) {
		setOptions({ key: apiKey, v: 'weekly' });
		mapsLibrariesPromise = Promise.all([
			importLibrary('maps'),
			importLibrary('geocoding'),
			importLibrary('geometry'),
		]).then(([maps, geocoding, geometry]) => ({
			Map: maps.Map,
			Polyline: maps.Polyline,
			Geocoder: geocoding.Geocoder,
			decodePath: geometry.encoding.decodePath,
		})).catch(error => {
			mapsLibrariesPromise = null;
			throw error;
		});
	}
	return mapsLibrariesPromise;
}

function selectedStopLocation(stop: SuggestedStop | null | undefined): Location | null {
	if (stop?.dataMode !== 'live' || !stop.candidate) return null;
	if (stop.candidate.coordinates) return stop.candidate.coordinates;
	if (stop.candidate.placeId) return { placeId: stop.candidate.placeId };
	if (stop.candidate.address) return { address: stop.candidate.address };
	return null;
}

function describeLocation(location: Location): string {
	if ('address' in location) return location.address;
	if ('placeId' in location) return 'Selected place';
	return locationDisplayName(location);
}

async function resolvePoint(
	location: Location,
	geocoder: google.maps.Geocoder,
): Promise<google.maps.LatLngLiteral | null> {
	if ('latitude' in location) {
		return { lat: location.latitude, lng: location.longitude };
	}

	try {
		const request = 'placeId' in location
			? { placeId: location.placeId }
			: { address: location.address };
		const { results } = await geocoder.geocode(request);
		return results[0]?.geometry.location.toJSON() ?? null;
	} catch (error) {
		if (process.env.NODE_ENV !== 'production') {
			console.warn('[RouteWise map] Could not resolve a trip location.', error);
		}
		return null;
	}
}

export default function Map({ origin, destination, selectedRoute = null, selectedStop, variant = 'full' }: MapProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<MapStatus>(
		process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? 'loading' : 'unavailable',
	);
	const [hasRouteGeometry, setHasRouteGeometry] = useState(false);
	const [unresolvedLocations, setUnresolvedLocations] = useState<string[]>([]);
	const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
	const routePolyline = selectedRoute?.encodedPolyline ?? null;
	const stopOnRoute = selectedStop && selectedRoute?.includesStop ? selectedStop : null;

	useEffect(() => {
		let cancelled = false;
		const container = containerRef.current;
		if (!apiKey || !container) {
			setStatus('unavailable');
			return () => { cancelled = true; };
		}
		const browserKey = apiKey;
		const mapContainer = container;

		let markers: google.maps.Marker[] = [];
		let routeLine: google.maps.Polyline | null = null;
		setStatus('loading');
		setHasRouteGeometry(false);
		setUnresolvedLocations([]);

		async function initializeMap() {
			const { Map: GoogleMap, Polyline, Geocoder, decodePath } = await loadGoogleMaps(browserKey);
			if (cancelled) return;

			const locations: MapPoint[] = [
				{ id: 'origin', label: 'Origin', markerLabel: 'A', location: origin },
				{ id: 'destination', label: 'Destination', markerLabel: 'B', location: destination },
			];
			const stopLocation = selectedStopLocation(stopOnRoute);
			if (stopOnRoute && stopLocation) {
				locations.push({ id: 'stop', label: stopOnRoute.name, markerLabel: 'S', location: stopLocation });
			}

			const geocoder = new Geocoder();
			const resolved = await Promise.all(locations.map(async point => ({
				...point,
				position: await resolvePoint(point.location, geocoder),
			})));
			if (cancelled) return;

			const points: ResolvedMapPoint[] = resolved.flatMap(point => point.position
				? [{ id: point.id, label: point.label, markerLabel: point.markerLabel, position: point.position }]
				: []);
			const missing = resolved.filter(point => !point.position).map(point => point.label);
			setUnresolvedLocations(missing);

			let decodedRoute: google.maps.LatLng[] = [];
			if (routePolyline?.trim()) {
				try {
					decodedRoute = decodePath(routePolyline.trim());
					if (decodedRoute.length < 2) decodedRoute = [];
				} catch (error) {
					if (process.env.NODE_ENV !== 'production') {
						console.warn('[RouteWise map] Backend route geometry was invalid; omitting the route line.', error);
					}
					decodedRoute = [];
				}
			}

			if (points.length === 0 && decodedRoute.length === 0) {
				setStatus('unavailable');
				return;
			}

			const initialCenter = points[0]?.position ?? decodedRoute[0].toJSON();
			const map = new GoogleMap(mapContainer, {
				center: initialCenter,
				zoom: 13,
				mapTypeControl: false,
				streetViewControl: false,
				fullscreenControl: true,
				clickableIcons: false,
				gestureHandling: 'cooperative',
			});

			markers = points.map(point => new google.maps.Marker({
				map,
				position: point.position,
				title: point.label,
				label: point.markerLabel,
			}));

			if (decodedRoute.length > 0) {
				routeLine = new Polyline({
					map,
					path: decodedRoute,
					geodesic: true,
					strokeColor: '#24634d',
					strokeOpacity: 0.85,
					strokeWeight: 4,
					clickable: false,
				});
			}

			const bounds = new google.maps.LatLngBounds();
			points.forEach(point => bounds.extend(point.position));
			decodedRoute.forEach(point => bounds.extend(point));
			if (points.length + decodedRoute.length > 1) map.fitBounds(bounds, 40);
			else map.setZoom(14);

			setHasRouteGeometry(decodedRoute.length > 0);
			setStatus('ready');
		}

		void initializeMap().catch(error => {
			if (cancelled) return;
			if (process.env.NODE_ENV !== 'production') {
				console.error('[RouteWise map] Map preview failed to load; route results remain available.', error);
			}
			setStatus('unavailable');
		});

		return () => {
			cancelled = true;
			markers.forEach(marker => marker.setMap(null));
			routeLine?.setMap(null);
		};
		// The selected route is the source of truth: switching routes re-runs this effect and refits the map.
	}, [apiKey, origin, destination, stopOnRoute, routePolyline]);

	const stopForFallback = stopOnRoute?.dataMode === 'live' && stopOnRoute.candidate ? stopOnRoute.name : null;
	const routeTitle = selectedRoute ? (selectedRoute.label ?? modeLabels[selectedRoute.mode]) : null;
	const compact = variant === 'compact';
	const sectionClass = compact
		? 'route-results map-compact grid min-w-0 gap-2 p-0'
		: 'route-results grid min-w-0 gap-3 p-4 sm:p-5';
	const mapHeight = compact ? 'h-40 sm:h-44' : 'h-64 sm:h-80';

	return (
		<section className={sectionClass} aria-labelledby={compact ? undefined : 'trip-map-title'}>
			{!compact && (
				<header className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<span className="eyebrow">TRIP LOCATIONS</span>
						<h2 id="trip-map-title" className="font-serif text-xl font-medium text-[#192923]">
							{routeTitle ? `${routeTitle} route` : 'Map preview'}
						</h2>
					</div>
					<span className="text-xs font-medium text-[#68766f]">Google Maps</span>
				</header>
			)}

			{apiKey && <div ref={containerRef} className={`${mapHeight} w-full overflow-hidden rounded-md border border-[#dce5dc] bg-[#edf3e9]`} aria-label={compact && routeTitle ? `Map of the ${routeTitle} route` : 'Map showing trip locations'} />}

			{status === 'loading' && <p className="text-sm text-[#68766f]" role="status">Loading map…</p>}
			{status === 'ready' && !hasRouteGeometry && (
				<p className="text-xs leading-5 text-[#68766f]" role="status">Route map unavailable for this option, so the map shows location markers only.</p>
			)}
			{status === 'ready' && unresolvedLocations.length > 0 && (
				<p className="text-xs leading-5 text-[#68766f]" role="status">Some locations could not be placed: {unresolvedLocations.join(', ')}. Your route results are still available.</p>
			)}
			{status === 'unavailable' && (
				<div className="grid gap-2 rounded-sm border-l-4 border-[#dce5dc] bg-[#f8faf6] px-4 py-3 text-sm text-[#43534b]" role="status">
					<p>{apiKey ? 'Map preview is unavailable right now. Your route results are still available.' : 'Map preview needs a browser-restricted Maps key. Your route results are still available.'}</p>
					<p><span className="font-semibold">Origin:</span> {describeLocation(origin)}</p>
					<p><span className="font-semibold">Destination:</span> {describeLocation(destination)}</p>
					{stopForFallback && <p><span className="font-semibold">Selected stop:</span> {stopForFallback}</p>}
				</div>
			)}
		</section>
	);
}
