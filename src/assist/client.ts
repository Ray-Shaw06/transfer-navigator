import type {
  AssistAcademicYear,
  AssistInstitution,
  AssistPartner,
  AssistReport,
  AssistResult,
  AssistTransferabilityList,
} from './types';

// Server-side ASSIST client. This must never be imported into a browser
// bundle: ASSIST sends no CORS headers, so a browser fetch cannot reach it,
// and the token handling below assumes one long-lived process.

const ORIGIN = 'https://assist.org';

// ASSIST answers a browser, and sends a plain 400 to anything that does not
// look like one. This is the User-Agent of a current desktop Chrome.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export class AssistQuotaError extends Error {
  constructor() {
    super('ASSIST is rate limiting this site right now.');
    this.name = 'AssistQuotaError';
  }
}

export class AssistUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistUnavailableError';
  }
}

// ASSIST protects /api with ASP.NET's double-submit antiforgery: GET the site
// root once to be issued an X-XSRF-TOKEN cookie, then send that cookie AND
// the same value as an X-XSRF-TOKEN header on every API call. Cookie alone,
// header alone, and a forged value all return 400. No account is involved;
// this is not authentication and nothing here identifies a user.
type Token = { cookie: string; value: string };
let token: Token | null = null;
let inFlight: Promise<Token> | null = null;

async function fetchToken(): Promise<Token> {
  const response = await fetch(ORIGIN + '/', {
    headers: { 'User-Agent': USER_AGENT },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new AssistUnavailableError(`ASSIST returned ${response.status} for the token request.`);
  }

  // getSetCookie is the only way to read more than one Set-Cookie header.
  // ASSIST sets several; only X-XSRF-TOKEN matters, but the affinity cookies
  // are sent back too because the API is load balanced behind them.
  const jar = response.headers.getSetCookie?.() ?? [];
  const pairs = jar.map((line) => line.split(';')[0].trim()).filter(Boolean);
  const xsrf = pairs.find((p) => p.startsWith('X-XSRF-TOKEN='));
  if (!xsrf) {
    throw new AssistUnavailableError('ASSIST did not issue an antiforgery token.');
  }

  return { cookie: pairs.join('; '), value: decodeURIComponent(xsrf.slice('X-XSRF-TOKEN='.length)) };
}

// Concurrent cold requests would otherwise each bootstrap their own token,
// spending several of the very quota this exists to protect.
async function getToken(): Promise<Token> {
  if (token) return token;
  inFlight ??= fetchToken()
    .then((t) => {
      token = t;
      return t;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// ASSIST allows 50 API calls per 5 minutes per IP, and answers the 51st with
// the plain text "API calls quota exceeded! Maximum admitted 50 per 5m."
// instead of JSON. On Vercel every visitor shares this function's egress IP,
// so that ceiling is the whole site's budget, not one student's.
//
// The bucket is deliberately set below the ceiling so this site stops itself
// before ASSIST stops it, and so the UI can say something true about why.
// It is per-instance state, which under-counts when Vercel runs several
// instances at once. It is a safety margin, not a guarantee: the real
// defence is the CDN cache in front of the route handlers, which means a
// repeat request for the same agreement never reaches this file at all.
const WINDOW_MS = 5 * 60 * 1000;
const BUDGET = 40;
let calls: number[] = [];

function spend(): void {
  const now = Date.now();
  calls = calls.filter((t) => now - t < WINDOW_MS);
  if (calls.length >= BUDGET) throw new AssistQuotaError();
  calls.push(now);
}

export function quotaRemaining(): number {
  const now = Date.now();
  return Math.max(0, BUDGET - calls.filter((t) => now - t < WINDOW_MS).length);
}

async function call(path: string, retry = true): Promise<unknown> {
  spend();
  const { cookie, value } = await getToken();

  const response = await fetch(ORIGIN + path, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      Referer: ORIGIN + '/',
      Cookie: cookie,
      'X-XSRF-TOKEN': value,
    },
    // Caching is done in front of this file, at the CDN, keyed on the route
    // handler's own URL. Caching here as well would key on the token too,
    // which rotates, so every rotation would silently miss the whole cache.
    cache: 'no-store',
  });

  const body = await response.text();

  if (body.startsWith('API calls quota exceeded')) throw new AssistQuotaError();

  // A 400 is what ASSIST returns for a stale or missing token, so the first
  // one earns a fresh token and one more attempt. A second 400 is a real
  // rejection of the request itself.
  if (response.status === 400 && retry) {
    token = null;
    return call(path, false);
  }

  if (!response.ok) {
    throw new AssistUnavailableError(`ASSIST returned ${response.status} for ${path}.`);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new AssistUnavailableError(`ASSIST returned something that is not JSON for ${path}.`);
  }
}

export async function institutions(): Promise<AssistInstitution[]> {
  const data = await call('/api/institutions');
  if (!Array.isArray(data)) throw new AssistUnavailableError('Institution list was not a list.');
  return data as AssistInstitution[];
}

export async function academicYears(): Promise<AssistAcademicYear[]> {
  const data = await call('/api/AcademicYears');
  if (!Array.isArray(data)) throw new AssistUnavailableError('Academic year list was not a list.');
  return data as AssistAcademicYear[];
}

// Which receiving institutions this college actually has agreements with,
// and for which years. Without this the pickers offer dead ends: ASSIST
// publishes a catalog year well before the agreements for it exist, so
// 2026-2027 is a real, selectable year with no agreements under it for most
// pairs, and a student choosing it would be told, wrongly, that their
// college and campus have no agreement.
export async function partners(collegeId: number): Promise<AssistPartner[]> {
  const data = await call(`/api/institutions/${collegeId}/agreements`);
  if (!Array.isArray(data)) throw new AssistUnavailableError('Partner list was not a list.');
  return data as AssistPartner[];
}

export async function majors(
  sendingId: number,
  receivingId: number,
  academicYearId: number,
): Promise<AssistReport[]> {
  const data = (await call(
    `/api/agreements?receivingInstitutionId=${receivingId}&sendingInstitutionId=${sendingId}&academicYearId=${academicYearId}&categoryCode=major`,
  )) as { reports?: AssistReport[] } | null;
  return data?.reports ?? [];
}

// The courses a college certifies for a general education pattern. Cal-GETC
// replaced IGETC and CSU GE Breadth from Fall 2025, so a year before that
// returns an empty list rather than an error, and the caller has to say so
// rather than render an empty pattern as a finished one.
//
// listType wants the enum NAME. Passing the number 8 returns the CSU
// transferable course list with listType echoed back as 0: a wrong list that
// looks like a right one.
export async function transferability(
  institutionId: number,
  academicYearId: number,
  listType = 'CALGETC',
): Promise<AssistTransferabilityList> {
  const data = (await call(
    `/api/transferability/courses?institutionId=${institutionId}&academicYearId=${academicYearId}&listType=${encodeURIComponent(listType)}`,
  )) as AssistTransferabilityList | null;
  if (!data) throw new AssistUnavailableError('ASSIST returned no transferability list.');
  return data;
}

export async function agreement(key: string): Promise<AssistResult> {
  const data = (await call(`/api/articulation/Agreements?Key=${encodeURIComponent(key)}`)) as {
    result?: AssistResult;
    isSuccessful?: boolean;
  } | null;
  if (!data?.result) throw new AssistUnavailableError('ASSIST returned no agreement for that key.');
  return data.result;
}
