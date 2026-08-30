# Transfer Navigator v2: the ASSIST API, every college, deployed

## Why

v1 asks a student to go to assist.org, find their agreement, download a PDF,
come back and upload it. The parser then reconstructs structure from PDF text
coordinates, which is where every Critical in the v1 review came from: column
splits, y-banding, section quantifiers dropped on the floor.

ASSIST serves the same agreements as structured JSON. The structure that the
PDF parser has to infer is explicit in the JSON: section rules carry an
instruction object, receiving series carry their own conjunction, and a
not-articulated cell is simply a cell with no articulation entry. Reading the
JSON removes a whole class of wrong answers rather than patching them.

It also removes the download step, which is the actual reason this tool helps
nobody today.

## What ASSIST exposes (measured, not assumed)

Bootstrap: `GET https://assist.org/` sets an `X-XSRF-TOKEN` cookie. Every
`/api/*` call must send that cookie AND the same value as an `X-XSRF-TOKEN`
header. Cookie alone, header alone, or a forged value all return 400. This is
ASP.NET double-submit antiforgery, not authentication: no account is involved.

- `GET /api/institutions` -> 181 schools. 116 community colleges (senders),
  and 65 receivers: 9 UC, 23 CSU, 33 private/independent.
- `GET /api/AcademicYears` -> id/fallYear pairs. 2025-2026 is id 76.
- `GET /api/agreements?receivingInstitutionId=&sendingInstitutionId=&academicYearId=&categoryCode=major`
  -> `{reports: [{label, key}]}`, roughly 60-175 majors per pair. Private
  institutions are partial: several return 0 majors.
- `GET /api/articulation/Agreements?Key=<key>` -> the agreement. `result`
  holds `templateAssets` and `articulations`, each a JSON string that must be
  parsed a second time.

Two hard constraints, both measured:

1. **No CORS.** No `Access-Control-Allow-Origin` on any response, and the
   preflight 400s. The browser cannot call ASSIST. A server hop is required.
2. **50 API calls per 5 minutes, per IP.** Exceeding it returns the plain text
   `API calls quota exceeded! Maximum admitted 50 per 5m.` instead of JSON.
   On Vercel every user shares the function egress IP, so this is a shared
   budget for the whole site, not a per-user one. This is the single biggest
   design constraint in this plan.

## Shape of the data

`templateAssets` is a flat, position-ordered list:

- `GeneralTitle` / `GeneralText` (`area: "General"`) -> the advisory prose v1
  calls `Agreement.notes`. `GeneralText` content is HTML.
- `RequirementTitle` (`area: "Requirements"`) -> a heading.
- `RequirementGroup` -> the requirements. Carries `instruction` (the section
  rule), and `sections[]`, each either a `SectionHeader` (a label) or a
  `Section` with `rows[]` of `cells[]`.

Instruction types, counted over 109 groups sampled across UC, CSU and private:

| instruction | n | meaning |
|---|---|---|
| `Following` | 37 | complete all rows |
| `Conjunction` `Or` | 20 | complete any ONE of the sections |
| `NFromArea` | 24 | complete `amount` of `amountUnitType` (Course or Unit) |
| `null` | 20 | complete all rows |
| `Conjunction` `And` | 6 | all sections required |
| `NFromConjunction` | 3 | `UpTo N`. Not evaluable, see below |

Cell types: `Course` 365, `Series` 39 (own `conjunction`, always `And` in the
sample), `Requirement` 8 (a named non-course requirement), `CALGETC` 2.

Sending side: `articulations[]` keyed by `templateCellId`, matching a cell's
`id`. A cell with no entry is not articulated. `sendingArticulation.items` is
a list of OR alternatives; within an item, `courseConjunction: "And"` means
the courses go together, `"Or"` means each is its own alternative.

Verified against the one agreement this project has hand-checked (PCC ->
UCI Computer Science B.S.): 13 cells, 9 articulated, and the 4 unarticulated
ones are exactly STATS 67, I&C SCI 53, IN4MATX 43 and I&C SCI 6N, which is
what Task 7 read off the PDF by hand.

## Design

The planner is good and stays. `buildPlan` takes an `Agreement` and knows
nothing about where it came from. v2 adds a second producer of `Agreement`
beside `parseAgreement`, and the PDF path stays as the fallback for anything
the API cannot serve.

### Section rules

`SectionRule` today is `{kind:'all'} | {kind:'choose', least}`. Three of the
six instruction shapes do not fit it. Extend it:

- `{kind:'choose_units', least}` for `NFromArea` with `amountUnitType: 'Unit'`
- `{kind:'choose_route'}` for `Conjunction: 'Or'`, where a route is a whole
  section, not a single row, and satisfying one route satisfies the group
- `{kind:'advisory', text}` for `NFromConjunction` and anything unrecognised

An `advisory` section is planned as if every row were required and prints its
instruction verbatim with a caution. Overstating what is left to do is the
safe direction; silently dropping a quantifier, the v1 C1 bug, is not.

### Routes generalise orGroup

v1's `orGroup` says "these single rows are alternative paths through one
requirement". `Conjunction: Or` says the same about groups of rows: 13 of the
20 such groups in the sample have a multi-row section. Rather than adding a
second mechanism, generalise `ChooseGroup.indices: number[]` to
`members: number[][]`. A member is satisfied when all its rows are, costs the
sum of its rows' remaining units, and is demoted as a unit. The existing
choose and orGroup cases become members of one row each and behave exactly as
they do now.

### Rate limit

- The token is fetched once per serverless instance and cached in module
  scope, refetched only on a 400.
- Every ASSIST response is cached with Next's `fetch` data cache. Agreements
  are republished about once a year, so `revalidate` is 30 days for
  agreements and major lists, 7 days for institutions and academic years.
- An outbound token bucket caps this site at 40 ASSIST calls per 5 minutes,
  below the 50 ceiling, so the site degrades before ASSIST cuts it off.
- On exhaustion the API route returns 503 with a body the UI can act on, and
  the UI points the student at the PDF fallback and at assist.org directly.
  This is the reason the PDF parser stays.

### Privacy

The PDF path's guarantee (the file never leaves the tab) is unchanged. The
API path sends no student data at all: the request carries a college, a
campus and a major, and the courses a student has completed are typed in and
matched entirely in the browser. Neither path sends a name, an ID or a
transcript anywhere.

## Tasks

1. Extend `SectionRule` and generalise `ChooseGroup` to members, with tests.
   No behaviour change for existing agreements.
2. `src/assist/types.ts`, the API JSON shapes.
3. `src/assist/agreement.ts`, a pure `toAgreement(result)` mapper with tests
   over hand-written fixtures in the same invented-institution style the
   parser tests use.
4. `src/assist/client.ts`, token bootstrap, token bucket, cached fetch.
   Server only.
5. Route handlers under `app/api/assist/`.
6. UI: cascading college/campus/major pickers, PDF upload demoted to a
   fallback, quota exhaustion handled visibly.
7. CI, README, LICENSE.
8. Public GitHub repo, Vercel deploy.

## Not in this plan

- Caching agreements in a database. There is no free database in scope, and
  the data cache covers the traffic this will actually see.
- Prefetching all 7,540 college/campus pairs. At 50 calls per 5 minutes that
  is 12 hours of fetching, and the result would be stale within the year.
- Departments and general education agreements. Majors only, as v1.
- Prerequisite-aware sequencing. Agreements still carry no prerequisite data.
