# Transfer Navigator

Pick your California community college, where you want to transfer, and your
major. It reads the ASSIST articulation agreement and builds the route: which
courses to take, in which term, and whether you make the term you are aiming
for. Tick what you have already finished and the plan updates around it.

Not affiliated with ASSIST or any college. [assist.org](https://assist.org)
is the official source; this is a reading of it.

## What it covers

Everything ASSIST publishes major agreements for:

- **116** California community colleges as the sending school
- **65** receiving institutions: 9 UC campuses, 23 CSU campuses, and 33
  private or independent colleges
- Every major agreement between them, for every catalog year ASSIST has one

Coverage is only as good as ASSIST's. Private colleges in particular are
partial: several are listed but publish no major agreements at all. The
picker only offers campuses and years that actually have agreements, so a
dead end shows up as a shorter list rather than as an empty result.

Majors only. Department and general education agreements are not read.

## How it works

Two paths to the same planner.

**The picker** calls ASSIST's own JSON API through this app's server routes.
That is the same data assist.org shows, in structured form, so the section
rules and course groupings are read rather than inferred.

**The upload** parses an agreement PDF entirely inside your browser tab, for
anything ASSIST will not serve. The file is read into memory in the tab and
never uploaded. It exists because ASSIST rate limits how often this site may
ask it for data, and because it works when ASSIST does not.

Neither path sends anything about you anywhere. A picker request carries a
college, a campus and a major. The courses you have finished are typed in
and matched against the agreement in your browser; they are never sent to
this server or to ASSIST.

### The rate limit

ASSIST allows 50 API calls per five minutes per IP address. On a hosted
deployment every visitor shares one egress IP, so that is the whole site's
budget rather than one student's.

Three things keep the site inside it:

1. Agreement, major and institution responses are cached at the CDN for
   between a week and a month, so a repeat lookup never reaches ASSIST or
   even runs the function. Agreements are republished about once a year.
2. A token bucket in `src/assist/client.ts` caps outbound calls below the
   ceiling, so the site stops itself before ASSIST stops it.
3. When it does run out, the UI says so plainly and points at the upload
   path, which does not touch ASSIST at all.

## Three surfaces

- **Plan** builds the route for one college, campus and major.
- **Compare** puts several campuses side by side for the same college, so
  "where should I aim" gets an answer in units rather than in vibes.
- **How it works** says where the data comes from, what this refuses to guess,
  and where it can still be wrong.

## Sharing a plan

The whole plan lives in the query string: college, campus, year, major, the
courses you have ticked, and your unit load and target term. A refresh keeps
it, the back button works, and the link can go to a counselor who then sees
exactly what you see. Nothing is stored on a server because nothing needs to
be.

## Saying what you have already taken

You tick courses from a list the agreement itself provides, in your college's
spelling. It used to be a text box matched by exact string equality, which
meant `CS 3B` counted for nothing against a catalog that says `CS 003B`: the
plan simply did not move, and the only symptom was that the tool looked
broken. Nothing you can tick can be misspelled, so nothing you tell it can be
quietly ignored.

Only courses that can satisfy something on your agreement are listed, so the
list stays short and every entry is relevant. The filter ignores spacing and
zero padding, so `math5a` finds `MATH 005A`.

## General education

Alongside major preparation it shows the Cal-GETC pattern as your college
certifies it, and leads with the part students most often get wrong: which
courses in your major-prep route **also** clear a Cal-GETC area, so you do not
take a second course you never needed.

It tracks the whole pattern: 11 courses, 34 semester units, area by area. Tick
what you have taken and it fills in.

The per-area counts are not in ASSIST. They come from
[ICAS Cal-GETC Standards 1.4](https://icas-ca.org/wp-content/uploads/2026/07/Cal-GETC_Standards_1v4_Final_r.pdf),
section 2, transcribed in `src/planner/calgetc.ts` with its citation and
covered by tests that assert the transcription, so a mistyped table fails the
build rather than quietly changing what students are told to take.

Two rules from that standard are applied rather than assumed:

- **One course, one area.** Section 9: a course listed under two areas may be
  applied to only one. Assigning each course to a single area, choosing the
  assignment that satisfies the most requirements, is a matching problem;
  crediting a course to every area it is listed under would overstate progress.
- **The laboratory.** Area 5 asks that one of your two science courses carry a
  one-unit lab. That is the exception the standard names, so it rides along
  with an Area 5 course instead of consuming a slot, and you are told when
  neither of yours has one.

Area 4 asks for two academic disciplines. A department is not quite a
discipline, so that one is flagged when both courses share a department rather
than being enforced.

Cal-GETC began in Fall 2025, so a catalog year before that has no pattern and
the panel simply does not appear.

## Term planning

Give it a starting term, a unit load, whether you take summers, and a term you
want to transfer by. It packs the remaining work into named terms, gives
summer a smaller load, and says plainly when the plan runs past your target.

It keeps the courses of one requirement together, and it will not put two
parts of a numbered sequence in the same term. That last rule is read from how
California colleges number courses, not from the agreement, and it knows a lab
suffix from a sequence step: CS 003BL is the lab for CS 003B and belongs in
the same term, while MATH 005A and MATH 005B do not.

## What it will not do

- **It does not know prerequisites.** Agreements do not carry them. The
  suggested order is grouped by unit load, nothing more.
- **It will not guess.** Where ASSIST states a rule this tool does not
  evaluate, the section says so and every item under it is counted as
  required. That overstates the work rather than hiding a requirement.
- **It can understate what you have finished.** When one completed course
  could count toward two requirements, it is credited to the first one, in
  document order. It never overstates what you have finished.
- **It is not a counselor.** Confirm anything here before you register.

## Development

```bash
npm install
npm test          # unit tests, no network
npx tsc --noEmit
npm run build && npm start
```

`next dev` is not used here; see `next.config.ts`.

### Monitoring

`scripts/canary.mjs` checks that the deployed site can still read ASSIST end
to end, and runs daily from `.github/workflows/canary.yml`. Everything it
touches is derived rather than pinned: agreement keys carry a UUID that
changes whenever an agreement is republished, so a hardcoded key would fail
every summer for a reason that is not a bug. Point it anywhere:

```bash
node scripts/canary.mjs http://localhost:3100
```

### The ASSIST acceptance gate

`tests/assist/acceptance.test.ts` runs the mapper over real saved ASSIST
responses. Those are not committed: this repo carries no agreement content.
To run it, save some `/api/articulation/Agreements` responses to a directory
and point `ASSIST_CACHE_DIR` at it:

```bash
ASSIST_CACHE_DIR=/path/to/saved/responses npm test
```

Without it the gate skips and prints a warning saying so, so a green check
never implies it ran. The parser is not left unchecked in CI either:
`tests/parser/synthetic.test.ts` builds an agreement PDF from scratch, with
invented institutions and course codes, and runs the whole pipeline over it
including pdfjs. It carries the shapes that have caused real bugs here: a
receiving-side AND, a cell with nothing articulated, a choose-at-least
section, a receiving-side OR, and a section spanning a page break.

## Layout

| Path | What is there |
|---|---|
| `src/assist/` | ASSIST client, response types, and the mapper into `Agreement` |
| `src/parser/` | The PDF parser, and the `Agreement` type both paths produce |
| `src/planner/` | `buildPlan` (section rules, routes, unit totals), `buildSchedule` (named terms), `catalog` (the courses you can tick) |
| `app/api/assist/` | Cached server routes; the only code that talks to ASSIST |
| `src/assist/ge.ts` | The Cal-GETC certification list, mapped into areas |
| `app/` | The three pages, shared data hooks in `app/lib/` |
| `docs/plans/` | The plans this was built from, including what was left out |

## License

MIT. See [LICENSE](LICENSE).
