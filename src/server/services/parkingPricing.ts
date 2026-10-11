/**
 * App-maintained parking price reference based on official published garage/lot rates.
 *
 * Google Places does not return parking prices, so prices are provided only for garages/lots with
 * a known published rate in this maintained config. Everything else reports priceAvailable: false
 * and the UI shows "Price unavailable". Prices are NEVER invented or assumed uniform.
 *
 * Keys are matched against the parking facility name returned by Places. Update rates here.
 */

export interface ParkingPriceInfo {
  priceAvailable: boolean;
  amount?: number;
  currency: 'USD';
  /** 'official_config' means from the maintained official-rate config; 'unavailable' means unknown. */
  source: 'official_config' | 'unavailable';
  /** Short note about what the price covers (e.g. "published hourly/day rate"). */
  note?: string;
}

interface ParkingPriceEntry {
  match: string;
  amount: number;
  note?: string;
}

const KNOWN_PARKING_PRICES: ReadonlyArray<ParkingPriceEntry> = [
  // Maintained from published rates; extend as official data is gathered.
  { match: 'museum garage', amount: 10, note: 'Published day rate' },
  { match: 'wynwood garage', amount: 15, note: 'Published day rate' },
];

/**
 * Returns the maintained official price for a parking facility name, or unavailable.
 * Returns null-equivalent (priceAvailable: false) rather than a guessed number.
 */
export function lookupParkingPrice(facilityName: string): ParkingPriceInfo {
  const name = facilityName.trim().toLowerCase();
  if (name.length === 0) return { priceAvailable: false, currency: 'USD', source: 'unavailable' };
  const entry = KNOWN_PARKING_PRICES.find(candidate => name.includes(candidate.match));
  if (!entry) return { priceAvailable: false, currency: 'USD', source: 'unavailable' };
  return { priceAvailable: true, amount: entry.amount, currency: 'USD', source: 'official_config', note: entry.note };
}
