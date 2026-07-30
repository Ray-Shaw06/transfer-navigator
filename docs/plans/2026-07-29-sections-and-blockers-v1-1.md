# Transfer Navigator v1.1: sections and the three blockers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three Critical findings that block v1 from reaching a real student, the largest being that the agreement's section quantifiers are discarded so optional requirements are reported as required.

**Architecture:** Unchanged from v1. Everything still runs in the browser, no server, no storage. This adds a section layer between row banding and the agreement, and an allocation pass in the planner.

**Predecessor:** `docs/plans/2026-07-28-parser-planner-v1.md`, all nine tasks complete, 43 tests passing. Findings recorded in `.superpowers/sdd/progress.md`.

## Global Constraints

Carried unchanged from v1, restated because they bind every task here:

- **No ASSIST agreement content as data in the repository.** Real agreement PDFs and derived datasets stay gitignored. Committed fixtures use invented codes. Acceptance tests may name the specific codes they assert on, because that is what makes them acceptance tests. Explanatory comments should use invented examples.
- **Never present a guess as fact.** Anything not fully understood renders as unreadable with a link to verify on assist.org. This is the property the three Criticals breach.
- **No em dashes** in code, comments, UI copy, or commit messages. Periods, commas, colons.
- **No coordinate constants in assertions** beyond a fixture's own values.
- $0 infrastructure, Vercel free tier.
- TDD throughout. One commit per task, conventional-commits style, revertible in one step.
- `npx tsc --noEmit` clean, and every pre-existing test still passing, unchanged.

## What the real agreement actually looks like

Measured 2026-07-29 by dumping the receiving column in document order with each line classified. This is the design input, not a guess.

| Section | Header lines, in the receiving column | Governs | Rule |
|---|---|---|---|
| 1 | `1`, then `REQUIRED FOR ADMISSION` | the AND-joined programming requirement, plus two calculus requirements | all required |
| 2 | `ADDITIONAL APPROVED COURSES FOR THE MAJOR`, then `2 Complete at least 1 course from the following` | eight requirements | choose at least 1 |
| 3 | `3 Select A or B`, with `A` and `B` labels | two requirements | choose 1 |

Two facts that matter:

**Section membership is document order, not page.** Section 1's requirements span pages 2 and 3. Section 2's header sits at the bottom of page 3 and its requirements are all on page 4. So sections are assigned by walking the receiving column in page-then-y order, never per page.

**Page 1 prose conflicts with the table, and the table wins.** Page 1 carries UCI's `IMPORTANT MAJOR INFORMATION`, which reads as though more is required than section 2's "at least 1". That prose is advisory and not machine readable. The table's quantifier is explicit. So: parse the quantifier, surface the prose verbatim for the student to read, and never interpret the prose. Interpreting it would be exactly the guess this project refuses to make.

**Section 3 is the existing `orGroup` mechanism with N of 1.** The `orGroup` work from v1 Task 7 already groups it correctly. Section 2 is the same idea with eight members instead of two. The section layer should subsume `orGroup` rather than sit beside it, so there is one concept and not two.

---

### Task 10: Guard an empty or unrecognised parse

**Files:**
- Modify: `src/parser/document.ts`
- Modify: `app/page.tsx`
- Test: `tests/parser/document.test.ts`

**Interfaces:**
- Consumes: `Agreement` from v1
- Produces: `parseAgreement` throws `UnrecognisedAgreementError` when the parse yields nothing usable

Today a PDF that is not an agreement parses without throwing to an empty agreement, and the page renders `0 semester units remaining` with `Nothing left to schedule`. A student pointing at the wrong file is told they are done. Same output for a scanned agreement with no text layer.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/document.test.ts, a new describe block outside the fixture-gated one
import { UnrecognisedAgreementError } from '../../src/parser/document';

describe('parseAgreement on input that is not an agreement', () => {
  it('throws rather than returning an empty agreement', async () => {
    // A minimal valid PDF carrying one line of unrelated text.
    const pdf = makeTextPdf('This is not an articulation agreement.');
    await expect(parseAgreement(pdf)).rejects.toThrow(UnrecognisedAgreementError);
  });
});
```

Write `makeTextPdf` as a small helper in the same file that emits a syntactically valid single page PDF with a text layer. Keep it to the smallest thing pdfjs will open. If that proves awkward, an acceptable substitute is a test that calls the internal assembly step with an empty row list and asserts the same throw, but say in your report which you did and why.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/parser/document.test.ts`
Expected: FAIL, `UnrecognisedAgreementError` is not exported.

- [ ] **Step 3: Implement**

```ts
// src/parser/document.ts
export class UnrecognisedAgreementError extends Error {
  constructor() {
    super('That file does not look like an ASSIST articulation agreement.');
    this.name = 'UnrecognisedAgreementError';
  }
}
```

At the end of `parseAgreement`, before returning, throw it when the parse produced nothing usable. The condition is: no rows, or no academic year and no major. Do not guess a repair.

- [ ] **Step 4: Surface it in the page**

In `app/page.tsx`, the existing catch already sets an error message. Make it distinguish the two cases so the message is accurate:

```tsx
    } catch (err) {
      setAgreement(null);
      setError(
        err instanceof UnrecognisedAgreementError
          ? 'That file does not look like an ASSIST articulation agreement. Download yours from assist.org and try again. A scanned or photographed agreement will not work, it needs to be the PDF assist.org gives you.'
          : 'Could not read that PDF. Download the agreement again from assist.org and retry.',
      );
    }
```

Confirm `setAgreement(null)` is present so a previous good result is cleared rather than left on screen beside an error.

- [ ] **Step 5: Run the suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/parser/document.ts app/page.tsx tests/parser/document.test.ts
git commit -m "fix: reject a file that is not an agreement instead of reporting zero units"
```

---

### Task 11: One course satisfies one requirement

**Files:**
- Modify: `src/planner/plan.ts`
- Test: `tests/planner/plan.test.ts`

**Interfaces:**
- Consumes: `Agreement`, `ArticulationRow`
- Produces: `buildPlan` allocates each completed course to at most one requirement

The agreement states that a single course may be used only once. The parser reads that line and discards it. Today `buildPlan` evaluates every row independently, so one course satisfies two requirements at once and the remaining units drop by more than they should.

Allocation strategy, stated so it is not invented per task: walk rows in document order, and a row may only be satisfied by courses not already consumed by an earlier row. Document order is the agreement's own order, which is the closest thing to the intended priority. This is deliberately simple and can be wrong in the sense of not being globally optimal. That is acceptable and must be disclosed in the UI copy: it may understate what a student has already satisfied, never overstate it. Understating is the safe direction here.

- [ ] **Step 1: Write the failing test**

```ts
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
```

The second test is the guard against overcorrecting. A greedy allocation that consumes `SEND 8` for the first row must still find `SEND 9` for the second.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/planner/plan.test.ts`
Expected: FAIL on the first test, both rows reported satisfied and remainingUnits 0.

- [ ] **Step 3: Implement**

Replace the independent `agreement.rows.map(baseStatus)` call with a sequential walk that carries a consumed set. `baseStatus` gains a third parameter:

```ts
function baseStatus(row: ArticulationRow, done: Set<string>, consumed: Set<string>): RowStatus {
```

Inside it, a course counts as available only when `done.has(code) && !consumed.has(code)`. When an option is chosen as satisfying the row, add every course in that option to `consumed`.

Prefer, among options the student has fully completed with unconsumed courses, the one consuming the fewest courses, so a cheap option does not needlessly eat a course a later row depends on.

Leave `resolveGroups` and the term packing untouched.

- [ ] **Step 4: Also fix the cheapest-option ordering while you are here**

Review finding: `cheapestOption` is chosen by sorting on each option's full unit total, then the completed courses are subtracted afterwards. So a student holding one course of a two course option can be routed to a costlier option. Sort on open units, meaning units the student has not already completed, not on the option total.

Add a test for it:

```ts
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
```

- [ ] **Step 5: Run the suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/planner/plan.ts tests/planner/plan.test.ts
git commit -m "fix: allocate each completed course to one requirement only"
```

---

### Task 12: Parse sections and their quantifiers

**Files:**
- Create: `src/parser/sections.ts`
- Modify: `src/parser/document.ts`
- Test: `tests/parser/sections.test.ts`, `tests/parser/document.test.ts`

**Interfaces:**
- Consumes: `Line`, `ParsedLine`, `RawRow`
- Produces:

```ts
export type SectionRule =
  | { kind: 'all' }                       // every requirement in the section is required
  | { kind: 'choose'; least: number };    // at least N of the requirements
export type Section = { label: string; rule: SectionRule };
export function parseSectionHeader(text: string): Section | null;
```

and on `ArticulationRow`, a `section?: number` index plus `Agreement.sections: Section[]`.

This is the Critical finding. The section header is a receiving-column line carrying no course, and `document.ts` drops every such line in order to discard page headers and footers. So `2 Complete at least 1 course from the following` is thrown away and the eight requirements beneath it are emitted as eight independent required rows. The app then reports units the student does not owe, and lists requirements as blockers that the student does not need.

- [ ] **Step 1: Write the failing header tests**

```ts
// tests/parser/sections.test.ts
import { describe, it, expect } from 'vitest';
import { parseSectionHeader } from '../../src/parser/sections';

describe('parseSectionHeader', () => {
  it('reads a numbered choose-at-least header', () => {
    expect(parseSectionHeader('2 Complete at least 1 course from the following')).toEqual({
      label: 'Complete at least 1 course from the following',
      rule: { kind: 'choose', least: 1 },
    });
  });

  it('reads a plural choose-at-least header', () => {
    expect(parseSectionHeader('4 Complete at least 2 courses from the following')).toEqual({
      label: 'Complete at least 2 courses from the following',
      rule: { kind: 'choose', least: 2 },
    });
  });

  it('reads a select-between header as choosing one', () => {
    expect(parseSectionHeader('3 Select A or B')).toEqual({
      label: 'Select A or B',
      rule: { kind: 'choose', least: 1 },
    });
  });

  it('reads a required-for-admission header as all required', () => {
    expect(parseSectionHeader('REQUIRED FOR ADMISSION')).toEqual({
      label: 'REQUIRED FOR ADMISSION',
      rule: { kind: 'all' },
    });
  });

  it('returns null for a page header, a footer, or prose', () => {
    expect(parseSectionHeader('7/28/26, 12:25 PM 2025-2026 Computer Science, B.S. Agreement')).toBeNull();
    expect(parseSectionHeader('https://assist.org/transfer/results?year=76')).toBeNull();
    expect(parseSectionHeader('Minimum grade required: B or better')).toBeNull();
    expect(parseSectionHeader('END OF AGREEMENT')).toBeNull();
    expect(parseSectionHeader('A')).toBeNull();
  });
});
```

That last group matters as much as the positive cases. Misreading a footer as a section header would regroup the whole document.

- [ ] **Step 2: Run and watch fail**

Run: `npx vitest run tests/parser/sections.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the header parser**

```ts
// src/parser/sections.ts
export type SectionRule = { kind: 'all' } | { kind: 'choose'; least: number };
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
```

Returning `null` for a numbered line whose label is not recognised is deliberate. An unrecognised quantifier must not silently become "all required", and must not become a guess either. Task 13 handles what to do with it.

- [ ] **Step 4: Assign rows to sections in document.ts**

Walk the receiving column in page-then-y order. Maintain a current section index, starting at a synthetic section 0 with rule `{ kind: 'all' }` for anything appearing before the first header. When a line parses as a section header, push a new section and advance. When a banded row is emitted, tag it with the current section index.

Section membership is document order and spans pages: section 1's requirements are on pages 2 and 3, and section 2's header is at the bottom of page 3 while its requirements are all on page 4. Do not scope this per page.

Add `sections: Section[]` to `Agreement` and `section?: number` to `ArticulationRow`.

- [ ] **Step 5: Write the real-agreement acceptance test**

Add inside the existing fixture-gated describe block in `tests/parser/document.test.ts`. Values measured 2026-07-29, do not adjust them to match output:

```ts
  it('assigns the eight optional requirements to a choose-one section', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));

    const chooseSections = agreement.sections.filter((s) => s.rule.kind === 'choose');
    expect(chooseSections.length).toBeGreaterThanOrEqual(2);

    const optional = agreement.rows.filter((r) => {
      const section = r.section === undefined ? undefined : agreement.sections[r.section];
      return section?.rule.kind === 'choose' && section.label.startsWith('Complete at least');
    });

    expect(optional.map((r) => r.receiving[0].code).sort()).toEqual(
      [
        'I&C SCI 45C',
        'I&C SCI 46',
        'I&C SCI 51',
        'I&C SCI 53',
        'I&C SCI 6B',
        'I&C SCI 6D',
        'IN4MATX 43',
        'STATS 67',
      ].sort(),
    );
  });

  it('keeps the calculus and programming requirements outside any choose section', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));

    for (const code of ['I&C SCI 31', 'MATH 2A', 'MATH 2B']) {
      const row = agreement.rows.find((r) => r.receiving.some((c) => c.code === code));
      const section = row!.section === undefined ? undefined : agreement.sections[row!.section];
      expect(section?.rule.kind ?? 'all').toBe('all');
    }
  });
```

- [ ] **Step 6: Run the suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass. The 13 row count and the four not-articulated codes from v1 must not change, only their section tags.

- [ ] **Step 7: Commit**

```bash
git add src/parser/sections.ts src/parser/document.ts tests/parser/sections.test.ts tests/parser/document.test.ts
git commit -m "feat: parse section headers and their choose-at-least quantifiers"
```

---

### Task 13: Planner honours section rules

**Files:**
- Modify: `src/planner/plan.ts`
- Test: `tests/planner/plan.test.ts`

**Interfaces:**
- Consumes: `Agreement.sections`, `ArticulationRow.section`
- Produces: `Plan` gains `sections: SectionStatus[]`, and `RowStatus.state` may be `'optional'`

Generalises the existing `orGroup` resolution. A `choose` section with `least: N` is satisfied when N of its requirements are satisfied. While fewer than N are satisfied, the cheapest members needed to reach N stay `remaining` and the rest become `optional`. Only the members counted toward N contribute to `remainingUnits` and to the term plan.

The `not_articulated` rule follows from that: a requirement with nothing articulated inside a choose section where enough other members are achievable is not a blocker and must not appear in `notArticulated`. That is the bug, stated precisely.

An unrecognised numbered header returned `null` from Task 12, so its rows fall into the surrounding section. If that surrounding section is `all`, the effect is to treat unknown quantifiers as all required, which overstates the work. Overstating is the safe direction, and the UI must say so.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run and watch fail**

Run: `npx vitest run tests/planner/plan.test.ts`
Expected: FAIL, `'optional'` is not an allowed state and section rules are ignored.

- [ ] **Step 3: Implement**

Add `'optional'` to `RowStatus['state']`. Replace `resolveGroups` with a single `resolveSections` that handles both the section rule and the legacy `orGroup`, since `orGroup` is a choose-one over two rows and should not remain a separate concept. Rows in an `all` section keep the state `baseStatus` gave them.

For each `choose` section with `least: N`:
1. Count members already `satisfied`. If that count is at least N, every unsatisfied member becomes `optional` with `remainingUnits` zeroed.
2. Otherwise pick the `(N - satisfiedCount)` cheapest members whose state is `remaining`, ordered by `remainingUnits`. Those stay `remaining`. Every other member becomes `optional` with `remainingUnits` zeroed.
3. If there are fewer achievable members than needed, leave every member as it is, so `not_articulated` members surface as the real blockers they are.

- [ ] **Step 4: Add the section summary to Plan**

```ts
export type SectionStatus = {
  label: string;
  rule: SectionRule;
  satisfiedCount: number;
  needed: number;
  met: boolean;
};
```

Populate `Plan.sections`. The UI needs it to say "pick 1 of these 8, you have 0 so far" rather than presenting eight requirements flatly.

- [ ] **Step 5: Run the suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, including every v1 test unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/planner/plan.ts tests/planner/plan.test.ts
git commit -m "feat: honour section choose-at-least rules when planning"
```

---

### Task 14: Show sections, options and the advisory prose

**Files:**
- Modify: `app/page.tsx`, `app/components/PlanView.tsx`
- Modify: `src/parser/document.ts` if the advisory prose is not already captured

**Interfaces:**
- Consumes: `Plan.sections`, `RowStatus.state` including `'optional'`

Three review findings land here.

**Sections must be visible.** Grouping requirements under their section, with the rule stated in plain words, is the difference between "you need these eight things" and "pick one of these eight". Render `optional` rows visibly but clearly not as work to do.

**The full option list must exist.** The UI currently says to open the full requirement list before deciding, and there is no such list. Either build it or remove the claim, and building it is the right answer: on the real agreement one requirement has five accepted options and the app shows only the fewest-units one. That is how it ends up suggesting Calculus for Life Sciences to a computer science major. `RowStatus` needs every option, not just `cheapestOption`, so add `allOptions: AndGroup[]` and render them.

**The advisory prose must be surfaced verbatim, never interpreted.** Page 1 of the agreement carries the receiving campus's own notes, including a competitive-admission warning, a minimum grade requirement, and a warning not to split a sequence across institutions. None of it is machine readable and none of it is currently shown. Capture that page 1 prose into `Agreement.notes: string[]` and render it under a heading that makes clear it is the campus's text, not ours. Do not summarise it and do not act on it.

- [ ] **Step 1: Add the option list and notes**

Extend `RowStatus` with `allOptions: AndGroup[]`, populated in `baseStatus`. Extend `Agreement` with `notes: string[]`, populated from the page 1 receiving-column prose lines that are not headers, footers, or section headers.

- [ ] **Step 2: Render sections and options**

Group `plan.statuses` by section. For each section print the label and, for a `choose` rule, a line in plain words, for example `Pick at least 1 of these 8. You have 0 so far.` For each requirement show its state, and for anything not satisfied show every option with its units, marking which one the planner chose.

Keep every branch keyed off `state`, never off field presence. A row whose state is `optional` or `alternative` still carries a populated `cheapestOption` from before it lost, and rendering that as work to do is the trap.

- [ ] **Step 3: Correct the copy that promised a list**

The existing paragraph saying fewest units is not best should now point at a list that exists. Also state plainly that where a requirement could be satisfied by a course the student already took, the app allocates each completed course to one requirement only and so may understate what is already done.

- [ ] **Step 4: Render the campus notes**

```tsx
      {plan.notes.length > 0 && (
        <>
          <h3>Notes from the receiving campus</h3>
          <p>Their text, shown as printed. Read it, it carries rules this tool does not check.</p>
          <ul>
            {plan.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </>
      )}
```

- [ ] **Step 5: Verify in a real browser**

Run the dev server, load the real agreement through the actual file input, and confirm:
- the eight page 4 requirements appear under a section saying pick at least 1 of 8
- remaining units is lower than the previous 42, and you can account for the difference
- `I&C SCI 53`, `IN4MATX 43` and `STATS 67` no longer appear as things to take after transferring
- the calculus requirement shows all of its accepted options, not only the fewest-units one
- the campus notes appear
- the network tab shows nothing carrying the file

Report the new remaining units figure and the arithmetic behind it.

- [ ] **Step 6: Run the suite and typecheck, then commit**

```bash
npm test && npx tsc --noEmit
git add app src/parser/document.ts src/planner/plan.ts
git commit -m "feat: show sections, every accepted option, and the campus notes"
```

---

### Task 15: Make the acceptance gate visible in CI

**Files:**
- Create: `tests/fixtures/synthetic-agreement.ts` or a generator, plus `.github/workflows/ci.yml`
- Modify: `tests/parser/document.test.ts`

Eight of the tests, including the entire real-agreement acceptance gate, are `describe.skipIf` on a gitignored fixture. CI would go green having validated no agreement at all. The spec calls for CI running the tests, so this matters before anyone trusts a green check.

- [ ] **Step 1: Make the skip loud**

Add a test outside the gate that always runs and reports whether the fixture was present, so a skipped acceptance gate is visible in the output rather than silent:

```ts
it('reports whether the real agreement acceptance gate ran', () => {
  const present = existsSync(FIXTURE);
  if (!present) {
    console.warn(
      'ACCEPTANCE GATE SKIPPED: no local agreement fixture. Parser correctness against a real agreement was NOT verified in this run.',
    );
  }
  expect(typeof present).toBe('boolean');
});
```

- [ ] **Step 2: Build a committable synthetic multi-page agreement**

Generate a small PDF that mimics the real layout: two columns, a section header with a choose-at-least quantifier, an AND-joined receiving requirement, a `No Course Articulated` cell, and a requirement whose option list spans a page break. Invented institutions and course codes throughout, so it is safe to commit.

This is the fixture that lets CI verify the pipeline end to end, and it also covers the page-break case that no current test reaches.

- [ ] **Step 3: Add CI**

A workflow running `npm ci`, `npx tsc --noEmit`, and `npm test` on push and pull request.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures .github/workflows/ci.yml tests/parser/document.test.ts
git commit -m "test: add a committable synthetic agreement and CI"
```

---

## Deliberately not in this plan

- **The column split margin.** Review finding: the corridor between columns is about 25pt while a decoy gap inside the receiving column is 32pt, so a print offset far enough could pick the wrong one. Real, but it degrades into Task 10's new unrecognised-agreement error rather than into a wrong answer, which is the safe direction. Revisit with a second real agreement in hand.
- **Page-break handling in AND merging and y banding.** Task 15's synthetic fixture will expose it. Fix it once there is a test that fails.
- **The npm audit findings.** Both transitive through `next`, neither reachable in a static client-side site with no untrusted CSS and no `next/image`.
- **Prerequisite-aware sequencing.** No agreement carries prerequisite data. Still disclaimed in the UI.
- **The matcher and any database.** v2, per the spec.
