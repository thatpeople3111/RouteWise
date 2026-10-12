import { fareSchema } from './pricing';
import { z } from 'zod';
import { coordinatesSchema, rideshareOptionSchema } from './view-contracts';

const hub = z.object({ id: z.string(), name: z.string(), kind: z.enum(['AIRPORT', 'TRAIN_STATION', 'TRANSIT_HUB']), coordinates: coordinatesSchema, sourceUrl: z.string().url() });
const connection = z.object({ from: z.string(), to: z.string(), mode: z.enum(['RIDESHARE', 'AT_HUB']),
  durationMinutes: z.number().nonnegative().nullable(), costUsd: z.number().nonnegative().nullable(), fare: fareSchema.optional(), rideshares: z.array(rideshareOptionSchema) });
const rental = z.object({ id: z.string(), provider: z.string(), logo: z.string(), pickup: z.string(), bookingUrl: z.string().url(),
  sourceUrl: z.string().url(), priceUsdPerDay: z.number().nonnegative().nullable(), fare: fareSchema.optional() });
export const longDistanceSchema = z.object({
  rankings: z.object({ best: z.string().nullable(), fastest: z.string().nullable(), cheapest: z.string().nullable() }),
  destinationHub: hub.nullable(),
  journeys: z.array(z.object({ id: z.string(), mode: z.enum(['DRIVING', 'RAIL', 'FLIGHT']), provider: z.string(), logo: z.string().optional(), fare: fareSchema.optional(),
    originHub: hub.optional(), destinationHub: hub.optional(), firstMile: connection.optional(), lastMile: connection.optional(),
    rentals: z.array(rental).optional(),
    durationMinutes: z.number().nonnegative().nullable(), rideMinutes: z.number().nonnegative().nullable(), bufferMinutes: z.number().nonnegative(),
    departureTime: z.string().optional(), arrivalTime: z.string().optional(), airline: z.string().optional(),
    stops: z.number().int().nonnegative().optional(), transfers: z.number().int().nonnegative().optional(),
    cost: z.object({ components: z.array(z.object({ label: z.string(), amountUsd: z.number().nonnegative().nullable(),
      source: z.enum(['live', 'official', 'estimated', 'unavailable']), note: z.string().optional(), fare: fareSchema.optional() })),
      priceLowUsd: z.number().nonnegative().nullable().optional(), priceHighUsd: z.number().nonnegative().nullable().optional(),
      knownSubtotalUsd: z.number().nonnegative(), knownSubtotalLowUsd: z.number().nonnegative().optional(), totalUsd: z.number().nonnegative().nullable(), complete: z.boolean() }),
    bookingUrl: z.string().url(), sourceUrl: z.string().url(), status: z.enum(['configured_service', 'route_estimate', 'search_only']),
    labels: z.array(z.enum(['BEST', 'FASTEST', 'CHEAPEST'])), warnings: z.array(z.string()),
  })),
  rentals: z.array(z.object({ id: z.string(), provider: z.string(), logo: z.string(), pickup: z.string(), bookingUrl: z.string().url(),
    sourceUrl: z.string().url(), priceUsdPerDay: z.number().nonnegative().nullable() })), warnings: z.array(z.string()),
}).superRefine((plan, ctx) => {
  const ids = new Set(plan.journeys.map(journey => journey.id));
  if (ids.size !== plan.journeys.length || Object.values(plan.rankings).some(id => id !== null && !ids.has(id))) {
    ctx.addIssue({ code: 'custom', message: 'Invalid long-distance journey ranking IDs.' });
  }
});
export type LongDistanceView = z.infer<typeof longDistanceSchema>;
