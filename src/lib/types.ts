/** Starter contract: agree on field changes together before implementing APIs. */
export type StopCategory = "food" | "coffee" | "attraction" | "rest";
export interface StopPreferences {
  categories: StopCategory[];
  maxDetourMinutes: number;
}
export interface TripRequest {
  origin: string;
  destination: string;
  preferences: StopPreferences;
}
export interface SuggestedStop {
  id: string;
  name: string;
  address: string;
  category: StopCategory;
  location: { lat: number; lng: number };
  reason: string;
}
export interface FinalTripRequest extends TripRequest {
  selectedStops: SuggestedStop[];
}
export interface RouteOption {
  id: string;
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  stops: SuggestedStop[];
}
export interface TripPlan {
  routes: RouteOption[];
}
