import { describe, it, expect } from 'vitest';
import { buildPlan, rowKey } from '../../src/planner/plan';
import type { Agreement } from '../../src/parser/document';

const course = (code: string, units: number) => ({ code, title: code, units });

const agreement: Agreement = {
  academicYear: '2025-2026',
  major: 'Widgetry, B.S.',
  receivingInstitution: 'Test University',
  sendingInstitution: 'Test College',
  sections: [],
  rows: [
    {
      receiving: [course('RECV 10', 4)],
      sending: {
        kind: 'options',
        options: [
          { kind: 'and', courses: [course('SEND 1', 3), course('SEND 1L', 1)] },
          { kind: 'and', courses: [course('SEND 9', 5)] },
        ],
      },
    },
    { receiving: [course('RECV 20', 4)], sending: { kind: 'not_articulated' } },
    {
      receiving: [course('RECV 30', 4)],
      sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 5', 4)] }] },
    },
  ],
};

describe('buildPlan', () => {
  it('marks a row satisfied when one alternative is fully complete', () => {
    const plan = buildPlan(agreement, ['SEND 1', 'SEND 1L']);
    expect(plan.statuses[0].state).toBe('satisfied');
    expect(plan.statuses[0].satisfiedBy.map((c) => c.code)).toEqual(['SEND 1', 'SEND 1L']);
  });

  it('proposes the cheapest open alternative by units', () => {
    const plan = buildPlan(agreement, []);
    expect(plan.statuses[0].cheapestOption.map((c) => c.code)).toEqual(['SEND 1', 'SEND 1L']);
    expect(plan.statuses[0].remainingUnits).toBe(4);
  });

  it('reports rows with nothing articulated separately and never as remaining', () => {
    const plan = buildPlan(agreement, []);
    expect(plan.statuses[1].state).toBe('not_articulated');
    expect(plan.notArticulated.map((c) => c.code)).toEqual(['RECV 20']);
    expect(plan.remainingUnits).toBe(8);
  });

  it('counts only the cheapest route through an or group', () => {
    // Two routes through one requirement. The expensive one, and the one with
    // nothing articulated, must not add units or appear as blockers.
    const grouped: Agreement = {
      ...agreement,
      rows: [
        { receiving: [course('RECV 40', 4)], sending: { kind: 'not_articulated' }, orGroup: 1 },
        {
          receiving: [course('RECV 50', 4)],
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 7', 4)] }] },
          orGroup: 1,
        },
      ],
    };

    const plan = buildPlan(grouped, []);

    expect(plan.statuses[0].state).toBe('alternative');
    expect(plan.statuses[1].state).toBe('remaining');
    expect(plan.remainingUnits).toBe(4);
    expect(plan.notArticulated).toEqual([]);
  });

  it('treats an or group as done when either route is complete', () => {
    const grouped: Agreement = {
      ...agreement,
      rows: [
        {
          receiving: [course('RECV 40', 4)],
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 6', 4)] }] },
          orGroup: 1,
        },
        {
          receiving: [course('RECV 50', 4)],
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 7', 4)] }] },
          orGroup: 1,
        },
      ],
    };

    const plan = buildPlan(grouped, ['SEND 7']);

    expect(plan.statuses[1].state).toBe('satisfied');
    expect(plan.statuses[0].state).toBe('alternative');
    expect(plan.remainingUnits).toBe(0);
  });

  it('leaves an or group alone when no route is achievable', () => {
    const grouped: Agreement = {
      ...agreement,
      rows: [
        { receiving: [course('RECV 40', 4)], sending: { kind: 'not_articulated' }, orGroup: 1 },
        { receiving: [course('RECV 50', 4)], sending: { kind: 'not_articulated' }, orGroup: 1 },
      ],
    };

    const plan = buildPlan(grouped, []);

    expect(plan.statuses.map((s) => s.state)).toEqual(['not_articulated', 'not_articulated']);
    expect(plan.notArticulated.map((c) => c.code)).toEqual(['RECV 40', 'RECV 50']);
  });

  it('reports the work left as the groups it came from, not a flat list', () => {
    const plan = buildPlan(agreement, []);
    expect(plan.remainingGroups.map((g) => g.courses.map((c) => c.code))).toEqual([
      ['SEND 1', 'SEND 1L'],
      ['SEND 5'],
    ]);
  });

  it('leaves a course out of the remaining work once it is done', () => {
    const plan = buildPlan(agreement, ['SEND 1']);
    expect(plan.remainingGroups.map((g) => g.courses.map((c) => c.code))).toEqual([
      ['SEND 1L'],
      ['SEND 5'],
    ]);
  });

  it('does not let one course satisfy two requirements', () => {
    const shared: Agreement = {
      ...agreement,
      rows: [
        {
          receiving: [course('RECV 60', 4)],
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 8', 4)] }] },
        },
        {
          receiving: [course('RECV 70', 4)],
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 8', 4)] }] },
        },
      ],
    };

    const plan = buildPlan(shared, ['SEND 8']);

    expect(plan.statuses[0].state).toBe('satisfied');
    expect(plan.statuses[1].state).toBe('remaining');
    expect(plan.remainingUnits).toBe(4);
  });

  it('still satisfies both when the student took both courses', () => {
    const shared: Agreement = {
      ...agreement,
      rows: [
        {
          receiving: [course('RECV 60', 4)],
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 8', 4)] }] },
        },
        {
          receiving: [course('RECV 70', 4)],
          sending: {
            kind: 'options',
            options: [
              { kind: 'and', courses: [course('SEND 8', 4)] },
              { kind: 'and', courses: [course('SEND 9', 5)] },
            ],
          },
        },
      ],
    };

    const plan = buildPlan(shared, ['SEND 8', 'SEND 9']);

    expect(plan.statuses.map((s) => s.state)).toEqual(['satisfied', 'satisfied']);
    expect(plan.remainingUnits).toBe(0);
  });

  it('picks the option that is cheapest given what the student already has', () => {
    const rows: Agreement = {
      ...agreement,
      rows: [
        {
          receiving: [course('RECV 80', 4)],
          sending: {
            kind: 'options',
            options: [
              { kind: 'and', courses: [course('SEND 1', 3), course('SEND 2', 3)] },
              { kind: 'and', courses: [course('SEND 3', 5)] },
            ],
          },
        },
      ],
    };

    const plan = buildPlan(rows, ['SEND 1']);

    expect(plan.statuses[0].cheapestOption.map((c) => c.code)).toEqual(['SEND 1', 'SEND 2']);
    expect(plan.statuses[0].remainingUnits).toBe(3);
  });

  it('releases a demoted routes courses so a later row can claim them', () => {
    // Review finding folded into this task: baseStatus commits `consumed`
    // before the group winner is picked, so a losing route's courses used to
    // stay marked consumed even after the route was demoted. Reproduced
    // here: routes A and B are both independently satisfied, A wins on
    // document order, B is demoted, and a third, unrelated row also needs
    // B's course. Before the fix that third row wrongly showed 'remaining'
    // for a course the student actually holds.
    const grouped: Agreement = {
      ...agreement,
      rows: [
        {
          receiving: [course('RECV 40', 4)],
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 6', 4)] }] },
          orGroup: 1,
        },
        {
          receiving: [course('RECV 50', 4)],
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 7', 4)] }] },
          orGroup: 1,
        },
        {
          receiving: [course('RECV 90', 4)],
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 7', 4)] }] },
        },
      ],
    };

    const plan = buildPlan(grouped, ['SEND 6', 'SEND 7']);

    expect(plan.statuses[0].state).toBe('satisfied');
    expect(plan.statuses[1].state).toBe('alternative');
    expect(plan.statuses[1].satisfiedBy).toEqual([]);
    expect(plan.statuses[2].state).toBe('satisfied');
    expect(plan.remainingUnits).toBe(0);
  });

  it('needs only the cheapest member of a choose-one section', () => {
    const sectioned: Agreement = {
      ...agreement,
      sections: [{ label: 'Complete at least 1 course from the following', rule: { kind: 'choose', least: 1 } }],
      rows: [
        {
          receiving: [course('RECV 10', 4)],
          section: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 1', 3)] }] },
        },
        {
          receiving: [course('RECV 20', 4)],
          section: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 2', 5)] }] },
        },
        { receiving: [course('RECV 30', 4)], section: 0, sending: { kind: 'not_articulated' } },
      ],
    };

    const plan = buildPlan(sectioned, []);

    expect(plan.statuses[0].state).toBe('remaining');
    expect(plan.statuses[1].state).toBe('optional');
    expect(plan.statuses[2].state).toBe('optional');
    expect(plan.remainingUnits).toBe(3);
    expect(plan.notArticulated).toEqual([]);
  });

  it('needs two members of a choose-two section', () => {
    const sectioned: Agreement = {
      ...agreement,
      sections: [{ label: 'Complete at least 2 courses from the following', rule: { kind: 'choose', least: 2 } }],
      rows: [
        {
          receiving: [course('RECV 10', 4)],
          section: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 1', 3)] }] },
        },
        {
          receiving: [course('RECV 20', 4)],
          section: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 2', 4)] }] },
        },
        {
          receiving: [course('RECV 30', 4)],
          section: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 3', 9)] }] },
        },
      ],
    };

    const plan = buildPlan(sectioned, []);

    expect(plan.statuses.map((s) => s.state)).toEqual(['remaining', 'remaining', 'optional']);
    expect(plan.remainingUnits).toBe(7);
  });

  it('counts a choose section as done once enough members are satisfied', () => {
    const sectioned: Agreement = {
      ...agreement,
      sections: [{ label: 'Complete at least 1 course from the following', rule: { kind: 'choose', least: 1 } }],
      rows: [
        {
          receiving: [course('RECV 10', 4)],
          section: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 1', 3)] }] },
        },
        {
          receiving: [course('RECV 20', 4)],
          section: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 2', 5)] }] },
        },
      ],
    };

    const plan = buildPlan(sectioned, ['SEND 2']);

    expect(plan.statuses[1].state).toBe('satisfied');
    expect(plan.statuses[0].state).toBe('optional');
    expect(plan.remainingUnits).toBe(0);
  });

  it('reports blockers when a choose section cannot be met at all', () => {
    const sectioned: Agreement = {
      ...agreement,
      sections: [{ label: 'Complete at least 1 course from the following', rule: { kind: 'choose', least: 1 } }],
      rows: [
        { receiving: [course('RECV 10', 4)], section: 0, sending: { kind: 'not_articulated' } },
        { receiving: [course('RECV 20', 4)], section: 0, sending: { kind: 'not_articulated' } },
      ],
    };

    const plan = buildPlan(sectioned, []);

    expect(plan.notArticulated.map((c) => c.code)).toEqual(['RECV 10', 'RECV 20']);
  });

  it('summarises a choose section for the UI', () => {
    const sectioned: Agreement = {
      ...agreement,
      sections: [{ label: 'Complete at least 1 course from the following', rule: { kind: 'choose', least: 1 } }],
      rows: [
        {
          receiving: [course('RECV 10', 4)],
          section: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 1', 3)] }] },
        },
        {
          receiving: [course('RECV 20', 4)],
          section: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 2', 5)] }] },
        },
      ],
    };

    const plan = buildPlan(sectioned, []);

    expect(plan.sections).toEqual([
      {
        label: 'Complete at least 1 course from the following',
        rule: { kind: 'choose', least: 1 },
        satisfiedCount: 0,
        needed: 1,
        satisfiedUnits: 0,
        met: false,
      },
    ]);
  });
  it('completes one whole route and stands the other down', () => {
    // Two routes through one section. Route 0 takes two courses, route 1
    // takes one expensive course. Both are achievable, so the cheaper route
    // wins and every row of the loser goes quiet.
    const routed: Agreement = {
      ...agreement,
      sections: [{ label: 'Complete A or B', rule: { kind: 'choose_route' } }],
      rows: [
        {
          receiving: [course('RECV 10', 4)],
          section: 0,
          route: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 1', 3)] }] },
        },
        {
          receiving: [course('RECV 11', 4)],
          section: 0,
          route: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 2', 3)] }] },
        },
        {
          receiving: [course('RECV 20', 4)],
          section: 0,
          route: 1,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 9', 9)] }] },
        },
      ],
    };

    const plan = buildPlan(routed, []);

    expect(plan.statuses.map((s) => s.state)).toEqual(['remaining', 'remaining', 'alternative']);
    expect(plan.remainingUnits).toBe(6);
    expect(plan.sections[0]).toMatchObject({ satisfiedCount: 0, needed: 1, met: false });
  });

  it('does not treat a half finished route as a finished one', () => {
    const routed: Agreement = {
      ...agreement,
      sections: [{ label: 'Complete A or B', rule: { kind: 'choose_route' } }],
      rows: [
        {
          receiving: [course('RECV 10', 4)],
          section: 0,
          route: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 1', 3)] }] },
        },
        {
          receiving: [course('RECV 11', 4)],
          section: 0,
          route: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 2', 3)] }] },
        },
        {
          receiving: [course('RECV 20', 4)],
          section: 0,
          route: 1,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 9', 9)] }] },
        },
      ],
    };

    // SEND 1 alone finishes half of route 0. The section is not met, and the
    // route is still the cheaper one to finish, so route 1 stays stood down.
    const plan = buildPlan(routed, ['SEND 1']);

    expect(plan.statuses.map((s) => s.state)).toEqual(['satisfied', 'remaining', 'alternative']);
    expect(plan.sections[0].met).toBe(false);
    expect(plan.remainingUnits).toBe(3);
  });

  it('avoids a route it cannot finish even when that route looks cheaper', () => {
    const routed: Agreement = {
      ...agreement,
      sections: [{ label: 'Complete A or B', rule: { kind: 'choose_route' } }],
      rows: [
        { receiving: [course('RECV 10', 4)], section: 0, route: 0, sending: { kind: 'not_articulated' } },
        {
          receiving: [course('RECV 20', 4)],
          section: 0,
          route: 1,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 9', 9)] }] },
        },
      ],
    };

    const plan = buildPlan(routed, []);

    expect(plan.statuses[1].state).toBe('remaining');
    expect(plan.remainingUnits).toBe(9);
    expect(plan.notArticulated).toEqual([]);
  });

  it('keeps taking options until a unit target is reached', () => {
    // 8 units wanted. The two cheapest options are 3 and 4 units, which is 7,
    // so a third has to be kept as well.
    const unitTarget: Agreement = {
      ...agreement,
      sections: [{ label: 'Complete at least 8 units from the following', rule: { kind: 'choose_units', least: 8, unitLabel: 'semester units' } }],
      rows: [3, 4, 5, 6].map((units, i) => ({
        receiving: [course(`RECV ${(i + 1) * 10}`, 4)],
        section: 0,
        sending: {
          kind: 'options' as const,
          options: [{ kind: 'and' as const, courses: [course(`SEND ${units}`, units)] }],
        },
      })),
    };

    const plan = buildPlan(unitTarget, []);

    expect(plan.statuses.map((s) => s.state)).toEqual([
      'remaining',
      'remaining',
      'remaining',
      'optional',
    ]);
    expect(plan.remainingUnits).toBe(12);
    expect(plan.sections[0]).toMatchObject({ satisfiedUnits: 0, met: false });
  });

  it('counts units already completed toward a unit target', () => {
    const unitTarget: Agreement = {
      ...agreement,
      sections: [{ label: 'Complete at least 8 units from the following', rule: { kind: 'choose_units', least: 8, unitLabel: 'semester units' } }],
      rows: [3, 4, 5, 6].map((units, i) => ({
        receiving: [course(`RECV ${(i + 1) * 10}`, 4)],
        section: 0,
        sending: {
          kind: 'options' as const,
          options: [{ kind: 'and' as const, courses: [course(`SEND ${units}`, units)] }],
        },
      })),
    };

    const plan = buildPlan(unitTarget, ['SEND 5', 'SEND 6']);

    expect(plan.sections[0]).toMatchObject({ satisfiedUnits: 11, met: true });
    expect(plan.remainingUnits).toBe(0);
  });

  it('treats an advisory section as fully required rather than dropping its rule', () => {
    // The tool cannot evaluate "up to 2 courses", so it must not pretend to.
    // Every row stays required, which overstates the work, and the rule text
    // survives on the section for the UI to print.
    const advisory: Agreement = {
      ...agreement,
      sections: [
        { label: 'Additional courses', rule: { kind: 'advisory', text: 'Complete up to 2 courses from the following' } },
      ],
      rows: [
        {
          receiving: [course('RECV 10', 4)],
          section: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 1', 3)] }] },
        },
        {
          receiving: [course('RECV 20', 4)],
          section: 0,
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 2', 5)] }] },
        },
      ],
    };

    const plan = buildPlan(advisory, []);

    expect(plan.statuses.map((s) => s.state)).toEqual(['remaining', 'remaining']);
    expect(plan.remainingUnits).toBe(8);
    expect(plan.sections[0]).toMatchObject({ needed: 2, met: false });
  });
});

describe('which requirements are a minimum', () => {
  // The shape of a real UCI agreement: one section the campus marks as
  // gating admission, one it lists without that mark. Reading the two the
  // same is what told a student on an ordinary two-year plan that they could
  // not transfer at all, on the strength of a course the campus never said
  // was required.
  const marked = (admission: boolean, label: string) => ({
    label,
    rule: { kind: 'all' as const },
    admission,
  });

  const row = (receiving: string, sending: string, section: number) => ({
    receiving: [course(receiving, 4)],
    section,
    sending: {
      kind: 'options' as const,
      options: [{ kind: 'and' as const, courses: [course(sending, 4)] }],
    },
  });

  const build = (sections: ReturnType<typeof marked>[]): Agreement => ({
    academicYear: '2025-2026',
    major: 'Widgetry, B.S.',
    receivingInstitution: 'Test University',
    sendingInstitution: 'Test College',
    sections,
    rows: [row('RECV 10', 'SEND 1', 0), row('RECV 20', 'SEND 2', 1)],
  });

  it('splits an agreement that marks its minimums', () => {
    const plan = buildPlan(
      build([
        marked(true, 'MAJOR PREPARATION REQUIRED FOR TRANSFER — REQUIRED FOR ADMISSION'),
        marked(false, 'ADDITIONAL APPROVED COURSES FOR THE MAJOR'),
      ]),
      [],
    );

    expect(plan.remainingGroups.map((g) => [g.courses[0].code, g.priority])).toEqual([
      ['SEND 1', 'admission'],
      ['SEND 2', 'major'],
    ]);
  });

  it('treats every requirement as a minimum when the agreement marks none', () => {
    // An agreement that never draws the distinction is not one where nothing
    // is required. Demoting its requirements would understate the work, which
    // is the one direction this project does not go.
    const plan = buildPlan(
      build([marked(false, 'MAJOR PREPARATION'), marked(false, 'MORE PREPARATION')]),
      [],
    );

    expect(plan.remainingGroups.every((g) => g.priority === 'admission')).toBe(true);
  });
});

describe('credit this tool cannot see', () => {
  // The gap this closes. A student with an AP score, or a course from another
  // college, or a course ASSIST does not list for this pairing, had no way to
  // say so, and the plan went on scheduling work they had already done.
  it('clears a requirement the student says they already hold', () => {
    const plan = buildPlan(agreement, [], ['RECV 30']);

    expect(plan.statuses[2].state).toBe('satisfied');
    expect(plan.statuses[2].clearedByCredit).toBe(true);
    expect(plan.statuses[2].satisfiedBy).toEqual([]);
    expect(plan.remainingGroups.flatMap((g) => g.courses.map((c) => c.code))).not.toContain(
      'SEND 5',
    );
  });

  it('names a multi-course requirement by all of its receiving codes', () => {
    expect(rowKey([course('I&C SCI 31', 4), course('I&C SCI 32', 4)])).toBe(
      'I&C SCI 31+I&C SCI 32',
    );
  });

  it('leaves the sending courses free for a row that genuinely needs them', () => {
    // A cleared row was not satisfied by any sending course, so it must not
    // take one out of circulation. Two rows both articulated by SEND 5: with
    // the first cleared, the second still gets it.
    const shared: Agreement = {
      ...agreement,
      rows: [
        {
          receiving: [course('RECV 40', 4)],
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 5', 4)] }] },
        },
        {
          receiving: [course('RECV 50', 4)],
          sending: { kind: 'options', options: [{ kind: 'and', courses: [course('SEND 5', 4)] }] },
        },
      ],
    };

    const plan = buildPlan(shared, ['SEND 5'], ['RECV 40']);
    expect(plan.statuses[0].clearedByCredit).toBe(true);
    expect(plan.statuses[1].state).toBe('satisfied');
    expect(plan.statuses[1].satisfiedBy.map((c) => c.code)).toEqual(['SEND 5']);
    expect(plan.remainingUnits).toBe(0);
  });

  it('clears a requirement nothing at the college articulates', () => {
    // The case with no other way to be said: the college has nothing for it,
    // but an AP score still might.
    const plan = buildPlan(agreement, [], ['RECV 20']);
    expect(plan.statuses[1].state).toBe('satisfied');
    expect(plan.notArticulated).toEqual([]);
  });

  it('changes nothing when the claim names no row on this agreement', () => {
    const plan = buildPlan(agreement, [], ['NOT A ROW']);
    expect(plan.remainingUnits).toBe(buildPlan(agreement, []).remainingUnits);
  });
});

describe('an option something else in the plan needs', () => {
  // Diablo Valley to UCI, as read. MATH 2A takes MATH 182 (business calculus,
  // four units) or MATH 192 (calculus I, five units). MATH 2B takes only
  // MATH 193, and the catalog says MATH 193 needs MATH 192. Cheapest by units
  // is MATH 182, which puts MATH 182, MATH 192 and MATH 193 all on the plan
  // when MATH 192 alone would have done.
  const dvc: Agreement = {
    ...agreement,
    rows: [
      {
        receiving: [course('MATH 2A', 4)],
        sending: {
          kind: 'options',
          options: [
            { kind: 'and', courses: [course('MATH 182', 4)] },
            { kind: 'and', courses: [course('MATH 192', 5)] },
          ],
        },
      },
      {
        receiving: [course('MATH 2B', 4)],
        sending: { kind: 'options', options: [{ kind: 'and', courses: [course('MATH 193', 5)] }] },
      },
    ],
  };

  const math193 = [{ code: 'MATH 193', prerequisites: ['MATH 192'] }];

  it('is chosen over a cheaper one nothing needs', () => {
    const plan = buildPlan(dvc, [], [], math193);
    expect(plan.statuses[0].cheapestOption.map((c) => c.code)).toEqual(['MATH 192']);
    expect(plan.remainingUnits).toBe(10);
  });

  it('is not chosen when nothing says it is needed', () => {
    const plan = buildPlan(dvc, []);
    expect(plan.statuses[0].cheapestOption.map((c) => c.code)).toEqual(['MATH 182']);
  });

  it('is matched however the catalog spells it', () => {
    const plan = buildPlan(dvc, [], [], [{ code: 'MATH-193', prerequisites: ['math-192'] }]);
    expect(plan.statuses[0].cheapestOption.map((c) => c.code)).toEqual(['MATH 192']);
  });

  it('never displaces an option the student has already completed', () => {
    const plan = buildPlan(dvc, ['MATH 182'], [], math193);
    expect(plan.statuses[0].state).toBe('satisfied');
    expect(plan.statuses[0].satisfiedBy.map((c) => c.code)).toEqual(['MATH 182']);
  });

  it('breaks a tie between two needed options on units', () => {
    const both: Agreement = {
      ...dvc,
      rows: [
        {
          receiving: [course('MATH 2A', 4)],
          sending: {
            kind: 'options',
            options: [
              { kind: 'and', courses: [course('MATH 192', 5)] },
              { kind: 'and', courses: [course('MATH 182', 4)] },
            ],
          },
        },
      ],
    };
    const plan = buildPlan(both, [], [], [
      { code: 'MATH 193', prerequisites: ['MATH 192'] },
      { code: 'ECON 10', prerequisites: ['MATH 182'] },
    ]);
    expect(plan.statuses[0].cheapestOption.map((c) => c.code)).toEqual(['MATH 182']);
  });

  it('does not send a student to the honours section on a tie', () => {
    // UC Irvine's mathematics requirement for Biological Sciences from
    // Pasadena lists MATH 005AH ahead of MATH 005A. Both serve MATH 005B and
    // both are five units, and document order chose the honours section.
    const honours: Agreement = {
      ...dvc,
      rows: [
        {
          receiving: [course('MATH 2A', 4)],
          sending: {
            kind: 'options',
            options: [
              { kind: 'and', courses: [course('MATH 005AH', 5)] },
              { kind: 'and', courses: [course('MATH 006A', 3)] },
              { kind: 'and', courses: [course('MATH 005A', 5)] },
            ],
          },
        },
      ],
    };
    const plan = buildPlan(honours, [], [], [{ code: 'MATH 5B', prerequisites: ['MATH 5A', 'MATH 5AH'] }]);
    expect(plan.statuses[0].cheapestOption.map((c) => c.code)).toEqual(['MATH 005A']);
  });

  // Pasadena's I&C SCI 31-33 row, as read. CS 003B goes with CS 033 (seven
  // units) or with CS 002 (eight), and the catalog says CS 033 needs CS 003B
  // and CS 003A needs CS 002. CS 003A is on the plan for CS 008, a different
  // row. The first option needing its own member is not a reason to choose
  // it; CS 002 being needed from outside the row is.
  const pcc: Agreement = {
    ...agreement,
    rows: [
      {
        receiving: [course('I&C SCI 31', 4), course('I&C SCI 32', 4)],
        sending: {
          kind: 'options',
          options: [
            { kind: 'and', courses: [course('CS 003B', 3), course('CS 033', 3), course('CS 003BL', 1)] },
            { kind: 'and', courses: [course('CS 003B', 3), course('CS 002', 4), course('CS 003BL', 1)] },
          ],
        },
      },
      {
        receiving: [course('I&C SCI 46', 4)],
        sending: { kind: 'options', options: [{ kind: 'and', courses: [course('CS 008', 3)] }] },
      },
    ],
  };

  it('counts only a need from outside the row', () => {
    const plan = buildPlan(pcc, [], [], [
      { code: 'CS 033', prerequisites: ['CS 3B'] },
      { code: 'CS 3A', prerequisites: ['CS 2'] },
      { code: 'CS 8', prerequisites: ['CS 3A'] },
    ]);
    expect(plan.statuses[0].cheapestOption.map((c) => c.code)).toEqual(['CS 003B', 'CS 002', 'CS 003BL']);
  });

  it('is not swayed by an option vouching for itself', () => {
    const plan = buildPlan(pcc, [], [], [{ code: 'CS 033', prerequisites: ['CS 3B'] }]);
    expect(plan.statuses[0].cheapestOption.map((c) => c.code)).toEqual(['CS 003B', 'CS 033', 'CS 003BL']);
  });
});
