/**
 * Compatibility re-exports. The canonical rideshare logic (deep links and the app-maintained
 * Waymo service-area data) lives in the backend services so zone data is defined in one place.
 */
export {
  buildLyftRideLink,
  buildUberRideLink,
  WAYMO_WEB_URL,
} from '../server/services/rideshareOptions';
export {
  checkWaymoAvailability,
  findWaymoServiceArea,
  WAYMO_SERVICE_AREAS,
} from '../server/services/waymoAvailability';
