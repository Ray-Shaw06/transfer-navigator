# Class schedules

Goal: for the next term in a student's route, show real sections (days, times,
instructor, campus, seats) and pick a conflict-free set that respects their
limits. When they tick courses done, the route recomputes and so does the next
term's schedule. It never registers anyone for anything.

## Shape

One `Section` type for every college (`src/schedule/types.ts`). Each college's
schedule system is different, so each gets an adapter that maps its rows to
`Section`, and everything else reads only `Section`:

- `src/schedule/pcc.ts`: Pasadena City College. Built and tested on real rows.
- `src/schedule/pick.ts`: chooses one section per course, no overlaps, within
  the student's days, hours and online or in-person limits. Pure, college
  independent.

Built for PCC: the server routes (`app/api/schedule/pcc`, `app/api/schedule/ratings`),
the term fetcher with its last-year fallback (`pccServer.ts`), instructor ratings
(`rmp.ts`), and the plan page panel (`app/components/ClassSchedule.tsx`) with
limits, a professor-versus-time balance, alternates and a week view.

Still to build: adapters for other colleges, and general education course
choices (an area is scheduled as units, not as a section).

## Instructor ratings

`rmp.ts` reads the public GraphQL endpoint RateMyProfessors' own site uses. It is
not a documented or licensed API and the site's terms restrict automated access,
so it can break or be withdrawn at any time. Only summary numbers are kept, with
a link to the professor's page, and no review text is read. A section with no
rating is neutral, so the schedule still works without it. If it is ever
withdrawn, deleting `rmp.ts` and the ratings route leaves everything else intact.
Matching requires the same first and last name and at least 3 ratings, so a
fuzzy search hit is never shown as someone else's rating.

## Coverage is not 116

Catalogs were a census of 116 colleges and 38 could be read
([catalog-coverage.md](../catalog-coverage.md)). Schedules are a separate
vendor-by-vendor problem, and nothing here assumes the number will be higher.
The honest plan is to run the same kind of census for schedule systems, group
colleges by platform, write one adapter per platform family in order of how
many colleges it unlocks, and show "schedule not available for your college"
for the rest. No college is promised before it has been read end to end.

## PCC specifics (read from findclasses.pasadena.edu, 2026-10-11)

- Public JSON API under `prod-apiweb.pasadena.edu/api`, open CORS, robots.txt
  allows everything. Undocumented, so only `pcc.ts` knows its shape, and a
  canary like `scripts/canary.mjs` should watch it.
- `getClassScheduleTerms` lists terms. Spring 2027 exists but is flagged not
  displayed, so until PCC publishes it the next term has no real sections.
- `classSchedule/<termCode>` returns every section for a term: about 12 MB and 5,600 sections
  for Fall 2026. Must be fetched and trimmed on the server, never sent whole.
- A section arrives as several rows (schedule type, meeting). Rows flagged R or
  X are hidden by the college's own page and by `pcc.ts`.
- Seats can be negative; clamped to zero.

## Before the next term is published

Use the same term a year earlier, labelled as last year's pattern, so the
student sees what kinds of times usually exist without being told they are real
sections for a term that has none yet.
