import { describe, it, expect } from 'vitest';
import { buildPlan } from '../../src/planner/plan';
import type { Agreement } from '../../src/parser/document';

const course = (code: string, units: number) => ({ code, title: code, units });

const agreement: Agreement = {
  academicYear: '2025-2026',
  major: 'Widgetry, B.S.',
  receivingInstitution: 'Test University',
  sendingInstitution: 'Test College',
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

  it('packs remaining courses into terms under the unit cap', () => {
    const plan = buildPlan(agreement, [], 5);
    expect(plan.terms).toEqual([
      [course('SEND 1', 3), course('SEND 1L', 1)],
      [course('SEND 5', 4)],
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
});
