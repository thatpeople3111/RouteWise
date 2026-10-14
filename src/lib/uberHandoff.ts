import { toNavigationPoint } from './navigationHandoff';
import type { NavigationHandoffRequest, NavigationPoint, NavigationStop } from './navigationHandoff';
import type { NavigationPlatform } from './navigationPlatform';

export interface UberHandoffResult {
  url: string;
  webFallbackUrl: string;
  pickup: NavigationPoint;
  dropoff: NavigationPoint;
  unsupportedStops: NavigationStop[];
  /** Endpoint coverage, not a fare, service-availability or booking guarantee. */
  exactRepresentation: boolean;
}

function uberLocation(point: NavigationPoint) {
  return {
    latitude: point.latitude, longitude: point.longitude,
    ...(point.label ? { addressLine1: point.label } : {}),
    ...(point.address ? { addressLine2: point.address } : {}),
  };
}

/** Official HTTPS rider links; never books a ride or requests GPS/network access.
 * https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction
 */
export function buildUberHandoff(request: NavigationHandoffRequest,
  platform: NavigationPlatform = 'UNKNOWN'): UberHandoffResult {
  // Explicit ride endpoints win. Never replace a user-selected origin with my_location.
  const pickup = toNavigationPoint(request.rideshare?.pickup ?? request.origin);
  const dropoff = toNavigationPoint(request.rideshare?.dropoff ?? request.destination);
  const unsupportedStops = request.orderedStops.map(stop => ({ ...toNavigationPoint(stop), kind: stop.kind }));
  function link(path: string) {
    const url = new URL(path, 'https://m.uber.com');
    // JSON is encoded once by URLSearchParams. Only documented location fields are copied.
    url.searchParams.set('pickup', JSON.stringify(uberLocation(pickup)));
    url.searchParams.set('drop[0]', JSON.stringify(uberLocation(dropoff)));
    return url.toString();
  }
  const webFallbackUrl = link('/');
  const mobile = platform === 'ANDROID' || platform === 'IOS' || platform === 'IPADOS';
  return {
    url: mobile ? link('/looking') : webFallbackUrl,
    webFallbackUrl, pickup, dropoff, unsupportedStops,
    exactRepresentation: unsupportedStops.length === 0,
  };
}
