import { NextResponse } from 'next/server';
import { AssistQuotaError, AssistUnavailableError } from './client';
import { UnrecognisedAgreementError } from '../parser/document';

// Agreements are republished about once a year, and the institution list
// changes about as often, so these are cached hard. The cache lives at
// Vercel's CDN, in front of the function: a second student asking for the
// same agreement is served without the function running and without ASSIST
// being called at all. That, not the token bucket in client.ts, is what
// keeps this site inside ASSIST's 50-calls-per-5-minutes ceiling.
export const DAY = 60 * 60 * 24;

export function cached<T>(body: T, seconds: number): NextResponse {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${DAY}`,
    },
  });
}

// Every failure is uncached, so a blip does not stick to a URL for a month.
// The `error` field is a code the UI switches on; `message` is only ever
// shown as supporting detail.
export function failed(error: unknown): NextResponse {
  const headers = { 'Cache-Control': 'no-store' };

  if (error instanceof AssistQuotaError) {
    return NextResponse.json(
      {
        error: 'quota',
        message:
          'ASSIST limits how often this site may ask it for data, and that limit is reached for the moment. Wait a few minutes, or use the PDF upload below, which does not go through ASSIST at all.',
      },
      { status: 503, headers },
    );
  }

  if (error instanceof UnrecognisedAgreementError) {
    return NextResponse.json(
      {
        error: 'unrecognised',
        message: 'ASSIST returned something this tool could not read as an agreement.',
      },
      { status: 422, headers },
    );
  }

  if (error instanceof AssistUnavailableError) {
    return NextResponse.json({ error: 'unavailable', message: error.message }, { status: 502, headers });
  }

  return NextResponse.json(
    { error: 'unavailable', message: 'Could not reach ASSIST.' },
    { status: 502, headers },
  );
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: 'bad_request', message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
}

// A required integer query parameter. Returns null rather than NaN so the
// caller has one thing to check.
export function intParam(url: URL, name: string): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}
