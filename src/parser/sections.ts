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
export type Section = {
  label: string;
  rule: SectionRule;
  // Whether the campus itself marked this section as gating admission.
  //
  // ASSIST agreements say so in the heading, in those words: UCI's Computer
  // Science agreement has "MAJOR PREPARATION COURSES REQUIRED FOR TRANSFER —
  // REQUIRED FOR ADMISSION" and, separately, "ADDITIONAL APPROVED COURSES FOR
  // THE MAJOR" with no such mark. The first is a minimum. The second is
  // preparation a campus is glad to see and screens on, but it is not what
  // the application is refused for, and treating the two the same is what
  // made this tool tell a student on a perfectly ordinary two-year plan that
  // they could not transfer at all.
  //
  // Undefined means the heading said nothing either way. That is not the same
  // as false, and the planner reads it as "this agreement draws no
  // distinction, so assume all of it is a minimum". See admissionSections.
  admission?: boolean;
};

// The phrase, anywhere in the heading. Both halves of an ASSIST label are the
// campus's own words and either half can carry it, so this is not anchored.
const REQUIRED_FOR_ADMISSION = /required for admission/i;

export const marksAdmission = (label: string): boolean =>
  REQUIRED_FOR_ADMISSION.test(label);

// Whether the agreement marks admission requirements at all. An agreement
// that marks none of its sections is not an agreement where nothing is
// required; it is one that never said, so every section counts as a minimum.
// Only once a campus has marked at least one section does an unmarked section
// mean "not a minimum".
export const marksAnyAdmission = (sections: Section[]): boolean =>
  sections.some((s) => s.admission === true);

// Headers carry a leading section number. "Select A or B" is the same rule as
// "Complete at least 1", so both collapse to choose with least 1 rather than
// becoming two concepts.
const NUMBERED = /^(\d+)\s+(.+)$/;
const AT_LEAST = /^Complete at least (\d+) courses? from the following$/i;
const SELECT_BETWEEN = /^Select\s+[A-Z](?:\s+or\s+[A-Z])+$/i;

export function parseSectionHeader(text: string): Section | null {
  const trimmed = text.trim();

  if (/^REQUIRED FOR ADMISSION$/i.test(trimmed)) {
    return { label: trimmed, rule: { kind: 'all' }, admission: true };
  }

  const numbered = NUMBERED.exec(trimmed);
  if (!numbered) return null;

  const label = numbered[2].trim();

  const admission = marksAdmission(trimmed);

  const atLeast = AT_LEAST.exec(label);
  if (atLeast)
    return { label, rule: { kind: 'choose', least: Number(atLeast[1]) }, admission };

  if (SELECT_BETWEEN.test(label)) return { label, rule: { kind: 'choose', least: 1 }, admission };

  return null;
}
