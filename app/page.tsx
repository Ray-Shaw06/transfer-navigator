'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseAgreement, UnrecognisedAgreementError } from '../src/parser/document';
import type { Agreement } from '../src/parser/agreement';
import { buildPlan } from '../src/planner/plan';
import { buildSchedule, currentTerm } from '../src/planner/schedule';
import { geStatus } from '../src/planner/ge';
import type { GeneralEducation as Ge } from '../src/assist/ge';
import { Dropzone } from './components/Dropzone';
import { CourseChooser } from './components/CourseChooser';
import { Verdict } from './components/Verdict';
import { RouteView } from './components/Route';
import { Requirements } from './components/Requirements';
import { GeneralEducation } from './components/GeneralEducation';
import { ThemeToggle } from './components/ThemeToggle';
import {
  PlanControls,
  SchoolPicker,
  type MajorOption,
  type Option,
  type PlanSettings,
  type YearOption,
} from './components/SchoolPicker';

type Catalog = { colleges: Option[]; campuses: Option[]; academicYears: YearOption[] };
type Partner = { id: number; years: number[] };
type Failure = { code: string; message: string };

// A body this app's own routes always send on failure. Anything else (a proxy
// error page, a dropped connection) falls back to a sentence written here.
async function failureOf(response: Response): Promise<Failure> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    if (body.message) return { code: body.error ?? 'unavailable', message: body.message };
  } catch {
    // fall through
  }
  return { code: 'unavailable', message: 'Could not reach ASSIST. Try again in a moment.' };
}

// Which years a student may actually pick for the pair they have chosen.
// ASSIST publishes a catalog year long before the agreements under it are
// written, so offering every published year tells students their college and
// campus have no agreement when the year is simply too new.
function yearsFor(partner: Partner | undefined, all: YearOption[]): YearOption[] {
  if (!partner) return [];
  const available = new Set(partner.years);
  return all.filter((y) => available.has(y.id));
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="bar" key={i} style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

export default function Home() {
  const earliest = useMemo(() => currentTerm(), []);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [college, setCollege] = useState<number | null>(null);
  const [campus, setCampus] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [majors, setMajors] = useState<MajorOption[]>([]);
  const [majorsState, setMajorsState] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>(
    'idle',
  );
  const [major, setMajor] = useState<string | null>(null);

  const [ge, setGe] = useState<Ge | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loadingAgreement, setLoadingAgreement] = useState(false);
  // Course codes the student has ticked, uppercased. Kept across agreement
  // changes on purpose: switching major at the same college does not change
  // what they have already taken, and a code that is irrelevant to the new
  // agreement simply matches nothing.
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [failure, setFailure] = useState<Failure | null>(null);
  const [uploadError, setUploadError] = useState('');

  const [settings, setSettings] = useState<PlanSettings>({
    start: earliest,
    unitsPerTerm: 12,
    includeSummer: false,
    target: null,
  });

  useEffect(() => {
    let live = true;
    fetch('/api/assist/institutions')
      .then(async (response) => {
        if (!response.ok) throw await failureOf(response);
        return (await response.json()) as Catalog;
      })
      .then((data) => live && setCatalog(data))
      .catch((error: Failure) => live && setFailure(error));
    return () => {
      live = false;
    };
  }, []);

  // Which campuses this college has agreements with, and for which years.
  // Fetched as soon as a college is chosen so the campus list is narrowed
  // before the student picks something that leads nowhere.
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
  // invalidate it, and a stale year sends the student to one this pair has no
  // agreement for.
  useEffect(() => {
    if (years.length === 0) {
      if (year !== null) setYear(null);
      return;
    }
    if (year === null || !years.some((y) => y.id === year)) setYear(years[0].id);
  }, [years, year]);

  // Only campuses this college can actually reach. Before a college is chosen
  // the full list shows, so the two dropdowns can be read in either order.
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

  // The general education pattern is a property of the college and the year,
  // not of the major, so it is fetched independently of the agreement and
  // survives a change of major. A failure here is never surfaced as an error:
  // general education is additional to the plan, and losing it must not take
  // the plan down with it.
  useEffect(() => {
    if (college === null || year === null) {
      setGe(null);
      return;
    }

    let live = true;
    setGe(null);

    fetch(`/api/assist/ge?college=${college}&year=${year}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        return (await response.json()) as { ge: Ge };
      })
      .then((data) => live && setGe(data.ge))
      .catch(() => {
        // Leave it null. The panel simply does not appear.
      });

    return () => {
      live = false;
    };
  }, [college, year]);

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
  // into memory in this tab and parsed here. It never reaches this app's own
  // API routes, which only ever carry a college, a campus and a major.
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
          ? 'That does not look like an ASSIST articulation agreement. Download yours from assist.org and try again. A scan or a photo will not work; it needs the PDF assist.org gives you.'
          : 'Could not read that PDF. Download the agreement again from assist.org and retry.',
      );
    }
  }, []);

  const plan = useMemo(
    () => (agreement ? buildPlan(agreement, [...completed]) : null),
    [agreement, completed],
  );

  // Courses the route still has the student taking, which is what can double
  // count toward a general education area.
  const geView = useMemo(() => {
    if (!ge || !plan || ge.areas.length === 0) return null;
    const planned = plan.remainingGroups.flatMap((g) => g.courses);
    return geStatus(ge, completed, planned);
  }, [ge, plan, completed]);

  const schedule = useMemo(
    () =>
      plan
        ? buildSchedule(plan.remainingGroups, {
            start: settings.start,
            unitsPerTerm: settings.unitsPerTerm,
            includeSummer: settings.includeSummer,
            target: settings.target,
          })
        : null,
    [plan, settings],
  );

  return (
    <main className="shell">
      <header className="masthead">
        <h1>
          <svg className="mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 20V6.5a2.5 2.5 0 0 1 2.5-2.5H19"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <circle cx="5" cy="20" r="2.2" fill="currentColor" />
            <circle cx="19" cy="4" r="2.2" fill="currentColor" />
          </svg>
          Transfer Navigator
        </h1>
        <ThemeToggle />
        <p>
          What you still need to transfer, term by term, read straight from the ASSIST articulation
          agreement.
        </p>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h2>Your agreement</h2>
          <p>116 California community colleges · 9 UC, 23 CSU and 33 private campuses</p>
        </div>

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
        ) : failure ? null : (
          <Skeleton rows={3} />
        )}
      </section>

      {failure && (
        <p
          role="alert"
          className="notice"
          data-tone={failure.code === 'quota' ? 'caution' : 'error'}
          style={{ marginTop: '1rem' }}
        >
          <strong>{failure.code === 'quota' ? 'ASSIST is busy' : 'Something went wrong'}</strong>
          {failure.message}
          {failure.code === 'quota' && (
            <span>
              The upload at the bottom of this page reads a PDF entirely inside this tab, so it
              works even when ASSIST will not answer.
            </span>
          )}
        </p>
      )}

      {loadingAgreement && (
        <section className="panel" style={{ marginTop: '1rem' }}>
          <Skeleton rows={4} />
        </section>
      )}

      {plan && schedule && agreement && (
        <>
          <section className="panel" style={{ marginTop: '1rem' }}>
            <div className="panel-head">
              <h2>Where you are</h2>
              <p>
                {agreement.major} · {agreement.sendingInstitution} to{' '}
                {agreement.receivingInstitution} · {agreement.academicYear}
              </p>
            </div>
            <CourseChooser agreement={agreement} chosen={completed} onChange={setCompleted} />
          </section>

          <section className="panel" style={{ marginTop: '1rem' }}>
            <div className="panel-head">
              <h2>How you want to go</h2>
            </div>
            <PlanControls settings={settings} earliest={earliest} onChange={setSettings} />
          </section>

          <Verdict plan={plan} schedule={schedule} target={settings.target} />

          {schedule.terms.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2>Your route</h2>
                <p>
                  Grouped by unit load. Agreements list no prerequisites, so confirm the order with
                  a counselor.
                </p>
              </div>
              <RouteView schedule={schedule} unitsPerTerm={settings.unitsPerTerm} />
            </section>
          )}

          <section className="panel" style={{ marginTop: '1rem' }}>
            <div className="panel-head">
              <h2>Every requirement</h2>
              <p>Grouped the way the agreement groups them</p>
            </div>
            <Requirements plan={plan} />
          </section>

          {geView && (
            <section className="panel" style={{ marginTop: '1rem' }}>
              <div className="panel-head">
                <h2>General education</h2>
                <p>
                  {geView.pattern} at {agreement.sendingInstitution} · {geView.academicYear}
                </p>
              </div>
              <GeneralEducation status={geView} />
            </section>
          )}

          {plan.notes.length > 0 && (
            <section className="panel">
              <details>
                <summary className="field-label" style={{ cursor: 'pointer', marginBottom: 0 }}>
                  Notes from {agreement.receivingInstitution} ({plan.notes.length})
                </summary>
                <div className="notes-body">
                  {plan.notes.map((note, i) => (
                    <p key={i}>{note}</p>
                  ))}
                </div>
              </details>
              <p className="field-note" style={{ marginTop: '0.75rem' }}>
                Their words, unedited. They carry rules this tool does not check, including grade
                minimums and whether the major takes TAG.
              </p>
            </section>
          )}

          <div className="scope">
            <p>
              <b>What this covers.</b> Major preparation on this one agreement, and nothing else.
            </p>
            <p>
              <b>What it does not.</b> General education and IGETC, the minimum transferable units
              your campus asks for, GPA, and admission itself. Confirm all of that with a counselor
              before you register.
            </p>
            <p>
              <b>Where it can be wrong.</b> When a course you finished could count toward two
              requirements it is credited to the first one only, so this can understate what you
              have done. It never overstates it.
            </p>
          </div>
        </>
      )}

      <details className="fallback">
        <summary>Or upload an agreement PDF instead</summary>
        <div className="fallback-body">
          <p className="field-note">
            For anything ASSIST will not serve this site: a pair of schools or a year the picker
            cannot reach, or an agreement you already saved. Download it from{' '}
            <a href="https://assist.org" target="_blank" rel="noreferrer">
              assist.org
            </a>
            . The file is read in this browser tab and never uploaded.
          </p>
          <Dropzone onFile={onFile} error={uploadError} />
        </div>
      </details>

      <footer className="site-footer">
        <p>
          Not affiliated with ASSIST, the University of California, the California State University,
          or any college. Agreement data comes from{' '}
          <a href="https://assist.org" target="_blank" rel="noreferrer">
            assist.org
          </a>
          , which is the official source and the one to trust if this ever disagrees with it.
        </p>
      </footer>
    </main>
  );
}
