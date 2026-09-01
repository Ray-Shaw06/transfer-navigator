import { describe, it, expect } from 'vitest';
import { admissionNeeds } from '../../src/planner/minimum';
import { areasFor, patternFor, type Destination, type PatternKey } from '../../src/planner/patterns';
import type { AreaCoverage } from '../../src/planner/ge';

// Areas as the pattern itself defines them, with nothing done yet, which is
// the state that matters: it is the student with everything still to do who
// finds out there are not enough terms for all of it.
const untouched = (key: PatternKey, destination: Destination): AreaCoverage[] =>
  areasFor(patternFor(key), destination).map((rule) => ({
    id: rule.id,
    label: rule.label,
    semesterUnits: rule.semesterUnits,
    required: rule.courses,
    offered: 20,
    done: [],
    planned: [],
    met: false,
    covered: false,
  }));

const needs = (key: PatternKey, destination: Destination, areas = untouched(key, destination)) =>
  admissionNeeds(patternFor(key), destination, areas);

const slots = (map: ReturnType<typeof needs>) =>
  Object.fromEntries([...map].filter(([, v]) => v.count > 0).map(([k, v]) => [k, v.count]));

describe('what CSU admission needs', () => {
  it('asks for the four areas of the gate and nothing else', () => {
    // Cal-GETC states all four as whole areas of one course each.
    expect(slots(needs('CALGETC', 'CSU'))).toEqual({ '1A': 1, '1B': 1, '1C': 1, '2': 1 });
  });

  it('reaches inside an area for a subarea the gate names', () => {
    // Quantitative reasoning is B4, one course inside a three-course Area B.
    // Marking the whole of Area B would schedule two courses admission does
    // not ask for; marking none of it would drop the one it does.
    const map = needs('CSUGE', 'CSU');
    expect(map.get('B')).toEqual({ count: 1, need: 'B4' });
    expect(slots(map)).toEqual({ A1: 1, A2: 1, A3: 1, B: 1 });
  });

  it('leaves the breadth areas out of it', () => {
    const map = needs('IGETC', 'CSU');
    for (const id of ['3', '4', '5', '7']) expect(map.get(id)?.count ?? 0).toBe(0);
  });
});

describe('what UC admission needs', () => {
  it('asks for two composition courses, one mathematics, and four of breadth', () => {
    // The 7-course pattern: 1A and 1B are the two UC-E courses, Area 2 is
    // UC-M, and four more come out of Areas 3, 4 and 5.
    const map = needs('CALGETC', 'UC');
    expect(map.get('1A')?.count).toBe(1);
    expect(map.get('1B')?.count).toBe(1);
    expect(map.get('2')?.count).toBe(1);

    const breadth = ['3', '4', '5'].reduce((sum, id) => sum + (map.get(id)?.count ?? 0), 0);
    expect(breadth).toBe(4);
    expect(['3', '4', '5'].filter((id) => (map.get(id)?.count ?? 0) > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('does not ask for oral communication or ethnic studies', () => {
    // Both are real Cal-GETC requirements and neither appears in UC's
    // pattern. This is the distinction the whole feature turns on: they are
    // needed to certify, not to be admitted.
    const map = needs('CALGETC', 'UC');
    expect(map.get('1C')?.count ?? 0).toBe(0);
    expect(map.get('6')?.count ?? 0).toBe(0);
  });

  it('does not ask IGETC students for a language other than English', () => {
    const map = needs('IGETC', 'UC');
    expect(map.get('6A')?.count ?? 0).toBe(0);
    expect(map.get('7')?.count ?? 0).toBe(0);
    expect(map.get('2A')?.count).toBe(1);
  });

  it('counts courses already held toward the breadth quota', () => {
    const areas = untouched('CALGETC', 'UC');
    const area3 = areas.find((a) => a.id === '3')!;
    area3.done = [
      { code: 'ART 001', title: 'Art', units: 3 },
      { code: 'HIST 001', title: 'History', units: 3 },
    ];

    // Two of the four are already in hand, so only two more are asked for,
    // and they cannot come from the area that is finished.
    const map = admissionNeeds(patternFor('CALGETC'), 'UC', areas);
    expect(map.get('3')?.count ?? 0).toBe(0);
    expect(['4', '5'].reduce((sum, id) => sum + (map.get(id)?.count ?? 0), 0)).toBe(2);
  });

  it('takes the breadth quota from wherever it is cheapest to finish', () => {
    // One course short in Area 4 and nothing done in Area 3 or 5. The two
    // courses left in Area 4 plus two elsewhere is four; asking for the two
    // untouched areas instead would cost the student more work for the same
    // rule.
    const areas = untouched('CALGETC', 'UC');
    areas.find((a) => a.id === '4')!.done = [{ code: 'PSYC 001', title: 'Psych', units: 3 }];

    const map = admissionNeeds(patternFor('CALGETC'), 'UC', areas);
    expect(map.get('4')?.count).toBe(1);
    expect(['3', '4', '5'].reduce((sum, id) => sum + (map.get(id)?.count ?? 0), 0)).toBe(3);
  });

  it('has nothing to say about CSU GE-Breadth, which UC does not accept', () => {
    expect(slots(needs('CSUGE', 'UC'))).toEqual({});
  });
});

it('asks for nothing until a destination is chosen', () => {
  expect(admissionNeeds(patternFor('CALGETC'), null, untouched('CALGETC', 'UC')).size).toBe(0);
});
