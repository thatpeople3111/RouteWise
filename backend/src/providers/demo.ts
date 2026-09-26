import type { Mode, NearbyInput, Place, Route, TripInput } from '../../shared/contracts.js';
import { mapsLink } from './google.js';

export const campusPresets = [
  { id: 'fiu-mmc', name: 'FIU Modesto A. Maidique Campus', location: { address: 'FIU Modesto A. Maidique Campus, Miami, FL' } },
  { id: 'fiu-engineering', name: 'FIU Engineering Center', location: { address: 'FIU Engineering Center, 10555 W Flagler St, Miami, FL' } },
  { id: 'fiu-bbc', name: 'FIU Biscayne Bay Campus', location: { address: 'FIU Biscayne Bay Campus, North Miami, FL' } },
];
export const demoWarning = 'DEMO: fictional fixture data for UI development, not directions, fares, opening hours, or travel advice for the requested locations.';
export class DemoProvider {
  async routes(input: TripInput, mode: Mode): Promise<Route[]> {
    const values: Record<Mode, [number, number, number, number]> = { TRANSIT: [58, 8, 5.5, 18000], DRIVE: [32, 0, 12, 21000], WALK: [220, 220, 0, 16000], BICYCLE: [64, 0, 0, 19000] };
    const [durationMinutes, walkingMinutes, amount, distanceMeters] = values[mode];
    const arrivalTime = input.arrivalTime ?? new Date(Date.now() + (durationMinutes + 10) * 60000).toISOString();
    return [{
      id: `demo-${mode.toLowerCase()}`, mode, label: `Demo ${mode.toLowerCase()} option`, durationMinutes, walkingMinutes, distanceMeters,
      cost: { amount, currency: 'USD', kind: 'demo', complete: true, note: 'Fictional total for UI testing only.' },
      steps: mode === 'TRANSIT' ? [
        { mode: 'WALK', instruction: 'Demo: walk to a sample bus stop', durationMinutes: 4, distanceMeters: 300, transit: null },
        { mode: 'TRANSIT', instruction: 'Demo: take the sample campus bus', durationMinutes: 50, distanceMeters: 17400, transit: { line: 'DEMO BUS', headsign: 'Sample destination', departureStop: 'Sample campus stop', arrivalStop: 'Sample destination stop', departureTime: null, arrivalTime: null, agencies: [] } },
        { mode: 'WALK', instruction: 'Demo: walk to the sample destination', durationMinutes: 4, distanceMeters: 300, transit: null },
      ] : [{ mode, instruction: `Demo: ${mode.toLowerCase()} to sample destination`, durationMinutes, distanceMeters, transit: null }],
      encodedPolyline: null, destination: { latitude: 25.801, longitude: -80.199 },
      mapsUrl: mapsLink(input.origin, input.destination, mode), arrivalTime,
      departureTime: new Date(Date.parse(arrivalTime) - durationMinutes * 60000).toISOString(), timing: 'demo',
      constraints: { budget: 'unknown', walking: 'unknown', arrival: 'unknown', eligible: false }, warnings: [demoWarning],
    }];
  }
  async nearby(input: NearbyInput): Promise<Place[]> {
    if (input.openNow) return [];
    return [{ id: `demo-${input.category}`, name: `Demo ${input.category.replace('_', ' ')}`, address: 'Fictional sample place', location: input.location,
      mapsUrl: null, openNow: null, priceLevel: null, attributions: [] }];
  }
  async search(query: string): Promise<Place[]> {
    return [{ id: 'demo-destination', name: `Demo result for ${query}`, address: 'Fictional result; use an address in your trip request', location: { latitude: 25.801, longitude: -80.199 }, mapsUrl: null, openNow: null, priceLevel: null, attributions: [] }];
  }
}
