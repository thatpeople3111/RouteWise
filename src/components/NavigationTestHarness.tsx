'use client';

import { useState } from 'react';
import { detectNavigationPlatform } from '@/lib/navigationPlatform';
import { prepareNavigationProviderHandoff } from '@/lib/startNavigation';
import { buildUberHandoff } from '@/lib/uberHandoff';
import { buildWaymoHandoff } from '@/lib/waymoHandoff';
import { openExternalHandoff } from '@/lib/externalHandoff';
import type { NavigationHandoffRequest } from '@/lib/navigationHandoff';
import HandoffFallbackLinks from './HandoffFallbackLinks';

const origin = { latitude: 37.7955, longitude: -122.3937, label: 'San Francisco Ferry Building' };
const destination = { latitude: 37.7793, longitude: -122.4193, label: 'San Francisco City Hall' };
const cafe = { latitude: 37.7891, longitude: -122.4011, label: 'Test optional stop', kind: 'OPTIONAL_STOP' as const };
const parking = { latitude: 37.7815, longitude: -122.4172, label: 'Test parking point', kind: 'PARKING' as const };
const base: NavigationHandoffRequest = { origin, destination, orderedStops: [], travelMode: 'DRIVING', context: 'NORMAL' };
const scenarios: Array<{ name: string; request: NavigationHandoffRequest }> = [
  { name: 'Driving', request: base },
  { name: 'Walking', request: { ...base, travelMode: 'WALKING' } },
  { name: 'Transit', request: { ...base, travelMode: 'TRANSIT' } },
  { name: 'Optional stop', request: { ...base, orderedStops: [cafe] } },
  { name: 'Parking + walk', request: { ...base, orderedStops: [cafe, parking], parkingLocation: parking } },
  { name: 'Waypoint overflow', request: { ...base, orderedStops: Array.from({ length: 5 }, (_, index) => ({ ...cafe, latitude: cafe.latitude + index / 10000 })) } },
  { name: 'Safe Place first leg', request: { ...base, travelMode: 'WALKING', context: 'STRANDED_SAFE_PLACE_LEG', safePlaceFirstLeg: cafe } },
  { name: 'Stranded resume', request: { ...base, origin: cafe, travelMode: 'TRANSIT', context: 'STRANDED_RESUME', safePlaceFirstLeg: cafe } },
];
type TestLink = { name: string; url: string; webFallbackUrl?: string; detail: string };

/** Static fixtures only. No planner API, provider pricing, account or GPS requests. */
export default function NavigationTestHarness() {
  const [links, setLinks] = useState<TestLink[]>([]);
  const [platform, setPlatform] = useState('Not detected yet');
  const [message, setMessage] = useState('');
  function generate() {
    try {
      const detected = detectNavigationPlatform(); setPlatform(detected);
      const generated = scenarios.map(({ name, request }) => {
        const result = prepareNavigationProviderHandoff(request, detected);
        return { name, url: result.url, webFallbackUrl: result.webFallbackUrl,
          detail: `Omitted stops: ${result.omittedStops.length}. ${result.warnings.join(' ')}` };
      });
      const uber = buildUberHandoff(base, detected);
      const waymo = buildWaymoHandoff(base, { provider: 'WAYMO', available: true }, detected);
      generated.push({ name: 'Uber (test endpoints)', url: uber.url, webFallbackUrl: uber.webFallbackUrl, detail: 'Verify pickup and destination. Do not request a ride.' });
      if (waymo.enabled) generated.push({ name: 'Waymo landing (simulated availability)', url: waymo.url, webFallbackUrl: waymo.webFallbackUrl, detail: 'Landing flow only; endpoint prefill is unsupported. This fixture does not check service availability.' });
      setLinks(generated); setMessage('');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not generate links.'); }
  }
  return <main className="page-container py-6">
    <h1>Development navigation test harness</h1>
    <p>Static San Francisco test points, not a real trip or availability quote. Never book a ride during testing.</p>
    <p>Runtime platform: {platform}</p>
    <button type="button" className="submit-button" onClick={generate}>Generate device links</button>
    {message && <p role="status">{message}</p>}
    <div className="grid gap-4 mt-4">{links.map(link => <section key={link.name} className="border rounded-md p-4">
      <h2>{link.name}</h2><p>{link.detail}</p>
      <button type="button" className="location-button" onClick={() => { setMessage(openExternalHandoff(link.url).message ?? 'Link opened.'); }}>Open test link</button>
      <HandoffFallbackLinks url={link.url} webFallbackUrl={link.webFallbackUrl} />
      <details><summary>Inspect generated URL</summary><p className="break-all">{link.url}</p></details>
    </section>)}</div>
  </main>;
}
