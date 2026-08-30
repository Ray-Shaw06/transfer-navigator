import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toAgreement } from '../../src/assist/agreement';
import { buildPlan } from '../../src/planner/plan';
import type { AssistResult } from '../../src/assist/types';

// Real ASSIST responses are not committed: this project does not carry
// agreement content in its repo. Point ASSIST_CACHE_DIR at a directory of
// saved /api/articulation/Agreements responses to run this gate locally.
const dir = process.env.ASSIST_CACHE_DIR;
const present = Boolean(dir && existsSync(dir));

it('reports whether the real ASSIST acceptance gate ran', () => {
  if (!present) {
    console.warn(
      'ASSIST ACCEPTANCE GATE SKIPPED: set ASSIST_CACHE_DIR to a directory of saved ASSIST agreement responses. The mapper was NOT verified against real data in this run.',
    );
  }
  expect(typeof present).toBe('boolean');
});

describe.skipIf(!present)('toAgreement over real ASSIST responses', () => {
  // describe.skipIf still runs this body during collection, so the read has
  // to be guarded here as well as by the gate.
  const files = present
    ? readdirSync(dir!)
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(dir!, f))
    : [];

  const results = files
    .map((f) => {
      try {
        return JSON.parse(readFileSync(f, 'utf8')) as { result?: AssistResult };
      } catch {
        return null;
      }
    })
    .filter((r): r is { result: AssistResult } => Boolean(r?.result));

  it('has agreements to check', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('maps every agreement without throwing and plans it', () => {
    for (const { result } of results) {
      const agreement = toAgreement(result);
      expect(agreement.major).not.toBe('');
      expect(agreement.receivingInstitution).not.toBe('');
      expect(agreement.sendingInstitution).not.toBe('');
      const plan = buildPlan(agreement, []);
      expect(plan.remainingUnits).toBeGreaterThanOrEqual(0);
      expect(plan.statuses).toHaveLength(agreement.rows.length);
    }
  });

  it('never emits a row with no receiving side and never an empty option list', () => {
    for (const { result } of results) {
      for (const row of toAgreement(result).rows) {
        expect(row.receiving.length).toBeGreaterThan(0);
        if (row.sending.kind === 'options') {
          expect(row.sending.options.length).toBeGreaterThan(0);
          for (const option of row.sending.options) {
            expect(option.courses.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('tags every row with a section that exists', () => {
    for (const { result } of results) {
      const agreement = toAgreement(result);
      for (const row of agreement.rows) {
        expect(row.section).toBeDefined();
        expect(agreement.sections[row.section!]).toBeDefined();
      }
    }
  });
});
