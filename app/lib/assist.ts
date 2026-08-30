'use client';

import { useEffect, useState } from 'react';
import type { Agreement } from '../../src/parser/agreement';
import type { GeneralEducation } from '../../src/assist/ge';

export type Option = { id: number; name: string; system?: string };
export type YearOption = { id: number; label: string };
export type MajorOption = { label: string; key: string };
export type Partner = { id: number; years: number[] };
export type Catalog = { colleges: Option[]; campuses: Option[]; academicYears: YearOption[] };
export type Failure = { code: string; message: string };

// A body this app's own routes always send on failure. Anything else (a proxy
// error page, a dropped connection) falls back to a sentence written here.
export async function failureOf(response: Response): Promise<Failure> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    if (body.message) return { code: body.error ?? 'unavailable', message: body.message };
  } catch {
    // fall through
  }
  return { code: 'unavailable', message: 'Could not reach ASSIST. Try again in a moment.' };
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw await failureOf(response);
  return (await response.json()) as T;
}

// One shared fetch of the catalog, kept in module scope so the second and
// third page a visitor opens do not refetch a list that changes once a year.
// The CDN would serve it anyway; this saves the round trip.
let catalogPromise: Promise<Catalog> | null = null;

export function useCatalog(): { catalog: Catalog | null; failure: Failure | null } {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    let live = true;
    catalogPromise ??= getJson<Catalog>('/api/assist/institutions');
    catalogPromise
      .then((data) => live && setCatalog(data))
      .catch((error: Failure) => {
        // Let a failed load be retried by the next mount rather than caching
        // the failure for the life of the tab.
        catalogPromise = null;
        if (live) setFailure(error);
      });
    return () => {
      live = false;
    };
  }, []);

  return { catalog, failure };
}

export function usePartners(college: number | null): Partner[] | null {
  const [partners, setPartners] = useState<Partner[] | null>(null);

  useEffect(() => {
    if (college === null) {
      setPartners(null);
      return;
    }
    let live = true;
    setPartners(null);
    getJson<{ partners: Partner[] }>(`/api/assist/partners?college=${college}`)
      .then((data) => live && setPartners(data.partners))
      .catch(() => {
        // Handled by whatever the page shows when no partners arrive.
      });
    return () => {
      live = false;
    };
  }, [college]);

  return partners;
}

// Which years a student may actually pick for the pair they have chosen.
// ASSIST publishes a catalog year long before the agreements under it are
// written, so offering every published year tells students their college and
// campus have no agreement when the year is simply too new.
export function yearsFor(
  partners: Partner[] | null,
  campus: number | null,
  all: YearOption[],
): YearOption[] {
  const partner = partners?.find((p) => p.id === campus);
  if (!partner) return [];
  const available = new Set(partner.years);
  return all.filter((y) => available.has(y.id));
}

export type MajorsState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export function useMajors(
  college: number | null,
  campus: number | null,
  year: number | null,
): { majors: MajorOption[]; state: MajorsState; failure: Failure | null } {
  const [majors, setMajors] = useState<MajorOption[]>([]);
  const [state, setState] = useState<MajorsState>('idle');
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    if (college === null || campus === null || year === null) {
      setMajors([]);
      setState('idle');
      return;
    }

    let live = true;
    setState('loading');
    setMajors([]);
    setFailure(null);

    getJson<{ majors: MajorOption[] }>(
      `/api/assist/majors?sending=${college}&receiving=${campus}&year=${year}`,
    )
      .then((data) => {
        if (!live) return;
        setMajors(data.majors);
        setState(data.majors.length === 0 ? 'empty' : 'ready');
      })
      .catch((error: Failure) => {
        if (!live) return;
        setState('error');
        setFailure(error);
      });

    return () => {
      live = false;
    };
  }, [college, campus, year]);

  return { majors, state, failure };
}

export function useAgreement(key: string | null): {
  agreement: Agreement | null;
  loading: boolean;
  failure: Failure | null;
} {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    if (key === null) {
      setAgreement(null);
      return;
    }

    let live = true;
    setLoading(true);
    setFailure(null);
    setAgreement(null);

    getJson<{ agreement: Agreement }>(`/api/assist/agreement?key=${encodeURIComponent(key)}`)
      .then((data) => live && setAgreement(data.agreement))
      .catch((error: Failure) => live && setFailure(error))
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [key]);

  return { agreement, loading, failure };
}

// The general education pattern belongs to the college and the year, not the
// major, so it survives a change of major. A failure is swallowed: general
// education is additional to the plan and must not take the plan down.
export function useGeneralEducation(college: number | null, year: number | null): GeneralEducation | null {
  const [ge, setGe] = useState<GeneralEducation | null>(null);

  useEffect(() => {
    if (college === null || year === null) {
      setGe(null);
      return;
    }
    let live = true;
    setGe(null);
    getJson<{ ge: GeneralEducation }>(`/api/assist/ge?college=${college}&year=${year}`)
      .then((data) => live && setGe(data.ge))
      .catch(() => {
        // The panel simply does not appear.
      });
    return () => {
      live = false;
    };
  }, [college, year]);

  return ge;
}
