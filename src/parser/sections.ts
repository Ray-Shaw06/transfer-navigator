// 'all' and 'choose' are what a PDF section header can say. The other three
// exist because the ASSIST API states rules the printed header only implies:
// a unit target rather than a course count, a choice between whole routes
// rather than between single rows, and shapes this project has decided not
// to evaluate. See docs/plans/2026-08-29-assist-api-v2.md for the counts.
export type SectionRule =
  | { kind: 'all' }
  | { kind: 'choose'; least: number }
  // Pick enough options to reach `least` sending units. ASSIST states these
  // as NFromArea with a unit-flavoured amountUnitType (SemesterUnit,
  // QuarterUnit, Unit). `unitLabel` is ASSIST's own wording for which unit
  // system it means, shown verbatim rather than converted, because semester
  // and quarter units are not interchangeable.
  | { kind: 'choose_units'; least: number; unitLabel: string }
  // The section's rows are divided into routes by ArticulationRow.route, and
  // completing any one whole route satisfies the section. This is the
  // multi-row generalisation of ArticulationRow.orGroup.
  | { kind: 'choose_route' }
  // A rule this project can read but has chosen not to act on, carrying the
  // receiving campus's own words for it. Planned as if every row were
  // required, which overstates the work rather than hiding a requirement,
  // and displayed with the text so the student can see what was not applied.
  | { kind: 'advisory'; text: string }
  // Not a requirement at all. ASSIST's own "Articulation Details" section
  // restates combinations already required above it, to show which
  // combination of sending courses equals which combination of receiving
  // ones. The agreement's own prose points at it in those words: "Please
  // review the Articulation Details section to view course combination
  // equivalencies." Its rows are shown and never counted, because counting
  // them charges a student twice for the same courses. Only the API sets
  // this; a printed agreement has no such section.
  | { kind: 'reference' };
export type Section = { label: string; rule: SectionRule };

// Headers carry a leading section number. "Select A or B" is the same rule as
// "Complete at least 1", so both collapse to choose with least 1 rather than
// becoming two concepts.
const NUMBERED = /^(\d+)\s+(.+)$/;
const AT_LEAST = /^Complete at least (\d+) courses? from the following$/i;
const SELECT_BETWEEN = /^Select\s+[A-Z](?:\s+or\s+[A-Z])+$/i;

export function parseSectionHeader(text: string): Section | null {
  const trimmed = text.trim();

  if (/^REQUIRED FOR ADMISSION$/i.test(trimmed)) {
    return { label: trimmed, rule: { kind: 'all' } };
  }

  const numbered = NUMBERED.exec(trimmed);
  if (!numbered) return null;

  const label = numbered[2].trim();

  const atLeast = AT_LEAST.exec(label);
  if (atLeast) return { label, rule: { kind: 'choose', least: Number(atLeast[1]) } };

  if (SELECT_BETWEEN.test(label)) return { label, rule: { kind: 'choose', least: 1 } };

  return null;
}
