'use client';

import { useMemo, useState } from 'react';
import { bySubject, normalizeCode, subjectOf } from '../../src/planner/catalog';
import type { Course } from '../../src/parser/types';

// The courses a student has already taken, chosen from a supplied list rather
// than typed. Nothing here can be misspelled, so the plan can never quietly
// ignore something a student told it.
//
// The list is a parameter because two of them are needed: the courses this
// agreement articulates, and the courses the college certifies for Cal-GETC.
// They are the same interaction over different data.
export function CourseChooser({
  courses,
  chosen,
  onChange,
  label,
  emptyNote,
  footnote,
  id = 'course-filter',
}: {
  courses: Course[];
  chosen: Set<string>;
  onChange: (next: Set<string>) => void;
  label: string;
  emptyNote: string;
  footnote: string;
  id?: string;
}) {
  const [filter, setFilter] = useState('');

  const matching = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return courses;
    // Match on code and title both: a student may remember "calculus" but not
    // that their college calls it MATH 005B. Codes are compared with padding
    // and spacing removed, so "math5a" finds "MATH 005A".
    const loose = normalizeCode(needle);
    return courses.filter(
      (c) => normalizeCode(c.code).includes(loose) || c.title.toLowerCase().includes(needle),
    );
  }, [courses, filter]);

  const groups = useMemo(() => bySubject(matching), [matching]);
  const selected = courses.filter((c) => chosen.has(c.code.toUpperCase()));

  if (courses.length === 0) return <p className="field-note">{emptyNote}</p>;

  const toggle = (code: string) => {
    const key = code.toUpperCase();
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div className="chooser">
      <div className="chooser-head">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <div className="chooser-meta">
          <span>
            {selected.length} of {courses.length} selected
          </span>
          {selected.length > 0 && (
            <button type="button" className="linkish" onClick={() => onChange(new Set())}>
              Clear
            </button>
          )}
        </div>
      </div>

      <input
        id={id}
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by code or title"
        autoComplete="off"
      />

      {matching.length === 0 ? (
        <p className="field-note">
          Nothing here matches &ldquo;{filter}&rdquo;.
        </p>
      ) : (
        <div className="subjects">
          {groups.map(([subject, list]) => (
            <div className="subject" key={subject}>
              <div className="subject-name">{subject}</div>
              <div className="chips">
                {list.map((c) => {
                  const on = chosen.has(c.code.toUpperCase());
                  return (
                    <label className="chip" key={c.code} data-on={on} title={c.title}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(c.code)}
                      />
                      {/* The subject is already the group heading, so the
                          chip shows only what distinguishes the course.
                          Stripped with subjectOf rather than a regex so a
                          two-word prefix like "I&C SCI" comes off whole. */}
                      <span className="code">{c.code.slice(subjectOf(c.code).length).trim()}</span>
                      <u>{c.units}u</u>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="field-note">{footnote}</p>
    </div>
  );
}
