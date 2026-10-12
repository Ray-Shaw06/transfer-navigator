import { badRequest, cached, failed } from '../../../../src/assist/http';
import { PCC_SCHOOL_ID, ratingFor, type Rating } from '../../../../src/schedule/rmp';

export const maxDuration = 30;

const MAX_NAMES = 40;
const NAME = /^[\p{L} .'-]{3,60}$/u;
const DAY = 24 * 60 * 60;

// Ratings change slowly, so a day at the CDN and a day in memory. A failed
// lookup for one name leaves that name unrated and does not fail the rest.
export async function GET(request: Request) {
  const names = [
    ...new Set(
      (new URL(request.url).searchParams.get('names') ?? '')
        .split('|')
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  ];
  if (names.length === 0 || names.length > MAX_NAMES || !names.every((n) => NAME.test(n))) {
    return badRequest(`names must be 1 to ${MAX_NAMES} instructor names, separated by |.`);
  }

  try {
    const ratings: Record<string, Rating | null> = {};
    const queue = [...names];
    // Four at a time, so a full term of instructors is a few seconds and the
    // upstream never sees a burst.
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let name = queue.shift(); name; name = queue.shift()) {
          ratings[name] = await ratingFor(name, PCC_SCHOOL_ID).catch(() => null);
        }
      }),
    );
    return cached({ ratings }, DAY);
  } catch (error) {
    return failed(error);
  }
}
