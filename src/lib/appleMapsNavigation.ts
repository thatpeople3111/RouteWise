import { toNavigationPoint } from './navigationHandoff';
import type { NavigationHandoffRequest, NavigationPoint, NavigationStop } from './navigationHandoff';

export interface AppleMapsNavigationResult {
  url: string;
  handoffDestination: NavigationPoint;
  finalDestination: NavigationPoint;
  includedStops: NavigationStop[];
  unsupportedStops: NavigationStop[];
  /** Entire requested leg, including any walking continuation, represented by one URL. */
  exactRepresentation: boolean;
  continuation?: { origin: NavigationPoint; destination: NavigationPoint; travelMode: 'WALKING' };
  warnings: string[];
  transit?: { exactJourneyPreloaded: false; requestedTimingPreloaded: false };
}
export interface AppleMapsNavigationOptions {
  /** Opt in only when unified URLs are known to be supported (iOS/iPadOS 18.4+).
   * Platform classification alone does not establish OS-version support.
   */
  format?: 'COMPATIBILITY' | 'UNIFIED';
}
const legacyModes = { DRIVING: 'd', WALKING: 'w', TRANSIT: 'r' } as const;
const unifiedModes = { DRIVING: 'driving', WALKING: 'walking', TRANSIT: 'transit' } as const;
const coordinates = (point: NavigationPoint) => `${point.latitude},${point.longitude}`;
const samePoint = (a: NavigationPoint, b: NavigationPoint) => a.latitude === b.latitude && a.longitude === b.longitude;

/** Pure, key-free Apple Maps handoff; no network calls, browser globals or UI actions. */
export function buildAppleMapsNavigationUrl(request: NavigationHandoffRequest,
  options: AppleMapsNavigationOptions = {}): AppleMapsNavigationResult {
  if (!legacyModes[request.travelMode]) throw new Error('Unsupported navigation travel mode.');
  const origin = toNavigationPoint(request.origin);
  const finalDestination = toNavigationPoint(request.destination);
  const stops = request.orderedStops.map(stop => ({ ...toNavigationPoint(stop), kind: stop.kind }));
  const explicitParking = request.parkingLocation ? toNavigationPoint(request.parkingLocation) : undefined;
  const safePlace = request.safePlaceFirstLeg ? toNavigationPoint(request.safePlaceFirstLeg) : undefined;
  const safeLeg = request.context === 'STRANDED_SAFE_PLACE_LEG';
  if (safeLeg && (!safePlace || request.travelMode !== 'WALKING')) {
    throw new Error('A safe-place first leg requires a safe place and walking mode.');
  }
  const parking = !safeLeg && request.travelMode === 'DRIVING'
    ? explicitParking ?? stops.findLast(stop => stop.kind === 'PARKING') : undefined;
  const handoffDestination = safeLeg ? safePlace! : parking ?? finalDestination;
  const candidates = safeLeg ? [] : stops.filter(stop => !(parking && stop.kind === 'PARKING' && samePoint(stop, parking)));
  const unified = options.format === 'UNIFIED';
  const includedStops = unified ? candidates : [];
  const unsupportedStops = unified ? [] : candidates;
  const continuation = parking && !samePoint(parking, finalDestination)
    ? { origin: toNavigationPoint(parking), destination: finalDestination, travelMode: 'WALKING' as const } : undefined;
  const warnings: string[] = [];
  if (unsupportedStops.length) warnings.push('Compatibility Maps links cannot preload intermediate stops; retain the full itinerary in RouteWise.');
  if (continuation) warnings.push('Driving ends at parking; the final walking leg remains a separate continuation.');
  if (request.travelMode === 'TRANSIT') {
    warnings.push('Your navigation app may recalculate the exact transit combination.');
    if (request.requestedTiming) warnings.push('Set your requested departure or arrival time in Maps; this URL cannot preload it.');
  }
  const url = new URL(unified ? 'https://maps.apple.com/directions' : 'https://maps.apple.com/');
  url.searchParams.set(unified ? 'source' : 'saddr', coordinates(origin));
  url.searchParams.set(unified ? 'destination' : 'daddr', coordinates(handoffDestination));
  url.searchParams.set(unified ? 'mode' : 'dirflg', unified ? unifiedModes[request.travelMode] : legacyModes[request.travelMode]);
  for (const stop of includedStops) url.searchParams.append('waypoint', coordinates(stop));
  // Directions do not document custom coordinate labels. Keep names/addresses in metadata;
  // do not append a label to coordinates or pass Google's Place IDs as Apple Place IDs.
  return {
    url: url.toString(), handoffDestination: toNavigationPoint(handoffDestination), finalDestination,
    includedStops, unsupportedStops,
    exactRepresentation: unsupportedStops.length === 0 && !continuation,
    ...(continuation ? { continuation } : {}), warnings,
    ...(request.travelMode === 'TRANSIT' ? { transit: { exactJourneyPreloaded: false as const, requestedTimingPreloaded: false as const } } : {}),
  };
}
