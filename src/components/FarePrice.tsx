import type { FareEstimate } from '@/lib/pricing';
const sources = { LIVE_API: 'Live price', OFFICIAL: 'Official published fare', PUBLIC_BOOKING_PAGE: 'Public booking price',
  GEMINI_GROUNDED: 'Public-source fare · Gemini extraction', MODELED: 'Estimated fare', UNAVAILABLE: 'Price unavailable' };
export default function FarePrice({ fare, unit = '', unavailableLabel = 'Price unavailable', loading = false }: { fare?: FareEstimate; unit?: string; unavailableLabel?: string; loading?: boolean }) {
  if (loading) return <p className="fare-price-status" role="status">Checking price…</p>;
  if (!fare) return <p className="fare-price-status">{unavailableLabel}</p>;
  const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: fare.currency,
    minimumFractionDigits: 0, maximumFractionDigits: fare.sourceType === 'MODELED' ? 0 : 2 }).format(value);
  const value = fare.kind === 'EXACT' && fare.exactPrice !== undefined ? money(fare.exactPrice)
    : fare.kind === 'FROM' && fare.priceLow !== undefined ? `From ${money(fare.priceLow)}`
      : fare.kind === 'RANGE' && fare.priceLow !== undefined && fare.priceHigh !== undefined ? `${money(fare.priceLow)}–${money(fare.priceHigh)}` : null;
  return <div className="fare-price"><p className="fare-price-value">{value ? `${value}${unit}` : unavailableLabel}</p>
    {value && <p className="fare-price-source">{fare.sourceType === 'LIVE_API' ? fare.label : sources[fare.sourceType]}{!fare.appliesToTrip ? unit ? ' · total depends on duration' : ' · reference only; trip total unavailable' : ''}</p>}
    {fare.sourceUrl && <a className="field-hint" href={fare.sourceUrl} target="_blank" rel="noopener noreferrer">Price source</a>}
    {fare.sourceType === 'MODELED' && fare.methodology && <details className="field-hint"><summary>Estimate details</summary><p>{fare.methodology}</p></details>}
  </div>;
}
