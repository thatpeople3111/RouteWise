import { lookupParkingPrice } from '../services/parkingPricing';
import type { FareAdapter, FareProvider } from './types';
import { unavailableFare } from './types';
import { publishedRailFare } from './railPricing';
import { amadeusFlightPricing } from './flightPricing';

/** No provider credentials/API agreements exist: live adapters are injected when connected.
 * Do not replace unavailable live APIs with private endpoints or authenticated web scraping.
 */
export const providerAdapters: Record<FareProvider, { domains: string[]; official?: FareAdapter; live?: (request: Parameters<FareAdapter>[0], fetchImpl?: typeof fetch) => ReturnType<FareAdapter> }> = {
  TRANSIT: { domains: [] },
  UBER: { domains: ['uber.com'] }, LYFT: { domains: ['lyft.com'] }, WAYMO: { domains: ['waymo.com', 'support.google.com'] },
  BRIGHTLINE: { domains: ['gobrightline.com'] }, AMTRAK: { domains: ['amtrak.com'] },
  TRIRAIL: { domains: ['tri-rail.com'], official: publishedRailFare }, SUNRAIL: { domains: ['sunrail.com'], official: publishedRailFare },
  FLIGHT: { domains: [], live: (request, fetchImpl) => amadeusFlightPricing(request, { fetchImpl }) },
  RENTAL_CAR: { domains: ['hertz.com', 'enterprise.com', 'avis.com', 'alamo.com', 'budget.com', 'nationalcar.com', 'orlandomco.com', 'tampaairport.com', 'atl.com'] },
  PARKING: { domains: [], official: async request => {
    const reference = lookupParkingPrice(request.providerMetadata?.facilityName ?? '');
    return reference.priceAvailable && reference.amount !== undefined ? { ...unavailableFare(request), exactPrice: reference.amount,
      sourceType: 'OFFICIAL', confidence: 'MEDIUM', kind: 'EXACT', label: 'Official published rate', appliesToTrip: false,
      methodology: reference.note ?? 'Maintained published facility rate; parking duration not verified.' } : null;
  } },
};
export function allowedPublicUrl(provider: FareProvider, source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && providerAdapters[provider].domains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
  } catch { return false; }
}
