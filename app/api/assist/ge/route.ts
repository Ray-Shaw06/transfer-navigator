import { transferability } from '../../../../src/assist/client';
import { toGeneralEducation } from '../../../../src/assist/ge';
import { badRequest, cached, failed, intParam, DAY } from '../../../../src/assist/http';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const college = intParam(url, 'college');
  const year = intParam(url, 'year');
  // Constrained to the three patterns this app knows, so the parameter cannot
  // be used to make this server fetch arbitrary ASSIST lists.
  const pattern = url.searchParams.get('pattern') ?? 'CALGETC';

  if (college === null || year === null) {
    return badRequest('college and year are both required and must be positive integers.');
  }
  if (!['CALGETC', 'IGETC', 'CSUGE'].includes(pattern)) {
    return badRequest('pattern must be CALGETC, IGETC or CSUGE.');
  }

  try {
    // Mapped here rather than in the browser: it strips a large response down
    // to the codes, titles, units and areas the plan actually reads, and the
    // CDN then caches the small useful thing.
    return cached(
      { ge: toGeneralEducation(await transferability(college, year, pattern), pattern) },
      30 * DAY,
    );
  } catch (error) {
    return failed(error);
  }
}
