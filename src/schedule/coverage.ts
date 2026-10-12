// Which colleges have a class schedule adapter, keyed by ASSIST college id.
// Client safe: no server code is imported here, so the plan page can ask
// whether a college is covered without bundling any adapter.
//
// A college is only listed once its adapter has been tested on real rows from
// it. The survey, including colleges ruled out and why, is in
// docs/schedule-coverage.md.

export type ScheduleProviderId = 'pcc' | 'sdccd' | 'nocccd';

export const SCHEDULE_COVERAGE: Record<number, { provider: ScheduleProviderId; name: string; district: string }> = {
  49: { provider: 'pcc', name: 'Pasadena City College', district: 'Pasadena Area CCD' },
  54: { provider: 'sdccd', name: 'San Diego City College', district: 'San Diego CCD' },
  101: { provider: 'sdccd', name: 'San Diego Mesa College', district: 'San Diego CCD' },
  45: { provider: 'sdccd', name: 'San Diego Miramar College', district: 'San Diego CCD' },
  71: { provider: 'nocccd', name: 'Cypress College', district: 'North Orange County CCD' },
  134: { provider: 'nocccd', name: 'Fullerton College', district: 'North Orange County CCD' },
};

export const scheduleCoverage = (college: number | null) =>
  college === null ? null : (SCHEDULE_COVERAGE[college] ?? null);
