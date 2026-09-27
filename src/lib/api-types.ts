// Wire contract snapshot from routewise-backend/src/types/index.ts.
// Keep synchronized when the backend contract changes. UI adapters live in api.ts.
export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type Location =
  | { address: string }
  | { placeId: string }
  | Coordinates;

export type TripCategory = 'food' | 'coffee' | 'parking' | 'gas' | 'ev_charging' | 'pharmacy';
export type TripPreference = 'balanced' | 'cheapest' | 'fastest' | 'least_walking';

export interface TripRequest {
  origin: Location;
  destination: Location;
  arrivalTime?: string;
  departureTime?: string;
  allowTransit?: boolean;
  allowWalking?: boolean;
  notes?: string;
  hasCar?: boolean;
  hasBike?: boolean;
  budgetUsd?: number;
  maxWalkingMinutes?: number;
  avoidTolls?: boolean;
  preference?: TripPreference;
  nearbyCategories?: TripCategory[];
}

export type SuggestedStopCategory = 'food' | 'coffee' | 'gas' | 'groceries' | 'dessert' | 'pharmacy';
export type StopTimeOfDay = 'MORNING' | 'MIDDAY' | 'EVENING' | 'LATE_NIGHT';

export interface SuggestedStop {
  id: string;
  name: string;
  category: SuggestedStopCategory;
  address: string;
  location: Coordinates;
  description: string;
}

export interface SuggestStopsResponse {
  dataMode: 'demo' | 'live';
  availableCategories: SuggestedStopCategory[];
  timeOfDay: StopTimeOfDay;
  recommendedCategories: SuggestedStopCategory[];
  stops: SuggestedStop[];
  category?: StopCategory;
  searchArea?: StopSearchArea;
  candidates?: SuggestedPlaceCandidate[];
  rejectedCandidates?: Array<SuggestedPlaceCandidate & { rejectionReasons: string[] }>;
  warnings?: string[];
}

export interface FinalTripRequest extends TripRequest {
  selectedStop?: FinalTripSelectedStop;
  skip?: boolean;
  maxExtraMinutes?: number;
  maxExtraBudget?: number;
}

export type TripPlanRank = 'BEST' | 'FASTEST' | 'CHEAPEST';
export type RouteConstraintState = 'met' | 'exceeded' | 'unknown' | 'not_requested';

export interface TripPlanStep {
  mode: 'DRIVE' | 'TRANSIT' | 'WALK' | 'BICYCLE';
  instruction?: string;
  durationMinutes?: number;
  distanceMeters?: number;
  transit?: {
    headsign?: string;
    line?: string;
    lineShortName?: string;
    departureStop?: string;
    arrivalStop?: string;
  };
}

export interface TripPlanRouteOption {
  encodedPolyline?: string;
  tolls?: TollEstimate;
  parking?: DestinationParking;
  id: string;
  mode: 'TRANSIT' | 'DRIVE' | 'WALK' | 'BICYCLE';
  durationMinutes: number;
  distanceMeters: number;
  walkingMinutes: number | null;
  estimatedTransportationCost: {
    amount: number;
    currency: string;
    source: 'google_routes_estimate' | 'no_fare' | 'demo';
  } | null;
  steps: TripPlanStep[];
  origin: Location;
  destination: Location;
  extraStopMinutes: number | null;
  constraints: {
    budget: RouteConstraintState;
    walking: RouteConstraintState;
    extraTime: RouteConstraintState;
    extraBudget: RouteConstraintState;
    eligible: true;
  };
  warnings: string[];
}


export interface TripPlan {
  id: string;
  generatedAt: string;
  dataMode: 'live' | 'demo';
  origin: Location;
  destination: Location;
  selectedStop: FinalTripSelectedStop | null;
  routeOptions: TripPlanRouteOption[];
  rankings: {
    best: string | null;
    fastest: string | null;
    cheapest: string | null;
  };
  recommendationSource: 'gemini' | 'rules';
  warnings: string[];
}

export interface TripPlanRankings {
  best: string | null;
  fastest: string | null;
  cheapest: string | null;
}

export interface PlanTripInput {
  origin: Location;
  destination: Location;
}

export interface RouteOption {
  id: string;
  durationMinutes: number;
  distanceMeters: number;
  costAmount: number | null;
}

export interface RouteRanking {
  best: string | null;
  fastest: string | null;
  cheapest: string | null;
}

export type StopCategory = 'food' | 'coffee' | 'gas' | 'groceries' | 'dessert' | 'pharmacy';
export type StopSearchArea = 'ON_ROUTE' | 'DESTINATION';
export type SuggestStopsRequest = TripRequest & {
  category?: StopCategory;
  searchArea?: StopSearchArea;
  maxExtraMinutes?: number;
  maxExtraBudget?: number;
  radiusMeters?: number;
  maxResults?: number;
};
export interface SuggestedPlaceCandidate extends PlaceCandidate {
  extraStopMinutes: number | null;
  comparisonMode: 'DRIVE' | 'TRANSIT' | 'WALK' | 'BICYCLE' | null;
  routeWalkingMinutes: number | null;
  budgetStatus: 'not_requested' | 'within_limit' | 'exceeds_limit' | 'unknown';
}

export type PlacePriceLevel = 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE'
  | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE';
export type PlaceBusinessStatus = 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';

export type PlaceSearchRequest = {
  category: StopCategory;
  searchArea: 'DESTINATION';
  destination: Coordinates;
  radiusMeters?: number;
  maxResults?: number;
} | {
  category: StopCategory;
  searchArea: 'ON_ROUTE';
  routePolyline: string;
  radiusMeters?: number;
  maxResults?: number;
};

export interface PlaceCandidate {
  placeId: string;
  name: string;
  category: StopCategory;
  address: string | null;
  coordinates: Coordinates | null;
  rating: number | null;
  priceLevel: PlacePriceLevel | null;
  businessStatus: PlaceBusinessStatus | null;
  openNow: boolean | null;
  mapsUri: string | null;
}

export type FinalTripSelectedStop = SuggestedStop | (PlaceCandidate & {
  purchaseCostEstimate?: PurchaseCostEstimate;
});

export interface PurchaseCostEstimate {
  amount: number;
  currency: string;
  precision: 'estimated' | 'exact';
  source: string;
}
export interface TollEstimate {
  status: 'estimated' | 'unknown' | 'not_reported';
  prices: Array<{ amount: number; currency: string }>;
}

export interface ParkingLocation {
  placeId: string;
  name: string;
  address: string | null;
  coordinates: Coordinates;
  distanceMeters: number;
  mapsUri: string;
  openNow: boolean | null;
}

export interface DestinationParking {
  status: 'available' | 'none' | 'unavailable';
  locations: ParkingLocation[];
}
