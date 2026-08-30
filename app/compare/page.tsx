'use client';

import { useMemo, useState } from 'react';
import { buildPlan } from '../../src/planner/plan';
import { CompareSlot, type Slot } from '../components/CompareSlot';
import { useCatalog, usePartners, yearsFor, type Option } from '../lib/assist';

// Where should you aim? A student choosing between campuses is choosing
// between different amounts of work, and ASSIST has the answer but only one
// agreement at a time. This puts them side by side.
//
// Deliberately one college and several campuses, not the reverse: you do not
// get to pick which community college you already attend.

const EMPTY: Slot = { campus: null, year: null, major: null };

export default function Compare() {
  const { catalog, failure } = useCatalog();
  const [college, setCollege] = useState<number | null>(null);
  const [slots, setSlots] = useState<Slot[]>([EMPTY, EMPTY]);
  const [completed, setCompleted] = useState('');

  const partners = usePartners(college);

  const campuses: Option[] = (catalog?.campuses ?? []).filter(
    (c) => partners === null || partners.some((p) => p.id === c.id),
  );

  const done = useMemo(
    () =>
      completed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [completed],
  );

  const setSlot = (index: number, next: Slot) =>
    setSlots((current) => current.map((s, i) => (i === index ? next : s)));

  return (
    <main>
      <div className="page-intro">
        <h1>Compare campuses</h1>
        <p>
          The same college, several destinations. How much major preparation each one actually
          costs you, side by side, counting what you have already done.
        </p>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>You</h2>
          <p>One college, because that is the part you do not get to choose</p>
        </div>
        <div className="grid">
          <div className="field">
            <label htmlFor="college">Your community college</label>
            <select
              id="college"
              value={college ?? ''}
              disabled={!catalog}
              onChange={(e) => {
                setCollege(e.target.value === '' ? null : Number(e.target.value));
                setSlots([EMPTY, EMPTY]);
              }}
            >
              <option value="">Choose your college</option>
              {(catalog?.colleges ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="done">Courses you have already finished</label>
            <input
              id="done"
              type="text"
              value={completed}
              onChange={(e) => setCompleted(e.target.value)}
              placeholder="CS 003B, MATH 005A"
            />
            <p className="field-note">
              Comma separated. Applied to every campus below so the comparison is against the same
              starting point.
            </p>
          </div>
        </div>
      </section>

      {failure && (
        <p role="alert" className="notice" data-tone="error" style={{ marginTop: '1rem' }}>
          <strong>Could not load the list of colleges</strong>
          {failure.message}
        </p>
      )}

      <div className="compare">
        {slots.map((slot, i) => (
          <CompareSlot
            key={i}
            index={i}
            slot={slot}
            college={college}
            campuses={campuses}
            years={yearsFor(partners, slot.campus, catalog?.academicYears ?? [])}
            completed={done}
            onChange={(next) => setSlot(i, next)}
            onRemove={slots.length > 2 ? () => setSlots(slots.filter((_, j) => j !== i)) : undefined}
            buildPlan={buildPlan}
          />
        ))}
      </div>

      {slots.length < 4 && (
        <button type="button" className="add-slot" onClick={() => setSlots([...slots, EMPTY])}>
          Add another campus
        </button>
      )}

      <div className="scope">
        <p>
          <b>This compares major preparation only.</b> A campus that looks cheaper here can still be
          harder to get into, and admission is not something any articulation agreement describes.
        </p>
        <p>
          <b>Majors are picked per campus</b> because campuses name them differently and structure
          them differently. Two majors with the same name are not always the same programme.
        </p>
      </div>
    </main>
  );
}
