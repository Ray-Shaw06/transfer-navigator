import type { PlanSettings } from '../components/SchoolPicker';
import type { TermKind, TermRef } from '../../src/planner/schedule';
import type { PatternKey } from '../../src/planner/patterns';

// The whole plan lives in the query string: a refresh keeps it, the back
// button works, and a student can send the link to a counselor or a friend
// and they see exactly the same plan. Nothing is stored on a server, because
// nothing needs to be.

export type PlanUrlState = {
  college: number | null;
  campus: number | null;
  year: number | null;
  major: string | null;
  completed: Set<string>;
  settings: PlanSettings | null;
  // Null means the catalog year decides, which is the usual case. Only an
  // explicit choice rides in the link.
  pattern: PatternKey | null;
};

const encodeTerm = (ref: TermRef) => `${ref.kind}-${ref.year}`;

function decodeTerm(value: string | null): TermRef | null {
  if (!value) return null;
  const [kind, year] = value.split('-');
  if (!['Fall', 'Spring', 'Summer'].includes(kind)) return null;
  const parsed = Number(year);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return null;
  return { kind: kind as TermKind, year: parsed };
}

function decodeInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// Keys are ASSIST's own agreement keys. Validated to the same shape the API
// route accepts, so a hand-edited link cannot point this at anything else.
const KEY = /^\d+\/\d+\/to\/\d+\/Major\/[0-9a-fA-F-]{36}$/;

export function readPlanUrl(search: string): PlanUrlState {
  const params = new URLSearchParams(search);

  const major = params.get('major');
  const start = decodeTerm(params.get('start'));
  const load = decodeInt(params.get('load'));

  return {
    college: decodeInt(params.get('college')),
    campus: decodeInt(params.get('campus')),
    year: decodeInt(params.get('year')),
    major: major && KEY.test(major) ? major : null,
    completed: new Set(
      (params.get('done') ?? '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
    ),
    pattern: (['CALGETC', 'IGETC', 'CSUGE'] as const).find((k) => k === params.get('pattern')) ?? null,
    settings: start
      ? {
          start,
          unitsPerTerm: load ?? 12,
          includeSummer: params.get('summer') === '1',
          target: decodeTerm(params.get('target')),
        }
      : null,
  };
}

export function writePlanUrl(state: {
  college: number | null;
  campus: number | null;
  year: number | null;
  major: string | null;
  completed: Set<string>;
  settings: PlanSettings;
  pattern: PatternKey | null;
}): string {
  const params = new URLSearchParams();
  if (state.college !== null) params.set('college', String(state.college));
  if (state.campus !== null) params.set('campus', String(state.campus));
  if (state.year !== null) params.set('year', String(state.year));
  if (state.major) params.set('major', state.major);
  if (state.completed.size > 0) params.set('done', [...state.completed].sort().join(','));
  if (state.pattern) params.set('pattern', state.pattern);

  // Settings only ride along once there is a plan to apply them to, so a bare
  // link does not carry four parameters that mean nothing yet.
  if (state.major) {
    params.set('start', encodeTerm(state.settings.start));
    params.set('load', String(state.settings.unitsPerTerm));
    if (state.settings.includeSummer) params.set('summer', '1');
    if (state.settings.target) params.set('target', encodeTerm(state.settings.target));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}
