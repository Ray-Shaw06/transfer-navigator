import Link from 'next/link';
import { EXAMPLE_PLAN_QUERY } from './lib/example';
import { LiveDemo } from './components/LiveDemo';

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

        <LiveDemo />
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
        <p className="home-built">
          Built by Rehaan Shaw, a computer science student at UC Irvine who made this transfer
          from Pasadena City College.
        </p>
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
