import { describe, it, expect } from 'vitest';
import { toAgreement, toSectionRule } from '../../src/assist/agreement';
import { UnrecognisedAgreementError } from '../../src/parser/document';
import { buildPlan } from '../../src/planner/plan';
import type {
  AssistArticulation,
  AssistAsset,
  AssistCell,
  AssistCourse,
  AssistInstruction,
  AssistResult,
  AssistRow,
  AssistSection,
} from '../../src/assist/types';

// Invented institutions and course codes throughout: this project does not
// carry ASSIST agreement content in its repo. The shapes are real, taken
// from responses measured across UC, CSU and private agreements, but no
// agreement's contents are reproduced here.

const course = (prefix: string, courseNumber: string, minUnits: number): AssistCourse => ({
  prefix,
  courseNumber,
  courseTitle: `${prefix} ${courseNumber} title`,
  minUnits,
  maxUnits: minUnits,
});

// ASSIST nests JSON inside JSON: templateAssets and articulations arrive as
// strings that have to be parsed a second time. Building fixtures the same
// way keeps the tests honest about what the mapper actually receives.
function result(assets: AssistAsset[], articulations: AssistArticulation[] = []): AssistResult {
  return {
    name: 'Widgetry, B.S.',
    templateAssets: JSON.stringify(assets),
    articulations: JSON.stringify(articulations),
    receivingInstitution: JSON.stringify({ names: [{ name: 'Example University' }] }),
    sendingInstitution: JSON.stringify({ names: [{ name: 'Example College' }] }),
    academicYear: JSON.stringify({ code: '2025-2026' }),
  };
}

const group = (
  instruction: AssistAsset['instruction'],
  sections: AssistAsset['sections'],
): AssistAsset => ({ type: 'RequirementGroup', area: 'Requirements', position: 1, instruction, sections });

const section = (rows: AssistRow[]): AssistSection => ({ type: 'Section', rows });

const courseCell = (id: string, c: AssistCourse): AssistCell => ({ type: 'Course', id, course: c });

const articulated = (id: string, conjunction: 'And' | 'Or', courses: AssistCourse[]): AssistArticulation => ({
  templateCellId: id,
  articulation: { sendingArticulation: { items: [{ courseConjunction: conjunction, items: courses }] } },
});

describe('toAgreement', () => {
  it('reads the header off the nested institution objects', () => {
    const agreement = toAgreement(
      result([group(null, [section([{ cells: [courseCell('a', course('RECV', '10', 4))] }])])]),
    );

    expect(agreement.major).toBe('Widgetry, B.S.');
    expect(agreement.sendingInstitution).toBe('Example College');
    expect(agreement.receivingInstitution).toBe('Example University');
    expect(agreement.academicYear).toBe('2025-2026');
  });

  it('turns one articulated cell into one row of options', () => {
    const agreement = toAgreement(
      result(
        [group(null, [section([{ cells: [courseCell('a', course('RECV', '10', 4))] }])])],
        [articulated('a', 'And', [course('SEND', '1', 3), course('SEND', '1L', 1)])],
      ),
    );

    expect(agreement.rows).toHaveLength(1);
    expect(agreement.rows[0].receiving.map((c) => c.code)).toEqual(['RECV 10']);
    expect(agreement.rows[0].sending).toEqual({
      kind: 'options',
      options: [
        {
          kind: 'and',
          courses: [
            { code: 'SEND 1', title: 'SEND 1 title', units: 3 },
            { code: 'SEND 1L', title: 'SEND 1L title', units: 1 },
          ],
        },
      ],
    });
  });

  it('expands an Or-joined sending item into one alternative per course', () => {
    const agreement = toAgreement(
      result(
        [group(null, [section([{ cells: [courseCell('a', course('RECV', '10', 4))] }])])],
        [articulated('a', 'Or', [course('SEND', '1', 3), course('SEND', '2', 5)])],
      ),
    );

    const sending = agreement.rows[0].sending;
    expect(sending.kind).toBe('options');
    if (sending.kind !== 'options') return;
    expect(sending.options.map((o) => o.courses.map((c) => c.code))).toEqual([['SEND 1'], ['SEND 2']]);
  });

  it('keeps an And-joined receiving series as one requirement, not three', () => {
    const agreement = toAgreement(
      result(
        [
          group(null, [
            section([
              {
                cells: [
                  {
                    type: 'Series',
                    id: 'a',
                    series: {
                      conjunction: 'And',
                      name: 'RECV 31, RECV 32',
                      courses: [course('RECV', '31', 4), course('RECV', '32', 4)],
                    },
                  },
                ],
              },
            ]),
          ]),
        ],
        [articulated('a', 'And', [course('SEND', '1', 3)])],
      ),
    );

    expect(agreement.rows).toHaveLength(1);
    expect(agreement.rows[0].receiving.map((c) => c.code)).toEqual(['RECV 31', 'RECV 32']);
  });

  it('splits an Or-joined receiving series into rows sharing one or group', () => {
    const agreement = toAgreement(
      result(
        [
          group(null, [
            section([
              {
                cells: [
                  {
                    type: 'Series',
                    id: 'a',
                    series: {
                      conjunction: 'Or',
                      name: 'RECV 31 or RECV 32',
                      courses: [course('RECV', '31', 4), course('RECV', '32', 4)],
                    },
                  },
                ],
              },
            ]),
          ]),
        ],
        [articulated('a', 'And', [course('SEND', '1', 3)])],
      ),
    );

    expect(agreement.rows).toHaveLength(2);
    expect(agreement.rows[0].orGroup).toBe(agreement.rows[1].orGroup);
    expect(agreement.rows[0].orGroup).toBeDefined();
  });

  it('treats a cell with no articulation entry as not articulated', () => {
    const agreement = toAgreement(
      result([group(null, [section([{ cells: [courseCell('a', course('RECV', '10', 4))] }])])], []),
    );

    expect(agreement.rows[0].sending).toEqual({ kind: 'not_articulated' });
  });

  it("carries ASSIST's own reason for a non articulation", () => {
    const agreement = toAgreement(
      result(
        [group(null, [section([{ cells: [courseCell('a', course('RECV', '10', 4))] }])])],
        [
          {
            templateCellId: 'a',
            articulation: {
              sendingArticulation: {
                noArticulationReason: 'This course must be taken at the university after transfer',
                items: [],
              },
            },
          },
        ],
      ),
    );

    expect(agreement.rows[0].sending).toEqual({
      kind: 'not_articulated',
      reason: 'This course must be taken at the university after transfer',
    });
  });

  it('calls an articulation entry that yields no course unreadable, not unarticulated', () => {
    // The two are different advice. "Nothing articulated" tells a student to
    // take the course after transferring; an entry ASSIST sent that this
    // mapper could not read should send them to check, not to plan around it.
    const agreement = toAgreement(
      result(
        [group(null, [section([{ cells: [courseCell('a', course('RECV', '10', 4))] }])])],
        [{ templateCellId: 'a', articulation: { sendingArticulation: { items: [{ courseConjunction: 'And', items: [] }] } } }],
      ),
    );

    expect(agreement.rows[0].sending.kind).toBe('unreadable');
  });

  it('makes each section of an Or group a route', () => {
    const agreement = toAgreement(
      result(
        [
          group({ type: 'Conjunction', conjunction: 'Or' }, [
            section([{ cells: [courseCell('a', course('RECV', '10', 4))] }]),
            section([
              { cells: [courseCell('b', course('RECV', '20', 4))] },
              { cells: [courseCell('c', course('RECV', '21', 4))] },
            ]),
          ]),
        ],
        [
          articulated('a', 'And', [course('SEND', '1', 3)]),
          articulated('b', 'And', [course('SEND', '2', 3)]),
          articulated('c', 'And', [course('SEND', '3', 3)]),
        ],
      ),
    );

    expect(agreement.sections[0].rule).toEqual({ kind: 'choose_route' });
    expect(agreement.rows.map((r) => r.route)).toEqual([0, 1, 1]);
  });

  it('leaves route unset when the rule is not a route choice', () => {
    const agreement = toAgreement(
      result([
        group({ type: 'Following' }, [
          section([{ cells: [courseCell('a', course('RECV', '10', 4))] }]),
          section([{ cells: [courseCell('b', course('RECV', '20', 4))] }]),
        ]),
      ]),
    );

    expect(agreement.rows.every((r) => r.route === undefined)).toBe(true);
  });

  it('orders rows by their stated position, not the order they arrive in', () => {
    const agreement = toAgreement(
      result([
        group(null, [
          section([
            { position: 2, cells: [courseCell('c', course('RECV', '30', 4))] },
            { position: 0, cells: [courseCell('a', course('RECV', '10', 4))] },
            { position: 1, cells: [courseCell('b', course('RECV', '20', 4))] },
          ]),
        ]),
      ]),
    );

    expect(agreement.rows.map((r) => r.receiving[0].code)).toEqual(['RECV 10', 'RECV 20', 'RECV 30']);
  });

  it('names a requirement cell that carries no course code', () => {
    const agreement = toAgreement(
      result([
        group(null, [
          section([
            { cells: [{ type: 'Requirement', id: 'a', requirement: { name: 'A world history area' } }] },
          ]),
        ]),
      ]),
    );

    expect(agreement.rows[0].receiving).toEqual([{ code: 'A world history area', title: '', units: 0 }]);
  });

  it('labels a section with the heading above it and its own header', () => {
    const agreement = toAgreement(
      result([
        { type: 'RequirementTitle', area: 'Requirements', position: 0, content: 'PREPARATION FOR THE MAJOR' },
        {
          type: 'RequirementGroup',
          area: 'Requirements',
          position: 1,
          instruction: null,
          sections: [
            { type: 'SectionHeader', content: 'REQUIRED FOR ADMISSION' },
            section([{ cells: [courseCell('a', course('RECV', '10', 4))] }]),
          ],
        },
      ]),
    );

    expect(agreement.sections[0].label).toBe('PREPARATION FOR THE MAJOR — REQUIRED FOR ADMISSION');
  });

  it('drops a section that produced no rows rather than showing an empty heading', () => {
    const agreement = toAgreement(
      result([
        group(null, [section([{ cells: [{ type: 'Course', id: 'a', course: {} }] }])]),
        group(null, [section([{ cells: [courseCell('b', course('RECV', '10', 4))] }])]),
      ]),
    );

    expect(agreement.sections).toHaveLength(1);
    expect(agreement.rows).toHaveLength(1);
    expect(agreement.rows[0].section).toBe(0);
  });

  it('reads campus prose as text and never as markup', () => {
    const agreement = toAgreement(
      result([
        { type: 'GeneralTitle', area: 'General', position: 0, content: 'IMPORTANT INFORMATION' },
        {
          type: 'GeneralText',
          area: 'General',
          position: 1,
          content: '<p>Grades of <strong>C</strong> or better &amp; a 3.0 GPA.</p>',
        },
        group(null, [section([{ cells: [courseCell('a', course('RECV', '10', 4))] }])]),
      ]),
    );

    expect(agreement.notes).toEqual(['IMPORTANT INFORMATION', 'Grades of C or better & a 3.0 GPA.']);
  });

  it('refuses a response that carries neither requirements nor a name', () => {
    expect(() => toAgreement({ templateAssets: '[]', articulations: '[]' })).toThrow(
      UnrecognisedAgreementError,
    );
  });

  it('accepts a real agreement that happens to articulate nothing', () => {
    // ASSIST does publish these. Refusing one would tell a student the tool
    // is broken when the honest answer is that their college articulates
    // nothing for that major.
    const agreement = toAgreement(result([]));
    expect(agreement.rows).toEqual([]);
    expect(agreement.major).toBe('Widgetry, B.S.');
  });
});

describe('toSectionRule', () => {
  it('treats a missing instruction and Following alike, as all required', () => {
    expect(toSectionRule(null)).toEqual({ kind: 'all' });
    expect(toSectionRule({ type: 'Following' })).toEqual({ kind: 'all' });
  });

  it('reads an And conjunction between sections as all required', () => {
    expect(toSectionRule({ type: 'Conjunction', conjunction: 'And' })).toEqual({ kind: 'all' });
  });

  it('reads an Or conjunction as a choice between routes', () => {
    expect(toSectionRule({ type: 'Conjunction', conjunction: 'Or' })).toEqual({ kind: 'choose_route' });
  });

  it('reads a course count and a unit total as different quantifiers', () => {
    expect(
      toSectionRule({ type: 'NFromArea', amount: 2, amountUnitType: 'Course', amountQuantifier: 'AtLeast' }),
    ).toEqual({ kind: 'choose', least: 2 });
    expect(
      toSectionRule({ type: 'NFromArea', amount: 8, amountUnitType: 'Unit', amountQuantifier: 'None' }),
    ).toEqual({ kind: 'choose_units', least: 8, unitLabel: 'units' });
  });

  it('reads every unit flavour ASSIST states as a unit target, not a course count', () => {
    // Found by checking a second real agreement: ASSIST writes SemesterUnit,
    // not Unit. Read as a course count, "complete at least 12 semester
    // units" would have told a student to take twelve courses.
    expect(
      toSectionRule({ type: 'NFromArea', amount: 12, amountUnitType: 'SemesterUnit', amountQuantifier: 'AtLeast' }),
    ).toEqual({ kind: 'choose_units', least: 12, unitLabel: 'semester units' });
    expect(
      toSectionRule({ type: 'NFromArea', amount: 12, amountUnitType: 'QuarterUnit', amountQuantifier: 'AtLeast' }),
    ).toEqual({ kind: 'choose_units', least: 12, unitLabel: 'quarter units' });
  });

  it('counts a series and a combination the way it counts a course', () => {
    // Each is one row in this model, so N of them is N rows.
    for (const amountUnitType of ['Series', 'CourseOrCombination']) {
      expect(
        toSectionRule({ type: 'NFromArea', amount: 3, amountUnitType, amountQuantifier: 'AtLeast' }),
      ).toEqual({ kind: 'choose', least: 3 });
    }
  });

  it('refuses to count a unit type it has never seen', () => {
    const rule = toSectionRule({
      type: 'NFromArea',
      amount: 4,
      amountUnitType: 'SomethingNew',
      amountQuantifier: 'AtLeast',
    });
    expect(rule.kind).toBe('advisory');
  });

  it('refuses to invent a floor out of a ceiling', () => {
    const rule = toSectionRule({
      type: 'NFromArea',
      amount: 2,
      amountUnitType: 'Course',
      amountQuantifier: 'UpTo',
    });
    expect(rule.kind).toBe('advisory');
    if (rule.kind !== 'advisory') return;
    expect(rule.text).toContain('up to 2 courses');
  });

  it('falls back to advisory for a rule it has never seen', () => {
    expect(toSectionRule({ type: 'SomethingNew' }).kind).toBe('advisory');
    // An amount with nothing saying what it counts, whatever the rule type.
    expect(toSectionRule({ type: 'NFromConjunction', conjunction: 'And', amount: 2 }).kind).toBe(
      'advisory',
    );
  });
});

// The real shape this exists for: a CSU agreement stating "complete 12
// semester units" over one section of twenty-five science rows. Read as
// advisory, every one of the twenty-five became required.
describe('toSectionRule over an NFromConjunction', () => {
  const nfc = (extra: Partial<AssistInstruction>): AssistInstruction => ({
    type: 'NFromConjunction',
    conjunction: 'And',
    amountQuantifier: 'None',
    ...extra,
  });

  it('counts the rows of the one section it has', () => {
    expect(toSectionRule(nfc({ amount: 12, amountUnitType: 'SemesterUnit' }), 1)).toEqual({
      kind: 'choose_units',
      least: 12,
      unitLabel: 'semester units',
    });
    expect(toSectionRule(nfc({ amount: 2, amountUnitType: 'Course' }), 1)).toEqual({
      kind: 'choose',
      least: 2,
    });
  });

  it('counts a series the way it counts a course, since each is one row', () => {
    expect(toSectionRule(nfc({ amount: 1, amountUnitType: 'Series' }), 1)).toEqual({
      kind: 'choose',
      least: 1,
    });
  });

  it('reads it the same way whichever conjunction it carries', () => {
    // Across real agreements the field is sometimes And and sometimes Or
    // without the member shape following it, so it is not what decides this.
    // With one section there is nothing for a section-level choice to pick
    // between, and the amount can only be counting rows either way.
    expect(toSectionRule(nfc({ conjunction: 'Or', amount: 1, amountUnitType: 'Course' }), 1)).toEqual({
      kind: 'choose',
      least: 1,
    });
  });

  it('stays advisory when more than one section leaves the members ambiguous', () => {
    // Two sections could mean "one course from all of them" or "one whole
    // section", and those are different requirements. Guessing understates
    // the work in one direction and overstates it in the other, so neither
    // is guessed.
    const rule = toSectionRule(nfc({ amount: 1, amountUnitType: 'Course' }), 3);
    expect(rule.kind).toBe('advisory');
    if (rule.kind !== 'advisory') return;
    expect(rule.text).toContain('1 course');
  });

  it('keeps every guard the area quantifier already had', () => {
    // A ceiling is not a floor, and an unknown unit type must not silently
    // become a course count.
    expect(
      toSectionRule(nfc({ amount: 2, amountUnitType: 'Course', amountQuantifier: 'UpTo' }), 1).kind,
    ).toBe('advisory');
    expect(toSectionRule(nfc({ amount: 3, amountUnitType: 'Fortnight' }), 1).kind).toBe('advisory');
    expect(toSectionRule(nfc({ amount: 0, amountUnitType: 'Course' }), 1).kind).toBe('advisory');
  });
});

describe('an NFromConjunction group end to end', () => {
  // Four science courses under "complete 6 units", the shape that made a real
  // CSU agreement ask for every science sequence it listed.
  const build = (sectionCount: 1 | 2) => {
    const codes = ['SCI 1', 'SCI 2', 'SCI 3', 'SCI 4'];
    const cells = codes.map((code, i) =>
      courseCell(`cell-${i}`, course('SCI', String(i + 1), 3)),
    );
    const rows = cells.map((c) => ({ cells: [c] }) as AssistRow);
    const sections =
      sectionCount === 1 ? [section(rows)] : [section(rows.slice(0, 2)), section(rows.slice(2))];

    return toAgreement(
      result(
        [
          group(
            {
              type: 'NFromConjunction',
              conjunction: 'And',
              amount: 6,
              amountUnitType: 'SemesterUnit',
              amountQuantifier: 'None',
            },
            sections,
          ),
        ],
        cells.map((c, i) => articulated(c.id!, 'And', [course('LOCAL', String(i + 1), 3)])),
      ),
    );
  };

  it('carries the quantifier through to a section the planner can act on', () => {
    const agreement = build(1);
    expect(agreement.sections[0].rule).toEqual({
      kind: 'choose_units',
      least: 6,
      unitLabel: 'semester units',
    });
    expect(agreement.rows).toHaveLength(4);
  });

  it('asks for the units stated rather than for every row listed', () => {
    // The whole point. Four three-unit rows under "complete 6 units" is two
    // rows of work, not four, and the other two are optional rather than
    // owed.
    const plan = buildPlan(build(1), []);
    const remaining = plan.statuses.filter((s) => s.state === 'remaining');
    expect(remaining).toHaveLength(2);
    expect(plan.statuses.filter((s) => s.state === 'optional')).toHaveLength(2);
    expect(plan.remainingUnits).toBe(6);
  });

  it('still asks for all of them when the group has sections to choose between', () => {
    // Two sections make the members ambiguous, so the rule stays advisory and
    // nothing is demoted. Overstating here is the safe direction: the UI
    // shows the rule it did not apply.
    const agreement = build(2);
    expect(agreement.sections[0].rule.kind).toBe('advisory');
    expect(buildPlan(agreement, []).remainingUnits).toBe(12);
  });
});

// ASSIST's Articulation Details section restates combinations already
// required above it. Counting them charges a student twice for the same
// courses, which on a real CSU agreement tripled the work reported.
describe('the Articulation Details section', () => {
  const title = (content: string, position: number): AssistAsset => ({
    type: 'RequirementTitle',
    area: 'Requirements',
    position,
    content,
  });

  const positioned = (asset: AssistAsset, position: number): AssistAsset => ({ ...asset, position });

  // A real requirement for MATH 1 and MATH 2, then an equivalency restating
  // the pair, both satisfied by the same two sending courses.
  const build = (heading: string, instruction: AssistAsset['instruction'] = null) => {
    const a = courseCell('req-a', course('MATH', '1', 3));
    const b = courseCell('req-b', course('MATH', '2', 3));
    const combo: AssistCell = {
      type: 'Series',
      id: 'combo',
      series: { conjunction: 'And', courses: [course('MATH', '1', 3), course('MATH', '2', 3)] },
    };

    return toAgreement(
      result(
        [
          title('MATHEMATICS REQUIREMENTS', 0),
          positioned(group(null, [section([{ cells: [a] }, { cells: [b] }])]), 1),
          title(heading, 2),
          positioned(group(instruction, [section([{ cells: [combo] }])]), 3),
        ],
        [
          articulated('req-a', 'And', [course('LOCAL', '10', 4)]),
          articulated('req-b', 'And', [course('LOCAL', '11', 4)]),
          articulated('combo', 'And', [course('LOCAL', '10', 4), course('LOCAL', '11', 4)]),
        ],
      ),
    );
  };

  it('is read as reference rather than as work', () => {
    const agreement = build('ARTICULATION DETAILS');
    expect(agreement.sections[1].rule).toEqual({ kind: 'reference' });

    const plan = buildPlan(agreement, []);
    // Eight units of real requirement, and the equivalency adds none.
    expect(plan.remainingUnits).toBe(8);
    expect(plan.statuses.filter((s) => s.state === 'reference')).toHaveLength(1);
    expect(plan.remainingGroups.flatMap((g) => g.courses.map((c) => c.code))).toEqual([
      'LOCAL 10',
      'LOCAL 11',
    ]);
  });

  it('never takes a completed course away from the requirement that needs it', () => {
    // The failure this guards. Rows are walked in document order and a
    // satisfied row claims its sending courses so nothing else can reuse
    // them. An equivalency running through that walk would claim LOCAL 10 and
    // LOCAL 11 for itself and leave the real requirement above reading as
    // unsatisfied, which is worse than the double count it replaced.
    const plan = buildPlan(build('ARTICULATION DETAILS'), ['LOCAL 10', 'LOCAL 11']);
    const real = plan.statuses.filter((s) => s.section === 0);
    expect(real.map((s) => s.state)).toEqual(['satisfied', 'satisfied']);
    expect(plan.remainingUnits).toBe(0);
  });

  it('leaves a section alone when the heading is not that heading', () => {
    const agreement = build('ADDITIONAL APPROVED COURSES FOR THE MAJOR');
    expect(agreement.sections[1].rule).toEqual({ kind: 'all' });
    expect(buildPlan(agreement, []).remainingUnits).toBe(16);
  });

  it('respects a group that states a quantifier of its own', () => {
    // A heading is weaker evidence than a rule. A group asking for two
    // courses is asking for something whatever it is filed under, so the
    // quantifier wins and the section is not treated as reference.
    const agreement = build('ARTICULATION DETAILS', {
      type: 'NFromArea',
      amount: 2,
      amountUnitType: 'Course',
      amountQuantifier: 'AtLeast',
    });
    expect(agreement.sections[1].rule).toEqual({ kind: 'choose', least: 2 });
  });
});
