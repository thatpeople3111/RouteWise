/** UI view models, separate from the active backend wire types in api-types.ts. */
export type {
  TripRequest, TripInput, TripResponse, NearbyRequest, NearbyResponse,
  Location, Coordinates, Mode, Route, Place,
} from "./view-contracts";
// Existing card view models; the live wire response is mapped explicitly in api.ts.
export type { TripResponse as TripPlan } from "./view-contracts";

import type { Route } from './view-contracts';
import type { SuggestedPlaceCandidate } from './api-types';
export type RouteOption = Route & { includesStop?: boolean; extraStopMinutes?: number | null };

export type SuggestedStopCategory = "food" | "coffee" | "gas" | "groceries" | "dessert" | "pharmacy";
export type SuggestedStopTiming = "ON_ROUTE" | "DESTINATION";

export type { SafeWaitCandidate, SafeWaitResponse } from "./api-types";

export type SuggestedStop = {
  id: string;
  name: string;
  category: SuggestedStopCategory;
  address: string;
  estimatedExtraMinutes: number | null;
  estimatedCost?: number;
  rating: number | null;
  timing: SuggestedStopTiming;
  dataMode?: "demo" | "live";
  candidate?: SuggestedPlaceCandidate;
};
