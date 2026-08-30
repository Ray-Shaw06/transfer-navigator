export const metadata = {
  title: 'How Transfer Navigator works',
  description:
    'Where the data comes from, what this tool reads, what it refuses to guess, and where it can still be wrong.',
};

export default function About() {
  return (
    <main>
      <div className="page-intro">
        <h1>How it works</h1>
        <p>
          What this reads, what it refuses to guess, and where it can still be wrong. Worth knowing
          before you plan a transfer on it.
        </p>
      </div>

      <div className="prose">
        <section>
          <h2>Where the data comes from</h2>
          <div className="facts">
            <div className="fact">
              <b>116</b>
              <span>community colleges</span>
            </div>
            <div className="fact">
              <b>65</b>
              <span>receiving campuses</span>
            </div>
            <div className="fact">
              <b>9 / 23 / 33</b>
              <span>UC, CSU, private</span>
            </div>
            <div className="fact">
              <b>0</b>
              <span>of your own data leaves the browser</span>
            </div>
          </div>
          <p>
            Everything comes from{' '}
            <a href="https://assist.org" target="_blank" rel="noreferrer">
              assist.org
            </a>
            , the official repository of California articulation agreements. This site reads the
            same structured data that powers ASSIST&apos;s own pages, so the requirements, the
            course options and the sections are theirs, not a transcription. If this ever disagrees
            with ASSIST, ASSIST is right.
          </p>
        </section>

        <section>
          <h2>What happens when you pick a major</h2>
          <ol className="pipeline">
            <li>
              <span>
                <b>Your college and campus</b>{' '}narrow to the pairs ASSIST actually has an agreement
                for, in the years it actually has one. Catalog years are published well before
                agreements exist under them, so offering all of them would show empty results.
              </span>
            </li>
            <li>
              <span>
                <b>The agreement is fetched and mapped</b>{' '}into requirements: which receiving
                courses are one requirement rather than several, which of your college&apos;s
                courses satisfy each, and what rule governs each section.
              </span>
            </li>
            <li>
              <span>
                <b>Courses you have finished are matched</b>{' '}against those options. A course is
                credited to one requirement only, walking the agreement in order.
              </span>
            </li>
            <li>
              <span>
                <b>What is left is packed into terms</b>{' '}under the unit load you choose, keeping the
                courses of one requirement together and spreading numbered sequences apart.
              </span>
            </li>
          </ol>
        </section>

        <section>
          <h2>What it refuses to guess</h2>
          <p>
            A confident wrong answer costs a student more than an honest &ldquo;check
            ASSIST&rdquo;. So where the data does not say something, this tool says that instead of
            filling the gap.
          </p>
          <ul>
            <li>
              <strong>Section rules it cannot evaluate</strong> are labelled on the section itself,
              and everything under them is counted as required. That overstates the work rather
              than hiding a requirement.
            </li>
            <li>
              <strong>Requirements it cannot read</strong> are marked unreadable and you are sent to
              ASSIST for that row, rather than being shown a plausible reconstruction.
            </li>
            <li>
              <strong>How many courses each Cal-GETC area needs.</strong> ASSIST publishes which of
              your college&apos;s courses clear which area. It does not publish the counts, so
              neither does this.
            </li>
            <li>
              <strong>Prerequisites.</strong> No articulation agreement carries them. The one
              ordering rule applied, keeping numbered sequences in separate terms, is read from how
              courses are numbered and is labelled where it is used.
            </li>
          </ul>
        </section>

        <section>
          <h2>Where it can still be wrong</h2>
          <ul>
            <li>
              <strong>It can understate what you have finished.</strong> When one completed course
              could count toward two requirements, it is credited to the first one. It never
              overstates what you have done.
            </li>
            <li>
              <strong>It covers major preparation and Cal-GETC, and nothing else.</strong> Not the
              minimum transferable units your campus asks for, not GPA, not admission.
            </li>
            <li>
              <strong>A major that does not want a full GE pattern.</strong> Engineering and
              computer science often tell students to prioritise major preparation. Read the campus
              notes on your plan.
            </li>
          </ul>
          <p>
            None of this replaces a counselor. It is meant to make the conversation with one
            shorter and better informed.
          </p>
        </section>

        <section>
          <h2>Privacy</h2>
          <p>
            A request from this site carries a college, a campus and a major. Nothing else. The
            courses you tick are matched against the agreement <strong>in your browser</strong> and
            are never sent to this server or to ASSIST. The PDF upload path never uploads anything:
            the file is read in the tab and parsed there.
          </p>
        </section>

        <section>
          <h2>Built with</h2>
          <p>
            Next.js and TypeScript, deployed on Vercel. ASSIST responses are cached at the CDN for a
            week to a month, because agreements are republished about once a year and ASSIST rate
            limits how often any one site may ask. A daily job checks that the whole chain still
            works, so a change on their side surfaces as a failed build rather than as a quietly
            broken page.
          </p>
          <p>
            <a
              href="https://github.com/Ray-Shaw06/transfer-navigator"
              target="_blank"
              rel="noreferrer"
            >
              Source on GitHub
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
