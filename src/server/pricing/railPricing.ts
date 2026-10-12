import { RAIL_PROVIDERS } from '../services/travelProviders';
import { distanceMeters } from '../services/locationResolution';
import { getPricingTimeContext } from './timeContext';
import { unavailableFare, type FareEstimate, type FareRequest } from './types';
const TRI_ZONES: Record<string, number> = { 'tr-miami': 6, 'tr-fll': 5, 'tr-wpb': 1, 'tr-mangonia': 1 };
const SUN_ZONES: Record<string, number> = { 'sr-poinciana': 1, 'sr-orlando': 2, 'sr-deland': 4 };
const TRI_BEFORE = [2.5, 3.75, 5, 6.25, 7.5, 8.75];
const TRI_CURRENT = [3, 4, 6, 7, 8, 10];
function triRailHoliday(date: string) {
  const [year, month, day] = date.split('-').map(Number), weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (month === 1 && day === 1) || (month === 7 && day === 4) || (month === 12 && day === 25)
    || (month === 5 && weekday === 1 && day + 7 > 31) || (month === 9 && weekday === 1 && day <= 7)
    || (month === 11 && weekday === 4 && day >= 22 && day <= 28);
}
export function railStations(request: FareRequest) {
  const id = request.provider === 'BRIGHTLINE' ? 'brightline' : request.provider === 'TRIRAIL' ? 'tri-rail' : request.provider === 'SUNRAIL' ? 'sunrail' : 'amtrak';
  const stations = RAIL_PROVIDERS.find(provider => provider.id === id)!.stations;
  const match = (point: FareRequest['origin'], stationId?: string) => {
    if (!('latitude' in point)) return null;
    return stations.find(station => (!stationId || station.id === stationId) && distanceMeters(point, station.coordinates) < 500) ?? null;
  };
  const from = match(request.origin, request.providerMetadata?.originStationId), to = match(request.destination, request.providerMetadata?.destinationStationId);
  return from && to && from.id !== to.id ? { from, to } : null;
}
export async function publishedRailFare(request: FareRequest): Promise<FareEstimate | null> {
  if (!['TRIRAIL', 'SUNRAIL'].includes(request.provider)) return null;
  const pair = railStations(request), time = getPricingTimeContext(request.departureTime ?? request.arrivalTime, null, 'America/New_York');
  const passengers = request.passengers ?? 1;
  if (!pair || !time || !Number.isInteger(passengers) || passengers < 1 || passengers > 9 || time.date < '2025-01-01') return null;
  const zones = request.provider === 'TRIRAIL' ? TRI_ZONES : SUN_ZONES;
  const from = zones[pair.from.id], to = zones[pair.to.id];
  if (!from || !to) return null;
  const count = Math.abs(from - to) + 1;
  const weekend = request.provider === 'TRIRAIL' && (time.dayType === 'WEEKEND' || triRailHoliday(time.date));
  const amount = request.provider === 'SUNRAIL' ? 2 + count - 1 : weekend ? 5
    : (time.date >= '2026-10-01' ? TRI_CURRENT : TRI_BEFORE)[count - 1];
  return { ...unavailableFare(request), exactPrice: amount * passengers, kind: 'EXACT', sourceType: 'OFFICIAL', confidence: 'HIGH', appliesToTrip: true,
    label: weekend ? 'Official weekend day-pass fare' : 'Official adult one-way fare',
    sourceUrl: request.provider === 'SUNRAIL' ? 'https://sunrail.com/fares-passes/fares/' : 'https://www.tri-rail.com/pressreleases',
    methodology: 'Maintained published adult fare table, determined by station zones and local travel date. Fare does not confirm train availability. Discounts, holidays, and special-event products must be checked with the operator.',
    metadata: { zonesTraveled: count, passengers, tableVersion: request.provider === 'TRIRAIL' ? time.date >= '2026-10-01' ? '2026-10-01' : 'pre-2026-10-01' : 'verified-2026-10-11',
      originStation: pair.from.id, destinationStation: pair.to.id, priceUnit: 'TRIP' } };
}
export function prepareRailRequest(request: FareRequest): FareRequest {
  if (!['BRIGHTLINE', 'AMTRAK', 'TRIRAIL', 'SUNRAIL'].includes(request.provider)) return request;
  const pair = railStations(request);
  if (!pair) return request;
  return { ...request, providerMetadata: { ...request.providerMetadata, originStationId: pair.from.id, destinationStationId: pair.to.id,
    originName: request.providerMetadata?.originName ?? pair.from.name, destinationName: request.providerMetadata?.destinationName ?? pair.to.name,
    sourceUrl: request.providerMetadata?.sourceUrl && !request.providerMetadata.sourceUrl.endsWith('/train-stations') ? request.providerMetadata.sourceUrl : request.provider === 'BRIGHTLINE' ? 'https://www.gobrightline.com/offers' : request.provider === 'AMTRAK' ? 'https://www.amtrak.com/routes/floridian-train' : request.providerMetadata?.sourceUrl,
    bookingUrl: request.providerMetadata?.bookingUrl ?? (request.provider === 'BRIGHTLINE' ? 'https://www.gobrightline.com/' : 'https://www.amtrak.com/') } };
}
