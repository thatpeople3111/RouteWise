/** Single source of truth: backend/shared/contracts.ts. Use type-only imports. */
export type {
  TripRequest, TripInput, TripResponse, NearbyRequest, NearbyResponse,
  Location, Coordinates, Mode, Route, Place,
} from "../../backend/shared/contracts";
// Convenient UI aliases; these refer to the backend types, not separate definitions.
export type { TripResponse as TripPlan, Route as RouteOption } from "../../backend/shared/contracts";
