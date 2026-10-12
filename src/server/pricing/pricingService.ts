import { estimateModeledFare } from './modeledPricing';
import { providerAdapters } from './providers';
import { fetchPublicFareSource, type PublicFareSource } from './publicSource';
import { extractFareWithGemini, validateExtractedFare } from './geminiPriceExtractor';
import { unavailableFare, validFare, type FareAdapter, type FareEstimate, type FareProvider, type FareRequest } from './types';
import { prepareRailRequest } from './railPricing';
import { checkWaymoAvailability } from '../services/waymoAvailability';

export interface PricingOptions {
  liveAdapters?: Partial<Record<FareProvider, FareAdapter>>;
  officialAdapters?: Partial<Record<FareProvider, FareAdapter>>;
  publicEnabled?: boolean;
  fetchImpl?: typeof fetch;
  extract?: typeof extractFareWithGemini;
  now?: () => number;
  ttlMs?: number;
}
function publicStartingFare(request: FareRequest, source: PublicFareSource): FareEstimate | null {
  const evidence = source.text.match(/(?:fares?|tickets?|rides?|rentals?)\b[^.]{0,80}?\b(?:from|starting at)\s*(?:USD\s*|\$\s*)\d+(?:\.\d{1,2})?/i)?.[0];
  if (!evidence) return null;
  const amount = Number(evidence.match(/(?:USD\s*|\$\s*)(\d+(?:\.\d{1,2})?)/)?.[1]);
  const fare = validateExtractedFare({ sourceFound: true, currency: 'USD', fareLabel: 'from', priceLow: amount, evidence }, request, source);
  return fare ? { ...fare, sourceType: 'PUBLIC_BOOKING_PAGE' } : null;
}
export class PricingService {
  private cache = new Map<string, { expires: number; fare: FareEstimate }>();
  private pending = new Map<string, Promise<FareEstimate>>();
  constructor(private options: PricingOptions = {}) {}
  clearCache() { this.cache.clear(); }
  async getFare(request: FareRequest): Promise<FareEstimate> {
    try {
      if (request.provider === 'WAYMO' && (!('latitude' in request.origin) || !('latitude' in request.destination)
        || !checkWaymoAvailability(request.origin, request.destination).available)) return unavailableFare(request);
      return await this.cachedFare(prepareRailRequest(request));
    } catch { return unavailableFare(request); }
  }
  private async cachedFare(request: FareRequest): Promise<FareEstimate> {
    const now = this.options.now?.() ?? Date.now();
    // Exact date/time avoids mixing two travel dates or market contexts.
    const key = JSON.stringify(request);
    const cached = this.cache.get(key);
    if (cached && cached.expires > now) return structuredClone(cached.fare);
    const pending = this.pending.get(key); if (pending) return structuredClone(await pending);
    const work = this.resolve(request).catch(() => unavailableFare(request, now));
    this.pending.set(key, work);
    try {
      const fare = await work;
      const ttl = Math.min(300000, Math.max(0, this.options.ttlMs ?? 120000));
      if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { expires: now + (fare.sourceType === 'UNAVAILABLE' ? Math.min(ttl, 15000) : ttl), fare });
      return structuredClone(fare);
    } finally { this.pending.delete(key); }
  }
  private async resolve(request: FareRequest): Promise<FareEstimate> {
    let reference: FareEstimate | null = null;
    const attempt = async (source: string, adapter: FareAdapter | undefined) => {
      let fare: FareEstimate | null = null;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try { fare = adapter ? await Promise.race([adapter(request), new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 7000); })]) : null; }
      catch { /* Fall through. */ } finally { if (timeout) clearTimeout(timeout); }
      const valid = validFare(fare, request) && fare.sourceType === source;
      if (process.env.NODE_ENV === 'development') console.debug('[RouteWise pricing]', { provider: request.provider, source, result: valid ? 'success' : 'unavailable' });
      return valid ? fare : null;
    };
    for (const [source, adapter] of [
      ['LIVE_API', this.options.liveAdapters?.[request.provider] ?? (providerAdapters[request.provider]?.live
        ? req => providerAdapters[request.provider].live!(req, this.options.fetchImpl) : undefined)],
      ['OFFICIAL', this.options.officialAdapters?.[request.provider] ?? providerAdapters[request.provider]?.official],
    ] as const) {
      const fare = await attempt(source, adapter);
      if (fare) { if (fare.appliesToTrip) return fare; reference ??= fare; }
    }
    if (this.options.publicEnabled ?? process.env.ROUTEWISE_PUBLIC_PRICING_ENABLED !== 'false') {
      const publicSource = await fetchPublicFareSource(request, this.options.fetchImpl);
      if (publicSource) {
        const publicFare = publicStartingFare(request, publicSource);
        if (publicFare?.appliesToTrip) return publicFare;
        if (publicFare) reference ??= publicFare;
        const extracted = await attempt('GEMINI_GROUNDED', req => (this.options.extract ?? extractFareWithGemini)(req, publicSource, { fetchImpl: this.options.fetchImpl }));
        if (extracted?.appliesToTrip) return extracted;
        reference ??= extracted;
      }
    }
    const modeled = estimateModeledFare(request);
    if (process.env.NODE_ENV === 'development') console.debug('[RouteWise pricing]', { provider: request.provider, source: modeled.sourceType, result: validFare(modeled, request) ? 'success' : 'unavailable' });
    if (validFare(modeled, request)) return modeled;
    return reference ?? unavailableFare(request);
  }
}
export const pricingService = new PricingService();
