import { afterEach, describe, expect, it, vi } from 'vitest';
import { bannerSectionsFor } from '../../src/schedule/banner9Server';

// A host may cap a results page below the size asked for. The server module has
// to keep going until it has the server's own total, or whole colleges in a
// shared district silently vanish.
const row = (n: number, campus: string) => ({
  courseReferenceNumber: String(10000 + n),
  subject: 'MATH',
  courseNumber: 'A180',
  courseTitle: 'Calculus',
  campusDescription: campus,
  creditHours: 4,
  creditHourLow: 4,
  seatsAvailable: 5,
  waitCount: 0,
  openSection: true,
  instructionalMethodDescription: null,
  faculty: [],
  meetingsFaculty: [],
});

afterEach(() => vi.unstubAllGlobals());

describe('Banner 9 paging', () => {
  it('follows the total count when the server caps a page at 200', async () => {
    const TOTAL = 450;
    const CAP = 200;
    const requested: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/term/search')) {
          return new Response('{}', { status: 200, headers: { 'set-cookie': 'JSESSIONID=abc; Path=/' } });
        }
        const offset = Number(new URL(url).searchParams.get('pageOffset'));
        requested.push(offset);
        expect((init?.headers as Record<string, string>).Cookie).toContain('JSESSIONID=abc');
        const data = Array.from({ length: Math.min(CAP, TOTAL - offset) }, (_, i) =>
          // The college we want is last in the sort order, so it only appears
          // on the final page.
          row(offset + i, offset + i < 300 ? 'Coastline' : 'Orange Coast'),
        );
        return Response.json({ success: true, totalCount: TOTAL, data });
      }),
    );

    const sections = await bannerSectionsFor({ code: '999901', label: 'Spring 2099', estimate: false }, 74, ['MATH A180']);
    expect(requested).toEqual([0, 200, 400]);
    expect(sections).toHaveLength(150);
    expect(sections.every((s) => s.campus === 'Orange Coast')).toBe(true);
  });
});
