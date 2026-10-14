import type { TransitAlternative } from './types';

type Step = TransitAlternative['steps'][number];

type TransitMetadata = {
  line?: string | null; lineShortName?: string | null;
  routeShortName?: string | null; routeLongName?: string | null;
  systemName?: string | null; agencyName?: string | null;
  vehicleType?: string | null; vehicleName?: string | null;
  agencies?: readonly { name: string }[];
  headsign?: string | null; departureStop?: string | null; arrivalStop?: string | null;
  departureTime?: string | null; arrivalTime?: string | null;
};

function clean(value?: string | null): string | undefined {
  const text = value?.trim().replace(/\s+/g, ' ');
  return text && !/^(undefined|null)$/i.test(text) ? text : undefined;
}

function containsName(name: string, part: string): boolean {
  return ` ${name.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).join(' ')} `
    .includes(` ${part.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).join(' ')} `);
}

/** Source names always win; no location-based guesses or invented agency aliases. */
export function resolveTransitBranding(segment: TransitMetadata) {
  const vehicle = clean(segment.vehicleType) ?? clean(segment.vehicleName) ?? clean(segment.line) ?? '';
  const genericMode = /bus/i.test(vehicle) ? 'Bus'
    : /tram|light_?rail|streetcar/i.test(vehicle) ? 'Tram'
    : /subway|metro/i.test(vehicle) ? 'Subway'
    : /rail|train/i.test(vehicle) ? 'Rail'
    : /ferry|boat/i.test(vehicle) ? 'Ferry'
    : /cable|gondola/i.test(vehicle) ? 'Cable car' : 'Transit';
  const short = clean(segment.routeShortName) ?? clean(segment.lineShortName);
  const long = clean(segment.routeLongName) ?? clean(segment.line);
  const systemName = clean(segment.systemName) ?? clean(segment.agencyName) ?? clean(segment.agencies?.[0]?.name);
  const generic = /^(bus|rail|train|tram|subway|transit|ferry|light rail)$/i;
  // Bus long names often describe endpoints. Keep the compact route number in that case.
  const sourceName = clean(segment.systemName)
    ?? (long && !generic.test(long) && !/^(?:route\s+)?(?:\d+[\p{L}-]*|[\p{L}])$/iu.test(long) && (genericMode !== 'Bus' || /bus|streetcar|rail|metro|transit|express/i.test(long) || !short) ? long : undefined);
  const conciseAgency = systemName && systemName.length <= 32 && !/department|authority|transportation and/i.test(systemName)
    ? systemName : undefined;
  const agencyIncludesMode = conciseAgency && (generic.test(conciseAgency)
    || (genericMode === 'Bus' && /bus/i.test(conciseAgency))
    || (['Rail', 'Subway'].includes(genericMode) && /rail|subway|metro/i.test(conciseAgency))
    || (genericMode === 'Tram' && /tram|streetcar/i.test(conciseAgency)));
  const modeLabel = sourceName ?? (conciseAgency ? `${conciseAgency}${agencyIncludesMode ? '' : ` ${genericMode}`}` : genericMode);
  const routeLabel = short ?? (long && !generic.test(long) ? long : undefined);
  const displayName = routeLabel && !containsName(modeLabel, routeLabel)
    ? `${modeLabel} ${routeLabel}` : modeLabel;
  return { systemName, modeLabel, routeLabel, displayName };
}

type JourneyStep = { mode: string; instruction?: string; transit?: TransitMetadata | null };

/** Collapse only boundaries with evidence of continuity, never across a walk/transfer. */
function continuousRide(previous: JourneyStep, next: JourneyStep): boolean {
  const a = previous.transit, b = next.transit;
  if (!a || !b || /transfer|board|change/i.test(next.instruction ?? '')) return false;
  const identity = (s: TransitMetadata) => [clean(s.agencyName), clean(s.systemName), clean(s.line), clean(s.lineShortName), clean(s.routeShortName), clean(s.routeLongName), clean(s.vehicleType), clean(s.headsign)];
  return !!clean(a.arrivalStop) && a.arrivalStop === b.departureStop
    && !!a.arrivalTime && a.arrivalTime === b.departureTime
    && identity(a).every((value, index) => value === identity(b)[index]);
}

export function buildTransitJourneyLabel(steps: readonly JourneyStep[]): string {
  const labels: string[] = [];
  let previous: JourneyStep | undefined;
  for (const step of steps) {
    if (step.mode === 'TRANSIT') {
      if (!previous || previous.mode !== 'TRANSIT' || !continuousRide(previous, step)) {
        labels.push(step.transit ? resolveTransitBranding(step.transit).displayName : 'Transit');
      }
    }
    previous = step;
  }
  return labels.join(' → ') || (steps.length && steps.every(step => step.mode === 'WALK') ? 'Walking' : 'Transit');
}

/** Presentation only: callers must keep using the original steps for maps and constraints. */
export function combineAdjacentWalkingSegments(steps: readonly Step[]): Step[] {
  const display: Step[] = [];
  let walking: Step[] = [];
  function flush() {
    if (!walking.length) return;
    const sum = (key: 'durationMinutes' | 'distanceMeters') =>
      walking.every(step => step[key] == null) ? null : walking.reduce((total, step) => total + (step[key] ?? 0), 0);
    const durationMinutes = sum('durationMinutes');
    const distanceMeters = sum('distanceMeters');
    const instruction = walking.map(step => step.instruction.trim()).filter(text => text && !/^walk(?:ing)?(?:\s+\d+(?:\.\d+)?\s*(?:min(?:utes?)?)?)?\.?$/i.test(text)).join('; ');
    if (durationMinutes !== 0 || instruction || (distanceMeters ?? 0) > 0 || walking.some(step => step.transit)) {
      display.push({ ...walking[0], durationMinutes, distanceMeters, instruction, encodedPolyline: null });
    }
    walking = [];
  }
  for (const step of steps) {
    if (step.mode === 'WALK') walking.push(step);
    else { flush(); display.push({ ...step }); }
  }
  flush();
  return display;
}
