import type { GeneralEducation } from '../assist/ge';
import { normalizeCode } from './catalog';
import { areasFor, patternFor, type AreaRule, type Destination, type Pattern, type PatternKey } from './patterns';
import type { AndGroup } from '../parser/groups';
import type { Course } from '../parser/types';

// Which general education areas a course also clears.
//
// A course that satisfies a major requirement AND a general education area is
// the best thing on the board, and it is the single thing students most often
// miss: they take the cheapest course for the major, then take a second course
// for the area the first one would have covered. The GE panel already counts
// these after the fact. This puts them where the decision is made, on the
// route and on every accepted option for a requirement.
//
// Areas are reported as the pattern names them, not as ASSIST tags them, so a
// course tagged 3B reads as Area 3. That is what the rest of the interface
// shows and what the standards print.

export type DoubleCountIndex = {
  // Normalised course code to the pattern areas it clears.
  byCourse: Map<string, string[]>;
  labels: Map<string, string>;
};

export function buildDoubleCountIndex(
  ge: GeneralEducation | null,
  pattern: Pattern,
  destination: Destination | null,
): DoubleCountIndex {
  const byCourse = new Map<string, string[]>();
  const labels = new Map<string, string>();
  if (!ge) return { byCourse, labels };

  // A pattern with no sourced requirements still has ASSIST's own areas, and
  // a course clearing one of those is still worth pointing at.
  const rules: AreaRule[] =
    pattern.areas.length > 0
      ? areasFor(pattern, destination)
      : ge.areas.map((a) => ({ id: a.code, label: a.name, courses: 0, semesterUnits: 0, from: [a.code] }));

  for (const rule of rules) labels.set(rule.id, rule.label);

  for (const entry of ge.byCourse) {
    const cleared = rules
      .filter((rule) => entry.areas.some((code) => rule.from.includes(code)))
      .map((rule) => rule.id);
    if (cleared.length > 0) byCourse.set(normalizeCode(entry.code), cleared);
  }

  return { byCourse, labels };
}

export const areasCleared = (index: DoubleCountIndex, code: string): string[] =>
  index.byCourse.get(normalizeCode(code)) ?? [];

// Every area an option's courses clear between them, deduped, so a two-course
// option that covers two areas reads as covering two.
export function optionAreas(index: DoubleCountIndex, option: AndGroup): string[] {
  const areas = new Set<string>();
  for (const course of option.courses) {
    for (const area of areasCleared(index, course.code)) areas.add(area);
  }
  return [...areas];
}

const total = (courses: Course[]) => courses.reduce((sum, c) => sum + c.units, 0);

// A better trade than the option the planner suggested: it clears a general
// education area the suggestion does not, so its extra units buy back a course
// somewhere else.
//
// Reported rather than chosen. The planner picks on units alone and says so,
// and quietly overriding that with a rule about a pattern the student may not
// even be following would be a worse kind of help than pointing at it.
export type BetterOption = {
  option: AndGroup;
  extraUnits: number;
  gains: string[];
};

export function betterByDoubleCount(
  index: DoubleCountIndex,
  options: AndGroup[],
  suggested: Course[],
): BetterOption | null {
  if (index.byCourse.size === 0 || options.length < 2) return null;

  const suggestedAreas = new Set(
    suggested.flatMap((c) => areasCleared(index, c.code)),
  );
  const suggestedUnits = total(suggested);

  const candidates = options
    .filter((o) => o.courses !== suggested)
    .map((option) => ({
      option,
      extraUnits: total(option.courses) - suggestedUnits,
      gains: optionAreas(index, option).filter((a) => !suggestedAreas.has(a)),
    }))
    .filter((c) => c.gains.length > 0)
    // An option that clears more areas for fewer or equal units is strictly
    // better; beyond that, prefer the one that costs least per area gained.
    .sort((a, b) => b.gains.length - a.gains.length || a.extraUnits - b.extraUnits);

  return candidates[0] ?? null;
}


// ------------------------------------------------- scheduling the pattern
//
// General education is most of what a student takes, so a route showing only
// major preparation understates a term badly. But ASSIST cannot say which
// course a student will use for an area, and this tool will not pick one for
// them: an area like Humanities has over a hundred certified courses at a
// single college. So the area itself is scheduled, carrying the units the
// pattern says it takes, and the student chooses the course.
//
// Areas already covered by the major-prep route are not scheduled again. That
// is the whole point of the double counting: those courses are already in the
// terms below as real courses.

import type { GeStatus } from './ge';
import type { ScheduleItem } from './schedule';
import { admissionNeeds } from './minimum';

// How the area's units split across the courses it takes. Cal-GETC Area 5 is
// seven units over two courses because one of them carries a one-unit
// laboratory, so it splits four and three rather than three and a half each.
// The larger goes first, so a part-finished area reports the more expensive
// remainder: overstating what is left is the safe direction.
export function splitUnits(totalUnits: number, courses: number): number[] {
  if (courses <= 0) return [];
  const base = Math.floor(totalUnits / courses);
  const remainder = totalUnits - base * courses;
  return Array.from({ length: courses }, (_, i) => (i < remainder ? base + 1 : base));
}

export function geScheduleItems(status: GeStatus): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  // Which of these slots the destination's own admission rule asks for. The
  // rest are certification: real work, but work neither system requires
  // before the application. See minimum.ts.
  const needs = admissionNeeds(
    patternFor(status.patternKey as PatternKey),
    status.destination,
    status.areas,
  );

  for (const area of status.areas) {
    if (area.required === 0) continue;

    // Already done, and already covered by a course in the route, both count.
    // Scheduling an area the route already clears would be telling a student
    // to take a course twice.
    const outstanding = area.required - area.done.length - area.planned.length;
    if (outstanding <= 0) continue;

    const units = splitUnits(area.semesterUnits, area.required);
    // Critical slots come first within the area, so the one the gate needs is
    // the one that gets a place when only part of an area fits.
    const critical = needs.get(area.id);
    for (let i = 0; i < outstanding; i++) {
      const admission = i < (critical?.count ?? 0);
      items.push({
        kind: 'area',
        units: units[i] ?? 3,
        areaId: area.id,
        label: area.label,
        pattern: status.pattern,
        priority: admission ? 'admission' : 'certification',
        ...(admission && critical?.need ? { need: critical.need } : {}),
      });
    }
  }

  return items;
}
