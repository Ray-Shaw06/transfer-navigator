'use client';

import { useCallback, useEffect, useState } from 'react';
import { parseAgreement, UnrecognisedAgreementError, type Agreement } from '../src/parser/document';
import { buildPlan, type Plan } from '../src/planner/plan';
import { Dropzone } from './components/Dropzone';
import { CourseInput } from './components/CourseInput';
import { PlanView } from './components/PlanView';
import {
  SchoolPicker,
  type MajorOption,
  type Option,
  type YearOption,
} from './components/SchoolPicker';

type Catalog = { colleges: Option[]; campuses: Option[]; academicYears: YearOption[] };
type Partner = { id: number; years: number[] };
type Failure = { code: string; message: string };

// A body this app's own routes always send on failure. Anything else (a
// proxy error page, a network drop) falls back to a sentence written here.
async function failureOf(response: Response): Promise<Failure> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    if (body.message) return { code: body.error ?? 'unavailable', message: body.message };
  } catch {
    // fall through
  }
  return { code: 'unavailable', message: 'Could not reach ASSIST. Try again in a moment.' };
}

// Which years a student may actually pick, for the pair they have chosen.
// ASSIST publishes a catalog year long before the agreements under it are
// written: on the day this was built, 2026-2027 was a selectable year with
// zero agreements for most pairs. Offering it would tell a student their
// college and campus have no agreement at all, which is false. So the year
// list is whatever ASSIST says exists for that pair, newest first, and the
// default is the newest of those rather than today's date.
function yearsFor(partner: Partner | undefined, all: YearOption[]): YearOption[] {
  if (!partner) return [];
  const available = new Set(partner.years);
  return all.filter((y) => available.has(y.id));
}

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [college, setCollege] = useState<number | null>(null);
  const [campus, setCampus] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [majors, setMajors] = useState<MajorOption[]>([]);
  const [majorsState, setMajorsState] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  const [major, setMajor] = useState<string | null>(null);

  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loadingAgreement, setLoadingAgreement] = useState(false);
  const [completed, setCompleted] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    let live = true;
    fetch('/api/assist/institutions')
      .then(async (response) => {
        if (!response.ok) throw await failureOf(response);
        return (await response.json()) as Catalog;
      })
      .then((data) => {
        if (!live) return;
        setCatalog(data);
      })
      .catch((error: Failure) => live && setFailure(error));
    return () => {
      live = false;
    };
  }, []);

  // Which campuses this college has agreements with, and for which years.
  // Fetched as soon as a college is chosen so the campus list can be
  // narrowed before the student picks a campus that leads nowhere.
  useEffect(() => {
    if (college === null) {
      setPartners(null);
      return;
    }

    let live = true;
    setPartners(null);
    setFailure(null);

    fetch(`/api/assist/partners?college=${college}`)
      .then(async (response) => {
        if (!response.ok) throw await failureOf(response);
        return (await response.json()) as { partners: Partner[] };
      })
      .then((data) => live && setPartners(data.partners))
      .catch((error: Failure) => live && setFailure(error));

    return () => {
      live = false;
    };
  }, [college]);

  const partner = partners?.find((p) => p.id === campus);
  const years = yearsFor(partner, catalog?.academicYears ?? []);

  // Keep the chosen year valid for the chosen pair. Changing campus can
  // invalidate it, and leaving a stale year selected would send the student
  // to a year this pair has no agreement for.
  useEffect(() => {
    if (years.length === 0) {
      if (year !== null) setYear(null);
      return;
    }
    if (year === null || !years.some((y) => y.id === year)) setYear(years[0].id);
  }, [years, year]);

  // Only campuses this college can actually reach. Before a college is
  // chosen the full list is shown, so the two dropdowns can be read in
  // either order.
  const campuses = (catalog?.campuses ?? []).filter(
    (c) => partners === null || partners.some((p) => p.id === c.id),
  );

  useEffect(() => {
    if (college === null || campus === null || year === null) {
      setMajors([]);
      setMajorsState('idle');
      return;
    }

    let live = true;
    setMajorsState('loading');
    setMajors([]);
    setMajor(null);
    setAgreement(null);
    setFailure(null);

    fetch(`/api/assist/majors?sending=${college}&receiving=${campus}&year=${year}`)
      .then(async (response) => {
        if (!response.ok) throw await failureOf(response);
        return (await response.json()) as { majors: MajorOption[] };
      })
      .then((data) => {
        if (!live) return;
        setMajors(data.majors);
        setMajorsState(data.majors.length === 0 ? 'empty' : 'ready');
      })
      .catch((error: Failure) => {
        if (!live) return;
        setMajorsState('error');
        setFailure(error);
      });

    return () => {
      live = false;
    };
  }, [college, campus, year]);

  useEffect(() => {
    if (major === null) return;

    let live = true;
    setLoadingAgreement(true);
    setFailure(null);
    setAgreement(null);

    fetch(`/api/assist/agreement?key=${encodeURIComponent(major)}`)
      .then(async (response) => {
        if (!response.ok) throw await failureOf(response);
        return (await response.json()) as { agreement: Agreement };
      })
      .then((data) => live && setAgreement(data.agreement))
      .catch((error: Failure) => live && setFailure(error))
      .finally(() => {
        if (live) setLoadingAgreement(false);
      });

    return () => {
      live = false;
    };
  }, [major]);

  // The upload path is unchanged and still entirely local: the file is read
  // into memory in this tab and parsed here. It is never sent to this app's
  // own API routes, which only ever carry a college, a campus and a major.
  const onFile = useCallback(async (file: File) => {
    try {
      setUploadError('');
      setFailure(null);
      setMajor(null);
      const bytes = new Uint8Array(await file.arrayBuffer());
      setAgreement(await parseAgreement(bytes));
    } catch (err) {
      setAgreement(null);
      setUploadError(
        err instanceof UnrecognisedAgreementError
          ? 'That file does not look like an ASSIST articulation agreement. Download yours from assist.org and try again. A scanned or photographed agreement will not work, it needs to be the PDF assist.org gives you.'
          : 'Could not read that PDF. Download the agreement again from assist.org and retry.',
      );
    }
  }, []);

  const plan: Plan | null = agreement
    ? buildPlan(
        agreement,
        completed
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  return (
    <main>
      <h1>Transfer Navigator</h1>
      <p className="tagline">
        Pick your community college, where you want to transfer, and your major. This shows what
        you still need, straight from the ASSIST articulation agreement.
      </p>

      {catalog ? (
        <SchoolPicker
          colleges={catalog.colleges}
          campuses={campuses}
          years={years}
          majors={majors}
          college={college}
          campus={campus}
          year={year}
          major={major}
          majorsState={majorsState}
          onCollege={setCollege}
          onCampus={setCampus}
          onYear={setYear}
          onMajor={setMajor}
        />
      ) : (
        !failure && <p className="loading">Loading the list of colleges…</p>
      )}

      {failure && (
        <div role="alert" className={failure.code === 'quota' ? 'warning' : 'error'}>
          <p>{failure.message}</p>
          {failure.code === 'quota' && (
            <p>
              The upload route below reads a PDF entirely inside this browser tab, so it works
              even when ASSIST will not answer this site.
            </p>
          )}
        </div>
      )}

      {loadingAgreement && <p className="loading">Reading the agreement…</p>}

      {agreement && (
        <>
          <p className="agreement-header">
            {agreement.major}, {agreement.sendingInstitution} to {agreement.receivingInstitution},{' '}
            {agreement.academicYear}
          </p>
          <CourseInput value={completed} onChange={setCompleted} />
        </>
      )}

      {plan && <PlanView plan={plan} />}

      <details className="fallback">
        <summary>Or upload an agreement PDF instead</summary>
        <p>
          For anything ASSIST will not serve this site: a year or a pair of schools the picker
          above cannot reach, or an agreement you already have saved. Download it from{' '}
          <a href="https://assist.org" target="_blank" rel="noreferrer">
            assist.org
          </a>{' '}
          and drop it here. The file is read in this browser tab and never uploaded.
        </p>
        <Dropzone onFile={onFile} error={uploadError} />
      </details>

      <footer className="site-footer">
        <p>
          Not affiliated with ASSIST, the University of California, the California State
          University, or any college. Agreement data comes from{' '}
          <a href="https://assist.org" target="_blank" rel="noreferrer">
            assist.org
          </a>
          , which is the official source. Confirm anything here with a counselor before you
          register.
        </p>
      </footer>
    </main>
  );
}
