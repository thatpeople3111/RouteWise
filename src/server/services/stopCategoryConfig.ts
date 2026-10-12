import type { StopCategory } from '../types/index';

/** Google Places search types and corridor widths, maintained in one place. */
export const stopCategoryConfig: Record<StopCategory, { type: string; textQuery: string; radius: number; expandedRadius: number }> = {
  food: { type: 'restaurant', textQuery: 'restaurants', radius: 1500, expandedRadius: 3000 },
  coffee: { type: 'cafe', textQuery: 'coffee shops', radius: 1500, expandedRadius: 3000 },
  gas: { type: 'gas_station', textQuery: 'gas station', radius: 2500, expandedRadius: 5000 },
  groceries: { type: 'grocery_store', textQuery: 'grocery supermarket', radius: 2500, expandedRadius: 5000 },
  dessert: { type: 'dessert_shop', textQuery: 'dessert ice cream bakery', radius: 2000, expandedRadius: 4000 },
  pharmacy: { type: 'pharmacy', textQuery: 'pharmacy', radius: 2500, expandedRadius: 5000 },
};
