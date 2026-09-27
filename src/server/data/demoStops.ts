import type { SuggestStopsResponse, SuggestedStop } from '../types/index';

export const DEMO_AVAILABLE_CATEGORIES: SuggestStopsResponse['availableCategories'] = [
  'food',
  'coffee',
  'gas',
  'groceries',
  'dessert',
  'pharmacy',
];

export const DEMO_SUGGESTED_STOPS: SuggestedStop[] = [
  {
    id: 'demo-food-1',
    name: 'Bayfront Market Cafe',
    category: 'food',
    address: '101 Biscayne Blvd, Miami, FL',
    location: { latitude: 25.7743, longitude: -80.1868 },
    description: 'Quick counter-service meals near downtown.',
  },
  {
    id: 'demo-coffee-1',
    name: 'Little Harbor Coffee',
    category: 'coffee',
    address: '220 SE 1st St, Miami, FL',
    location: { latitude: 25.7729, longitude: -80.1912 },
    description: 'Coffee and light snacks with indoor seating.',
  },
  {
    id: 'demo-grocery-1',
    name: 'Civic Center Grocer',
    category: 'groceries',
    address: '850 NW 12th Ave, Miami, FL',
    location: { latitude: 25.7821, longitude: -80.2114 },
    description: 'Convenience groceries and travel essentials.',
  },
  {
    id: 'demo-pharmacy-1',
    name: 'Central Pharmacy',
    category: 'pharmacy',
    address: '48 E Flagler St, Miami, FL',
    location: { latitude: 25.7745, longitude: -80.1937 },
    description: 'Basic health and personal-care supplies.',
  },
];

export function getDemoSuggestStopsResponse(
  recommendation: Pick<SuggestStopsResponse, 'timeOfDay' | 'recommendedCategories'>,
): SuggestStopsResponse {
  return {
    dataMode: 'demo',
    availableCategories: DEMO_AVAILABLE_CATEGORIES,
    ...recommendation,
    stops: DEMO_SUGGESTED_STOPS,
  };
}