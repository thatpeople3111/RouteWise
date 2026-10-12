'use client';

import Image from 'next/image';
import { formatDuration } from '@/lib/formatDuration';
import Map from './Map';
import FarePrice from './FarePrice';
import RouteCard from './RouteCard';
import RideshareOptions from './RideshareOptions';
import type { Location, SuggestedStop, TripPlan } from '@/lib/types';
import type { LongDistanceView } from '@/lib/longDistance';



function JourneyCard({ journey }: { journey: LongDistanceView['journeys'][number] }) {
  return (
    <article className="long-distance-card">
      <header className="rideshare-option-head">
        {journey.logo && <Image src={journey.logo} alt="" width={34} height={34} unoptimized className="long-distance-logo" />}
        <h3>{journey.provider}</h3>
        {journey.labels.map(label => <span key={label} className="long-distance-badge">{label}</span>)}
      </header>
      <p>{journey.originHub?.name} → {journey.destinationHub?.name}</p>
      <p className="long-distance-total">{formatDuration(journey.durationMinutes)} <small>door to door{journey.durationMinutes !== null ? ' · estimate' : ''}</small></p>
      <ol className="long-distance-segments">
        <li>To {journey.originHub?.name}: {formatDuration(journey.firstMile?.durationMinutes ?? null)} · estimated connection cost below</li>
        <li>{journey.mode === 'RAIL' ? 'Train' : 'Flight'}: {formatDuration(journey.rideMinutes)} · {journey.fare && journey.fare.sourceType !== 'UNAVAILABLE' ? journey.fare.label : journey.mode === 'FLIGHT' ? 'Fare unavailable' : 'Rail fare unavailable'}</li>
        <li>Arrival / exit allowances: {formatDuration(journey.bufferMinutes)} · modeled</li>
        <li>From {journey.destinationHub?.name}: {formatDuration(journey.lastMile?.durationMinutes ?? null)} · estimated connection cost below</li>
      </ol>
      {journey.originHub && journey.destinationHub && <Map origin={journey.originHub.coordinates} destination={journey.destinationHub.coordinates} variant="compact" />}
      <p className="field-hint">Hub markers only; no street route is used to depict rail or flight travel.</p>
      <FarePrice fare={journey.fare} unavailableLabel={journey.mode === 'RAIL' ? 'Fare unavailable' : 'Price unavailable'} />
      {journey.mode === 'FLIGHT' && journey.fare?.sourceType === 'LIVE_API' && <dl className="long-distance-segments">
        <div><dt>Airline code</dt><dd>{String(journey.fare.metadata?.airline ?? 'Unavailable')}</dd></div>
        <div><dt>Offer departure · airport local time</dt><dd>{String(journey.fare.metadata?.departureTime ?? 'Unavailable').replace('T', ' ')}</dd></div>
        <div><dt>Offer arrival · airport local time</dt><dd>{String(journey.fare.metadata?.arrivalTime ?? 'Unavailable').replace('T', ' ')}</dd></div>
        <div><dt>Stops</dt><dd>{String(journey.fare.metadata?.stops ?? 'Unavailable')}</dd></div>
      </dl>}
      <CostBreakdown cost={journey.cost} />
      <details><summary>First-mile transportation</summary>
        {journey.firstMile?.mode === 'AT_HUB' ? <p>You are already at the departure hub.</p> : <RideshareOptions headingId={`${journey.id}-first-rides`} options={(journey.firstMile?.rideshares ?? []).map(ride => ({ ...ride, id: `${journey.id}-first-${ride.id}` }))} />}
      </details>
      <section className="journey-ground" aria-labelledby={`${journey.id}-ground`}>
        <h4 id={`${journey.id}-ground`}>DESTINATION TRANSPORTATION</h4>
        <p>After arrival at {journey.destinationHub?.name}</p>
        <h5>RIDESHARE</h5>
        {journey.lastMile?.mode === 'AT_HUB' ? <p>Your destination is the arrival hub; no extra ride is needed.</p> :
          <RideshareOptions headingId={`${journey.id}-last-rides`} options={(journey.lastMile?.rideshares ?? []).map(ride => ({ ...ride, id: `${journey.id}-last-${ride.id}` }))} />}
        <h5>RENTAL CARS</h5>
        <RentalCards rentals={journey.rentals ?? []} />
      </section>
      <ul className="long-distance-notes">{journey.warnings.map(note => <li key={note}>{note}</li>)}</ul>
      <a className="rideshare-option-action" href={journey.fare?.bookingUrl ?? journey.bookingUrl} target="_blank" rel="noopener noreferrer">{journey.status === 'search_only' ? 'Search flights · availability unverified' : 'View provider details'}</a>
      <a className="field-hint" href={journey.sourceUrl} target="_blank" rel="noopener noreferrer">Provider / data source</a>
    </article>
  );
}
function RentalCards({ rentals }: { rentals: NonNullable<LongDistanceView['journeys'][number]['rentals']> }) {
  return <>
    <div className="long-distance-rentals">{rentals.map(rental => <article className="rideshare-option-card" key={rental.id}>
      <header className="rideshare-option-head"><Image src={rental.logo} alt="" width={34} height={34} unoptimized className="long-distance-logo" /><h3>{rental.provider}</h3></header>
      <FarePrice fare={rental.fare} unit={rental.fare?.metadata?.priceUnit === 'DAY' ? '/day' : ''} /><p>Pickup: {rental.pickup}</p>
      <p className="field-hint">Provider listed at this hub; confirm pickup access, vehicle availability, and rates. Rental cost is an alternative to the last-mile ride and is not included in the journey total.</p>
      <a className="rideshare-option-action" href={rental.fare?.bookingUrl ?? rental.bookingUrl} target="_blank" rel="noopener noreferrer">View rental</a>
      <a className="field-hint" href={rental.sourceUrl} target="_blank" rel="noopener noreferrer">Hub directory</a>
    </article>)}</div>
    {!rentals.length && <p>Rental provider data unavailable for this arrival hub.</p>}
  </>;
}
function CostBreakdown({ cost }: { cost: LongDistanceView['journeys'][number]['cost'] }) {
  const known = cost.components.filter(component => component.amountUsd !== null && Number.isFinite(component.amountUsd));
  const modeled = known.some(component => component.source === 'estimated' || component.fare?.sourceType === 'MODELED');
  const amountFare = (amount: number, source: string): import('@/lib/pricing').FareEstimate => ({ provider: 'TRANSIT', exactPrice: amount,
    currency: 'USD', sourceType: source === 'estimated' ? 'MODELED' : source === 'official' ? 'OFFICIAL' : 'LIVE_API',
    confidence: source === 'estimated' ? 'LOW' : 'HIGH', label: 'Supplied component price', kind: 'EXACT', appliesToTrip: true, retrievedAt: '' });
  const total = known.length ? amountFare(cost.complete ? cost.totalUsd! : cost.knownSubtotalUsd, modeled ? 'estimated' : 'live') : undefined;
  const low = cost.complete ? cost.priceLowUsd : cost.knownSubtotalLowUsd, high = cost.complete ? cost.priceHighUsd : cost.knownSubtotalUsd;
  if (total && low != null && high != null && low !== high) {
    total.kind = 'RANGE'; delete total.exactPrice; total.priceLow = low; total.priceHigh = high;
  }
  return <div className="long-distance-cost">
    <dl>{cost.components.map(component => <div key={component.label}><dt>{component.label}</dt><dd>
      <FarePrice fare={component.fare ?? (component.amountUsd !== null && Number.isFinite(component.amountUsd) ? amountFare(component.amountUsd, component.source) : undefined)} />
      {component.note && <p className="field-hint">{component.note}</p>}
    </dd></div>)}</dl>
    <p>{cost.complete ? 'Journey total' : known.length ? 'Known cost ? total unavailable' : 'Journey total unavailable'}</p>
    {total && <FarePrice fare={total} />}
  </div>;
}

export default function LongDistanceResults({ plan, origin, destination, selectedStop, onEditTrip }: {
  plan: TripPlan; origin: Location; destination: Location; selectedStop?: SuggestedStop | null; onEditTrip: () => void;
}) {
  const data = plan.longDistance!;
  return <section className="route-results long-distance-results" aria-labelledby="long-distance-title">
    <header><span className="eyebrow">YOUR LONG-DISTANCE OPTIONS</span><h1 id="long-distance-title">Go further.</h1>
      <p>This is a longer trip, so we’re comparing driving, rail, and flight searches.</p></header>
    {(['DRIVING', 'RAIL', 'FLIGHT'] as const).map(mode => <section key={mode} aria-labelledby={`long-${mode}`}>
      <h2 id={`long-${mode}`}>{mode === 'FLIGHT' ? 'FLIGHTS' : mode}</h2>
      <div className="long-distance-grid">
        {data.journeys.filter(journey => journey.mode === mode).map(journey => mode === 'DRIVING' ? <div key={journey.id}>
          <div className="flex gap-2">{journey.labels.map(label => <span className="long-distance-badge" key={label}>{label}</span>)}</div>
          {plan.routes.find(route => route.id === journey.id) && <RouteCard route={plan.routes.find(route => route.id === journey.id)!} origin={origin} destination={destination} selectedStop={selectedStop} variant="stranded"
            journeyCost={{ totalUsd: journey.cost.totalUsd, knownSubtotalUsd: journey.cost.knownSubtotalUsd, note: 'Vehicle cost is a mileage-based planning proxy, including fuel. Unknown tolls, parking, and stop purchases remain unavailable in the breakdown.' }} />}
          <CostBreakdown cost={journey.cost} />
          <ul className="long-distance-notes">{journey.warnings.map(note => <li key={note}>{note}</li>)}</ul>
        </div> : <JourneyCard key={journey.id} journey={journey} />)}
      </div>
      {!data.journeys.some(journey => journey.mode === mode) && <p>{mode === 'RAIL' ? 'No configured rail corridor serves both endpoints.' : mode === 'FLIGHT' ? 'Flight options unavailable right now: no practical configured airport pair.' : 'Driving route unavailable right now.'}</p>}
    </section>)}
    <ul className="long-distance-notes">{data.warnings.map(note => <li key={note}>{note}</li>)}</ul>
    <button className="location-button" type="button" onClick={onEditTrip}>Edit trip</button>
  </section>;
}
