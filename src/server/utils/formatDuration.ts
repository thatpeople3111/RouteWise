/** Durations only: clock times and numeric API values are unchanged. */
export function formatDuration(minutes: number | null | undefined, unavailable = 'Unavailable'): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return unavailable;
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60), remainder = rounded % 60;
  return `${hours} hr${remainder ? ` ${remainder} min` : ''}`;
}
