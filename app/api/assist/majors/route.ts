import { majors } from '../../../../src/assist/client';
import { badRequest, cached, failed, intParam, DAY } from '../../../../src/assist/http';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sending = intParam(url, 'sending');
  const receiving = intParam(url, 'receiving');
  const year = intParam(url, 'year');

  if (sending === null || receiving === null || year === null) {
    return badRequest('sending, receiving and year are all required and must be positive integers.');
  }

  try {
    const reports = await majors(sending, receiving, year);
    return cached(
      { majors: reports.map((r) => ({ label: r.label, key: r.key })) },
      30 * DAY,
    );
  } catch (error) {
    return failed(error);
  }
}
