import { prereqsFor } from '../../../src/catalog/client';
import { badRequest, cached, failed, intParam, uncached, DAY } from '../../../src/assist/http';

// A college publishes its catalog once a year and then leaves it alone, so
// this is cached harder than anything else here. As with the ASSIST routes,
// the CDN in front of the function is what keeps the colleges' own servers
// from ever noticing this site.
const YEAR = 365 * DAY;

// A plan holds ten or so courses. The cap is well clear of that and exists so
// one request cannot be turned into a hundred fetches at a college.
const MAX_CODES = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const college = intParam(url, 'college');
  const codes = (url.searchParams.get('codes') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  if (college === null) {
    return badRequest('college is required and must be a positive integer.');
  }
  if (codes.length === 0) {
    return badRequest('codes is required: a comma separated list of course codes.');
  }
  if (codes.length > MAX_CODES) {
    return badRequest(`codes holds at most ${MAX_CODES} courses.`);
  }

  try {
    const answer = await prereqsFor(college, codes);
    // An answer with a failed fetch behind it is served, since most of a
    // catalog beats none, but never cached: the next student to plan this
    // asks again, instead of inheriting a blip for a year.
    return answer.complete ? cached(answer, YEAR) : uncached(answer);
  } catch (error) {
    return failed(error);
  }
}
