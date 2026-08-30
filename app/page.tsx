'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseAgreement, UnrecognisedAgreementError } from '../src/parser/document';
import type { Agreement } from '../src/parser/agreement';
import { buildPlan } from '../src/planner/plan';
import { buildSchedule, currentTerm } from '../src/planner/schedule';
import { geStatus } from '../src/planner/ge';
import { Dropzone } from './components/Dropzone';
import { CourseChooser } from './components/CourseChooser';
import { Verdict } from './components/Verdict';
import { RouteView } from './components/Route';
import { Requirements } from './components/Requirements';
import { GeneralEducation } from './components/GeneralEducation';
import { ShareLink } from './components/ShareLink';
import { PlanControls, SchoolPicker, type PlanSettings } from './components/SchoolPicker';
import {
  useAgreement,
  useCatalog,
  useGeneralEducation,
  useMajors,
  usePartners,
  yearsFor,
} from './lib/assist';
import { readPlanUrl, writePlanUrl } from './lib/urlState';

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

  // Read once, synchronously, before anything fetches. Reading it in an effect
  // instead would let the pickers settle on empty values first and then jump.
  const initial = useMemo(
    () => readPlanUrl(typeof window === 'undefined' ? '' : window.location.search),
    [],
  );

  const [college, setCollege] = useState<number | null>(initial.college);
  const [campus, setCampus] = useState<number | null>(initial.campus);
  const [year, setYear] = useState<number | null>(initial.year);
  const [major, setMajor] = useState<string | null>(initial.major);
  const [completed, setCompleted] = useState<Set<string>>(initial.completed);
  const [settings, setSettings] = useState<PlanSettings>(
    initial.settings ?? { start: earliest, unitsPerTerm: 12, includeSummer: false, target: null },
  );

  // A major restored from the link. The majors effect clears the selection
  // whenever the pair changes, which on the very first run would throw away
  // the one the link asked for, so it is handed back exactly once.
  const restoredMajor = useRef(initial.major);

  const [uploaded, setUploaded] = useState<Agreement | null>(null);
  const [uploadError, setUploadError] = useState('');

  const { catalog, failure: catalogFailure } = useCatalog();
  const partners = usePartners(college);
  const years = yearsFor(partners, campus, catalog?.academicYears ?? []);
  const { majors, state: majorsState, failure: majorsFailure } = useMajors(college, campus, year);
  const { agreement: fetched, loading, failure: agreementFailure } = useAgreement(major);
  const ge = useGeneralEducation(college, year);

  const agreement = uploaded ?? fetched;
  const failure = catalogFailure ?? majorsFailure ?? agreementFailure;

  // Keep the chosen year valid for the chosen pair, but only once the pair's
  // real years have arrived. Running before that would clear a year restored
  // from a link, because `years` is empty until partners load.
  useEffect(() => {
    if (partners === null) return;
    if (years.length === 0) {
      if (year !== null) setYear(null);
      return;
    }
    if (year === null || !years.some((y) => y.id === year)) setYear(years[0].id);
  }, [partners, years, year]);

  // The pair changed, so the previous major no longer applies.
  useEffect(() => {
    setMajor(restoredMajor.current);
    restoredMajor.current = null;
  }, [college, campus, year]);

  // Only campuses this college can reach. Before a college is chosen the full
  // list shows, so the two dropdowns read in either order.
  const campuses = (catalog?.campuses ?? []).filter(
    (c) => partners === null || partners.some((p) => p.id === c.id),
  );

  const plan = useMemo(
    () => (agreement ? buildPlan(agreement, [...completed]) : null),
    [agreement, completed],
  );

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

  const geView = useMemo(() => {
    if (!ge || !plan || ge.areas.length === 0) return null;
    return geStatus(ge, completed, plan.remainingGroups.flatMap((g) => g.courses));
  }, [ge, plan, completed]);

  // Mirror the plan into the address bar. replaceState rather than pushState:
  // ticking a course is not a navigation, and filling the back button with
  // every tick would make it useless.
  const query = writePlanUrl({ college, campus, year, major, completed, settings });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.search === query) return;
    window.history.replaceState(null, '', `${window.location.pathname}${query}`);
  }, [query]);

  // The upload path is unchanged and still entirely local: the file is read
  // into memory in this tab and parsed here. It never reaches this app's own
  // API routes, which only ever carry a college, a campus and a major.
  const onFile = useCallback(async (file: File) => {
    try {
      setUploadError('');
      setMajor(null);
      const bytes = new Uint8Array(await file.arrayBuffer());
      setUploaded(await parseAgreement(bytes));
    } catch (err) {
      setUploaded(null);
      setUploadError(
        err instanceof UnrecognisedAgreementError
          ? 'That does not look like an ASSIST articulation agreement. Download yours from assist.org and try again. A scan or a photo will not work; it needs the PDF assist.org gives you.'
          : 'Could not read that PDF. Download the agreement again from assist.org and retry.',
      );
    }
  }, []);

  return (
    <main>
      <div className="page-intro">
        <h1>Plan your transfer</h1>
        <p>
          What you still need, term by term, read straight from the ASSIST articulation agreement.
        </p>
      </div>

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
            onCollege={(id) => {
              setCollege(id);
              setCampus(null);
            }}
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

      {loading && (
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
              <ShareLink />
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
              <b>What this covers.</b> Major preparation on this agreement, plus how it lands
              against Cal-GETC.
            </p>
            <p>
              <b>What it does not.</b> The minimum transferable units your campus asks for, GPA, and
              admission itself. Confirm all of that with a counselor before you register.
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
    </main>
  );
}
