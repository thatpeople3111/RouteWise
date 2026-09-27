import type {
  FinalTripRequest,
  Location,
  PlaceCandidate,
  PlaceBusinessStatus,
  PlacePriceLevel,
  PurchaseCostEstimate,
  SuggestedStop,
  SuggestedStopCategory,
  SuggestStopsRequest,
  TripCategory,
  TripPreference,
  TripRequest,
} from '../types/index';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const tripCategories: readonly TripCategory[] = [
  'food', 'coffee', 'parking', 'gas', 'ev_charging', 'pharmacy',
];
const tripPreferences = ['balanced', 'cheapest', 'fastest', 'least_walking'] as const;
const tripRequestKeys = new Set([
  'origin', 'destination', 'arrivalTime', 'departureTime', 'allowTransit', 'allowWalking', 'notes',
  'hasCar', 'hasBike', 'budgetUsd', 'maxWalkingMinutes', 'avoidTolls', 'preference',
  'nearbyCategories',
]);
const finalTripRequestKeys = new Set([...tripRequestKeys, 'selectedStop', 'skip', 'maxExtraMinutes', 'maxExtraBudget']);
const suggestStopsRequestKeys = new Set([
  ...tripRequestKeys,
  'category', 'searchArea', 'maxExtraMinutes', 'maxExtraBudget', 'radiusMeters', 'maxResults',
]);
const suggestedStopCategories: readonly SuggestedStopCategory[] = [
  'food', 'coffee', 'gas', 'groceries', 'dessert', 'pharmacy',
];

function isCoordinates(value: unknown): value is Location {
  return isRecord(value)
    && Object.keys(value).length === 2
    && typeof value.latitude === 'number'
    && Number.isFinite(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && typeof value.longitude === 'number'
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180;
}

function isLocation(value: unknown): value is Location {
  if (!isRecord(value)) return false;
  if (isCoordinates(value)) return true;

  const keys = Object.keys(value);
  if (keys.length !== 1) return false;
  if ('address' in value) {
    return typeof value.address === 'string'
      && value.address.trim().length >= 2
      && value.address.trim().length <= 300;
  }
  if ('placeId' in value) {
    return typeof value.placeId === 'string'
      && value.placeId.trim().length >= 3
      && value.placeId.trim().length <= 300;
  }
  return false;
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

export function isTripRequest(value: unknown): value is TripRequest {
  if (!isRecord(value)
    || Object.keys(value).some(key => !tripRequestKeys.has(key))
    || !isLocation(value.origin)
    || !isLocation(value.destination)) {
    return false;
  }

  if ('arrivalTime' in value && !isIsoDateTime(value.arrivalTime)) return false;
  if ('departureTime' in value && !isIsoDateTime(value.departureTime)) return false;
  if ('arrivalTime' in value && 'departureTime' in value) return false;
  if ('allowTransit' in value && typeof value.allowTransit !== 'boolean') return false;
  if ('allowWalking' in value && typeof value.allowWalking !== 'boolean') return false;
  if ('hasCar' in value && typeof value.hasCar !== 'boolean') return false;
  if ('hasBike' in value && typeof value.hasBike !== 'boolean') return false;
  if ('avoidTolls' in value && typeof value.avoidTolls !== 'boolean') return false;
  if ('notes' in value && (typeof value.notes !== 'string' || value.notes.trim().length > 1000)) return false;
  if ('budgetUsd' in value
    && (typeof value.budgetUsd !== 'number' || !Number.isFinite(value.budgetUsd)
      || value.budgetUsd < 0 || value.budgetUsd > 1000)) return false;
  if ('maxWalkingMinutes' in value
    && (typeof value.maxWalkingMinutes !== 'number' || !Number.isInteger(value.maxWalkingMinutes)
      || value.maxWalkingMinutes < 0 || value.maxWalkingMinutes > 180)) return false;
  if ('preference' in value && !tripPreferences.includes(value.preference as TripPreference)) return false;
  if ('nearbyCategories' in value
    && (!Array.isArray(value.nearbyCategories)
      || value.nearbyCategories.length > 3
      || value.nearbyCategories.some(category => !tripCategories.includes(category as TripCategory)))) {
    return false;
  }

  return true;
}

function isSuggestedStop(value: unknown): value is SuggestedStop {
  return isRecord(value)
    && Object.keys(value).length === 6
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.name === 'string'
    && value.name.length > 0
    && suggestedStopCategories.includes(value.category as SuggestedStopCategory)
    && typeof value.address === 'string'
    && value.address.length > 0
    && isCoordinates(value.location)
    && typeof value.description === 'string';
}

function isPurchaseCostEstimate(value: unknown): value is PurchaseCostEstimate {
  return isRecord(value)
    && typeof value.amount === 'number'
    && Number.isFinite(value.amount)
    && value.amount >= 0
    && typeof value.currency === 'string'
    && (value.precision === 'estimated' || value.precision === 'exact')
    && typeof value.source === 'string'
    && value.source.trim().length > 0;
}

const validPriceLevels: readonly PlacePriceLevel[] = [
  'PRICE_LEVEL_FREE', 'PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE',
];
const validBusinessStatuses: readonly PlaceBusinessStatus[] = [
  'OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY',
];

function isPlaceCandidate(value: unknown): value is PlaceCandidate & { purchaseCostEstimate?: PurchaseCostEstimate } {
  if (!isRecord(value)) return false;
  const allowedKeys = new Set([
    'placeId', 'name', 'category', 'address', 'coordinates', 'rating', 'priceLevel',
    'businessStatus', 'openNow', 'mapsUri', 'purchaseCostEstimate', 'extraStopMinutes',
    'comparisonMode', 'routeWalkingMinutes', 'budgetStatus', 'rejectionReasons',
  ]);
  if (Object.keys(value).some(key => !allowedKeys.has(key))) return false;
  if (typeof value.placeId !== 'string' || value.placeId.length === 0
    || typeof value.name !== 'string' || value.name.length === 0
    || !suggestedStopCategories.includes(value.category as SuggestedStopCategory)) return false;
  if (!(value.address === null || typeof value.address === 'string')) return false;
  if (!(value.coordinates === null || isCoordinates(value.coordinates))) return false;
  if (!(value.rating === null || (typeof value.rating === 'number' && Number.isFinite(value.rating)))) return false;
  if (!(value.priceLevel === null || validPriceLevels.includes(value.priceLevel as PlacePriceLevel))) return false;
  if (!(value.businessStatus === null || validBusinessStatuses.includes(value.businessStatus as PlaceBusinessStatus))) return false;
  if (!(value.openNow === null || typeof value.openNow === 'boolean')) return false;
  if (!(value.mapsUri === null || typeof value.mapsUri === 'string')) return false;
  if ('purchaseCostEstimate' in value && !isPurchaseCostEstimate(value.purchaseCostEstimate)) return false;
  if ('extraStopMinutes' in value
    && !(value.extraStopMinutes === null || (typeof value.extraStopMinutes === 'number'
      && Number.isFinite(value.extraStopMinutes) && value.extraStopMinutes >= 0))) return false;
  if ('comparisonMode' in value
    && !(value.comparisonMode === null || ['DRIVE', 'TRANSIT', 'WALK', 'BICYCLE'].includes(String(value.comparisonMode)))) return false;
  if ('routeWalkingMinutes' in value
    && !(value.routeWalkingMinutes === null || (typeof value.routeWalkingMinutes === 'number'
      && Number.isFinite(value.routeWalkingMinutes) && value.routeWalkingMinutes >= 0))) return false;
  if ('budgetStatus' in value
    && !['not_requested', 'within_limit', 'exceeds_limit', 'unknown'].includes(String(value.budgetStatus))) return false;
  if ('rejectionReasons' in value
    && (!Array.isArray(value.rejectionReasons)
      || value.rejectionReasons.some(reason => typeof reason !== 'string'))) return false;
  return true;
}

function isSelectedStop(value: unknown): boolean {
  return isSuggestedStop(value) || isPlaceCandidate(value);
}

export function isFinalTripRequest(value: unknown): value is FinalTripRequest {
  if (!isRecord(value) || Object.keys(value).some(key => !finalTripRequestKeys.has(key))) {
    return false;
  }
  if ('skip' in value && typeof value.skip !== 'boolean') return false;
  if ('selectedStop' in value && !isSelectedStop(value.selectedStop)) return false;
  if (value.skip === true && 'selectedStop' in value) return false;
  if ('maxExtraMinutes' in value
    && (typeof value.maxExtraMinutes !== 'number' || !Number.isFinite(value.maxExtraMinutes)
      || value.maxExtraMinutes < 0)) return false;
  if ('maxExtraBudget' in value
    && (typeof value.maxExtraBudget !== 'number' || !Number.isFinite(value.maxExtraBudget)
      || value.maxExtraBudget < 0)) return false;

  const tripFields = Object.fromEntries(
    Object.entries(value).filter(([key]) => tripRequestKeys.has(key)),
  );
  return isTripRequest(tripFields);
}

export function isSuggestStopsRequest(value: unknown): value is SuggestStopsRequest {
  if (!isRecord(value) || Object.keys(value).some(key => !suggestStopsRequestKeys.has(key))) return false;

  const hasCategory = 'category' in value;
  const hasSearchArea = 'searchArea' in value;
  if (hasCategory !== hasSearchArea) return false;
  if (hasCategory && !suggestedStopCategories.includes(value.category as SuggestedStopCategory)) return false;
  if (hasSearchArea && value.searchArea !== 'ON_ROUTE' && value.searchArea !== 'DESTINATION') return false;

  for (const limitName of ['maxExtraMinutes', 'maxExtraBudget'] as const) {
    if (limitName in value
      && (typeof value[limitName] !== 'number' || !Number.isFinite(value[limitName]) || value[limitName] < 0)) return false;
  }
  if ('radiusMeters' in value
    && (typeof value.radiusMeters !== 'number' || !Number.isInteger(value.radiusMeters)
      || value.radiusMeters < 100 || value.radiusMeters > 50_000)) return false;
  if ('maxResults' in value
    && (typeof value.maxResults !== 'number' || !Number.isInteger(value.maxResults)
      || value.maxResults < 1 || value.maxResults > 20)) return false;

  const tripFields = Object.fromEntries(
    Object.entries(value).filter(([key]) => tripRequestKeys.has(key)),
  );
  return isTripRequest(tripFields);
}