import type { Coordinates } from '../types/index';

/**
 * App-maintained transit fare reference based on official published agency base fares.
 *
 * Used only as a fallback when the Google Routes API does not return a live transitFare for a
 * trip. Values are single adult base fares from official agency sources and may not reflect
 * transfers, passes, discounts, or zone pricing. When the live API does return a fare, that
 * value always takes precedence and this service is not consulted.
 *
 * This data is NOT invented — it is maintained from published official fare schedules. It should
 * be updated here (in one place) as agencies change their fares.
 */

export interface TransitFareReference {
  fareAvailable: boolean;
  amount?: number;
  currency: 'USD';
  /** 'agency_official' means from the maintained official-fare config; 'unavailable' means unknown. */
  source: 'agency_official' | 'unavailable';
  sourceName?: string;
}

interface AgencyFareEntry {
  name: string;
  /** One-way base adult fare in USD, from the agency's official published schedule. */
  baseFareUsd: number;
  /** Optional rough bounding box limiting where this fallback applies. */
  region?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

const MIAMI_DADE_REGION = { minLat: 25.1, maxLat: 26.3, minLng: -80.9, maxLng: -80.0 };

/**
 * Maintained official-fare lookup. Keys are normalized substrings of the Google transit line name.
 * Order matters: first match wins, so more specific entries come first.
 */
const OFFICIAL_FARE_CONFIG: ReadonlyArray<{ match: string } & AgencyFareEntry> = [
  { match: 'metrorail', name: 'Miami-Dade Metrorail', baseFareUsd: 2.25, region: MIAMI_DADE_REGION },
  { match: 'metromover', name: 'Miami-Dade Metromover (free)', baseFareUsd: 0, region: MIAMI_DADE_REGION },
  { match: 'metrobus', name: 'Miami-Dade Metrobus', baseFareUsd: 2.25, region: MIAMI_DADE_REGION },
  { match: 'miami-dade', name: 'Miami-Dade Transit', baseFareUsd: 2.25, region: MIAMI_DADE_REGION },
  // Tri-Rail requires station zones and a travel date. Do not apply a generic $5
  // fare to weekday trips; pricing/railPricing supplies the maintained table.
];

function inRegion(region: { minLat: number; maxLat: number; minLng: number; maxLng: number } | undefined, point: Coordinates | null | undefined): boolean {
  if (!region) return true;
  if (!point) return true; // no coordinates to disprove; fall back to name match
  return point.latitude >= region.minLat && point.latitude <= region.maxLat
    && point.longitude >= region.minLng && point.longitude <= region.maxLng;
}

/**
 * Looks up a maintained official base fare for a transit route from its line names and location.
 * Returns fareAvailable: false when no maintained entry applies — never invents a fare.
 */
export function lookupTransitFare(input: {
  lines: ReadonlyArray<string | null | undefined>;
  origin?: Coordinates | null;
  destination?: Coordinates | null;
}): TransitFareReference {
  const names = input.lines.filter((line): line is string => typeof line === 'string' && line.trim().length > 0);
  for (const entry of OFFICIAL_FARE_CONFIG) {
    const matched = names.some(name => name.toLowerCase().includes(entry.match));
    if (matched && inRegion(entry.region, input.origin) && inRegion(entry.region, input.destination)) {
      return {
        fareAvailable: true,
        amount: entry.baseFareUsd,
        currency: 'USD',
        source: 'agency_official',
        sourceName: entry.name,
      };
    }
  }
  return { fareAvailable: false, currency: 'USD', source: 'unavailable' };
}
