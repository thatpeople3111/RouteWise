'use client';

import { buildUberRideLink, findWaymoServiceArea, WAYMO_WEB_URL } from '@/lib/rideshare';
import type { Coordinates } from '@/lib/types';

type RideshareOptionsProps = {
  pickup: Coordinates;
  destinationLabel: string;
};

type RideshareCard = {
  id: string;
  name: string;
  mark: string;
  note: string;
  actionLabel: string;
  href: string;
};

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Builds the list of rideshare cards to show; add another provider here to extend the section. */
function buildRideshareCards(pickup: Coordinates, destinationLabel: string): RideshareCard[] {
  const cards: RideshareCard[] = [];

  try {
    cards.push({
      id: 'uber',
      name: 'Uber',
      mark: 'U',
      note: 'Price shown in Uber',
      actionLabel: 'Request with Uber',
      href: buildUberRideLink(pickup, destinationLabel),
    });
  } catch (failure) {
    console.error('[RouteWise stranded mode] Could not build the Uber link.', failure);
  }

  try {
    const waymoArea = findWaymoServiceArea(pickup);
    if (waymoArea) {
      cards.push({
        id: 'waymo',
        name: 'Waymo',
        mark: 'W',
        note: `Waymo publishes service near ${waymoArea} — check current availability`,
        actionLabel: 'Check Waymo availability',
        href: WAYMO_WEB_URL,
      });
    }
  } catch (failure) {
    console.error('[RouteWise stranded mode] Could not determine Waymo availability.', failure);
  }

  return cards;
}

export default function RideshareOptions({ pickup, destinationLabel }: RideshareOptionsProps) {
  const cards = buildRideshareCards(pickup, destinationLabel);

  return (
    <section className="rideshare-panel" aria-labelledby="rideshare-title">
      <h2 id="rideshare-title">Rideshare Options</h2>
      <p className="rideshare-disclaimer">
        An additional way to get there. Exact pricing, vehicle availability, and pickup time are shown by each app once you open it.
      </p>
      {cards.length === 0 && (
        <p className="rideshare-status" role="status">No rideshare options could be prepared right now.</p>
      )}
      {cards.length > 0 && (
        <div className="rideshare-list">
          {cards.map(card => (
            <article key={card.id} className={`rideshare-card rideshare-card-${card.id}`}>
              <header className="rideshare-card-header">
                <span className={`rideshare-mark rideshare-mark-${card.id}`} aria-hidden="true">{card.mark}</span>
                <div className="min-w-0">
                  <h3>{card.name}</h3>
                  <p className="rideshare-price-note">{card.note}</p>
                </div>
              </header>
              <button
                type="button"
                className={`rideshare-action rideshare-action-${card.id}`}
                onClick={() => openExternal(card.href)}
              >
                {card.actionLabel}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
