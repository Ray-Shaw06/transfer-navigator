'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildPlan, type Need } from '../../src/planner/plan';
import { buildSchedule, type ScheduledTerm } from '../../src/planner/schedule';
import { canonicalCourseKey, padCourseCode } from '../../src/catalog/normalize';
import { geStatus } from '../../src/planner/ge';
import { geScheduleItems } from '../../src/planner/doubleCount';
import { patternFor } from '../../src/planner/patterns';
import { sendingCourses } from '../../src/planner/catalog';
import type { Course } from '../../src/parser/types';
import { useAgreement, useGeneralEducation, usePrereqs } from '../lib/assist';
import { EXAMPLE_MAJOR_KEY, EXAMPLE_PLAN_LABEL } from '../lib/example';
import { SAMPLE, type SampleTerm } from '../lib/sample';
import { verdictFor } from './Verdict';

// The example agreement: Pasadena City College (49) to UC Irvine, Computer
// Science, catalog year 2025-2026 (76), planned from Spring 2027 at 15 units.
// Everything below runs the same planner the /plan page runs, on the real
// agreement, in this tab. It is not a recording.
const COLLEGE = 49;
const YEAR = 76;
const START = { kind: 'Spring' as const, year: 2027 };
const PATTERN = patternFor('CALGETC');

// Courses worth offering as "I have finished this" in a demo. Only the ones
// the agreement actually lists are shown.
const OFFERED = ['MATH 005A', 'MATH 005B', 'CS 002', 'CS 003B'];

type Row = Pick<SampleTerm, 'season' | 'year' | 'units' | 'items'>;

function rowsFrom(terms: ScheduledTerm[]): Row[] {
  return terms.map((t) => ({
    season: t.ref.kind,
    year: t.ref.year,
    units: t.units,
    items: t.items.map((i) =>
      i.kind === 'course'
        ? { text: i.course.code, code: true }
        : { text: i.label, code: false },
    ),
  }));
}

export function LiveDemo() {
  const { agreement } = useAgreement(EXAMPLE_MAJOR_KEY);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [needs, setNeeds] = useState<Need[]>([]);

  const plan = useMemo(
    () => (agreement ? buildPlan(agreement, [...completed], new Set(), needs) : null),
    [agreement, completed, needs],
  );

  const planCodes = useMemo(
    () => [
      ...new Set([
        ...(plan ? plan.remainingGroups.flatMap((g) => g.courses.map((c) => c.code)) : []),
        ...needs.flatMap((n) => n.prerequisites),
      ]),
    ],
    [plan, needs],
  );
  const prereqs = usePrereqs(COLLEGE, planCodes);

  // As the planner does: a prerequisite the catalog names is added to the plan,
  // and its own prerequisites are asked about in turn.
  useEffect(() => {
    const answered = [...prereqs.index.values()].filter((e) => e.prerequisites.length > 0);
    setNeeds((have) => {
      const known = new Set(have.map((n) => canonicalCourseKey(n.code)));
      const fresh = answered.filter((e) => !known.has(canonicalCourseKey(e.code)));
      return fresh.length === 0
        ? have
        : [...have, ...fresh.map((e) => ({ code: e.code, prerequisites: e.prerequisites }))];
    });
  }, [prereqs.index]);

  const ge = useGeneralEducation(COLLEGE, YEAR, PATTERN.listType);

  const geView = useMemo(() => {
    if (!ge || !plan || ge.byCourse.length === 0) return null;
    return geStatus(
      ge,
      PATTERN,
      'UC',
      completed,
      plan.remainingGroups.flatMap((g) => g.courses),
    );
  }, [ge, plan, completed]);

  // How to name a course the catalog mentions but the agreement never did.
  const courseInfo = useMemo(() => {
    const known = new Map<string, Course>();
    let pads = false;
    for (const row of agreement?.rows ?? []) {
      if (row.sending.kind !== 'options') continue;
      for (const option of row.sending.options) {
        for (const c of option.courses) {
          known.set(canonicalCourseKey(c.code), c);
          if (/\s0\d/.test(c.code)) pads = true;
        }
      }
    }
    for (const c of ge?.byCourse ?? []) {
      const key = canonicalCourseKey(c.code);
      if (!known.has(key)) known.set(key, { code: c.code, title: c.title, units: c.units });
    }
    return (code: string): Course | null => {
      const listed = known.get(canonicalCourseKey(code));
      if (listed) return listed;
      const entry = prereqs.index.get(canonicalCourseKey(code));
      if (!entry || !entry.title || entry.units === undefined) return null;
      return { code: pads ? padCourseCode(entry.code) : entry.code, title: entry.title, units: entry.units };
    };
  }, [agreement, ge, prereqs.index]);

  const schedule = useMemo(
    () =>
      plan
        ? buildSchedule(
            plan.remainingGroups,
            {
              start: START,
              unitsPerTerm: 15,
              includeSummer: false,
              includeWinter: false,
              target: null,
              prereqs: prereqs.index.size > 0 ? prereqs.index : undefined,
              held: [...completed],
              courseInfo,
            },
            geView ? geScheduleItems(geView) : [],
          )
        : null,
    [plan, geView, prereqs, completed, courseInfo],
  );

  // Live only once everything the planner needs has arrived. Until then, and if
  // anything fails to load, the visitor sees the snapshot rather than a blank.
  const live = Boolean(agreement && plan && schedule && geView && prereqs.index.size > 0);

  const offered = useMemo(() => {
    if (!agreement) return [];
    const have = new Set(sendingCourses(agreement).map((c) => canonicalCourseKey(c.code)));
    return OFFERED.filter((code) => have.has(canonicalCourseKey(code)));
  }, [agreement]);

  const verdict =
    live && plan && schedule ? verdictFor(plan, schedule, null, PATTERN.name) : null;
  const rows: Row[] = live && schedule ? rowsFrom(schedule.terms) : SAMPLE.terms;
  const line = verdict ? verdict.line : SAMPLE.verdict;
  const detail =
    live && plan && schedule
      ? `${plan.remainingUnits + schedule.addedUnits} semester units to take across ${schedule.terms.length} ${schedule.terms.length === 1 ? 'term' : 'terms'}.`
      : SAMPLE.detail;

  const toggle = (code: string) =>
    setCompleted((have) => {
      const next = new Set(have);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <aside className="sample" aria-labelledby="sample-title" data-live={live}>
      <h2 id="sample-title" className="sample-title">
        {live ? 'Try it. This is the real planner.' : 'A real plan, not a mockup'}
      </h2>
      <p className="sample-from">{EXAMPLE_PLAN_LABEL}. 2025-2026 agreement, starting Spring 2027.</p>

      {live && (
        <div className="demo-ticks">
          <p className="demo-ticks-label" id="demo-ticks-label">
            Tick a course you have finished
          </p>
          <div className="demo-chips" role="group" aria-labelledby="demo-ticks-label">
            {offered.map((code) => (
              <button
                key={code}
                type="button"
                className="demo-chip"
                aria-pressed={completed.has(code)}
                onClick={() => toggle(code)}
              >
                <span className="code">{code}</span>
              </button>
            ))}
            {completed.size > 0 && (
              <button type="button" className="demo-reset" onClick={() => setCompleted(new Set())}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div aria-live="polite">
        <p className="sample-verdict" key={line}>
          {line}
        </p>
        <p className="sample-detail">{detail}</p>
      </div>

      <ol className="sample-terms">
        {rows.map((term) => (
          <li key={`${term.season}${term.year}`}>
            <div className="sample-when">
              <span>{term.season}</span>
              <span className="sample-year">{term.year}</span>
            </div>
            <div className="sample-items">
              <p className="sample-units">{term.units} units</p>
              <p>
                {term.items.map((item, i) => (
                  <span key={`${item.text}${i}`}>
                    {i > 0 && ', '}
                    {item.code ? <span className="code">{item.text}</span> : item.text}
                  </span>
                ))}
              </p>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="sample-empty">Nothing left on this agreement.</li>}
      </ol>

      <p className="sample-note">
        Order comes from the college&rsquo;s own catalog. Confirm it with a counselor before you register.
      </p>
    </aside>
  );
}
