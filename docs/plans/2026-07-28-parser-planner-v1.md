# Transfer Navigator v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student uploads their own ASSIST articulation agreement PDF, enters the courses they have finished, and gets back what is still required, how many units are left, and a term-by-term order to take them in.

**Architecture:** Everything runs in the browser. `pdfjs-dist` reads the PDF client side and hands back text items carrying x and y coordinates. A pure parser turns those coordinates into a structured agreement, because ASSIST's two-column layout does not survive flat text extraction. A pure planner diffs that structure against completed courses. No server, no database, no upload endpoint, so the agreement physically cannot be retained.

**Tech Stack:** TypeScript, Next.js (App Router, static export), `pdfjs-dist`, Vitest. Deployed on Vercel free tier.

Spec: `~/life-brain/brain/ideas/2026-07-27_transfer-navigator-v2-spec.md`
Terms decision that constrains all of this: `~/life-brain/brain/decisions/2026-07-27_assist-data-closed-byo-agreement.md`

## Global Constraints

- **No ASSIST data in the repository.** Real agreement PDFs and any JSON derived from them are gitignored. Committed test fixtures are hand-written synthetic data using invented institutions and course codes. This is not a style preference, it is the terms decision above.

  What this rule does and does not cover, because it was stated too broadly at first and reviewers kept flagging the wrong things. It forbids agreement content as *data*: the PDFs, extracted datasets, dumps of course listings, anything that reconstitutes what ASSIST publishes. It does not forbid naming a handful of real course codes where correctness depends on them, and Task 7's acceptance tests necessarily do, since asserting the parser pairs the right courses is the entire point of an acceptance test. A course code printed in a university's own public catalog is not the ASSIST dataset.

  Where a real identifier is incidental rather than load-bearing, prefer an invented one or a structural assertion. Explanatory comments about pattern shapes should use invented examples.
- **No persistence of agreement content anywhere.** No database, no upload endpoint, no analytics payload containing course data, no localStorage of parsed agreements in v1.
- **Never guess.** Any row the parser cannot read renders as unreadable with a deep link to verify on assist.org. A wrong answer costs a student a year.
- **No em dashes** in code comments, UI copy, commit messages, or docs. Periods, commas, colons.
- **$0 infrastructure.** Vercel free tier only.
- **No coordinate constants in assertions.** The measured x and y values in the spec came from `pypdf` and live in a different space than `pdfjs-dist` reports. Tests assert relative structure: which column, which order, which grouping. Never absolute numbers.
- **Small commits, revertible in one step.**
- **Verify on the live URL, never localhost.** Localhost proves the build. Only the live URL proves the deploy.

## Known gap, state it in the UI

There is no prerequisite graph in an articulation agreement. The term-by-term output is unit packing in requirement order, not dependency-aware sequencing. The UI says so plainly rather than implying the order is authoritative.

## File Structure

```
transfer-navigator/
  package.json
  tsconfig.json
  vitest.config.ts
  .gitignore
  src/parser/
    types.ts        Agreement, Section, ArticulationRow, Course, groups
    extract.ts      PDF bytes to TextItem[] (only file that touches pdfjs)
    columns.ts      TextItem[] to two columns, split derived from data
    lines.ts        TextItem[] to Line[], merges wrapped titles
    course.ts       one Line to Course or NotArticulated
    rows.ts         two columns of Line[] to ArticulationRow[] by y banding
    groups.ts       AND/OR structure on the sending side
    document.ts     header, sections, orchestration; exports parseAgreement
  src/planner/
    types.ts        CompletedCourse, RowStatus, Plan
    units.ts        semester and quarter conversion
    plan.ts         Agreement + completed courses to Plan
  app/
    page.tsx        upload, course entry, results
    components/
      Dropzone.tsx
      CourseInput.tsx
      PlanView.tsx
  tests/
    fixtures/
      synthetic.ts        hand-written TextItem arrays, committed
      local/              real agreements, GITIGNORED
    parser/*.test.ts
    planner/*.test.ts
```

`extract.ts` is the only file that imports `pdfjs-dist`. Everything downstream is pure functions over plain arrays, so it tests without a PDF and without a browser.

---

### Task 1: Scaffold, and confirm the pdfjs API against a real file

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/parser/extract.ts`
- Test: `tests/parser/extract.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `type TextItem = { text: string; x: number; y: number; page: number; pageWidth: number }` and `async function extractItems(data: Uint8Array): Promise<TextItem[]>`

`pageWidth` is carried on every item because Task 2 needs the page midpoint to find the column boundary, and reading it later would mean opening the PDF twice.

- [ ] **Step 1: Initialize the project**

```bash
mkdir -p ~/transfer-navigator && cd ~/transfer-navigator
git init
npm init -y
npm install next@latest react@latest react-dom@latest pdfjs-dist@latest
npm install -D typescript @types/node @types/react vitest
```

- [ ] **Step 2: Write `.gitignore` before anything else**

This one goes first on purpose. It is what keeps ASSIST data out of the repo.

```
node_modules/
.next/
out/
tests/fixtures/local/
*.pdf
```

- [ ] **Step 3: Copy the real agreement into the ignored fixture directory**

```bash
mkdir -p ~/transfer-navigator/tests/fixtures/local
cp "/Users/rehaanshaw/Downloads/2025-2026 Computer Science, B.S. Agreement.pdf" ~/transfer-navigator/tests/fixtures/local/pcc-uci-cs-2025-2026.pdf
git status --porcelain
```

Expected: the PDF does not appear in `git status` output. If it does, the gitignore is wrong. Stop and fix it before continuing.

- [ ] **Step 4: Spike, print what pdfjs actually returns**

Do not skip this. The exact import path and item shape need confirming against reality rather than trusting the plan.

```ts
// scratch-spike.mjs, deleted at the end of this task
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';

const data = new Uint8Array(readFileSync('tests/fixtures/local/pcc-uci-cs-2025-2026.pdf'));
const doc = await pdfjs.getDocument({ data }).promise;
const page = await doc.getPage(4);
const content = await page.getTextContent();
console.log(JSON.stringify(content.items.slice(0, 8), null, 2));
```

Run: `node scratch-spike.mjs`
Expected: items with a `str` field and a `transform` array of six numbers. `transform[4]` is x, `transform[5]` is y. If the shape differs, adjust `extract.ts` in step 6 to match what actually printed, and note the difference in a comment.

- [ ] **Step 5: Write the failing test**

```ts
// tests/parser/extract.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { extractItems } from '../../src/parser/extract';

const FIXTURE = 'tests/fixtures/local/pcc-uci-cs-2025-2026.pdf';

describe.skipIf(!existsSync(FIXTURE))('extractItems', () => {
  it('returns items with coordinates and page numbers', async () => {
    const items = await extractItems(new Uint8Array(readFileSync(FIXTURE)));

    expect(items.length).toBeGreaterThan(100);
    expect(new Set(items.map((i) => i.page))).toEqual(new Set([1, 2, 3, 4, 5]));

    // Assert structurally rather than on a specific course code, so the test
    // does not embed real agreement content and does not break when the
    // fixture is a different agreement.
    const codeLike = items.find((i) => /^[A-Z&][A-Z0-9&]*\s\d+[A-Z]*$/.test(i.text));
    expect(codeLike).toBeDefined();
    expect(Number.isFinite(codeLike!.x)).toBe(true);
    expect(Number.isFinite(codeLike!.y)).toBe(true);
    expect(items.every((i) => Number.isFinite(i.pageWidth) && i.pageWidth > 0)).toBe(true);
  });
});
```

The `skipIf` matters: a fresh clone has no local fixture, and the suite must still pass.

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run tests/parser/extract.test.ts`
Expected: FAIL, cannot resolve `../../src/parser/extract`.

- [ ] **Step 7: Implement**

```ts
// src/parser/extract.ts
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export type TextItem = {
  text: string;
  x: number;
  y: number;
  page: number;
  pageWidth: number;
};

export async function extractItems(data: Uint8Array): Promise<TextItem[]> {
  const doc = await pdfjs.getDocument({ data }).promise;
  const items: TextItem[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const pageWidth = page.getViewport({ scale: 1 }).width;
    const content = await page.getTextContent();

    for (const raw of content.items as Array<{ str: string; transform: number[] }>) {
      const text = raw.str.trim();
      if (text) {
        items.push({ text, x: raw.transform[4], y: raw.transform[5], page: p, pageWidth });
      }
    }
  }
  return items;
}
```

- [ ] **Step 8: Run it and watch it pass**

Run: `npx vitest run tests/parser/extract.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 9: Delete the spike and commit**

```bash
rm scratch-spike.mjs
git add .gitignore package.json tsconfig.json vitest.config.ts src/parser/extract.ts tests/parser/extract.test.ts
git commit -m "feat: extract pdf text items with coordinates"
```

---

### Task 2: Split the two columns without hardcoding a boundary

**Files:**
- Create: `src/parser/columns.ts`, `tests/fixtures/synthetic.ts`
- Test: `tests/parser/columns.test.ts`

**Interfaces:**
- Consumes: `TextItem` from Task 1
- Produces: `function splitColumns(items: TextItem[]): { receiving: TextItem[]; sending: TextItem[]; splitX: number }`

The receiving institution occupies the left column, the sending institution the right.

**Do not use "the widest gap" for this.** On the real PCC to UCI agreement the widest gap is inside the left column, between the title at x=156 and the units at x=462, a span of 306. The gap that actually separates the columns, 462 to 553, is only 91. Widest-gap splits the receiving column in half and mispairs the whole document.

The rule that works: seed the boundary at the page midpoint, then snap to the nearest real gap so the split never lands inside a column. Both quantities scale together when the print scale changes, so this survives a different browser or paper size.

- [ ] **Step 1: Write the synthetic fixture**

Invented institutions and course codes. No ASSIST content, so this is safe to commit.

```ts
// tests/fixtures/synthetic.ts
import type { TextItem } from '../../src/parser/extract';

// One page, two rows. Left column near x=50, right column near x=550.
// RECV 10 is satisfied by SEND 1 AND SEND 1L. RECV 20 has nothing articulated.
// The x values deliberately mirror the real agreement's trap: the widest gap
// here is 150 to 460, inside the LEFT column, not between the columns.
const W = 1000;
const at = (text: string, x: number, y: number): TextItem => ({
  text,
  x,
  y,
  page: 1,
  pageWidth: W,
});

export const twoRowPage: TextItem[] = [
  at('RECV 10', 50, 700),
  at('Intro to Widgets', 150, 700),
  at('4.00', 460, 700),
  at('SEND 1', 550, 712),
  at('Widget Fundamentals', 650, 712),
  at('3.00', 950, 712),
  at('AND', 540, 690),
  at('SEND 1L', 550, 668),
  at('Widget Fundamentals Lab', 650, 668),
  at('1.00', 950, 668),
  at('RECV 20', 50, 600),
  at('Advanced Widgets', 150, 600),
  at('4.00', 460, 600),
  at('No Course Articulated', 550, 600),
];

// The same page printed at a different scale and offset, which is what a
// different browser or paper size produces. pageWidth scales with it.
export const twoRowPageScaled: TextItem[] = twoRowPage.map((i) => ({
  ...i,
  x: i.x * 0.5 + 17,
  pageWidth: W * 0.5 + 17,
}));
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/parser/columns.test.ts
import { describe, it, expect } from 'vitest';
import { splitColumns } from '../../src/parser/columns';
import { twoRowPage, twoRowPageScaled } from '../fixtures/synthetic';

describe('splitColumns', () => {
  it('puts receiving codes left and sending codes right', () => {
    const { receiving, sending } = splitColumns(twoRowPage);

    expect(receiving.map((i) => i.text)).toContain('RECV 10');
    expect(receiving.map((i) => i.text)).toContain('RECV 20');
    expect(sending.map((i) => i.text)).toContain('SEND 1');
    expect(sending.map((i) => i.text)).toContain('No Course Articulated');
    expect(receiving.map((i) => i.text)).not.toContain('SEND 1');
  });

  it('keeps the receiving units column on the receiving side', () => {
    const { receiving, splitX } = splitColumns(twoRowPage);

    // The regression guard. A widest-gap split lands at 305 and drags this
    // item into the sending column, which mispairs every row after it.
    expect(receiving.filter((i) => i.x === 460)).toHaveLength(2);
    expect(splitX).toBeGreaterThan(460);
  });

  it('survives a different print scale', () => {
    const { splitX, receiving, sending } = splitColumns(twoRowPageScaled);

    expect(splitX).toBeGreaterThan(17 + 460 * 0.5);
    expect(splitX).toBeLessThan(17 + 540 * 0.5);
    expect(receiving.map((i) => i.text)).toContain('RECV 10');
    expect(sending.map((i) => i.text)).toContain('SEND 1');
  });
});
```

The second test is the one that matters. It is the same page printed at a different scale, which is exactly what a different student's browser produces.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tests/parser/columns.test.ts`
Expected: FAIL, cannot resolve `../../src/parser/columns`.

- [ ] **Step 4: Implement**

```ts
// src/parser/columns.ts
import type { TextItem } from './extract';

export function splitColumns(items: TextItem[]): {
  receiving: TextItem[];
  sending: TextItem[];
  splitX: number;
} {
  const seed = (items[0]?.pageWidth ?? 0) / 2;
  const xs = [...new Set(items.map((i) => i.x))].sort((a, b) => a - b);

  // Start at the page midpoint, then snap to the nearest gap between x values
  // so the boundary never lands inside a column.
  let splitX = seed;
  let best = Number.POSITIVE_INFINITY;

  for (let i = 0; i < xs.length - 1; i++) {
    const lo = xs[i];
    const hi = xs[i + 1];
    const distance =
      seed >= lo && seed <= hi ? 0 : Math.min(Math.abs(seed - lo), Math.abs(seed - hi));

    if (distance < best) {
      best = distance;
      splitX = (lo + hi) / 2;
    }
  }

  return {
    receiving: items.filter((i) => i.x < splitX),
    sending: items.filter((i) => i.x >= splitX),
    splitX,
  };
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run tests/parser/columns.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/parser/columns.ts tests/parser/columns.test.ts tests/fixtures/synthetic.ts
git commit -m "feat: split agreement columns by midpoint-seeded gap snap"
```

---

### Task 3: Assemble lines and rejoin wrapped titles

**Files:**
- Create: `src/parser/lines.ts`
- Test: `tests/parser/lines.test.ts`

**Interfaces:**
- Consumes: `TextItem` from Task 1
- Produces: `type Line = { y: number; page: number; text: string; parts: TextItem[] }` and `function assembleLines(items: TextItem[], tolerance?: number): Line[]`

Long course titles wrap onto a second visual line with a slightly different y. Items within `tolerance` of each other on y belong to the same logical line, ordered left to right. Lines come back sorted by page ascending then y descending, which is top to bottom on the page.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/lines.test.ts
import { describe, it, expect } from 'vitest';
import { assembleLines } from '../../src/parser/lines';
import type { TextItem } from '../../src/parser/extract';

// pageWidth is required by TextItem. assembleLines never reads it, but the
// literals must carry it or the project stops typechecking.
const item = (text: string, x: number, y: number): TextItem => ({
  text,
  x,
  y,
  page: 1,
  pageWidth: 1000,
});

const wrapped: TextItem[] = [
  item('SEND 66', 550, 500),
  item('Computer Architecture and Assembly', 650, 500),
  item('Language Programming', 650, 488),
  item('3.00', 950, 500),
  item('SEND 70', 550, 400),
];

describe('assembleLines', () => {
  it('joins items sharing a y into one line, left to right', () => {
    const lines = assembleLines(wrapped, 4);
    expect(lines[0].text).toBe('SEND 66 Computer Architecture and Assembly 3.00');
  });

  it('merges a wrapped title into the line above when tolerance allows', () => {
    const lines = assembleLines(wrapped, 20);
    expect(lines[0].text).toBe(
      'SEND 66 Computer Architecture and Assembly Language Programming 3.00',
    );
    expect(lines).toHaveLength(2);
  });

  it('orders lines top to bottom', () => {
    const lines = assembleLines(wrapped, 4);
    expect(lines[lines.length - 1].text).toBe('SEND 70');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/parser/lines.test.ts`
Expected: FAIL, cannot resolve `../../src/parser/lines`.

- [ ] **Step 3: Implement**

```ts
// src/parser/lines.ts
import type { TextItem } from './extract';

export type Line = { y: number; page: number; text: string; parts: TextItem[] };

export function assembleLines(items: TextItem[], tolerance = 20): Line[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y);
  const lines: Line[] = [];

  for (const item of sorted) {
    const open = lines[lines.length - 1];
    if (open && open.page === item.page && Math.abs(open.y - item.y) <= tolerance) {
      open.parts.push(item);
    } else {
      lines.push({ y: item.y, page: item.page, text: '', parts: [item] });
    }
  }

  for (const line of lines) {
    line.text = [...line.parts].sort((a, b) => a.x - b.x).map((p) => p.text).join(' ');
  }
  return lines;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/parser/lines.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/parser/lines.ts tests/parser/lines.test.ts
git commit -m "feat: assemble text items into lines with wrapped titles"
```

---

### Task 4: Parse one line into a course

**Files:**
- Create: `src/parser/types.ts`, `src/parser/course.ts`
- Test: `tests/parser/course.test.ts`

**Interfaces:**
- Consumes: `Line` from Task 3
- Produces: `type Course = { code: string; title: string; units: number }`, `type Connector = 'AND' | 'OR'`, `type ParsedLine = { kind: 'course'; course: Course } | { kind: 'connector'; connector: Connector } | { kind: 'not_articulated' } | { kind: 'other'; text: string }` and `function parseLine(line: Line): ParsedLine`

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/course.test.ts
import { describe, it, expect } from 'vitest';
import { parseLine } from '../../src/parser/course';
import type { Line } from '../../src/parser/lines';

const line = (text: string): Line => ({ y: 0, page: 1, text, parts: [] });

describe('parseLine', () => {
  it('parses code, title and units', () => {
    const result = parseLine(line('SEND 003BL Widget Fundamentals Lab 1.00'));
    expect(result).toEqual({
      kind: 'course',
      course: { code: 'SEND 003BL', title: 'Widget Fundamentals Lab', units: 1 },
    });
  });

  it('recognizes a missing articulation', () => {
    expect(parseLine(line('No Course Articulated'))).toEqual({ kind: 'not_articulated' });
  });

  it.each(['AND', 'OR'])('recognizes the %s connector', (word) => {
    expect(parseLine(line(word))).toEqual({ kind: 'connector', connector: word });
  });

  it('handles a multi-word prefix and a digit inside the prefix', () => {
    // Real agreements contain both shapes. A prefix pattern of [A-Z&] only
    // drops the second one, and it drops it silently.
    expect(parseLine(line('S&P TECH 6D Applied Widgets 4.00'))).toEqual({
      kind: 'course',
      course: { code: 'S&P TECH 6D', title: 'Applied Widgets', units: 4 },
    });
    expect(parseLine(line('AB4CDE 43 Widget Engineering 4.00'))).toEqual({
      kind: 'course',
      course: { code: 'AB4CDE 43', title: 'Widget Engineering', units: 4 },
    });
  });

  it('does not mistake prose for a course', () => {
    const result = parseLine(line('In fulfillment of the requirements below, a single course may be used only once.'));
    expect(result.kind).toBe('other');
  });
});
```

That last case is real. Agreements interleave instructional prose with course rows, and a greedy pattern will swallow it.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/parser/course.test.ts`
Expected: FAIL, cannot resolve `../../src/parser/course`.

- [ ] **Step 3: Implement**

```ts
// src/parser/types.ts
export type Course = { code: string; title: string; units: number };
export type Connector = 'AND' | 'OR';

// src/parser/course.ts
import type { Line } from './lines';
import type { Course, Connector } from './types';

export type ParsedLine =
  | { kind: 'course'; course: Course }
  | { kind: 'connector'; connector: Connector }
  | { kind: 'not_articulated' }
  | { kind: 'other'; text: string };

// A course code is one or more uppercase words, then a number with an optional
// letter suffix. Units are the trailing decimal.
//
// The prefix words allow digits and ampersands because real codes include both
// shapes: a two word prefix joined by an ampersand, as in X&Y ZZZ 6D, and a
// digit inside the prefix word, as in AB4CDE 43. A prefix class of [A-Z&]
// alone silently drops the second.
// Two guards against matching an all-caps header instead of a course:
// the prefix is at most two words, which covers every real shape seen, and
// the title must contain a lowercase letter, which every real
// course title does and shouty header text does not. When in doubt this
// returns other, which becomes an unreadable row the student is told to
// verify. Inventing a course from a header is the failure we cannot have.
const COURSE = /^((?:[A-Z&][A-Z0-9&]*\s){1,2}\d+[A-Z]*)\s+((?=.*[a-z]).+?)\s+(\d+\.\d{2})$/;

export function parseLine(line: Line): ParsedLine {
  const text = line.text.trim();

  if (/^No Course Articulated$/i.test(text)) return { kind: 'not_articulated' };
  if (text === 'AND' || text === 'OR') {
    return { kind: 'connector', connector: text as Connector };
  }

  const match = COURSE.exec(text);
  if (match) {
    return {
      kind: 'course',
      course: {
        code: match[1].replace(/\s+/g, ' ').trim(),
        title: match[2].trim(),
        units: Number.parseFloat(match[3]),
      },
    };
  }
  return { kind: 'other', text };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/parser/course.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/parser/types.ts src/parser/course.ts tests/parser/course.test.ts
git commit -m "feat: parse a line into course, connector or prose"
```

---

### Task 5: Band rows by y and pair the columns

**Files:**
- Create: `src/parser/rows.ts`
- Test: `tests/parser/rows.test.ts`

**Interfaces:**
- Consumes: `splitColumns` (Task 2), `assembleLines` (Task 3), `parseLine` (Task 4)
- Produces: `type RawRow = { receiving: Line[]; sending: Line[] }` and `function bandRows(receiving: Line[], sending: Line[]): RawRow[]`

Each receiving course anchors a row. Its sending block is every sending line falling between that anchor's y and the next anchor below it on the page. This is the whole reason the parser is geometric: reading order gives the right answer on some files by accident and the wrong answer on others.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/rows.test.ts
import { describe, it, expect } from 'vitest';
import { splitColumns } from '../../src/parser/columns';
import { assembleLines } from '../../src/parser/lines';
import { bandRows } from '../../src/parser/rows';
import { twoRowPage } from '../fixtures/synthetic';

describe('bandRows', () => {
  it('pairs each receiving anchor with the sending block beside it', () => {
    const { receiving, sending } = splitColumns(twoRowPage);
    const rows = bandRows(assembleLines(receiving, 4), assembleLines(sending, 4));

    expect(rows).toHaveLength(2);
    expect(rows[0].receiving[0].text).toContain('RECV 10');
    expect(rows[0].sending.map((l) => l.text)).toEqual([
      'SEND 1 Widget Fundamentals 3.00',
      'AND',
      'SEND 1L Widget Fundamentals Lab 1.00',
    ]);
    expect(rows[1].receiving[0].text).toContain('RECV 20');
    expect(rows[1].sending.map((l) => l.text)).toEqual(['No Course Articulated']);
  });

  it('does not leak a sending line into the row below', () => {
    const { receiving, sending } = splitColumns(twoRowPage);
    const rows = bandRows(assembleLines(receiving, 4), assembleLines(sending, 4));
    expect(rows[1].sending.some((l) => l.text.includes('SEND 1L'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/parser/rows.test.ts`
Expected: FAIL, cannot resolve `../../src/parser/rows`.

- [ ] **Step 3: Implement**

```ts
// src/parser/rows.ts
import type { Line } from './lines';

export type RawRow = { receiving: Line[]; sending: Line[] };

// Measured over the real 5 page agreement: of 74 sending lines, 57 sit below
// their receiving anchor, 11 sit level with it, and 6 sit slightly above. The
// slack covers that last minority so those rows are not lost.
const SLACK = 24;

export function bandRows(receiving: Line[], sending: Line[]): RawRow[] {
  const anchors = [...receiving].sort((a, b) => a.page - b.page || b.y - a.y);

  return anchors.map((anchor, index) => {
    const next = anchors[index + 1];
    const inBand = sending.filter((line) => {
      if (line.page !== anchor.page) return false;
      if (line.y > anchor.y + SLACK) return false;
      if (next && next.page === anchor.page && line.y <= next.y + SLACK) return false;
      return true;
    });
    return { receiving: [anchor], sending: inBand.sort((a, b) => b.y - a.y) };
  });
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/parser/rows.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/parser/rows.ts tests/parser/rows.test.ts
git commit -m "feat: band rows by y and pair receiving with sending"
```

---

### Task 6: Turn a sending block into AND and OR structure

**Files:**
- Create: `src/parser/groups.ts`
- Test: `tests/parser/groups.test.ts`

**Interfaces:**
- Consumes: `RawRow` (Task 5), `parseLine` (Task 4)
- Produces:

```ts
type AndGroup = { kind: 'and'; courses: Course[] };
type Requirement =
  | { kind: 'options'; options: AndGroup[] }
  | { kind: 'not_articulated' }
  | { kind: 'unreadable'; text: string[] };
function parseRequirement(lines: Line[]): Requirement;
```

A sending block is a list of alternatives separated by `OR`, where each alternative is a list of courses joined by `AND`. When the block contains lines that parse as neither, the whole requirement is `unreadable` and the UI tells the student to check ASSIST. Guessing here is forbidden.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/groups.test.ts
import { describe, it, expect } from 'vitest';
import { parseRequirement } from '../../src/parser/groups';
import type { Line } from '../../src/parser/lines';

const lines = (...texts: string[]): Line[] =>
  texts.map((text, i) => ({ y: 100 - i, page: 1, text, parts: [] }));

describe('parseRequirement', () => {
  it('reads a single course', () => {
    const result = parseRequirement(lines('SEND 8 Data Structures 3.00'));
    expect(result).toEqual({
      kind: 'options',
      options: [{ kind: 'and', courses: [{ code: 'SEND 8', title: 'Data Structures', units: 3 }] }],
    });
  });

  it('reads AND then OR into two alternatives', () => {
    const result = parseRequirement(
      lines(
        'SEND 2 Intro 4.00',
        'AND',
        'SEND 3B Java 3.00',
        'OR',
        'SEND 3C Python 3.00',
      ),
    );
    expect(result.kind).toBe('options');
    if (result.kind !== 'options') return;
    expect(result.options).toHaveLength(2);
    expect(result.options[0].courses.map((c) => c.code)).toEqual(['SEND 2', 'SEND 3B']);
    expect(result.options[1].courses.map((c) => c.code)).toEqual(['SEND 3C']);
  });

  it('passes through a missing articulation', () => {
    expect(parseRequirement(lines('No Course Articulated'))).toEqual({ kind: 'not_articulated' });
  });

  it('refuses to guess when a line is unrecognized', () => {
    const result = parseRequirement(lines('SEND 2 Intro 4.00', 'see counselor for details'));
    expect(result).toEqual({ kind: 'unreadable', text: ['see counselor for details'] });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/parser/groups.test.ts`
Expected: FAIL, cannot resolve `../../src/parser/groups`.

- [ ] **Step 3: Implement**

```ts
// src/parser/groups.ts
import type { Line } from './lines';
import type { Course } from './types';
import { parseLine } from './course';

export type AndGroup = { kind: 'and'; courses: Course[] };
export type Requirement =
  | { kind: 'options'; options: AndGroup[] }
  | { kind: 'not_articulated' }
  | { kind: 'unreadable'; text: string[] };

export function parseRequirement(lines: Line[]): Requirement {
  // An empty block means the band claimed nothing. Returning zero options
  // would read downstream as a requirement satisfiable by nothing, and the
  // planner would then index an empty array. Unreadable is the safe failure.
  if (lines.length === 0) return { kind: 'unreadable', text: [] };

  const parsed = lines.map(parseLine);

  if (parsed.every((p) => p.kind === 'not_articulated')) {
    return { kind: 'not_articulated' };
  }

  // A block mixing real courses with a not-articulated marker. Dropping the
  // marker would present an alternative as achievable when one of its parts
  // has no equivalent at the sending school. The precise semantics of this
  // shape are unverified against real data, so take the safe reading. Task 7
  // asserts no row on the real agreement is unreadable, so if this ever fires
  // there, that test surfaces it immediately and it can be refined against
  // evidence instead of guessed at now.
  if (parsed.some((p) => p.kind === 'not_articulated')) {
    return { kind: 'unreadable', text: lines.map((l) => l.text.trim()) };
  }

  const junk = parsed.filter((p) => p.kind === 'other') as Array<{ kind: 'other'; text: string }>;
  if (junk.length > 0) return { kind: 'unreadable', text: junk.map((j) => j.text) };

  const options: AndGroup[] = [];
  let current: Course[] = [];

  for (const item of parsed) {
    if (item.kind === 'course') current.push(item.course);
    if (item.kind === 'connector' && item.connector === 'OR') {
      options.push({ kind: 'and', courses: current });
      current = [];
    }
  }
  options.push({ kind: 'and', courses: current });
  const nonEmpty = options.filter((o) => o.courses.length > 0);

  // A block that parsed cleanly but produced no course at all, for example a
  // stray connector banded on its own, is not a requirement satisfiable by
  // nothing. Same safe failure as the empty block above.
  if (nonEmpty.length === 0) {
    return { kind: 'unreadable', text: lines.map((l) => l.text) };
  }

  return { kind: 'options', options: nonEmpty };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/parser/groups.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/parser/groups.ts tests/parser/groups.test.ts
git commit -m "feat: parse AND and OR structure, refuse to guess"
```

---

### Task 7: Assemble the whole agreement, and check it against the real file

**Files:**
- Create: `src/parser/document.ts`
- Test: `tests/parser/document.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces:

```ts
type ArticulationRow = {
  receiving: Course[];
  sending: Requirement;
  // Rows sharing an orGroup are alternative paths through one requirement,
  // coming from an OR connector in the receiving column. Satisfying any one
  // member satisfies the group. Without this the planner cannot tell "two
  // separate requirements" from "one requirement, two routes", and will tell
  // a student to somehow obtain a course that nothing articulates to when a
  // sibling route is wide open.
  orGroup?: number;
};
type Agreement = {
  academicYear: string;
  major: string;
  receivingInstitution: string;
  sendingInstitution: string;
  rows: ArticulationRow[];
};
async function parseAgreement(data: Uint8Array): Promise<Agreement>;
```

- [ ] **Step 1: Write the failing test**

This is the acceptance test for the parser, and it runs against the real agreement, so it skips on a fresh clone. The expected values are the ones read by hand off the PDF on 2026-07-28.

```ts
// tests/parser/document.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseAgreement } from '../../src/parser/document';

const FIXTURE = 'tests/fixtures/local/pcc-uci-cs-2025-2026.pdf';

describe.skipIf(!existsSync(FIXTURE))('parseAgreement, real PCC to UCI CS 2025-2026', () => {
  it('reads the header', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));
    expect(agreement.academicYear).toBe('2025-2026');
    expect(agreement.major).toBe('Computer Science, B.S.');
    expect(agreement.receivingInstitution).toContain('Irvine');
    expect(agreement.sendingInstitution).toContain('Pasadena');
  });

  it('finds the four cells with nothing articulated', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));
    const blanks = agreement.rows
      .filter((r) => r.sending.kind === 'not_articulated')
      .flatMap((r) => r.receiving.map((c) => c.code));

    expect(blanks).toEqual(
      expect.arrayContaining(['I&C SCI 53', 'IN4MATX 43', 'STATS 67', 'I&C SCI 6N']),
    );
  });

  it('pairs I&C SCI 51 with the machine organization pair', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));
    const row = agreement.rows.find((r) => r.receiving.some((c) => c.code === 'I&C SCI 51'));

    expect(row).toBeDefined();
    expect(row!.sending.kind).toBe('options');
    if (row!.sending.kind !== 'options') return;
    expect(row!.sending.options[0].courses.map((c) => c.code)).toEqual(['CS 066', 'CS 066L']);
  });

  it('reads the four-alternative programming requirement', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));
    const row = agreement.rows.find((r) => r.receiving.some((c) => c.code === 'I&C SCI 31'));

    expect(row!.sending.kind).toBe('options');
    if (row!.sending.kind !== 'options') return;
    expect(row!.sending.options).toHaveLength(4);
  });

  it('leaves no row unreadable', async () => {
    const agreement = await parseAgreement(new Uint8Array(readFileSync(FIXTURE)));
    const unreadable = agreement.rows.filter((r) => r.sending.kind === 'unreadable');
    expect(unreadable).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/parser/document.test.ts`
Expected: FAIL, cannot resolve `../../src/parser/document`.

- [ ] **Step 3: Implement**

```ts
// src/parser/document.ts
import { extractItems } from './extract';
import { splitColumns } from './columns';
import { assembleLines } from './lines';
import { parseLine } from './course';
import { bandRows } from './rows';
import { parseRequirement, type Requirement } from './groups';
import type { Course } from './types';

export type ArticulationRow = { receiving: Course[]; sending: Requirement };
export type Agreement = {
  academicYear: string;
  major: string;
  receivingInstitution: string;
  sendingInstitution: string;
  rows: ArticulationRow[];
};

function findAfter(lines: string[], marker: RegExp): string {
  const index = lines.findIndex((l) => marker.test(l));
  return index >= 0 && lines[index + 1] ? lines[index + 1].trim() : '';
}

export async function parseAgreement(data: Uint8Array): Promise<Agreement> {
  const items = await extractItems(data);
  const allLines = assembleLines(items).map((l) => l.text);

  const year = /Effective during the (\d{4}-\d{4}) academic year/.exec(allLines.join('\n'));
  const majorLine = allLines.find((l) => /,\s*B\.[AS]\.$/.test(l)) ?? '';

  const { receiving, sending } = splitColumns(items);
  const rows = bandRows(assembleLines(receiving), assembleLines(sending))
    .map((raw) => {
      const courses = raw.receiving
        .map(parseLine)
        .filter((p): p is { kind: 'course'; course: Course } => p.kind === 'course')
        .map((p) => p.course);
      return { receiving: courses, sending: parseRequirement(raw.sending) };
    })
    .filter((row) => row.receiving.length > 0);

  return {
    academicYear: year ? year[1] : '',
    major: majorLine.trim(),
    receivingInstitution: findAfter(allLines, /^To:/) || (allLines.find((l) => /^To:/.test(l)) ?? '').replace(/^To:\s*/, ''),
    sendingInstitution: findAfter(allLines, /^From:/) || (allLines.find((l) => /^From:/.test(l)) ?? '').replace(/^From:\s*/, ''),
    rows,
  };
}
```

- [ ] **Step 4: Run it, and expect to iterate**

Run: `npx vitest run tests/parser/document.test.ts`

This is the task where reality pushes back. Header extraction in particular depends on how the print laid out the To and From blocks. Adjust the implementation until all five tests pass. Do not adjust the expected values to match the output, they were read off the PDF by hand.

If a row genuinely cannot be parsed, that is a finding, not a failure to paper over. Report it rather than loosening the `unreadable` test.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: all tests pass, and the parser tests that need the local fixture actually ran rather than skipped.

- [ ] **Step 6: Commit**

```bash
git add src/parser/document.ts tests/parser/document.test.ts
git commit -m "feat: assemble parsed agreement from a pdf"
```

---

### Task 8: The planner

**Files:**
- Create: `src/planner/units.ts`, `src/planner/plan.ts`
- Test: `tests/planner/units.test.ts`, `tests/planner/plan.test.ts`

**Interfaces:**
- Consumes: `Agreement`, `ArticulationRow`, `Requirement`, `Course`
- Produces:

```ts
function semesterToQuarter(units: number): number;
type RowStatus = {
  receiving: Course[];
  orGroup?: number;
  state: 'satisfied' | 'remaining' | 'not_articulated' | 'unreadable' | 'alternative';
  satisfiedBy: Course[];
  cheapestOption: Course[];
  remainingUnits: number;
};
type Plan = {
  statuses: RowStatus[];
  remainingUnits: number;
  terms: Course[][];
  notArticulated: Course[];
};
function buildPlan(agreement: Agreement, completed: string[], unitsPerTerm?: number): Plan;
```

A row is satisfied when any one of its alternatives is fully covered by the completed courses. Where several alternatives remain open, the cheapest by total units is proposed. Rows with nothing articulated can never be satisfied at the sending school and are reported separately, never silently dropped.

**Rows sharing an `orGroup` are alternative routes through one requirement.** The group is satisfied when any member is. An unsatisfied group contributes only its cheapest member to remaining units and to the term plan, never all of them. A `not_articulated` member of a group where another member is achievable is not a blocker and must not appear in `notArticulated`, otherwise the student is told to obtain a course they do not need.

- [ ] **Step 1: Write the failing unit conversion test**

```ts
// tests/planner/units.test.ts
import { describe, it, expect } from 'vitest';
import { semesterToQuarter } from '../../src/planner/units';

describe('semesterToQuarter', () => {
  it('multiplies by one and a half', () => {
    expect(semesterToQuarter(4)).toBe(6);
    expect(semesterToQuarter(3)).toBe(4.5);
  });

  it('rounds to two decimals rather than carrying float noise', () => {
    expect(semesterToQuarter(1.1)).toBe(1.65);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/planner/units.test.ts`
Expected: FAIL, cannot resolve `../../src/planner/units`.

- [ ] **Step 3: Implement the conversion**

```ts
// src/planner/units.ts
export function semesterToQuarter(units: number): number {
  return Math.round(units * 1.5 * 100) / 100;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/planner/units.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing planner test**

```ts
// tests/planner/plan.test.ts
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
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run tests/planner/plan.test.ts`
Expected: FAIL, cannot resolve `../../src/planner/plan`.

- [ ] **Step 7: Implement the planner**

```ts
// src/planner/plan.ts
import type { Agreement } from '../parser/document';
import type { Course } from '../parser/types';

export type RowStatus = {
  receiving: Course[];
  orGroup?: number;
  state: 'satisfied' | 'remaining' | 'not_articulated' | 'unreadable' | 'alternative';
  satisfiedBy: Course[];
  cheapestOption: Course[];
  remainingUnits: number;
};

export type Plan = {
  statuses: RowStatus[];
  remainingUnits: number;
  terms: Course[][];
  notArticulated: Course[];
};

const total = (courses: Course[]) => courses.reduce((sum, c) => sum + c.units, 0);

function baseStatus(row: ArticulationRow, done: Set<string>): RowStatus {
  const base = {
    receiving: row.receiving,
    orGroup: row.orGroup,
    satisfiedBy: [] as Course[],
    cheapestOption: [] as Course[],
    remainingUnits: 0,
  };

  if (row.sending.kind === 'not_articulated') return { ...base, state: 'not_articulated' };
  if (row.sending.kind === 'unreadable') return { ...base, state: 'unreadable' };

  const met = row.sending.options.find((o) =>
    o.courses.every((c) => done.has(c.code.toUpperCase())),
  );
  if (met) return { ...base, state: 'satisfied', satisfiedBy: met.courses };

  const cheapest = [...row.sending.options].sort(
    (a, b) => total(a.courses) - total(b.courses),
  )[0];
  const open = cheapest.courses.filter((c) => !done.has(c.code.toUpperCase()));

  return {
    ...base,
    state: 'remaining',
    cheapestOption: cheapest.courses,
    remainingUnits: total(open),
  };
}

// Rows sharing an orGroup are routes through one requirement, so exactly one
// of them should count. Losing routes become 'alternative', which keeps them
// visible in the UI without adding units, and keeps a route with nothing
// articulated out of the blocker list when a sibling route is open.
function resolveGroups(statuses: RowStatus[]): void {
  const groups = new Map<number, RowStatus[]>();
  for (const status of statuses) {
    if (status.orGroup === undefined) continue;
    const members = groups.get(status.orGroup) ?? [];
    members.push(status);
    groups.set(status.orGroup, members);
  }

  for (const members of groups.values()) {
    const winner =
      members.find((m) => m.state === 'satisfied') ??
      [...members]
        .filter((m) => m.state === 'remaining')
        .sort((a, b) => a.remainingUnits - b.remainingUnits)[0];

    // No route is achievable. Leave every member as it is so the student sees
    // the real situation rather than an arbitrary pick.
    if (!winner) continue;

    for (const member of members) {
      if (member === winner) continue;
      member.state = 'alternative';
      member.remainingUnits = 0;
    }
  }
}

export function buildPlan(agreement: Agreement, completed: string[], unitsPerTerm = 15): Plan {
  const done = new Set(completed.map((c) => c.toUpperCase()));

  const statuses: RowStatus[] = agreement.rows.map((row) => baseStatus(row, done));
  resolveGroups(statuses);

  const queue = statuses
    .filter((s) => s.state === 'remaining')
    .flatMap((s) => s.cheapestOption.filter((c) => !done.has(c.code.toUpperCase())));

  const terms: Course[][] = [];
  let term: Course[] = [];
  for (const course of queue) {
    if (term.length > 0 && total(term) + course.units > unitsPerTerm) {
      terms.push(term);
      term = [];
    }
    term.push(course);
  }
  if (term.length > 0) terms.push(term);

  return {
    statuses,
    remainingUnits: statuses.reduce((sum, s) => sum + s.remainingUnits, 0),
    terms,
    notArticulated: statuses
      .filter((s) => s.state === 'not_articulated')
      .flatMap((s) => s.receiving),
  };
}
```

- [ ] **Step 8: Run it and watch it pass**

Run: `npx vitest run tests/planner`
Expected: PASS, 6 tests.

- [ ] **Step 9: Commit**

```bash
git add src/planner tests/planner
git commit -m "feat: plan remaining requirements and pack terms"
```

---

### Task 9: The page, and the live deploy

**Files:**
- Create: `app/page.tsx`, `app/components/Dropzone.tsx`, `app/components/CourseInput.tsx`, `app/components/PlanView.tsx`
- Modify: `package.json` scripts

**Interfaces:**
- Consumes: `parseAgreement` (Task 7), `buildPlan` (Task 8)
- Produces: the deployed site

The whole flow is client side. The file is read with `FileReader`, parsed in the page, and never sent anywhere.

- [ ] **Step 1: Build the page**

```tsx
// app/page.tsx
'use client';

import { useState } from 'react';
import { parseAgreement, type Agreement } from '../src/parser/document';
import { buildPlan, type Plan } from '../src/planner/plan';

export default function Home() {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [completed, setCompleted] = useState('');
  const [error, setError] = useState('');

  async function onFile(file: File) {
    try {
      setError('');
      setAgreement(await parseAgreement(new Uint8Array(await file.arrayBuffer())));
    } catch {
      setError('Could not read that PDF. Download the agreement again from assist.org and retry.');
    }
  }

  const plan: Plan | null = agreement
    ? buildPlan(agreement, completed.split(',').map((s) => s.trim()).filter(Boolean))
    : null;

  return (
    <main>
      <h1>Transfer Navigator</h1>
      <p>
        Your agreement is read in this browser tab. It is never uploaded and never stored.
      </p>

      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {error && <p role="alert">{error}</p>}

      {agreement && (
        <>
          <p>
            {agreement.major}, {agreement.sendingInstitution} to {agreement.receivingInstitution},{' '}
            {agreement.academicYear}
          </p>
          <label htmlFor="completed">Courses you have finished, comma separated</label>
          <input
            id="completed"
            value={completed}
            onChange={(e) => setCompleted(e.target.value)}
            placeholder="CS 002, MATH 005A"
          />
        </>
      )}

      {plan && <PlanView plan={plan} />}
    </main>
  );
}

function PlanView({ plan }: { plan: Plan }) {
  return (
    <section>
      {/* Units come from the sending school, which is on semesters, while the
          receiving school is on quarters. A bare number here is ambiguous by
          construction, and the two systems are not interchangeable: UC asks
          for 60 semester units or 90 quarter units. Always say which. */}
      <h2>{plan.remainingUnits} semester units remaining</h2>
      <p>
        About {semesterToQuarter(plan.remainingUnits)} quarter units at the
        receiving campus.
      </p>

      {plan.statuses.some((s) => s.state === 'unreadable') && (
        <p role="alert">
          Some rows could not be read. Check them on{' '}
          <a href="https://assist.org" target="_blank" rel="noreferrer">assist.org</a> before
          relying on this plan.
        </p>
      )}

      <h3>Suggested order</h3>
      <p>
        Grouped by unit load only. Agreements do not list prerequisites, so this is not a
        prerequisite-aware sequence. Confirm the order with a counselor.
      </p>
      <p>
        Where a requirement has several accepted options, the one shown is
        simply the one with the fewest units. Fewest units is not the same as
        best for your major, so open the full list before deciding.
      </p>
      <ol>
        {plan.terms.map((term, i) => (
          <li key={i}>{term.map((c) => `${c.code} ${c.title}`).join(', ')}</li>
        ))}
      </ol>

      {plan.notArticulated.length > 0 && (
        <>
          <h3>No course articulated</h3>
          <p>Nothing at your college satisfies these. You take them after you transfer.</p>
          <ul>
            {plan.notArticulated.map((c) => (
              <li key={c.code}>{c.code} {c.title}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Run it locally and load your own agreement**

Run: `npm run dev`
Expected: uploading the PCC to UCI CS agreement shows the header line, and with an empty completed list the remaining units are greater than zero and the four not-articulated courses appear.

- [ ] **Step 3: Confirm nothing leaves the browser**

Open the network tab, upload the agreement, and confirm there is no request carrying the file. This is the architectural claim of the whole design, so verify it rather than assuming it.

- [ ] **Step 4: Deploy**

```bash
npx vercel --prod
```

- [ ] **Step 5: Verify on the live URL, not localhost**

Load the deployed URL, upload the agreement, confirm the same result. Localhost proves the build. Only the live URL proves the deploy.

- [ ] **Step 6: Commit**

```bash
git add app package.json
git commit -m "feat: client-side upload, parse and plan"
```

---

## What is deliberately not here

- **The matcher.** Week 6, on public C-ID data, tracked in the spec. v1 ships with no trained model and that is a known, accepted gap.
- **Any database.** v1 has no persistence by design, which is what makes the retention rule structural instead of a promise.
- **Prerequisite-aware sequencing.** No agreement carries prerequisite data. The UI says so.
- **Accounts, saved plans, multi-agreement comparison.** YAGNI until a real user asks.
