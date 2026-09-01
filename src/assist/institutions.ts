import type { AssistInstitution } from './types';

// Which name to show a student for a school that has had more than one.
//
// ASSIST keeps every name a school has ever been listed under, oldest first,
// and stamps each rename with the year it took effect. The original entry
// carries no fromYear at all. Taking the first entry therefore shows the name
// the school stopped using, which is how this site listed three CSU campuses
// under names none of them answer to any more:
//
//   Humboldt State University        -> California Polytechnic University, Humboldt   (2021)
//   California State University, Hayward -> California State University, East Bay     (2005)
//   California Maritime Academy     -> California State University, Maritime Academy  (2015)
//
// A student looking for Cal Poly Humboldt in the campus list did not find it,
// and had no way to know it was in there under a name from before they were
// born. Eight of ASSIST's 181 institutions carry more than one visible name.
//
// The newest name wins rather than the name in force for the catalog year
// being planned. A student searches this list for the campus they are
// applying to today, which is the campus under its current name; the
// agreement itself still prints whatever ASSIST prints on it.
export function currentName(names: AssistInstitution['names']): string | null {
  const visible = (names ?? []).filter((n) => !n.hideInList && n.name?.trim());
  if (visible.length === 0) return null;

  // Reduce rather than sort: ties keep the entry ASSIST listed later, which is
  // the later rename, and an absent fromYear is the original name.
  const newest = visible.reduce((best, entry) =>
    (entry.fromYear ?? -Infinity) >= (best.fromYear ?? -Infinity) ? entry : best,
  );
  return newest.name.trim();
}
