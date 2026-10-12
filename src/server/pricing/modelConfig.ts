/** RouteWise planning assumptions; none are live provider rate cards or surge factors. */
export const PROVIDER_PRICING_MODELS = {
  UBER: { base: 3.25, perMile: 1.4, perMinute: .27, source: 'RouteWise standard-ride planning assumptions; not an Uber tariff.' },
  LYFT: { base: 3.5, perMile: 1.35, perMinute: .25, source: 'Existing RouteWise standard Lyft planning assumptions.' },
  WAYMO: { base: 4, perMile: 1.5, perMinute: .28, source: 'Existing RouteWise Waymo planning assumptions; coverage checked separately.' },
};
export const TIME_ADJUSTMENTS = { commute: 1.15, lateNight: 1.2, weekend: 1.1, baseline: 1, low: .85, high: 1.2 };
export const RENTAL_TIME_ADJUSTMENTS = { weekend: 1.1, baseline: 1 };
export const BRIGHTLINE_MODEL = { baseline: 84, low: .7, high: 1.55, weekend: 1.1, peak: 1.1,
  source: 'https://www.gobrightline.com/content/dam/brightline/pdfs/investor-relations/brightline-florida-february-2025-revenue-ridership-report.pdf' };
/** RPD is an aggregate financial metric, NOT a retail quote. Wide planning bands
 * explicitly retain that uncertainty. Enterprise/Alamo/National use an industry
 * proxy because no public company-specific retail baseline was verified.
 */
export const RENTAL_MODELS: Record<string, { baseline: number; low: number; high: number; source: string; note: string }> = {
  hertz: { baseline: 56.08, low: .8, high: 1.5, source: 'https://d18rn0p25nwr6d.cloudfront.net/CIK-0001657853/5569387e-2ff3-467f-a3f8-fc576188390f.pdf', note: 'Hertz Americas Q2 2025 RPD proxy, not a retail daily rate.' },
  avis: { baseline: 70.2, low: .8, high: 1.5, source: 'https://ir.avisbudgetgroup.com/news-releases/news-release-details/avis-budget-group-reports-second-quarter-2026-results', note: 'Avis Budget Group Americas Q2 2026 RPD proxy; not brand/location-specific retail pricing.' },
  budget: { baseline: 70.2, low: .7, high: 1.4, source: 'https://ir.avisbudgetgroup.com/news-releases/news-release-details/avis-budget-group-reports-second-quarter-2026-results', note: 'Avis Budget Group aggregate proxy; Budget-specific band is a RouteWise assumption.' },
  enterprise: { baseline: 70.2, low: .65, high: 1.6, source: 'https://ir.avisbudgetgroup.com/news-releases/news-release-details/avis-budget-group-reports-second-quarter-2026-results', note: 'Industry RPD proxy from Avis Budget Group, not Enterprise rates; Enterprise-specific retail baseline unavailable.' },
  alamo: { baseline: 70.2, low: .65, high: 1.5, source: 'https://ir.avisbudgetgroup.com/news-releases/news-release-details/avis-budget-group-reports-second-quarter-2026-results', note: 'Industry RPD proxy, not Alamo rates.' },
  national: { baseline: 70.2, low: .8, high: 1.7, source: 'https://ir.avisbudgetgroup.com/news-releases/news-release-details/avis-budget-group-reports-second-quarter-2026-results', note: 'Industry RPD proxy, not National rates.' },
};
export const HERTZ_ATL_MONTHLY = [95, 103, 118, 128, 142, 131, 124, 118, 112, 151, 138, 123];
export const HERTZ_ATL_SOURCE = 'https://www.hertz.com/us/en/location/unitedstates/georgia/collegepark/atlt11';
