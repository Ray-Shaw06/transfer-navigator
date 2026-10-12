// Instructor ratings from RateMyProfessors, for ranking sections.
//
// This reads the public GraphQL endpoint the RateMyProfessors website itself
// uses. It is not a documented or licensed API, and the site's terms restrict
// automated access, so treat it as something that can stop working or be
// withdrawn. Everything degrades without it: a section with no rating is simply
// unranked on professor. Only the summary numbers are kept, with a link back to
// the professor's page for the reviews. No review text is read or shown.

export type Rating = {
  rating: number;
  difficulty: number;
  count: number;
  wouldTakeAgain: number | null;
  department: string;
  url: string;
};

export type Candidate = {
  legacyId: number;
  firstName: string;
  lastName: string;
  department: string;
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
  wouldTakeAgainPercent: number;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// A rating from two reviews is noise. Below this the instructor is treated as
// unrated rather than being ranked on almost nothing.
export const MIN_RATINGS = 3;

// Search returns fuzzy matches, so "Juan Leon" also returns every other Juan.
// A match has to agree on first and last name, and where two instructors share
// both, the one with more ratings wins. A middle name on either side is
// ignored. No match, or too few ratings, is no rating.
export function matchTeacher(name: string, candidates: Candidate[]): Rating | null {
  const parts = norm(name).split(' ').filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const hits = candidates
    .filter((c) => norm(c.firstName).split(' ')[0] === first && norm(c.lastName).split(' ').pop() === last)
    .sort((a, b) => b.numRatings - a.numRatings);
  const best = hits[0];
  if (!best || best.numRatings < MIN_RATINGS) return null;
  return {
    rating: best.avgRating,
    difficulty: best.avgDifficulty,
    count: best.numRatings,
    wouldTakeAgain: best.wouldTakeAgainPercent >= 0 ? Math.round(best.wouldTakeAgainPercent) : null,
    department: best.department,
    url: `https://www.ratemyprofessors.com/professor/${best.legacyId}`,
  };
}

const ENDPOINT = 'https://www.ratemyprofessors.com/graphql';
// The public client credential the RateMyProfessors website sends with its own
// requests. It is not a secret and identifies no account.
const CLIENT_AUTH = 'Basic dGVzdDp0ZXN0';

// Pasadena City College on RateMyProfessors.
export const PCC_SCHOOL_ID = 'U2Nob29sLTI2NDk=';

const QUERY = `query($q:TeacherSearchQuery!){newSearch{teachers(query:$q,first:8){edges{node{legacyId firstName lastName department avgRating avgDifficulty numRatings wouldTakeAgainPercent}}}}}`;

const cache = new Map<string, { at: number; rating: Rating | null }>();
const DAY_MS = 24 * 60 * 60 * 1000;

export async function ratingFor(name: string, schoolId: string): Promise<Rating | null> {
  const key = `${schoolId}:${norm(name)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DAY_MS) return hit.rating;

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: CLIENT_AUTH },
    body: JSON.stringify({ query: QUERY, variables: { q: { text: name, schoolID: schoolId } } }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`ratings lookup answered ${response.status}`);
  const body = (await response.json()) as {
    data?: { newSearch?: { teachers?: { edges?: { node: Candidate }[] } } };
  };
  const nodes = (body.data?.newSearch?.teachers?.edges ?? []).map((e) => e.node);
  const rating = matchTeacher(name, nodes);
  cache.set(key, { at: Date.now(), rating });
  return rating;
}
