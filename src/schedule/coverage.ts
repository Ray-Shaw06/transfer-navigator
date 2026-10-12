// Which colleges have a class schedule adapter, keyed by ASSIST college id.
// Client safe: no server code is imported here, so the plan page can ask
// whether a college is covered without bundling any adapter.
//
// A college is only listed once its adapter has been tested on real rows from
// it. The survey, including colleges ruled out and why, is in
// docs/schedule-coverage.md.

export type ScheduleProviderId = 'pcc' | 'sdccd' | 'nocccd' | 'banner9';

export const SCHEDULE_COVERAGE: Record<number, { provider: ScheduleProviderId; name: string; district: string }> = {
  49: { provider: 'pcc', name: 'Pasadena City College', district: 'Pasadena Area CCD' },
  54: { provider: 'sdccd', name: 'San Diego City College', district: 'San Diego CCD' },
  101: { provider: 'sdccd', name: 'San Diego Mesa College', district: 'San Diego CCD' },
  45: { provider: 'sdccd', name: 'San Diego Miramar College', district: 'San Diego CCD' },
  71: { provider: 'nocccd', name: 'Cypress College', district: 'North Orange County CCD' },
  134: { provider: 'nocccd', name: 'Fullerton College', district: 'North Orange County CCD' },
  // Colleges on Ellucian Banner 9 self-service, which has one public, anonymous
  // class search with the same JSON everywhere. See banner9.ts.
  139: { provider: 'banner9', name: 'Moorpark College', district: 'Ventura County CCD' },
  87: { provider: 'banner9', name: 'Oxnard College', district: 'Ventura County CCD' },
  95: { provider: 'banner9', name: 'Ventura College', district: 'Ventura County CCD' },
  84: { provider: 'banner9', name: 'Bakersfield College', district: 'Kern CCD' },
  9: { provider: 'banner9', name: 'Cerro Coso Community College', district: 'Kern CCD' },
  125: { provider: 'banner9', name: 'Porterville College', district: 'Kern CCD' },
  74: { provider: 'banner9', name: 'Orange Coast College', district: 'Coast CCD' },
  55: { provider: 'banner9', name: 'Golden West College', district: 'Coast CCD' },
  105: { provider: 'banner9', name: 'Coastline Community College', district: 'Coast CCD' },
  121: { provider: 'banner9', name: 'Antelope Valley College', district: 'Antelope Valley CCD' },
  97: { provider: 'banner9', name: 'Citrus College', district: 'Citrus CCD' },
  72: { provider: 'banner9', name: 'Gavilan College', district: 'Gavilan CCD' },
  110: { provider: 'banner9', name: 'Allan Hancock College', district: 'Allan Hancock CCD' },
  62: { provider: 'banner9', name: 'Mt. San Antonio College', district: 'Mt. San Antonio CCD' },
};

export const scheduleCoverage = (college: number | null) =>
  college === null ? null : (SCHEDULE_COVERAGE[college] ?? null);
