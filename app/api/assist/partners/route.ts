import { partners } from '../../../../src/assist/client';
import { badRequest, cached, failed, intParam, DAY } from '../../../../src/assist/http';

export async function GET(request: Request) {
  const college = intParam(new URL(request.url), 'college');
  if (college === null) return badRequest('college is required and must be a positive integer.');

  try {
    const rows = await partners(college);

    // ASSIST can list the same partner more than once. Merging the year lists
    // rather than taking the first entry means a year that exists under a
    // duplicate row is still offered.
    const years = new Map<number, Set<number>>();
    for (const row of rows) {
      const set = years.get(row.institutionParentId) ?? new Set<number>();
      for (const id of row.receivingYearIds ?? []) set.add(id);
      years.set(row.institutionParentId, set);
    }

    return cached(
      {
        partners: [...years.entries()]
          .map(([id, set]) => ({ id, years: [...set].sort((a, b) => b - a) }))
          .filter((p) => p.years.length > 0),
      },
      7 * DAY,
    );
  } catch (error) {
    return failed(error);
  }
}
