'use client';

import { useMemo } from 'react';
import { useAgreement, useMajors, type Option, type YearOption } from '../lib/assist';
import type { Plan } from '../../src/planner/plan';
import type { Agreement } from '../../src/parser/agreement';

export type Slot = { campus: number | null; year: number | null; major: string | null };

type Props = {
  index: number;
  slot: Slot;
  college: number | null;
  campuses: Option[];
  years: YearOption[];
  completed: string[];
  onChange: (next: Slot) => void;
  onRemove?: () => void;
  buildPlan: (agreement: Agreement, completed: string[]) => Plan;
};

function campusGroups(campuses: Option[]): [string, Option[]][] {
  const order = ['UC', 'CSU', 'Private or independent', 'Other'];
  const groups = new Map<string, Option[]>();
  for (const c of campuses) {
    const key = c.system ?? 'Other';
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return order.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!]);
}

export function CompareSlot({
  index,
  slot,
  college,
  campuses,
  years,
  completed,
  onChange,
  onRemove,
  buildPlan,
}: Props) {
  // The year is chosen for the student rather than asked for: comparing two
  // campuses across two different catalog years compares two different
  // questions. The newest year each pair actually has is the right one.
  const year = slot.year ?? years[0]?.id ?? null;

  const { majors, state } = useMajors(college, slot.campus, year);
  const { agreement, loading } = useAgreement(slot.major);

  const plan = useMemo(
    () => (agreement ? buildPlan(agreement, completed) : null),
    [agreement, completed, buildPlan],
  );

  const blocked = plan?.statuses.filter((s) => s.state === 'not_articulated').length ?? 0;
  const satisfied = plan?.statuses.filter((s) => s.state === 'satisfied').length ?? 0;
  const remaining = plan?.statuses.filter((s) => s.state === 'remaining').length ?? 0;

  return (
    <section className="panel slot">
      <div className="slot-head">
        <span className="slot-index">{String.fromCharCode(65 + index)}</span>
        {onRemove && (
          <button type="button" className="linkish" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>

      <div className="field">
        <label htmlFor={`campus-${index}`}>Campus</label>
        <select
          id={`campus-${index}`}
          value={slot.campus ?? ''}
          disabled={college === null}
          onChange={(e) =>
            onChange({
              campus: e.target.value === '' ? null : Number(e.target.value),
              year: null,
              major: null,
            })
          }
        >
          <option value="">{college === null ? 'Pick your college first' : 'Choose a campus'}</option>
          {campusGroups(campuses).map(([system, list]) => (
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
        <label htmlFor={`major-${index}`}>Major</label>
        <select
          id={`major-${index}`}
          value={slot.major ?? ''}
          disabled={state !== 'ready'}
          onChange={(e) =>
            onChange({ ...slot, year, major: e.target.value === '' ? null : e.target.value })
          }
        >
          <option value="">
            {state === 'loading'
              ? 'Loading majors…'
              : state === 'ready'
                ? `Choose one of ${majors.length}`
                : state === 'empty'
                  ? 'No agreements for this pair'
                  : 'Pick a campus first'}
          </option>
          {majors.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="skeleton" aria-hidden="true">
          <div className="bar" style={{ width: '70%' }} />
          <div className="bar" style={{ width: '45%' }} />
        </div>
      )}

      {plan && agreement && (
        <div className="slot-result">
          <div className="slot-figure">
            <b>{plan.remainingUnits}</b>
            <span>semester units left</span>
          </div>
          <dl className="slot-stats">
            <div>
              <dt>Requirements left</dt>
              <dd>{remaining}</dd>
            </div>
            <div>
              <dt>Already satisfied</dt>
              <dd>{satisfied}</dd>
            </div>
            <div>
              <dt>Taken after transfer</dt>
              <dd>{blocked}</dd>
            </div>
          </dl>
          {/* Named rather than counted: a blocker is a specific course a
              student will have to take after transferring, and which one it
              is changes how much it matters. */}
          {blocked > 0 && (
            <p className="slot-note">
              Nothing articulated for{' '}
              {plan.statuses
                .filter((s) => s.state === 'not_articulated')
                .flatMap((s) => s.receiving.map((c) => c.code))
                .slice(0, 4)
                .join(', ')}
              {blocked > 4 ? ` and ${blocked - 4} more` : ''}.
            </p>
          )}
          <a className="slot-open" href={`/?college=${college}&campus=${slot.campus}&year=${year}&major=${encodeURIComponent(slot.major ?? '')}`}>
            Open the full plan
          </a>
        </div>
      )}
    </section>
  );
}
