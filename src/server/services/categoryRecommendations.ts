import type { TripRequest, StopTimeOfDay, SuggestedStopCategory } from '../types/index';
import { DEMO_AVAILABLE_CATEGORIES } from '../data/demoStops';

const CATEGORY_ORDER: Record<StopTimeOfDay, SuggestedStopCategory[]> = {
  MORNING: ['coffee', 'food', 'gas', 'pharmacy'],
  MIDDAY: ['food', 'coffee', 'groceries'],
  EVENING: ['food', 'dessert', 'groceries'],
  LATE_NIGHT: ['food', 'gas', 'pharmacy'],
};

function getTripHour(request: TripRequest): number | null {
  const tripTime = request.departureTime ?? request.arrivalTime;
  if (!tripTime) return null;

  const timeMatch = /T(\d{2}):\d{2}:\d{2}(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(tripTime);
  if (!timeMatch) return null;

  if (timeMatch[1] !== undefined && timeMatch[2] !== 'Z') {
    return Number(timeMatch[1]);
  }

  const date = new Date(tripTime);
  return Number.isNaN(date.valueOf()) ? null : date.getHours();
}

export function recommendStopCategories(request: TripRequest): {
  timeOfDay: StopTimeOfDay;
  recommendedCategories: SuggestedStopCategory[];
} {
  const hour = getTripHour(request);
  const timeOfDay: StopTimeOfDay = hour === null
    ? 'MIDDAY'
    : hour >= 5 && hour < 11
      ? 'MORNING'
      : hour >= 11 && hour < 17
        ? 'MIDDAY'
        : hour >= 17 && hour < 22
          ? 'EVENING'
          : 'LATE_NIGHT';

  const preferredOrder = CATEGORY_ORDER[timeOfDay];
  const preferredCategories = preferredOrder.filter(category => DEMO_AVAILABLE_CATEGORIES.includes(category));
  const remainingCategories = DEMO_AVAILABLE_CATEGORIES.filter(category => !preferredCategories.includes(category));

  return {
    timeOfDay,
    recommendedCategories: [...preferredCategories, ...remainingCategories],
  };
}