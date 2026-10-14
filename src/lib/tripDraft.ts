import type { Coordinates, RideshareProvider, TripRequest } from './types';
import type { TransportModePreference, RoutePriority } from './preferences';

export interface SelectedTripPlace {
  placeId: string;
  name: string;
  formattedAddress: string;
  coordinates: Coordinates;
}

/**
 * A single trip draft shared across the Trip Details and Constraints setup screens.
 * One source of truth; assembled into the existing TripRequest only on "Let's Go!".
 */
export interface TripDraft {
  preferredTransportMode?: TransportModePreference;
  routePriority?: RoutePriority;
  usingSavedDefaults?: boolean;
  savedDefaultsLimited?: boolean;
  /** Typed origin address text. */
  originText: string;
  /** Resolved current-location coordinates, when the user chose "Use my location". */
  originCoordinates: Coordinates | null;
  destinationText: string;
  originPlace?: SelectedTripPlace | null;
  destinationPlace?: SelectedTripPlace | null;
  scheduleMode: 'departure' | 'arrival';
  /** Local datetime-local value for the chosen schedule mode. */
  scheduleTime: string;
  /** Whether "Now" was selected for departure. */
  departureNow: boolean;

  budgetUsd: number;
  maxWalkingMinutes: number;
  hasCar: boolean;
  avoidTolls: boolean;
  allowTransit: boolean;
  allowWalking: boolean;
  rideshareProviders: RideshareProvider[];
  /** Optional rideshare-only budget; undefined when no budget is set. */
  maxRideshareBudget?: number;
  notes: string;
}

export const DEFAULT_TRIP_DRAFT: TripDraft = {
  originText: '',
  originCoordinates: null,
  destinationText: '',
  scheduleMode: 'departure',
  scheduleTime: '',
  departureNow: false,
  budgetUsd: 25,
  maxWalkingMinutes: 15,
  hasCar: false,
  avoidTolls: false,
  allowTransit: true,
  allowWalking: true,
  rideshareProviders: ['LYFT', 'WAYMO', 'UBER'],
  maxRideshareBudget: undefined,
  notes: '',
};

/**
 * Combines the Trip Details and Constraints draft into the existing TripRequest shape.
 * Does not change the backend contract. Throws a user-facing message when invalid.
 */
export function draftToTripRequest(draft: TripDraft): TripRequest {
  const date = draft.departureNow && draft.scheduleMode === 'departure'
    ? new Date()
    : new Date(draft.scheduleTime);
  if (!Number.isFinite(date.getTime())
    || (!draft.departureNow && date.getTime() <= Date.now())
    || date.getTime() > Date.now() + 7 * 86400000) {
    throw new Error('Choose a time in the future and within the next seven days.');
  }
  const timestamp = date.toISOString();
  const origin = draft.originPlace ? { placeId: draft.originPlace.placeId } : draft.originCoordinates ?? { address: draft.originText.trim() };
  return {
    origin,
    destination: draft.destinationPlace ? { placeId: draft.destinationPlace.placeId } : { address: draft.destinationText.trim() },
    ...(draft.scheduleMode === 'arrival' ? { arrivalTime: timestamp } : { departureTime: timestamp }),
    budgetUsd: draft.budgetUsd,
    maxWalkingMinutes: draft.allowWalking ? draft.maxWalkingMinutes : 0,
    hasCar: draft.hasCar,
    avoidTolls: draft.hasCar && draft.avoidTolls,
    allowTransit: draft.allowTransit,
    allowWalking: draft.allowWalking,
    preference: draft.routePriority === 'FASTEST' ? 'fastest' : draft.routePriority === 'CHEAPEST' ? 'cheapest' : 'balanced',
    nearbyCategories: [],
    rideshareProviders: draft.rideshareProviders,
    ...(draft.maxRideshareBudget !== undefined ? { maxRideshareBudget: draft.maxRideshareBudget } : {}),
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
  };
}
