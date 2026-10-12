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

export type RideshareProvider = 'LYFT' | 'WAYMO' | 'UBER';

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
  /** Optional rideshare-only budget in USD. Kept separate from budgetUsd (overall trip) and maxExtraBudget (optional stop). */
  maxRideshareBudget?: number;
  /** Providers the user wants to see. Defaults to all supported providers when omitted. */
  rideshareProviders?: RideshareProvider[];
}

export type SuggestedStopCategory = 'food' | 'coffee' | 'gas' | 'groceries' | 'dessert' | 'pharmacy';

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

export type StopTimeOfDay = 'MORNING' | 'MIDDAY' | 'EVENING' | 'LATE_NIGHT';

export interface FinalTripRequest extends TripRequest {
  selectedStop?: FinalTripSelectedStop;
  skip?: boolean;
  maxExtraMinutes?: number;
  maxExtraBudget?: number;
}

export type TripPlanRank = 'BEST' | 'FASTEST' | 'CHEAPEST';
export type RouteConstraintState = 'met' | 'exceeded' | 'unknown' | 'not_requested';

/** Distinguishes an internally calculated estimate from a live provider quote. */
export type RidesharePriceSource = 'estimate' | 'provider' | 'unavailable';

export interface RideshareOption {
  fare?: import('../pricing/types').FareEstimate;
  id: string;
  provider: RideshareProvider;
  available: boolean;
  unavailableReason?: string;
  unavailableDetail?: string;
  estimatedPickupMinutes?: number;
  estimatedRideMinutes?: number;
  estimatedTotalMinutes?: number;
  estimatedPriceLow?: number;
  estimatedPriceHigh?: number;
  priceSource?: RidesharePriceSource;
  /** null when no rideshare budget was set or the price is unknown. */
  withinBudget?: boolean | null;
  currency?: string;
  origin: string;
  destination: string;
  vehicleType?: string;
  bookingUrl?: string;
  notes?: string[];
}

export interface TripPlanStep {
  mode: 'DRIVE' | 'TRANSIT' | 'WALK' | 'BICYCLE';
  instruction?: string;
  durationMinutes?: number;
  distanceMeters?: number;
  /** Per-segment geometry for this step, when the provider returns it. */
  encodedPolyline?: string;
  transit?: {
    headsign?: string;
    line?: string;
    lineShortName?: string;
    /** Vehicle type as returned by the provider (e.g. Bus, Subway, Rail). */
    vehicleType?: string;
    vehicleName?: string;
    lineColor?: string;
    agencyName?: string;
    stopCount?: number;
    departureStop?: string;
    arrivalStop?: string;
  };
}

/** One distinct public-transit journey alternative (which may itself contain transfers). */
export interface TransitAlternative {
  fare?: import('../pricing/types').FareEstimate;
  id: string;
  /** Short label derived from the actual vehicle types/lines, e.g. "Bus" or "Bus + Rail". */
  title: string;
  durationMinutes: number;
  distanceMeters: number;
  walkingMinutes: number | null;
  estimatedTransportationCost: {
    amount: number;
    currency: string;
    source: 'google_routes_estimate' | 'no_fare' | 'demo' | 'agency_official';
    sourceName?: string;
  } | null;
  encodedPolyline?: string;
  steps: TripPlanStep[];
  /** Number of transfers between transit vehicles (initial boarding excluded). */
  transfers: number;
  recommended?: boolean;
  availability?: {
    available: boolean;
    reasonCode?: string;
    message?: string;
  };
  warnings: string[];
}

export interface TripPlanRouteOption {
  fare?: import('../pricing/types').FareEstimate;
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
    source: 'google_routes_estimate' | 'no_fare' | 'demo' | 'agency_official';
    /** Human-readable fare source, e.g. an official transit agency. */
    sourceName?: string;
  } | null;
  /** Resolved origin coordinates, when the route service returned them. */
  originCoordinates?: Coordinates;
  steps: TripPlanStep[];
  /** Alternative transit journeys, when more than one transit route is returned. */
  transitAlternatives?: TransitAlternative[];
  origin: Location;
  destination: Location;
  extraStopMinutes: number | null;
  /** Structured reason this route was excluded from ranking; absent when eligible. */
  availability?: {
    available: boolean;
    reasonCode?: 'WALKING_LIMIT_EXCEEDED' | 'BUDGET_EXCEEDED' | 'EXTRA_TIME_EXCEEDED' | 'EXTRA_BUDGET_EXCEEDED' | 'WALKING_UNVERIFIABLE' | 'NO_ROUTE';
    message?: string;
  };
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
  tripScope?: 'LOCAL' | 'LONG_DISTANCE';
  longDistance?: import('./longDistance').LongDistancePlan;
  id: string;
  generatedAt: string;
  dataMode: 'live' | 'demo';
  origin: Location;
  destination: Location;
  selectedStop: FinalTripSelectedStop | null;
  routeOptions: TripPlanRouteOption[];
  /** Rankings reference route option IDs, or a rideshare option ID when a rideshare wins a time-based label. */
  rankings: {
    best: string | null;
    fastest: string | null;
    cheapest: string | null;
  };
  rideshares?: RideshareOption[];
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
  comparisonMode: 'DRIVE' | 'TRANSIT' | 'WALK' | null;
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
  /** App-maintained official-published parking price, null when unknown. Never invented. */
  priceAmount?: number | null;
  priceCurrency?: string;
  priceSource?: 'official_config' | 'unavailable';
  fare?: import('../pricing/types').FareEstimate;
  /** Pedestrian route time from this lot to the destination, when routing is available. */
  walkingMinutes?: number | null;
  walkingDistanceMeters?: number | null;
  /** The lot RouteWise recommends for the driving total. */
  recommended?: boolean;
}

export interface DestinationParking {
  status: 'available' | 'none' | 'unavailable';
  locations: ParkingLocation[];
}

export interface SafeWaitCandidate {
  placeId: string;
  name: string;
  category: string;
  address: string | null;
  coordinates: Coordinates | null;
  rating: number | null;
  openNow: boolean | null;
  businessStatus: PlaceBusinessStatus | null;
  mapsUri: string | null;
  distanceMeters: number | null;
  walkingMinutes: number | null;
}

export interface SafeWaitResponse {
  dataMode: 'live';
  best: SafeWaitCandidate | null;
  alternates: SafeWaitCandidate[];
  warnings: string[];
}
