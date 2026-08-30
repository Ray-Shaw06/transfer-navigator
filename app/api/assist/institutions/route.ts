import { academicYears, institutions } from '../../../../src/assist/client';
import { cached, failed, DAY } from '../../../../src/assist/http';

// ASSIST's own numbering for what kind of school an institution is.
const SYSTEMS: Record<number, string> = {
  0: 'CSU',
  1: 'UC',
  2: 'California Community College',
  5: 'Private or independent',
};

// A school can be listed under several names over the years (a campus
// renamed, for instance). The first entry is the current one, and entries
// flagged hideInList are not meant to be offered.
function displayName(names: { name: string; hideInList?: boolean }[] | undefined): string | null {
  const visible = (names ?? []).filter((n) => !n.hideInList);
  return visible[0]?.name ?? null;
}

export async function GET() {
  try {
    const [all, years] = await Promise.all([institutions(), academicYears()]);

    const colleges = [];
    const campuses = [];
    for (const school of all) {
      const name = displayName(school.names);
      if (!name) continue;
      if (school.isCommunityCollege) {
        colleges.push({ id: school.id, name });
      } else {
        campuses.push({ id: school.id, name, system: SYSTEMS[school.category] ?? 'Other' });
      }
    }

    const compare = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    colleges.sort(compare);
    campuses.sort(compare);

    return cached(
      {
        colleges,
        campuses,
        // Newest first. ASSIST publishes years ahead of time, and an
        // agreement for a year that has not started yet is still the right
        // one to plan against.
        academicYears: [...years]
          .sort((a, b) => b.fallYear - a.fallYear)
          .map((y) => ({ id: y.id, label: `${y.fallYear}-${y.fallYear + 1}` })),
      },
      7 * DAY,
    );
  } catch (error) {
    return failed(error);
  }
}
