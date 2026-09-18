'use client';

import type { TermKind, TermRef } from '../../src/planner/schedule';
import { nextTerm, termLabel } from '../../src/planner/schedule';
import { clampUnits, LEAST_UNITS, type UnitLimits } from '../../src/planner/limits';

export type Option = { id: number; name: string; system?: string };
export type YearOption = { id: number; label: string };
export type MajorOption = { label: string; key: string };

export type PlanSettings = {
  start: TermRef;
  unitsPerTerm: number;
  includeSummer: boolean;
  includeWinter: boolean;
  // Units in a summer session and a winter intersession, once the student
  // has chosen them. Unset means the planner's own default for a short term,
  // which is what a student gets until they touch the slider.
  summerUnits?: number;
  winterUnits?: number;
  target: TermRef | null;
};

type Props = {
  colleges: Option[];
  campuses: Option[];
  years: YearOption[];
  majors: MajorOption[];
  college: number | null;
  campus: number | null;
  year: number | null;
  major: string | null;
  majorsState: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  onCollege: (id: number | null) => void;
  onCampus: (id: number | null) => void;
  onYear: (id: number | null) => void;
  onMajor: (key: string | null) => void;
};

const toId = (value: string): number | null => (value === '' ? null : Number(value));

// Campuses are grouped by system because a student usually knows whether they
// are aiming at a UC, a CSU or a private college before they know which one,
// and ASSIST's private coverage is patchy enough that the grouping is a
// warning in itself.
function campusGroups(campuses: Option[]): [string, Option[]][] {
  const order = ['UC', 'CSU', 'Private or independent', 'Other'];
  const groups = new Map<string, Option[]>();
  for (const c of campuses) {
    const key = c.system ?? 'Other';
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return order.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!]);
}

export function SchoolPicker(props: Props) {
  const { majorsState } = props;

  return (
    <div className="grid">
      <div className="field">
        <label htmlFor="college">Your community college</label>
        <select
          id="college"
          value={props.college ?? ''}
          onChange={(e) => props.onCollege(toId(e.target.value))}
        >
          <option value="">Choose your college</option>
          {props.colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="campus">Where you want to transfer</label>
        <select
          id="campus"
          value={props.campus ?? ''}
          onChange={(e) => props.onCampus(toId(e.target.value))}
        >
          <option value="">Choose a campus</option>
          {campusGroups(props.campuses).map(([system, list]) => (
            <optgroup key={system} label={system}>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="year">Catalog year</label>
        <select
          id="year"
          value={props.year ?? ''}
          disabled={props.years.length === 0}
          onChange={(e) => props.onYear(toId(e.target.value))}
        >
          {/* Only years ASSIST actually has an agreement for, for this pair.
              A catalog year exists on ASSIST well before agreements are
              written under it, so offering every published year would send
              students into empty ones. */}
          {props.years.length === 0 && <option value="">Pick a college and a campus first</option>}
          {props.years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="major">Major</label>
        <select
          id="major"
          value={props.major ?? ''}
          disabled={majorsState !== 'ready'}
          onChange={(e) => props.onMajor(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">
            {majorsState === 'loading'
              ? 'Loading majors…'
              : majorsState === 'ready'
                ? `Choose one of ${props.majors.length}`
                : 'Pick a college and a campus first'}
          </option>
          {props.majors.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        {majorsState === 'empty' && (
          <p className="field-note" role="status">
            ASSIST publishes no major agreements between these two for that year. That usually means
            the two schools have no agreement, not that something went wrong. Try another catalog
            year or another campus.
          </p>
        )}
      </div>
    </div>
  );
}

// Terms a student can start from or aim at: every term the calendar has, Fall,
// Winter, Spring and Summer, in the order they fall.
//
// All four regardless of the summer and winter checkboxes, which are a
// different question. Those say whether to spread work across the short
// sessions; this says which term a student is standing in, or aiming at, and a
// student who is starting in a summer session is starting in a summer session
// whether or not they plan to use later ones. Filtering this list by those
// boxes would also make the dropdown rearrange itself under the cursor.
//
// Twenty forward is five years, which covers any realistic community college
// route including a part-time one.
function termChoices(from: TermRef, count: number): TermRef[] {
  const out: TermRef[] = [];
  let ref = from;
  for (let i = 0; i < count; i++) {
    out.push(ref);
    ref = nextTerm(ref, true, true);
  }
  return out;
}

const encode = (ref: TermRef) => `${ref.kind}-${ref.year}`;
const decode = (value: string): TermRef => {
  const [kind, year] = value.split('-');
  return { kind: kind as TermKind, year: Number(year) };
};

// A slider held to a college's ceiling, with the ceiling's provenance said
// beside it. The provenance matters: a ceiling read off the college's own
// catalog is a rule, a typical one is a guess the student should check.
function LoadSlider({
  id,
  label,
  value,
  ceiling,
  verified,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  ceiling: number;
  verified: boolean;
  hint?: string;
  onChange: (units: number) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <b className="load-value">{value} units</b>
      </label>
      <input
        id={id}
        type="range"
        min={LEAST_UNITS}
        max={ceiling}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="field-note">
        {hint ? `${hint} ` : ''}
        {verified
          ? `Your college allows up to ${ceiling} without a petition.`
          : `Up to ${ceiling} is typical; your college's own ceiling is in its catalog.`}
      </p>
    </div>
  );
}

export function PlanControls({
  settings,
  earliest,
  limits,
  onChange,
}: {
  settings: PlanSettings;
  earliest: TermRef;
  // The college's unit ceilings, or typical ones with `verified` empty.
  limits: UnitLimits;
  onChange: (next: PlanSettings) => void;
}) {
  const starts = termChoices(earliest, 20);
  // Held to the ceiling, since a stored load can outlive a change of college.
  const load = clampUnits(settings.unitsPerTerm, limits.semester);
  // The planner's own defaults for a short term, shown on the slider until
  // the student moves it: half a load in summer, one course in winter.
  const summer = clampUnits(settings.summerUnits ?? Math.round(load / 2), limits.summer);
  const winter = clampUnits(settings.winterUnits ?? 5, limits.winter);
  const pace =
    load < limits.fullTime
      ? 'Part time.'
      : load < 15
        ? `Full time at your college starts at ${limits.fullTime}.`
        : 'The pace that finishes in two years.';
  // From the term after the one being started in: a student cannot transfer in
  // the same term they are still taking courses at their college.
  const targets = termChoices(settings.start, 21).slice(1);

  return (
    <div className="grid grid-tight">
      <div className="field">
        <label htmlFor="start">First term you are planning</label>
        <select
          id="start"
          value={encode(settings.start)}
          onChange={(e) => onChange({ ...settings, start: decode(e.target.value) })}
        >
          {starts.map((ref) => (
            <option key={encode(ref)} value={encode(ref)}>
              {termLabel(ref)}
            </option>
          ))}
        </select>
      </div>

      <LoadSlider
        id="load"
        label="Units per semester"
        value={load}
        ceiling={limits.semester}
        verified={limits.verified.includes('semester')}
        hint={pace}
        onChange={(units) => onChange({ ...settings, unitsPerTerm: units })}
      />

      <div className="field">
        <label htmlFor="target">Transfer by</label>
        <select
          id="target"
          value={settings.target ? encode(settings.target) : ''}
          onChange={(e) =>
            onChange({ ...settings, target: e.target.value ? decode(e.target.value) : null })
          }
        >
          <option value="">No target yet</option>
          {targets.map((ref) => (
            <option key={encode(ref)} value={encode(ref)}>
              {termLabel(ref)}
            </option>
          ))}
        </select>
      </div>

      {/* Both are opt-in and both are short. A college that does not run a
          winter intersession is common enough that assuming one would put a
          term in the plan a student cannot enrol in, which is the one kind of
          error this tool tries hardest not to make. */}
      <label className="check">
        <input
          type="checkbox"
          checked={settings.includeSummer}
          onChange={(e) => onChange({ ...settings, includeSummer: e.target.checked })}
        />
        Use summer terms
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={settings.includeWinter}
          onChange={(e) => onChange({ ...settings, includeWinter: e.target.checked })}
        />
        Use winter intersession
      </label>

      {/* The short sessions get their own sliders only once they are in use.
          Each has its own ceiling, and the ceilings are what make the two
          sessions different from each other and from a semester. */}
      {settings.includeSummer && (
        <LoadSlider
          id="summer-load"
          label="Units in a summer session"
          value={summer}
          ceiling={limits.summer}
          verified={limits.verified.includes('summer')}
          onChange={(units) => onChange({ ...settings, summerUnits: units })}
        />
      )}

      {settings.includeWinter && (
        <LoadSlider
          id="winter-load"
          label="Units in a winter intersession"
          value={winter}
          ceiling={limits.winter}
          verified={limits.verified.includes('winter')}
          hint="Usually one course."
          onChange={(units) => onChange({ ...settings, winterUnits: units })}
        />
      )}
    </div>
  );
}
