import { z } from 'zod';

export const transportModeSchema = z.enum(['PUBLIC_TRANSIT', 'DRIVING', 'WALKING', 'RIDESHARE']);
export const routePrioritySchema = z.enum(['BEST', 'FASTEST', 'CHEAPEST']);
export const preferenceValuesSchema = z.object({
  preferredTransportMode: transportModeSchema,
  routePriority: routePrioritySchema,
  maxWalkingMinutes: z.number().int().min(0).max(2147483647).nullable().optional(),
  maxBudget: z.number().min(0).max(99999999.99).nullable().optional(),
}).strict();

export type PreferenceValues = z.infer<typeof preferenceValuesSchema>;
export type TransportModePreference = z.infer<typeof transportModeSchema>;
export type RoutePriority = z.infer<typeof routePrioritySchema>;
export type UserPreferences = {
  userId: string; preferredTransportMode: TransportModePreference; routePriority: RoutePriority;
  maxWalkingMinutes: number | null; maxBudget: number | null; createdAt: string; updatedAt: string;
};
