import type { GateStatus } from '../../src/planner/ge';

// The four courses a CSU transfer application turns on.
//
// Every other area in the panel below this one is certification: finish it
// late and you finish late. These four are admission. A student who applies
// without them is not a student with an incomplete pattern, they are a student
// whose application is not considered, and no amount of major preparation
// makes up for it.
//
// So this block does one thing the area list deliberately does not: it says
// what happens if you do not do it, and it quotes the regulation that says so
// rather than asserting it in this project's own voice. The grade floor is
// part of the rule and is stated even though nothing here can check a grade.
export function GoldenFour({ gate }: { gate: GateStatus }) {
  const met = gate.doneCount === gate.items.length;

  return (
    <section className="gate" aria-labelledby="gate-head">
      <div className="gate-head">
        <h4 id="gate-head">
          The four that decide admission
          <em>{gate.name}</em>
        </h4>
        <span className="tally" data-met={met}>
          {gate.doneCount} of {gate.items.length} finished
        </span>
      </div>

      <p className="gate-lead">
        A CSU will not consider your application without these four, each passed with a{' '}
        <b>{gate.grade}</b>. The rest of the pattern below is certification: late costs you a term.
        These are admission: late costs you the year.
      </p>

      <ul className="gate-list">
        {gate.items.map((item) => {
          const state = item.done ? 'done' : item.planned ? 'planned' : 'open';
          return (
            <li key={item.id} data-state={state}>
              <span className="gate-code">{item.code}</span>
              <span className="gate-name">{item.label}</span>
              <span className="gate-course">
                {item.done ? (
                  <>
                    <b>{item.done.code}</b> done
                  </>
                ) : item.planned ? (
                  <>
                    <b>{item.planned.code}</b> in your route
                  </>
                ) : (
                  `${item.offered} to choose from`
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <details className="gate-source">
        <summary>What the regulation says</summary>
        <div className="gate-source-body">
          <blockquote>{gate.clause}</blockquote>
          <p>
            <a href={gate.citationUrl} target="_blank" rel="noreferrer">
              {gate.citation}
            </a>
            , the admission requirements for undergraduate transfers to the California State
            University. The same four subjects are asked of applicants who are not California
            residents, so this does not depend on your residency.
          </p>
          <p>The same subsection asks for all of the following, none of which this page checks:</p>
          <ul>
            {gate.minimums.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>{gate.impaction}</p>
          <p>{gate.adt}</p>
        </div>
      </details>
    </section>
  );
}
