import { getPricingTimeContext } from './timeContext';
import { unavailableFare, type FareEstimate, type FareRequest } from './types';
type Segment = { departure: { iataCode: string; at: string }; arrival: { iataCode: string; at: string }; carrierCode: string };
/** Documented Amadeus Self-Service Flight Offers Search; no browser scraping. */
export async function amadeusFlightPricing(request: FareRequest, options: {
  apiKey?: string; apiSecret?: string; environment?: string; fetchImpl?: typeof fetch;
} = {}): Promise<FareEstimate | null> {
  const key = options.apiKey ?? process.env.AMADEUS_API_KEY, secret = options.apiSecret ?? process.env.AMADEUS_API_SECRET;
  const environment = options.environment ?? process.env.AMADEUS_ENV ?? 'test';
  const from = request.providerMetadata?.departureAirport, to = request.providerMetadata?.arrivalAirport;
  const passengers = request.passengers ?? 1;
  const context = getPricingTimeContext(request.departureTime, 'latitude' in request.origin ? request.origin : null);
  const date = context?.date ?? request.departureTime?.slice(0, 10);
  if (!key || !secret || !request.departureTime || !Number.isFinite(Date.parse(request.departureTime)) || !from || !to || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)
    || from === to || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(passengers) || passengers < 1 || passengers > 9
    || !['test', 'production'].includes(environment)) return null;
  const base = environment === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const auth = await fetchImpl(`${base}/v1/security/oauth2/token`, { method: 'POST', signal: AbortSignal.timeout(2500),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: key, client_secret: secret }).toString() });
    if (!auth.ok) return null;
    const token = await auth.json() as { access_token?: unknown };
    if (typeof token.access_token !== 'string' || !token.access_token) return null;
    const query = new URLSearchParams({ originLocationCode: from, destinationLocationCode: to, departureDate: date,
      adults: String(passengers), currencyCode: 'USD', max: '25' });
    const response = await fetchImpl(`${base}/v2/shopping/flight-offers?${query}`, { signal: AbortSignal.timeout(3500),
      headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!response.ok) return null;
    const data = await response.json() as { data?: unknown[] };
    const offers = (Array.isArray(data.data) ? data.data : []).flatMap(value => {
      if (!value || typeof value !== 'object') return [];
      const offer = value as { id?: string; price?: { currency?: string; grandTotal?: string; total?: string };
        travelerPricings?: unknown[]; itineraries?: { duration?: string; segments?: Segment[] }[] };
      const price = Number(offer.price?.grandTotal ?? offer.price?.total), itinerary = offer.itineraries?.[0], segments = itinerary?.segments;
      if (offer.price?.currency !== 'USD' || !Number.isFinite(price) || price <= 0 || offer.itineraries?.length !== 1
        || offer.travelerPricings?.length !== passengers || !segments?.length
        || segments.some((segment, index) => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(segment.departure?.at ?? '')
          || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(segment.arrival?.at ?? '') || !/^[A-Z0-9]{2}$/.test(segment.carrierCode ?? '')
          || index > 0 && segments[index - 1].arrival.iataCode !== segment.departure.iataCode)
        || segments[0].departure.iataCode !== from || segments.at(-1)!.arrival.iataCode !== to
        || segments[0].departure.at.slice(0, 10) !== date) return [];
      const duration = itinerary?.duration?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
      const durationMinutes = duration ? Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0) : null;
      return [{ id: offer.id, price, segments, durationMinutes }];
    });
    // Date is exact. Within that date, match the requested local time band first.
    const sameBand = offers.filter(offer => {
      const hour = Number(offer.segments[0].departure.at.slice(11, 13));
      const minutes = hour * 60 + Number(offer.segments[0].departure.at.slice(14, 16));
      const band = hour < 5 || hour >= 22 ? 'LATE_NIGHT' : hour < 7 ? 'EARLY_MORNING' : hour < 10 ? 'AM_PEAK'
        : hour < 16 ? 'MIDDAY' : hour < 19 ? 'PM_PEAK' : 'EVENING';
      return !context || band === context.timeBand && minutes >= context.localMinutes;
    });
    const offer = sameBand.sort((a, b) => a.price - b.price)[0];
    if (!offer) return null;
    return { ...unavailableFare(request), exactPrice: offer.price, sourceType: 'LIVE_API', kind: 'EXACT',
      appliesToTrip: environment === 'production', confidence: environment === 'production' ? 'HIGH' : 'LOW',
      label: environment === 'production' ? 'Live flight offer · confirm before booking' : 'Amadeus sandbox offer · test data',
      sourceUrl: 'https://developers.amadeus.com/self-service/category/flights/api-doc/flight-offers-search',
      metadata: { environment, offerId: offer.id, passengers, airline: offer.segments[0].carrierCode,
        departureTime: offer.segments[0].departure.at, arrivalTime: offer.segments.at(-1)!.arrival.at,
        stops: offer.segments.length - 1, durationMinutes: offer.durationMinutes, priceUnit: 'TRIP' } };
  } catch { return null; }
}
