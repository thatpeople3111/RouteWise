import type { TransitAlternative } from './types';

type Step = TransitAlternative['steps'][number];

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
