import { SCHEDULE_COVERAGE } from './coverage';
import { chooseTerm, sectionsFor, type Season, type TermChoice } from './pccServer';
import { chooseSdTerm, sdSectionsFor } from './sdccdServer';
import { chooseNocTerm, nocSectionsFor } from './nocccdServer';
import { bannerSectionsFor, chooseBannerTerm } from './banner9Server';
import type { Section } from './types';

// Server only. One entry point for every covered college. Adding a district is
// an adapter, a case here, and a line in coverage.ts.

export async function termFor(college: number, season: Season, year: number): Promise<TermChoice | null> {
  switch (SCHEDULE_COVERAGE[college]?.provider) {
    case 'pcc':
      return chooseTerm(season, year);
    case 'sdccd':
      return chooseSdTerm(season, year);
    case 'nocccd':
      return chooseNocTerm(season, year);
    case 'banner9':
      return chooseBannerTerm(college, season, year);
    default:
      return null;
  }
}

export async function sectionsForCollege(college: number, term: TermChoice, courses: string[]): Promise<Section[]> {
  switch (SCHEDULE_COVERAGE[college]?.provider) {
    case 'pcc':
      return sectionsFor(term.code, courses);
    case 'sdccd':
      return sdSectionsFor(term.code, college, courses);
    case 'nocccd':
      return nocSectionsFor(term, college, courses);
    case 'banner9':
      return bannerSectionsFor(term, college, courses);
    default:
      return [];
  }
}
