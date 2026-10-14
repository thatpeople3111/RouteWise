import type { RouteOption, TripPlan } from './types';

type Availability = { available: boolean; reasonCode?: string; message?: string };
type WarningContext = { walkingMinutes?: number | null };

/** Legacy availability messages carry the limit; use only this option's own data. */
export function getShortConstraintMessage(availability?: Availability, context: WarningContext = {}): string | null {
  if (!availability || availability.available) return null;
  const message = availability.message ?? '';
  switch (availability.reasonCode) {
    case 'WALKING_LIMIT_EXCEEDED': {
      const limit = /(?:your\s+)?(\d+(?:\.\d+)?)[-\s]+(?:min(?:ute)?s?)\s+limit/i.exec(message);
      if (limit && context.walkingMinutes != null && Number.isFinite(context.walkingMinutes)) {
        const excess = context.walkingMinutes - Number(limit[1]);
        if (excess <= 0) return null;
        return `Exceeds walking limit by ${excess < 1 ? 'less than 1' : Math.ceil(excess)} min`;
      }
      return 'Exceeds walking limit';
    }
    case 'BUDGET_EXCEEDED': {
      const amounts = /fare is \$(\d+(?:\.\d+)?), above your \$(\d+(?:\.\d+)?)/i.exec(message);
      if (amounts) {
        const excess = Number(amounts[1]) - Number(amounts[2]);
        if (excess <= 0) return null;
        return `Over budget by $${Number(excess.toFixed(2))}`;
      }
      return 'Over trip budget';
    }
    case 'EXTRA_TIME_EXCEEDED': return 'Stop exceeds extra-time limit';
    case 'EXTRA_BUDGET_EXCEEDED': return 'Stop exceeds spending limit';
    case 'WALKING_UNVERIFIABLE': return 'Walking time unverified';
    case 'NO_ROUTE': return 'Route could not be verified';
    default: return message.trim() || null;
  }
}

/** Remove duplicates only when a rendered option owns the same warning. */
export function getGlobalWarnings(plan: TripPlan, routes: readonly RouteOption[] = plan.routes): string[] {
  const owned = new Set(routes.flatMap(route => [
    ...route.warnings, route.availability?.message,
    ...(route.transitAlternatives ?? []).flatMap(alt => [...alt.warnings, alt.availability?.message]),
  ]).filter((warning): warning is string => !!warning));
  for (const ride of plan.rideshares ?? []) for (const warning of ride.notes ?? []) owned.add(warning);
  const coveredReasons = new Set(routes.flatMap(route => [route.availability, ...(route.transitAlternatives ?? []).map(alt => alt.availability)])
    .filter(availability => availability?.available === false)
    .map(availability => availability?.reasonCode?.replace(/_EXCEEDED$/, '').replace(/^BUDGET$/, 'BUDGET_LIMIT').replace(/^EXTRA_TIME$/, 'EXTRA_TIME_LIMIT').replace(/^EXTRA_BUDGET$/, 'EXTRA_BUDGET_LIMIT')));
  return [...new Set(plan.warnings)].filter(warning => {
    if (owned.has(warning)) return false;
    const summary = /^Routes excluded by constraints:\s*([A-Z_,\s]+)\.?$/.exec(warning);
    return !summary || !summary[1].split(/[,\s]+/).filter(Boolean).every(reason => coveredReasons.has(reason));
  });
}
