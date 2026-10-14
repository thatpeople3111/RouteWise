import { isValidNavigationPoint, toNavigationPoint } from './navigationHandoff';
import type { NavigationHandoffRequest, NavigationPoint, NavigationStop } from './navigationHandoff';

/** The internal trip still requires an origin; a destination-only provider link may omit it. */
export type GoogleMapsNavigationRequest = Omit<NavigationHandoffRequest, 'origin'> & { origin?: NavigationPoint };
export interface GoogleMapsNavigationResult {
  url: string;
  includedStops: NavigationStop[];
  omittedStops: NavigationStop[];
  /** Point/order/mode representation only, not a guarantee of identical Google route geometry. */
  exactRepresentation: boolean;
  warnings: string[];
  /** Endpoint/mode links do not encode the selected RouteWise transit journey or schedule. */
  transit?: { exactJourneyPreloaded: false; requestedTimingPreloaded: false };
  continuation?: NavigationHandoffRequest['parkingContinuation'];
  finalDestination?: NavigationPoint;
}
export interface GoogleMapsNavigationOptions {
  /** Default covers mobile-browser fallback even if the native Maps app is absent. */
  target?: 'MOBILE_OR_UNKNOWN' | 'DESKTOP';
}

const modes = { DRIVING: 'driving', WALKING: 'walking', TRANSIT: 'transit' } as const;
const coordinates = (point: NavigationPoint) => `${point.latitude},${point.longitude}`;
const samePoint = (a: NavigationPoint, b: NavigationPoint) => a.latitude === b.latitude && a.longitude === b.longitude;
const priority = (stop: NavigationStop, normal: boolean) => normal
  ? stop.kind === 'OPTIONAL_STOP' ? 0 : stop.kind === 'PARKING' ? 1 : 2
  : stop.kind === 'PARKING' || stop.kind === 'SAFE_PLACE' ? 0 : stop.kind === 'OPTIONAL_STOP' ? 1 : 2;

/** Public, key-free Maps URL. Pure/SSR safe; never geocodes or launches navigation.
 * Documentation: https://developers.google.com/maps/documentation/urls/get-started
 */
export function buildGoogleMapsNavigationUrl(request: GoogleMapsNavigationRequest,
  options: GoogleMapsNavigationOptions = {}): GoogleMapsNavigationResult {
  const mode = modes[request.travelMode];
  if (!mode) throw new Error('Unsupported navigation travel mode.');
  const safeLeg = request.context === 'STRANDED_SAFE_PLACE_LEG';
  if (safeLeg && (!request.safePlaceFirstLeg || request.travelMode !== 'WALKING')) {
    throw new Error('A safe-place first leg requires a safe place and walking mode.');
  }
  // Validate even points that will be omitted: malformed input must never be hidden by limits.
  for (const point of [request.origin, request.destination, request.parkingLocation, request.safePlaceFirstLeg]) {
    if (point !== undefined && !isValidNavigationPoint(point)) throw new Error('Invalid navigation coordinates.');
  }
  const stops = request.orderedStops.map(stop => ({ ...toNavigationPoint(stop), kind: stop.kind }));
  const finalDestination = toNavigationPoint(request.destination);
  const parking = request.context === 'NORMAL' && request.travelMode === 'DRIVING'
    ? request.parkingLocation ?? stops.findLast(stop => stop.kind === 'PARKING') : undefined;
  const destination = toNavigationPoint(safeLeg ? request.safePlaceFirstLeg! : parking ?? request.destination);
  const continuation = parking && !samePoint(parking, finalDestination)
    ? { origin: toNavigationPoint(parking), destination: finalDestination, travelMode: 'WALKING' as const } : undefined;
  const origin = request.origin ? toNavigationPoint(request.origin) : undefined;
  if (!safeLeg && request.parkingLocation) {
    // The standard adapter already appends parking. Normalize standalone requests without duplication.
    const parking = toNavigationPoint(request.parkingLocation);
    const existing = stops.findIndex(stop => stop.kind === 'PARKING' && samePoint(stop, parking));
    if (existing >= 0) stops.splice(existing, 1);
    stops.push({ ...parking, kind: 'PARKING' });
  }
  const warnings: string[] = [];
  const limit = safeLeg || request.travelMode === 'TRANSIT' ? 0 : options.target === 'DESKTOP' ? 9 : 3;
  const candidates = safeLeg ? [] : stops.filter(stop => !(parking && stop.kind === 'PARKING' && samePoint(stop, parking)));
  // Select by significance, then restore itinerary order; never optimize visit order.
  const selected = new Set(candidates.map((stop, index) => ({ stop, index }))
    .sort((a, b) => priority(a.stop, request.context === 'NORMAL') - priority(b.stop, request.context === 'NORMAL') || a.index - b.index)
    .slice(0, limit).map(entry => entry.index));
  const includedStops = candidates.filter((_, index) => selected.has(index));
  const omittedStops = candidates.filter((_, index) => !selected.has(index));
  if (omittedStops.length) warnings.push(request.travelMode === 'TRANSIT'
    ? 'Intermediate stops are not passed for transit directions; use separate transit legs.'
    : `Waypoint limit exceeded: ${omittedStops.length} stop(s) omitted.`);

  function createUrl(includePlaceIds: boolean): string {
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    if (origin) {
      url.searchParams.set('origin', coordinates(origin));
      if (includePlaceIds && origin.placeId) url.searchParams.set('origin_place_id', origin.placeId);
    }
    url.searchParams.set('destination', coordinates(destination));
    if (includePlaceIds && destination.placeId) url.searchParams.set('destination_place_id', destination.placeId);
    url.searchParams.set('travelmode', mode);
    url.searchParams.set('dir_action', 'navigate');
    if (includedStops.length) {
      url.searchParams.set('waypoints', includedStops.map(coordinates).join('|'));
      // IDs must correspond one-for-one; mixed sets use coordinates for every waypoint.
      if (includePlaceIds && includedStops.every(stop => stop.placeId && !stop.placeId.includes('|'))) {
        url.searchParams.set('waypoint_place_ids', includedStops.map(stop => stop.placeId).join('|'));
      }
    }
    return url.toString();
  }
  let url = createUrl(true);
  if (url.length > 2048) {
    url = createUrl(false);
    warnings.push('Place IDs omitted to respect the URL length limit; resolved coordinates retained.');
  }
  // Coordinate-only links with <=9 waypoints fit within Google's 2048-character limit.
  if (continuation) warnings.push('Driving ends at parking; continue on foot to your final destination.');
  if (request.travelMode === 'TRANSIT') {
    warnings.push('Your navigation app may recalculate the exact transit combination.');
    if (request.requestedTiming) warnings.push('Set your requested departure or arrival time in Maps; this URL cannot preload it.');
  }
  return { url, includedStops, omittedStops, exactRepresentation: omittedStops.length === 0 && !continuation, warnings,
    ...(continuation ? { continuation, finalDestination } : {}),
    ...(request.travelMode === 'TRANSIT' ? { transit: { exactJourneyPreloaded: false as const, requestedTimingPreloaded: false as const } } : {}) };
}
