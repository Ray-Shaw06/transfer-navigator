import { agreement } from '../../../../src/assist/client';
import { toAgreement } from '../../../../src/assist/agreement';
import { badRequest, cached, failed, DAY } from '../../../../src/assist/http';

// Keys look like "76/49/to/120/Major/<uuid>" and come straight back from the
// majors route. Validating the shape keeps this handler from being used to
// make this server fetch arbitrary ASSIST paths on someone's behalf.
const KEY = /^\d+\/\d+\/to\/\d+\/Major\/[0-9a-fA-F-]{36}$/;

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('key');
  if (!key || !KEY.test(key)) {
    return badRequest('key must be an ASSIST major agreement key, as returned by the majors route.');
  }

  try {
    // Mapped here rather than in the browser: it keeps ASSIST's 80KB of
    // response off the wire, keeps the mapper out of the client bundle, and
    // means the CDN caches the small useful thing instead of the big raw one.
    return cached({ agreement: toAgreement(await agreement(key)) }, 30 * DAY);
  } catch (error) {
    return failed(error);
  }
}
