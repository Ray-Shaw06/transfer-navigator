import { afterEach, describe, expect, it, vi } from 'vitest';
import { prereqsFor } from '../../src/catalog/client';

// What a college's server does when asked for a course, by URL substring.
// Anything not listed answers 404, which is how a catalog says "no such
// course", and is an answer like any other.
type Reply = { status: number; body?: string } | Error;

const pasadena = (body: string) =>
  `<?xml version="1.0"?><courseinfo><course code="CS 003A"><![CDATA[<div class="courseblock"><span><strong>Prerequisite(s):</strong> <a onclick="return showCourse(this, 'CS 002');">CS 002</a></span><div class="courseblockdesc">3 units</div></div>]]></course></courseinfo>`;

function serve(replies: Record<string, Reply>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      const match = Object.keys(replies).find((k) => url.includes(k));
      const reply = match ? replies[match] : { status: 404 };
      if (reply instanceof Error) throw reply;
      return new Response(reply.body ?? '', { status: reply.status });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('whether an answer can be cached', () => {
  it('is complete when every course answered, found or not', async () => {
    serve({ 'code=CS%20003A': { status: 200, body: pasadena('') } });
    const answer = await prereqsFor(49, ['CS 003A', 'CS 999']);
    expect(answer.courses.map((c) => c.code)).toEqual(['CS 3A']);
    expect(answer.complete).toBe(true);
  });

  it('is not complete when a course could not be asked for', async () => {
    // A 503 today may be a 200 tomorrow, and an answer built on it must not
    // sit in the cache for a year.
    serve({ 'code=CS%20003A': { status: 200, body: pasadena('') }, 'code=CS%20999': { status: 503 } });
    const answer = await prereqsFor(49, ['CS 003A', 'CS 999']);
    expect(answer.courses.map((c) => c.code)).toEqual(['CS 3A']);
    expect(answer.complete).toBe(false);
  });

  it('is not complete when the network failed', async () => {
    serve({ 'code=CS%20003A': new TypeError('fetch failed') });
    const answer = await prereqsFor(49, ['CS 003A']);
    expect(answer.courses).toEqual([]);
    expect(answer.complete).toBe(false);
  });

  it('is not complete when a bot challenge stood in for the catalog', async () => {
    serve({ 'code=CS%20003A': { status: 202, body: '<html>challenge</html>' } });
    const answer = await prereqsFor(49, ['CS 003A']);
    expect(answer.complete).toBe(false);
  });

  it('is not complete when an eLumen tenant could not say which site it publishes', async () => {
    // Mission College. The site id has to be read before any course can be
    // asked for, so a blip there empties the whole answer.
    serve({ 'sites/publish?tenant': { status: 502 } });
    const answer = await prereqsFor(32, ['CIS 007']);
    expect(answer.supported).toBe(true);
    expect(answer.courses).toEqual([]);
    expect(answer.complete).toBe(false);
  });

  it('is complete for a college with no catalog reader', async () => {
    serve({});
    const answer = await prereqsFor(999999, ['CIS 007']);
    expect(answer.supported).toBe(false);
    expect(answer.complete).toBe(true);
  });
});
