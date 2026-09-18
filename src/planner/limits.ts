// How many units a college lets a student take in one term.
//
// Every college sets its own ceilings, publishes them as prose in its
// catalog, and puts that prose somewhere different. Pasadena's are under
// "Study Load Regulations" on its registration page: twelve units is full
// time, fifteen is normal progress, twenty is the most a student may take in
// a semester without a petition, and twelve is the most in a summer session.
// Other colleges say eighteen, or nineteen, or bury it in a PDF.
//
// So this is a table of the ceilings actually read off a catalog, over
// typical ones for everyone else, and it says which is which. The typical
// figures are the ones most colleges publish: eighteen in a semester, eight
// in a summer session, six in a winter intersession. A student at a college
// not listed is told the ceiling is typical rather than theirs, and pointed
// at their catalog.

export type Session = 'semester' | 'summer' | 'winter';

export type UnitLimits = {
  semester: number;
  summer: number;
  winter: number;
  // Which of the three were read from the college's own catalog. The rest
  // are typical.
  verified: Session[];
  // Full time as the college defines it, where it says. Twelve everywhere
  // read so far, which is also the federal financial-aid floor.
  fullTime: number;
};

export const TYPICAL = { semester: 18, summer: 8, winter: 6, fullTime: 12 } as const;

// Keyed by ASSIST college id, like the catalog registry. Only fields read
// from the catalog are set; anything missing is typical.
const READ: Record<number, Partial<Pick<UnitLimits, Session>>> = {
  // Pasadena City College, Study Load Regulations, 2026-27 catalog: "Those
  // who would like to take more than 20 units per semester may submit a
  // Special Circumstance Student Petition"; "The maximum load for the
  // Summer session is 12 units." Winter is not stated there.
  49: { semester: 20, summer: 12 },
};

export function limitsFor(college: number | null): UnitLimits {
  const read = college === null ? {} : (READ[college] ?? {});
  const verified = (['semester', 'summer', 'winter'] as Session[]).filter((s) => read[s] !== undefined);
  return {
    semester: read.semester ?? TYPICAL.semester,
    summer: read.summer ?? TYPICAL.summer,
    winter: read.winter ?? TYPICAL.winter,
    verified,
    fullTime: TYPICAL.fullTime,
  };
}

// The lowest load worth planning at. One course.
export const LEAST_UNITS = 3;

// A load held to the college's ceiling and the floor above. Used wherever a
// stored setting meets a college that may have changed since it was stored.
export const clampUnits = (units: number, ceiling: number): number =>
  Math.min(ceiling, Math.max(LEAST_UNITS, Math.round(units)));
