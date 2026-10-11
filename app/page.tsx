import Link from 'next/link';
import { EXAMPLE_PLAN_LABEL, EXAMPLE_PLAN_QUERY } from './lib/example';

/*
  THESIS: a planner earns trust by showing a real plan and its own limits on the
  first screen, not by describing itself. Refuses the hero-plus-three-icon-cards
  scaffold.
  OWN-WORLD: the existing navy and vermilion system. Vermilion means work still
  owed and the one action. Public Sans for prose, mono only for course codes.
  STORY: a student learns what it does, sees a real route, reads what it will not
  check, and opens the planner.
  FIRST VIEWPORT: headline and one primary action left, the verdict of a real
  plan beside it.
  FORM: the ledger, three columns of reads, works out, will not check.
*/

// Taken from a real run of the planner on the example agreement, so the home
// page shows output the tool actually produces. It is a snapshot: if the
// planner's output for this agreement changes, update it from /plan.
const SAMPLE = {
  verdict: '5 requirements left, finishing Spring 2029.',
  detail: '28 semester units: 25 on the agreement, 3 of prerequisites it does not mention.',
  terms: [
    {
      season: 'Spring',
      year: 2027,
      units: 15,
      items: ['English Composition', 'Critical Thinking and Composition', 'CS 002', 'MATH 005A'],
    },
    {
      season: 'Fall',
      year: 2027,
      units: 14,
      items: ['Arts and Humanities', 'Oral Communication', 'CS 003A', 'MATH 005B'],
    },
    {
      season: 'Spring',
      year: 2028,
      units: 14,
      items: ['Arts and Humanities', 'Social and Behavioral Sciences', 'CS 003B', 'CS 003BL', 'MATH 010'],
    },
    {
      season: 'Fall',
      year: 2028,
      units: 13,
      items: ['Social and Behavioral Sciences', 'Physical and Biological Sciences', 'CS 008'],
    },
    { season: 'Spring', year: 2029, units: 3, items: ['Ethnic Studies'] },
  ],
  check: 'CS 002 and MATH 005A need MATH 008 or MATH 009, or a placement result. Not added to the plan, so check yours.',
};

const isCode = (item: string) => /^[A-Z]{2,}\s\d/.test(item);

export default function Home() {
  return (
    <main className="home">
      <section className="home-hero">
        <div className="home-hero-copy">
          <h1>Find out what you still need to transfer, and when you will finish.</h1>
          <p>
            Pick your California community college, the campus you want and your major.
            Transfer Navigator reads the official ASSIST agreement and gives you a term by
            term route, with prerequisites worked in and a straight answer on whether you
            make your target term.
          </p>
          <div className="home-actions">
            <Link href="/plan" className="cta">
              Plan my transfer
            </Link>
            <Link href={`/plan${EXAMPLE_PLAN_QUERY}`} className="home-link">
              Open the example plan
            </Link>
          </div>
          <p className="home-fine">No account. Nothing you enter leaves your browser.</p>
        </div>

        <aside className="sample" aria-labelledby="sample-title">
          <h2 id="sample-title" className="sample-title">
            A real plan, not a mockup
          </h2>
          <p className="sample-from">
            {EXAMPLE_PLAN_LABEL}. 2025-2026 agreement, starting Spring 2027.
          </p>
          <p className="sample-verdict">{SAMPLE.verdict}</p>
          <p className="sample-detail">{SAMPLE.detail}</p>

          <ol className="sample-terms">
            {SAMPLE.terms.map((term) => (
              <li key={`${term.season}${term.year}`}>
                <div className="sample-when">
                  <span>{term.season}</span>
                  <span className="sample-year">{term.year}</span>
                </div>
                <div className="sample-items">
                  <p className="sample-units">{term.units} units</p>
                  <p>
                    {term.items.map((item, i) => (
                      <span key={item}>
                        {i > 0 && ', '}
                        {isCode(item) ? <span className="code">{item}</span> : item}
                      </span>
                    ))}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="sample-check">
            <strong>To check:</strong> {SAMPLE.check}
          </p>
        </aside>
      </section>

      <section className="home-section" aria-labelledby="ledger-title">
        <h2 id="ledger-title" className="home-h2">
          What it covers, and what it leaves to you
        </h2>
        <div className="ledger">
          <div>
            <h3>What it reads</h3>
            <ul>
              <li>
                ASSIST articulation agreements for 116 community colleges and 65 UC, CSU and
                private campuses.
              </li>
              <li>Your college&rsquo;s own catalog, for prerequisites the agreement leaves out.</li>
              <li>
                The general education pattern for your catalog year: Cal-GETC, IGETC or CSU
                GE-Breadth.
              </li>
            </ul>
          </div>
          <div>
            <h3>What it works out</h3>
            <ul>
              <li>Which requirements are left after the courses you have finished.</li>
              <li>An order that respects prerequisites, and a term for each course.</li>
              <li>Courses that count toward your major and general education at once.</li>
              <li>Whether you are on time for the term you are aiming for.</li>
            </ul>
          </div>
          <div>
            <h3>What it will not check</h3>
            <ul>
              <li>GPA, or the minimum transferable units a campus asks for.</li>
              <li>Admission itself.</li>
              <li>Rules that live only in a campus&rsquo;s notes. It shows them, unedited.</li>
              <li>Whether a class is open next term. Confirm with a counselor before you register.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="home-section" aria-labelledby="steps-title">
        <h2 id="steps-title" className="home-h2">
          How to use it
        </h2>
        <ol className="steps">
          <li>
            <h3>Choose your agreement</h3>
            <p>
              Your community college, the campus and the major. If ASSIST will not serve a
              pair, upload the agreement PDF instead. It is read in your browser tab.
            </p>
          </li>
          <li>
            <h3>Tick what you have finished</h3>
            <p>
              Only courses that count toward this agreement are listed, spelled the way your
              college spells them. The plan updates as you tick.
            </p>
          </li>
          <li>
            <h3>Set your pace and read the route</h3>
            <p>
              Pick a first term, a unit load and an optional target term. Copy the link to
              send the exact plan to a counselor.
            </p>
          </li>
        </ol>
      </section>

      <section className="home-close">
        <h2 className="home-h2">Start with your own agreement.</h2>
        <div className="home-actions">
          <Link href="/plan" className="cta">
            Plan my transfer
          </Link>
          <Link href="/about" className="home-link">
            How it works
          </Link>
        </div>
      </section>
    </main>
  );
}
