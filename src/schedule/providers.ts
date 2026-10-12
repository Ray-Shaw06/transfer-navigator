import { SCHEDULE_COVERAGE } from './coverage';
import { chooseTerm, sectionsFor, type Season, type TermChoice } from './pccServer';
import { chooseSdTerm, sdSectionsFor } from './sdccdServer';
import type { Section } from './types';

// Server only. One entry point for every covered college. Adding a district is
// an adapter, a case here, and a line in coverage.ts.

export async function termFor(college: number, season: Season, year: number): Promise<TermChoice | null> {
  switch (SCHEDULE_COVERAGE[college]?.provider) {
    case 'pcc':
      return chooseTerm(season, year);
    case 'sdccd':
      return chooseSdTerm(season, year);
    default:
      return null;
  }
}

export async function sectionsForCollege(college: number, termCode: string, courses: string[]): Promise<Section[]> {
  switch (SCHEDULE_COVERAGE[college]?.provider) {
    case 'pcc':
      return sectionsFor(termCode, courses);
    case 'sdccd':
      return sdSectionsFor(termCode, college, courses);
    default:
      return [];
  }
}
