import { z } from 'zod';
export const fareSchema = z.object({
  provider: z.enum(['UBER', 'LYFT', 'WAYMO', 'BRIGHTLINE', 'AMTRAK', 'TRIRAIL', 'SUNRAIL', 'FLIGHT', 'RENTAL_CAR', 'PARKING', 'TRANSIT']),
  exactPrice: z.number().finite().nonnegative().optional(), priceLow: z.number().finite().nonnegative().optional(), priceHigh: z.number().finite().nonnegative().optional(),
  currency: z.literal('USD'), sourceType: z.enum(['LIVE_API', 'OFFICIAL', 'PUBLIC_BOOKING_PAGE', 'GEMINI_GROUNDED', 'MODELED', 'UNAVAILABLE']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']), label: z.string(), kind: z.enum(['EXACT', 'RANGE', 'FROM', 'UNAVAILABLE']),
  appliesToTrip: z.boolean(), retrievedAt: z.string(), bookingUrl: z.string().url().optional(), sourceUrl: z.string().url().optional(),
  methodology: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((fare, ctx) => {
  if (fare.kind === 'EXACT' && fare.exactPrice === undefined || fare.kind === 'FROM' && fare.priceLow === undefined
    || fare.kind === 'RANGE' && (fare.priceLow === undefined || fare.priceHigh === undefined || fare.priceHigh < fare.priceLow)
    || fare.kind === 'FROM' && fare.appliesToTrip || fare.sourceType === 'UNAVAILABLE' && (fare.kind !== 'UNAVAILABLE' || fare.exactPrice !== undefined || fare.priceLow !== undefined || fare.priceHigh !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'Invalid normalized fare.' });
  }
});
export type FareEstimate = z.infer<typeof fareSchema>;
