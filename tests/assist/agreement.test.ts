import { describe, it, expect } from 'vitest';
import { toAgreement, toSectionRule } from '../../src/assist/agreement';
import { UnrecognisedAgreementError } from '../../src/parser/document';
import type {
  AssistArticulation,
  AssistAsset,
  AssistCell,
  AssistCourse,
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
    ).toEqual({ kind: 'choose_units', least: 8 });
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
    expect(toSectionRule({ type: 'NFromConjunction', conjunction: 'And', amount: 2 }).kind).toBe(
      'advisory',
    );
  });
});
