import { describe, it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
writeFileSync('/tmp/tn-out.txt','');
const LOG = (...a: unknown[]) => appendFileSync('/tmp/tn-out.txt', a.join(' ') + '\n');
import { readFileSync } from 'node:fs';
import { buildPlan } from '../src/planner/plan';
import type { Agreement } from '../src/parser/agreement';

describe('csu', () => {
  it('plans', () => {
    const a = JSON.parse(readFileSync('/tmp/agr-cpp-cs.json', 'utf8')).agreement as Agreement;
    const plan = buildPlan(a, []);
    LOG('SECTIONS');
    for (const s of plan.sections) LOG(' ', JSON.stringify(s));
    LOG('remainingUnits', plan.remainingUnits);
    LOG('remainingGroups', plan.remainingGroups.length);
    for (const g of plan.remainingGroups) LOG('  G:', g.courses.map((c) => `${c.code} (${c.units})`).join(' + '));
    LOG('statuses');
    for (const s of plan.statuses)
      LOG(`  [${s.state}] sec=${s.section} recv=${s.receiving.map((c) => c.code).join('+')} kind=${s.receivingKind ?? 'course'} opts=${s.allOptions.length} pick=${s.cheapestOption.map((c) => c.code).join('+')}`);
  });
});
