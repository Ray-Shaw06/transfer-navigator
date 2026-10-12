import { badRequest, cached, failed, intParam } from '../../../src/assist/http';
import { SCHEDULE_COVERAGE } from '../../../src/schedule/coverage';
import { sectionsForCollege, termFor } from '../../../src/schedule/providers';
import type { Season } from '../../../src/schedule/pccServer';

// Open seats change by the hour once registration opens, so this is cached for
// minutes, not days. Each provider reads its term into function memory once;
// see the *Server.ts files.
export const maxDuration = 30;

const MAX_COURSES = 20;
const COURSE = /^[A-Za-z&]{1,8}\s?[A-Za-z]?\d{1,4}[A-Za-z]{0,2}$/;
const SEASONS = new Set<string>(['Winter', 'Spring', 'Summer', 'Fall']);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const college = intParam(url, 'college');
  const [season, yearText] = (url.searchParams.get('term') ?? '').split('-');
  const year = Number(yearText);
  const courses = (url.searchParams.get('courses') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  if (college === null || !SCHEDULE_COVERAGE[college]) {
    return badRequest('college must be a college whose class schedule is supported.');
  }
  if (!SEASONS.has(season) || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return badRequest('term must look like Spring-2027.');
  }
  if (courses.length === 0 || courses.length > MAX_COURSES || !courses.every((c) => COURSE.test(c))) {
    return badRequest(`courses must be 1 to ${MAX_COURSES} course codes, comma separated.`);
  }

  try {
    const term = await termFor(college, season as Season, year);
    if (!term) return cached({ term: null, sections: [] }, 600);
    const sections = await sectionsForCollege(college, term.code, courses);
    return cached({ term, sections }, 600);
  } catch (error) {
    return failed(error);
  }
}
