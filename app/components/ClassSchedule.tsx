'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ScheduledTerm } from '../../src/planner/schedule';
import { alternatives, pickSchedule, type Pick, type Unplaced } from '../../src/schedule/pick';
import type { Day, SchedulePreferences, Section } from '../../src/schedule/types';
import type { Rating } from '../../src/schedule/rmp';

// Pasadena City College is the one college whose class schedule is read so far.
export const SCHEDULE_COLLEGE = 49;

type TermInfo = { code: string; label: string; estimate: boolean };
type Loaded =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; term: TermInfo | null; sections: Section[] };

const WEEK: { day: Day; name: string }[] = [
  { day: 'M', name: 'Mon' },
  { day: 'T', name: 'Tue' },
  { day: 'W', name: 'Wed' },
  { day: 'R', name: 'Thu' },
  { day: 'F', name: 'Fri' },
  { day: 'S', name: 'Sat' },
  { day: 'U', name: 'Sun' },
];
const DAY_NAME = Object.fromEntries(WEEK.map((d) => [d.day, d.name])) as Record<Day, string>;
const WEEKDAYS: Day[] = ['M', 'T', 'W', 'R', 'F'];

const WINDOWS = {
  any: { label: 'Any time', start: undefined, end: undefined },
  morning: { label: 'Mornings', start: 8 * 60, end: 12 * 60 },
  afternoon: { label: 'Afternoons', start: 12 * 60, end: 17 * 60 },
  evening: { label: 'Evenings', start: 17 * 60, end: 22 * 60 },
} as const;
type WindowKey = keyof typeof WINDOWS;

function fmtTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function fmtHour(h: number) {
  return fmtTime(h * 60).replace(':00', '');
}

function meetingText(section: Section) {
  if (section.meetings.length === 0) {
    return section.mode === 'online' ? 'Online, no set meeting time' : 'Time arranged with the instructor';
  }
  return section.meetings
    .map((m) => `${m.days.map((d) => DAY_NAME[d]).join(' ')} ${fmtTime(m.start)} to ${fmtTime(m.end)}`)
    .join(', ');
}

function seatsText(section: Section) {
  if (section.seatsOpen > 0) return `${section.seatsOpen} ${section.seatsOpen === 1 ? 'seat' : 'seats'} open`;
  return section.waitlistCount > 0 ? `Full, ${section.waitlistCount} on the waitlist` : 'Full';
}

const REASON: Record<Unplaced['reason'], string> = {
  'no-sections': 'PCC lists no sections of this course for the term.',
  preferences: 'Every section is ruled out by your limits. Loosen days or hours.',
  conflict: 'Its sections overlap the rest of this schedule. Try the alternates or loosen your limits.',
};

function RatingLine({ section, ratings }: { section: Section; ratings: Record<string, Rating | null> | null }) {
  if (!section.instructor) return <span className="cs-muted">Instructor not listed</span>;
  if (ratings === null) return <span>{section.instructor}</span>;
  const r = ratings[section.instructor];
  if (!r) {
    return (
      <span>
        {section.instructor} <span className="cs-muted">(no rating)</span>
      </span>
    );
  }
  return (
    <span>
      {section.instructor}{' '}
      <a href={r.url} target="_blank" rel="noreferrer">
        {r.rating.toFixed(1)} / 5
      </a>{' '}
      <span className="cs-muted">
        {r.count} ratings, difficulty {r.difficulty.toFixed(1)}
        {r.wouldTakeAgain !== null ? `, ${r.wouldTakeAgain}% would retake` : ''}. RateMyProfessors
      </span>
    </span>
  );
}

function WeekView({ picks }: { picks: Pick[] }) {
  const timed = picks.filter((p) => p.section.meetings.length > 0);
  const untimed = picks.filter((p) => p.section.meetings.length === 0);
  const days = WEEK.filter(
    (d) => WEEKDAYS.includes(d.day) || timed.some((p) => p.section.meetings.some((m) => m.days.includes(d.day))),
  );
  const starts = timed.flatMap((p) => p.section.meetings.map((m) => m.start));
  const ends = timed.flatMap((p) => p.section.meetings.map((m) => m.end));
  const first = starts.length ? Math.floor(Math.min(...starts) / 60) : 8;
  const last = ends.length ? Math.ceil(Math.max(...ends) / 60) : first + 6;
  const ROW = 44;
  const height = (last - first) * ROW;

  return (
    <div>
      <div className="cs-week" role="group" aria-label="Week view of the chosen sections">
        <div className="cs-week-head" aria-hidden="true">
          <span />
          {days.map((d) => (
            <span key={d.day}>{d.name}</span>
          ))}
        </div>
        <div className="cs-week-body" style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, 1fr)` }}>
          <div className="cs-week-hours" style={{ height }} aria-hidden="true">
            {Array.from({ length: last - first }, (_, i) => (
              <span key={i} style={{ top: i * ROW }}>
                {fmtHour(first + i)}
              </span>
            ))}
          </div>
          {days.map((d) => (
            <div key={d.day} className="cs-week-col" style={{ height }}>
              {Array.from({ length: last - first }, (_, i) => (
                <i key={i} style={{ top: i * ROW }} />
              ))}
              {timed.flatMap((p) =>
                p.section.meetings
                  .filter((m) => m.days.includes(d.day))
                  .map((m, i) => (
                    <div
                      key={`${p.section.crn}${i}`}
                      className="cs-block"
                      style={{
                        top: ((m.start - first * 60) / 60) * ROW,
                        height: Math.max(((m.end - m.start) / 60) * ROW - 2, 24),
                      }}
                    >
                      <b className="code">{p.course}</b>
                      <span>
                        {fmtTime(m.start)} to {fmtTime(m.end)}
                      </span>
                    </div>
                  )),
              )}
            </div>
          ))}
        </div>
      </div>
      {untimed.length > 0 && (
        <p className="cs-muted cs-untimed">
          No set time:{' '}
          {untimed.map((p, i) => (
            <span key={p.section.crn}>
              {i > 0 && ', '}
              <span className="code">{p.course}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export function ClassSchedule({ college, terms }: { college: number | null; terms: ScheduledTerm[] }) {
  const [termIdx, setTermIdx] = useState(0);
  const safeIdx = Math.min(termIdx, Math.max(terms.length - 1, 0));
  const term = terms[safeIdx];

  const codes = useMemo(
    () => (term ? term.items.flatMap((i) => (i.kind === 'course' ? [i.course.code] : [])) : []),
    [term],
  );
  const geSlots = term ? term.items.filter((i) => i.kind === 'area').length : 0;
  const codeKey = codes.join(',');

  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [ratings, setRatings] = useState<Record<string, Rating | null> | null>(null);

  const [days, setDays] = useState<Set<Day>>(new Set(WEEKDAYS));
  const [earliest, setEarliest] = useState<number | null>(null);
  const [latest, setLatest] = useState<number | null>(null);
  const [windowKey, setWindowKey] = useState<WindowKey>('any');
  const [weight, setWeight] = useState(0.6);
  const [allowOnline, setAllowOnline] = useState(true);
  const [allowInPerson, setAllowInPerson] = useState(true);
  const [view, setView] = useState<'list' | 'week'>('list');
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const enabled = college === SCHEDULE_COLLEGE && term !== undefined && codes.length > 0;

  useEffect(() => {
    if (!enabled || !term) return;
    const controller = new AbortController();
    setLoaded({ status: 'loading' });
    setRatings(null);
    setOverrides({});
    fetch(`/api/schedule/pcc?term=${term.ref.kind}-${term.ref.year}&courses=${encodeURIComponent(codeKey)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { term: TermInfo | null; sections: Section[] }) => {
        setLoaded({ status: 'ready', term: body.term, sections: body.sections });
        const names = [...new Set(body.sections.flatMap((s) => (s.instructor ? [s.instructor] : [])))].slice(0, 40);
        if (names.length === 0) return setRatings({});
        return fetch(`/api/schedule/ratings?names=${encodeURIComponent(names.join('|'))}`, {
          signal: controller.signal,
        })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((b: { ratings: Record<string, Rating | null> }) => setRatings(b.ratings))
          // Ratings are a ranking aid. Without them sections are still shown.
          .catch(() => setRatings({}));
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'AbortError') setLoaded({ status: 'error' });
      });
    return () => controller.abort();
  }, [enabled, term?.ref.kind, term?.ref.year, codeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const prefs: SchedulePreferences = useMemo(() => {
    const w = WINDOWS[windowKey];
    return {
      // Always sent, so the chips on screen are exactly what is enforced: with
      // Sat off, a Saturday section is not offered.
      days: [...days],
      earliest: earliest ?? undefined,
      latest: latest ?? undefined,
      allowOnline,
      allowInPerson,
      preferredStart: w.start,
      preferredEnd: w.end,
      professorWeight: weight,
      ratings: Object.fromEntries(
        Object.entries(ratings ?? {}).flatMap(([name, r]) => (r ? [[name, r.rating]] : [])),
      ),
    };
  }, [days, earliest, latest, windowKey, weight, allowOnline, allowInPerson, ratings]);

  const sections = loaded.status === 'ready' ? loaded.sections : [];
  const auto = useMemo(() => pickSchedule(codes, sections, prefs), [codes, sections, prefs]);

  // The student's own swaps sit on top of the automatic choice. An alternate is
  // only ever offered if it clears the rest, so a swap cannot create a clash.
  const picks: Pick[] = auto.picks.map((p) => {
    const crn = overrides[p.course];
    const swapped = crn ? sections.find((s) => s.crn === crn) : undefined;
    return swapped ? { course: p.course, section: swapped } : p;
  });

  const setPref = <T,>(set: (v: T) => void) => (v: T) => {
    setOverrides({});
    set(v);
  };

  if (college === null || terms.length === 0) return null;

  if (college !== SCHEDULE_COLLEGE) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Class schedule</h2>
        </div>
        <p className="field-note">
          Picking real class sections is only available for Pasadena City College so far. Other colleges
          publish their schedules in different systems and each one has to be read separately.
        </p>
      </section>
    );
  }

  const toggleDay = (d: Day) =>
    setPref(setDays)(
      (() => {
        const next = new Set(days);
        if (next.has(d)) next.delete(d);
        else next.add(d);
        return next;
      })(),
    );

  const hourOptions = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

  return (
    <section className="panel cs">
      <div className="panel-head">
        <h2>Class schedule</h2>
        <p>Real sections from Pasadena City College. It never registers you for anything.</p>
      </div>

      {terms.length > 1 && (
        <div className="cs-terms" role="group" aria-label="Term to schedule">
          {terms.slice(0, 6).map((t, i) => (
            <button
              key={`${t.ref.kind}${t.ref.year}`}
              type="button"
              className="demo-chip"
              aria-pressed={i === safeIdx}
              onClick={() => setTermIdx(i)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {geSlots > 0 && (
        <p className="field-note">
          {geSlots} general education {geSlots === 1 ? 'course' : 'courses'} in this term {geSlots === 1 ? 'is' : 'are'}{' '}
          not scheduled here, since you pick which course fills an area.
        </p>
      )}

      {codes.length === 0 ? (
        <p className="field-note">This term has no specific courses to schedule.</p>
      ) : (
        <>
          <div className="cs-controls">
            <fieldset>
              <legend>Days you can attend</legend>
              <div className="cs-row">
                {WEEK.slice(0, 6).map((d) => (
                  <button
                    key={d.day}
                    type="button"
                    className="demo-chip cs-small"
                    aria-pressed={days.has(d.day)}
                    onClick={() => toggleDay(d.day)}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="cs-field">
              <label htmlFor="cs-earliest">No class before</label>
              <select
                id="cs-earliest"
                value={earliest ?? ''}
                onChange={(e) => setPref(setEarliest)(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">Any time</option>
                {hourOptions.map((h) => (
                  <option key={h} value={h * 60}>
                    {fmtHour(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className="cs-field">
              <label htmlFor="cs-latest">Done by</label>
              <select
                id="cs-latest"
                value={latest ?? ''}
                onChange={(e) => setPref(setLatest)(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">Any time</option>
                {hourOptions.slice(3).map((h) => (
                  <option key={h} value={h * 60}>
                    {fmtHour(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className="cs-field">
              <label htmlFor="cs-window">Prefer</label>
              <select
                id="cs-window"
                value={windowKey}
                onChange={(e) => setPref(setWindowKey)(e.target.value as WindowKey)}
              >
                {(Object.keys(WINDOWS) as WindowKey[]).map((k) => (
                  <option key={k} value={k}>
                    {WINDOWS[k].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="cs-field cs-slider">
              <label htmlFor="cs-weight">
                Ranking: <span>time</span> to <span>professor</span>
              </label>
              <input
                id="cs-weight"
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={weight}
                onChange={(e) => setPref(setWeight)(Number(e.target.value))}
              />
            </div>
            <fieldset>
              <legend>Format</legend>
              <div className="cs-row">
                <button
                  type="button"
                  className="demo-chip cs-small"
                  aria-pressed={allowInPerson}
                  onClick={() => setPref(setAllowInPerson)(!allowInPerson)}
                >
                  In person
                </button>
                <button
                  type="button"
                  className="demo-chip cs-small"
                  aria-pressed={allowOnline}
                  onClick={() => setPref(setAllowOnline)(!allowOnline)}
                >
                  Online
                </button>
              </div>
            </fieldset>
          </div>

          {loaded.status === 'loading' && <p className="field-note">Loading sections from PCC. A cold load takes a few seconds.</p>}
          {loaded.status === 'error' && (
            <p role="alert" className="notice" data-tone="error">
              <strong>Could not load PCC&rsquo;s class schedule</strong>
              Try again in a minute. Your plan above is unaffected.
            </p>
          )}

          {loaded.status === 'ready' && (
            <>
              {loaded.term === null ? (
                <p className="field-note">PCC has no published schedule for this term or the same term last year.</p>
              ) : loaded.term.estimate ? (
                <p className="notice" data-tone="caution">
                  <strong>This is last year&rsquo;s pattern.</strong>
                  PCC has not published {term.label} yet, so these are the {loaded.term.label} sections. Days, times and
                  instructors will differ. Use it to see what usually exists, not what you will register for.
                </p>
              ) : (
                <p className="field-note">Sections for {loaded.term.label}, read from PCC. Seats change quickly.</p>
              )}

              <div className="cs-view" role="group" aria-label="View">
                <button type="button" className="demo-chip cs-small" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                  List
                </button>
                <button type="button" className="demo-chip cs-small" aria-pressed={view === 'week'} onClick={() => setView('week')}>
                  Week
                </button>
              </div>

              {view === 'week' && <WeekView picks={picks} />}

              <ol className="cs-list">
                {picks.map((p) => {
                  const alts = alternatives(p, picks, sections, prefs);
                  return (
                    <li key={p.course}>
                      <div className="cs-pick">
                        <p className="cs-course">
                          <b className="code">{p.course}</b> {p.section.title}
                          <span className="cs-muted"> · {p.section.units} units · CRN {p.section.crn}</span>
                        </p>
                        <p>{meetingText(p.section)}</p>
                        <p>
                          <RatingLine section={p.section} ratings={ratings} />
                        </p>
                        <p className="cs-muted">
                          {p.section.mode === 'online' ? 'Online' : p.section.campus}
                          {p.section.termPart && p.section.termPart !== 'Full Term' ? `, ${p.section.termPart}` : ''}
                          {` · ${seatsText(p.section)}`}
                        </p>
                      </div>
                      {alts.length > 0 && (
                        <details className="cs-alts">
                          <summary>Other sections ({alts.length})</summary>
                          <ul>
                            {alts.map((s) => (
                              <li key={s.crn}>
                                <div>
                                  <p>{meetingText(s)}</p>
                                  <p>
                                    <RatingLine section={s} ratings={ratings} />
                                  </p>
                                  <p className="cs-muted">
                                    {s.mode === 'online' ? 'Online' : s.campus} · {seatsText(s)} · CRN {s.crn}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="demo-reset"
                                  onClick={() => setOverrides((o) => ({ ...o, [p.course]: s.crn }))}
                                >
                                  Use this section
                                </button>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ol>

              {auto.unplaced.length > 0 && (
                <div className="notice" data-tone="caution">
                  <strong>
                    {auto.unplaced.length} {auto.unplaced.length === 1 ? 'course' : 'courses'} could not be placed
                  </strong>
                  <ul className="cs-unplaced">
                    {auto.unplaced.map((u) => (
                      <li key={u.course}>
                        <b className="code">{u.course}</b>: {REASON[u.reason]}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="field-note">
                Ranked on open seats first, then the professor and time of day by the balance you set. Ratings are
                summaries from RateMyProfessors and are only as good as the reviews behind them. Confirm every section
                in PCC&rsquo;s own system before you register.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
