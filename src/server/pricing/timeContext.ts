import type { Coordinates } from '../types/index';
export interface PricingTimeContext {
  date: string; month: number; weekday: string;
  localMinutes: number;
  dayType: 'WEEKDAY' | 'WEEKEND';
  timeBand: 'EARLY_MORNING' | 'AM_PEAK' | 'MIDDAY' | 'PM_PEAK' | 'EVENING' | 'LATE_NIGHT';
}
export function getPricingTimeContext(dateTime: string | undefined, origin?: Coordinates | null, zone?: string): PricingTimeContext | null {
  const timeZone = zone ?? (origin && origin.latitude >= 24 && origin.latitude <= 46
    ? origin.longitude >= -85 && origin.longitude <= -73 ? 'America/New_York'
      : origin.longitude >= -125 && origin.longitude <= -114 ? 'America/Los_Angeles' : null : null);
  if (!dateTime || !timeZone || !Number.isFinite(Date.parse(dateTime))) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(dateTime));
    const get = (type: string) => parts.find(part => part.type === type)!.value;
    const hour = Number(get('hour')), weekday = get('weekday');
    return { date: `${get('year')}-${get('month')}-${get('day')}`, month: Number(get('month')), weekday, localMinutes: hour * 60 + Number(get('minute')),
      dayType: ['Sat', 'Sun'].includes(weekday) ? 'WEEKEND' : 'WEEKDAY',
      timeBand: hour < 5 || hour >= 22 ? 'LATE_NIGHT' : hour < 7 ? 'EARLY_MORNING' : hour < 10 ? 'AM_PEAK'
        : hour < 16 ? 'MIDDAY' : hour < 19 ? 'PM_PEAK' : 'EVENING' };
  } catch { return null; }
}
