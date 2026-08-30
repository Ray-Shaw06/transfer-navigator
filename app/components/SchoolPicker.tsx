'use client';

import type { TermKind, TermRef } from '../../src/planner/schedule';
import { nextTerm, termLabel } from '../../src/planner/schedule';

export type Option = { id: number; name: string; system?: string };
export type YearOption = { id: number; label: string };
export type MajorOption = { label: string; key: string };

export type PlanSettings = {
  start: TermRef;
  unitsPerTerm: number;
  includeSummer: boolean;
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

// Terms a student can start from or aim at. Twelve forward from the current
// one is four years, which covers any realistic community college route
// including a part-time one.
function termChoices(from: TermRef, count: number): TermRef[] {
  const out: TermRef[] = [];
  let ref = from;
  for (let i = 0; i < count; i++) {
    out.push(ref);
    ref = nextTerm(ref, false);
  }
  return out;
}

const encode = (ref: TermRef) => `${ref.kind}-${ref.year}`;
const decode = (value: string): TermRef => {
  const [kind, year] = value.split('-');
  return { kind: kind as TermKind, year: Number(year) };
};

export function PlanControls({
  settings,
  earliest,
  onChange,
}: {
  settings: PlanSettings;
  earliest: TermRef;
  onChange: (next: PlanSettings) => void;
}) {
  const starts = termChoices(earliest, 12);
  const targets = termChoices(settings.start, 13).slice(1);

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

      <div className="field">
        <label htmlFor="load">Units per term</label>
        <select
          id="load"
          value={settings.unitsPerTerm}
          onChange={(e) => onChange({ ...settings, unitsPerTerm: Number(e.target.value) })}
        >
          {[6, 9, 12, 15, 18].map((n) => (
            <option key={n} value={n}>
              {n} units{n === 12 ? ' (full time)' : n === 6 ? ' (part time)' : ''}
            </option>
          ))}
        </select>
      </div>

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

      <label className="check">
        <input
          type="checkbox"
          checked={settings.includeSummer}
          onChange={(e) => onChange({ ...settings, includeSummer: e.target.checked })}
        />
        Use summer terms
      </label>
    </div>
  );
}
