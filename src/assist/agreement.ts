import { UnrecognisedAgreementError, type Agreement, type ArticulationRow } from '../parser/agreement';
import type { AndGroup, Requirement } from '../parser/groups';
import type { Section, SectionRule } from '../parser/sections';
import type { Course } from '../parser/types';
import type {
  AssistArticulation,
  AssistAsset,
  AssistCell,
  AssistCourse,
  AssistInstruction,
  AssistResult,
  AssistSection,
} from './types';

// Turns one ASSIST agreement into the same Agreement the PDF parser
// produces, so buildPlan and the whole UI stay unaware of which route the
// data came in through.
//
// The rule this file keeps, inherited from the parser it sits beside: never
// present a guess as fact. Where ASSIST states something this project cannot
// evaluate, the requirement is emitted as advisory or unreadable with the
// campus's own words attached, never dropped and never simplified into
// something that merely looks planable.

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

// ASSIST splits a course code across prefix and number. Uppercased on the
// way out because the planner matches completed courses case-insensitively
// by uppercasing both sides, and everything else in this project stores the
// code the way it was printed.
function toCourse(c: AssistCourse | undefined): Course | null {
  if (!c) return null;
  const code = [c.prefix, c.courseNumber].filter(Boolean).join(' ').trim();
  if (!code) return null;
  return {
    code,
    title: (c.courseTitle ?? '').trim(),
    // minUnits is what a student must earn; maxUnits only differs for
    // variable-unit courses, where planning on the minimum understates the
    // credit rather than promising units that may not materialise.
    units: num(c.minUnits) ?? num(c.maxUnits) ?? 0,
  };
}

// The receiving side of one cell. A Series joined by And is a single
// requirement spanning several courses (I&C SCI 31, 32 and 33 is one item,
// not three), which is exactly the receiving-side AND the PDF parser had to
// discover the hard way. A Requirement or CALGETC cell names something with
// no course code; it is carried as a zero-unit pseudo-course so it stays
// visible, and receiving units are display-only, never summed into a plan.
type Receiving = { courses: Course[]; kind: 'course' | 'requirement' | 'ge_pattern' };

function receivingCourses(cell: AssistCell): Receiving {
  if (cell.type === 'Course') {
    const course = toCourse(cell.course);
    return { courses: course ? [course] : [], kind: 'course' };
  }
  if (cell.type === 'Series') {
    return {
      courses: (cell.series?.courses ?? []).map(toCourse).filter((c): c is Course => c !== null),
      kind: 'course',
    };
  }
  if (cell.type === 'Requirement' && cell.requirement?.name) {
    // No course code and no units, because ASSIST states none. Carried as a
    // named requirement so the UI can say "your college's course for this
    // area" instead of inventing a zero-unit course nobody can look up.
    return { courses: [{ code: cell.requirement.name.trim(), title: '', units: 0 }], kind: 'requirement' };
  }
  if (cell.type === 'CALGETC') {
    return {
      courses: [{ code: 'CalGETC', title: 'General education pattern', units: 0 }],
      kind: 'ge_pattern',
    };
  }
  return { courses: [], kind: 'course' };
}

// The sending side. `items` is a list of alternatives; within one item,
// 'And' means the courses go together and 'Or' means each stands alone, so
// an Or item expands into one single-course alternative per course.
function sendingRequirement(entry: AssistArticulation | undefined): Requirement {
  const sending = entry?.articulation?.sendingArticulation;
  if (!sending) return { kind: 'not_articulated' };
  if (sending.noArticulationReason) {
    return { kind: 'not_articulated', reason: sending.noArticulationReason };
  }

  const options: AndGroup[] = [];
  for (const item of sending.items ?? []) {
    const courses = (item.items ?? []).map(toCourse).filter((c): c is Course => c !== null);
    if (courses.length === 0) continue;
    if (item.courseConjunction === 'Or') {
      for (const course of courses) options.push({ kind: 'and', courses: [course] });
    } else {
      options.push({ kind: 'and', courses });
    }
  }

  // An articulation entry that exists but yielded nothing readable is not the
  // same as no entry at all. Reporting it as not_articulated would tell a
  // student to take the course after transferring when ASSIST may well list
  // something here, so it is unreadable and the UI sends them to check.
  if (options.length === 0) return { kind: 'unreadable', text: [] };
  return { kind: 'options', options };
}

// ASSIST's own words for the rule over a group's sections, mapped onto the
// four rules the planner can act on. Anything not recognised becomes
// advisory rather than being treated as plain 'all', so a rule that was
// never applied is visible in the UI instead of silently absent.
//
// `sectionCount` is how many content Sections the group holds, which decides
// what an NFromConjunction quantifier is counting. See below.
export function toSectionRule(
  instruction: AssistInstruction | null | undefined,
  sectionCount = 1,
): SectionRule {
  if (!instruction) return { kind: 'all' };

  if (instruction.type === 'Following') return { kind: 'all' };

  if (instruction.type === 'Conjunction') {
    // 'And' between sections means every section is required, which is the
    // same demand as 'all' made of the rows underneath them.
    return instruction.conjunction === 'Or' ? { kind: 'choose_route' } : { kind: 'all' };
  }

  // An NFromConjunction states an amount over a group whose members are
  // either its Sections or the rows inside them, and ASSIST does not say
  // which. Across real agreements its `conjunction` field is sometimes 'And'
  // and sometimes 'Or' without the member shape following it, so reading the
  // members off that field would be a guess, and a wrong guess here is
  // expensive in both directions: counting rows as sections understates a
  // requirement, counting sections as rows overstates it.
  //
  // One case is not a guess. A group holding exactly one Section has nothing
  // for a section-level quantifier to choose between, so the amount can only
  // be counting that section's rows, which is what every other quantifier in
  // this file already counts. Those are read; the rest stay advisory.
  //
  // This is what the "MATHEMATICS AND SCIENCE COURSES" group on a real CSU
  // agreement is: one section, twenty-five rows of chemistry, physics,
  // biology and geology, and "complete 12 semester units" over them. Read as
  // advisory it became "take all twenty-five", which is how that agreement
  // came back as nineteen terms of work.
  if (instruction.type === 'NFromArea' || (instruction.type === 'NFromConjunction' && sectionCount === 1)) {
    const amount = num(instruction.amount);
    // 'UpTo' is a ceiling, not a floor: it says how much may count, not how
    // much is owed, and this project has no way to decide which of them a
    // student should pick. Advisory rather than a quantifier invented here.
    if (amount === undefined || amount <= 0 || instruction.amountQuantifier === 'UpTo') {
      return { kind: 'advisory', text: describeInstruction(instruction) };
    }

    const counted = countedThing(instruction.amountUnitType);
    if (counted === 'units') {
      return { kind: 'choose_units', least: amount, unitLabel: unitLabelFor(instruction.amountUnitType) };
    }
    if (counted === 'courses') return { kind: 'choose', least: amount };

    // An amountUnitType nobody has seen before must not quietly become a
    // course count. "Complete at least 12 SemesterUnit" read as "pick 12
    // courses" would roughly triple the work this tool reports.
    return { kind: 'advisory', text: describeInstruction(instruction) };
  }

  return { kind: 'advisory', text: describeInstruction(instruction) };
}

// What an NFromArea quantifier is counting. ASSIST has used Course, Series,
// CourseOrCombination and SemesterUnit; a Series and a CourseOrCombination
// are each one row in this model, so they count the same way a Course does.
function countedThing(amountUnitType: string | undefined): 'courses' | 'units' | null {
  if (!amountUnitType) return null;
  if (amountUnitType.includes('Unit')) return 'units';
  if (['Course', 'Series', 'CourseOrCombination'].includes(amountUnitType)) return 'courses';
  return null;
}

// ASSIST's own wording, kept rather than normalised. A student reading
// "12 semester units" needs to know it is not 12 quarter units.
function unitLabelFor(amountUnitType: string | undefined): string {
  if (amountUnitType === 'SemesterUnit') return 'semester units';
  if (amountUnitType === 'QuarterUnit') return 'quarter units';
  return 'units';
}

// A plain-language rendering of a rule the planner declined to act on, so
// the UI can tell a student exactly what was not applied. ASSIST states
// these as a shape, not a sentence, so one is written here.
function describeInstruction(instruction: AssistInstruction): string {
  const amount = num(instruction.amount);
  const counted = countedThing(instruction.amountUnitType);
  const unit =
    counted === 'units'
      ? unitLabelFor(instruction.amountUnitType)
      : counted === 'courses'
        ? 'courses'
        : (instruction.amountUnitType ?? 'items');
  const quantifier = instruction.amountQuantifier;
  if (amount !== undefined && quantifier === 'UpTo') {
    return `ASSIST states: complete up to ${amount} ${unit} from the following.`;
  }
  if (amount !== undefined) {
    return `ASSIST states a ${instruction.type} rule over ${amount} ${unit}.`;
  }
  return `ASSIST states a ${instruction.type} rule this tool does not evaluate.`;
}

// GeneralText content is HTML written by the campus. It is displayed as
// text, never as markup, so the tags come out here rather than being
// rendered downstream.
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function parseEmbedded<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// receivingInstitution and the rest are themselves JSON strings holding an
// object with a `names` array. Only the display name is wanted.
function institutionName(raw: string | undefined): string {
  const parsed = parseEmbedded<{ names?: { name: string }[] } | null>(raw, null);
  return parsed?.names?.[0]?.name ?? '';
}

function academicYearLabel(raw: string | undefined): string {
  const parsed = parseEmbedded<{ code?: string } | null>(raw, null);
  return parsed?.code ?? '';
}

const byPosition = <T extends { position?: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

// ASSIST's own name for the section that carries course combination
// equivalencies rather than requirements. Matched on the heading because
// nothing else separates it: the group arrives with the same shape, the same
// empty instruction and the same absent attributes as a real requirement
// group sitting two positions above it.
//
// Anchored at the start so a heading that merely mentions the phrase is not
// caught, and tolerant of a suffix so a campus adding to the standard name
// still matches.
const ARTICULATION_DETAILS = /^articulation details?\b/i;

const isArticulationDetails = (heading: string): boolean =>
  ARTICULATION_DETAILS.test(heading.trim());

// A group's label: the last RequirementTitle seen above it, plus the
// group's own SectionHeader when it has one. Both are the campus's words.
function groupLabel(group: AssistAsset, heading: string): string {
  const header = (group.sections ?? [])
    .filter((s) => s.type === 'SectionHeader')
    .map((s) => (s.content ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return [heading, header].filter(Boolean).join(' — ');
}

export function toAgreement(result: AssistResult): Agreement {
  const assets = parseEmbedded<AssistAsset[]>(result.templateAssets, []);
  const articulations = parseEmbedded<AssistArticulation[]>(result.articulations, []);

  const byCell = new Map<string, AssistArticulation>();
  for (const entry of articulations) {
    if (entry.templateCellId) byCell.set(entry.templateCellId, entry);
  }

  const notes: string[] = [];
  const sections: Section[] = [];
  const rows: ArticulationRow[] = [];
  let heading = '';

  for (const asset of byPosition(assets)) {
    if (asset.type === 'GeneralTitle' || asset.type === 'GeneralText') {
      const text = htmlToText(asset.content ?? '');
      if (text) notes.push(text);
      continue;
    }

    if (asset.type === 'RequirementTitle') {
      heading = (asset.content ?? '').trim();
      continue;
    }

    if (asset.type !== 'RequirementGroup') continue;

    // Each Section under a 'choose_route' group is one route. Under any
    // other rule the route index is meaningless and is left unset, which is
    // what keeps the planner's existing single-row grouping in charge.
    const contentSections = (asset.sections ?? []).filter(
      (s): s is AssistSection => s.type === 'Section',
    );

    const stated = toSectionRule(asset.instruction, contentSections.length);
    // A group under ASSIST's Articulation Details heading is equivalency
    // information, not work. Guarded twice so this stays narrow: the heading
    // has to be that heading, and the group must carry no quantifier of its
    // own, since a group that states "complete 6 units" is asking for
    // something whatever it is filed under. Every instance measured carried
    // no instruction at all.
    const rule: SectionRule =
      stated.kind === 'all' && isArticulationDetails(heading) ? { kind: 'reference' } : stated;
    const sectionIndex = sections.length;
    sections.push({ label: groupLabel(asset, heading), rule });

    let emitted = 0;
    contentSections.forEach((section, routeIndex) => {
      for (const row of byPosition(section.rows ?? [])) {
        for (const cell of row.cells ?? []) {
          const { courses: receiving, kind: receivingKind } = receivingCourses(cell);
          if (receiving.length === 0) continue;

          const sending = cell.id
            ? sendingRequirement(byCell.get(cell.id))
            : ({ kind: 'not_articulated' } as Requirement);

          // A Series joined by Or on the receiving side is two routes
          // through one requirement, the same thing ArticulationRow.orGroup
          // has always meant. Every course in it becomes its own row sharing
          // one group so the planner counts only the route taken.
          if (cell.type === 'Series' && cell.series?.conjunction === 'Or' && receiving.length > 1) {
            const orGroup = rows.length;
            for (const course of receiving) {
              rows.push({
                receiving: [course],
                sending,
                orGroup,
                section: sectionIndex,
                receivingKind,
                ...(rule.kind === 'choose_route' ? { route: routeIndex } : {}),
              });
              emitted += 1;
            }
            continue;
          }

          rows.push({
            receiving,
            sending,
            section: sectionIndex,
            receivingKind,
            ...(rule.kind === 'choose_route' ? { route: routeIndex } : {}),
          });
          emitted += 1;
        }
      }
    });

    // A group that produced no rows would leave a section heading with
    // nothing under it, which reads as a requirement that vanished. Drop the
    // section instead so the UI never shows an empty one.
    if (emitted === 0) sections.pop();
  }

  const agreement: Agreement = {
    academicYear: academicYearLabel(result.academicYear),
    major: (result.name ?? '').trim(),
    receivingInstitution: institutionName(result.receivingInstitution),
    sendingInstitution: institutionName(result.sendingInstitution),
    rows,
    sections,
    notes,
  };

  // The same guard the PDF path has, for the same reason: an agreement with
  // no requirements would render as "nothing left to schedule" and tell a
  // student who has done nothing that they are finished. ASSIST does publish
  // real agreements that articulate nothing at all, so a header alone is
  // enough to accept one; what is refused is a response with neither.
  if (rows.length === 0 && !agreement.major) throw new UnrecognisedAgreementError();

  return agreement;
}
