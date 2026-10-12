import { badRequest, cached, failed } from '../../../../src/assist/http';
import { chooseTerm, sectionsFor, type Season } from '../../../../src/schedule/pccServer';

// A schedule for a term is open seats, which change by the hour once
// registration opens, so this is cached for minutes, not days. The term itself
// is read once into the function's memory; see pccServer.ts.
export const maxDuration = 30;

const MAX_COURSES = 20;
const COURSE = /^[A-Za-z&]{1,8}\s?[A-Za-z]?\d{1,4}[A-Za-z]{0,2}$/;
const SEASONS = new Set<string>(['Winter', 'Spring', 'Summer', 'Fall']);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const [season, yearText] = (url.searchParams.get('term') ?? '').split('-');
  const year = Number(yearText);
  const courses = (url.searchParams.get('courses') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  if (!SEASONS.has(season) || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return badRequest('term must look like Spring-2027.');
  }
  if (courses.length === 0 || courses.length > MAX_COURSES || !courses.every((c) => COURSE.test(c))) {
    return badRequest(`courses must be 1 to ${MAX_COURSES} course codes, comma separated.`);
  }

  try {
    const term = await chooseTerm(season as Season, year);
    if (!term) return cached({ term: null, sections: [] }, 600);
    const sections = await sectionsFor(term.code, courses);
    return cached({ term, sections }, 600);
  } catch (error) {
    return failed(error);
  }
}
