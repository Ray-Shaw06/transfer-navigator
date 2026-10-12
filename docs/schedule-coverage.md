# Class schedule coverage

Which colleges this can read class schedules from. Today: **1 of 116**, Pasadena
City College (`src/schedule/pcc.ts`). This file is the working record for the
rest, started 2026-10-11.

Catalogs reached 38 of 116 colleges ([catalog-coverage.md](catalog-coverage.md)),
but that does not predict schedules. A catalog is published once a year by a
handful of vendors. A schedule is the college's student information system, and
each college wraps its own front end around it.

## What the first survey found

Ten large colleges, from their own pages. These are observations from search
results, not verified reads, and none of them is a promise of coverage.

| College | What it appears to use |
|---|---|
| Pasadena City College | Custom React search over a public JSON API. **Read end to end.** |
| Santa Monica | Its own "Search for Classes" at smc.edu/academics/classes, says it refreshes every two hours |
| Mt. San Antonio | Its own "New Class Search" and a standard search at mtsac.edu/schedule |
| Long Beach City | "Searchable Class Schedule" at apps.lbcc.edu/schedule, tied to the Viking Student System |
| Cerritos | MyCerritos live schedule and a separate "Schedule Plus" |
| Fullerton | North Orange County CCD "Searchable Class Schedule", one system for the district |
| Orange Coast | A schedule tool on its site that goes offline nightly 2 to 5 AM. Platform not identified |
| Diablo Valley | A schedule builder inside its InSite portal, plus a public search |
| Santa Barbara City | "Find a Class" with CRN and a status column |
| Riverside City | Term PDFs on docrepo.rccd.edu. A live search was not found |
| De Anza | Class Schedule link from MyPortal. Not identified |

The takeaway is that these are not one platform in different clothes. Several
speak the same vocabulary (CRN, seats, waitlist) but the front ends and any
public data behind them differ. **One adapter does not unlock many colleges by
default.**

## How to do it

1. **Group by district, not by college.** A district runs one system for all its
   colleges, so reading it once covers every college in it. The district list is
   the unit of work.
2. **For each district, find the data behind the page.** Open the public search
   with the browser's network tab and look for a JSON endpoint, as was done for
   PCC. That is the only kind of source worth an adapter. A page that must be
   scraped from rendered HTML, or that needs a login, is not.
3. **Order by students reached.** Multi-college districts and the largest
   colleges first.
4. **Record every attempt here**, including the ones that fail and why, so the
   same dead end is not walked twice.
5. **No college is listed as supported until an adapter has been tested on real
   rows from it**, the way `tests/schedule/` does for PCC.

## Not used

A third-party site that republishes section data for many California colleges
turns up in search. It is a copy of copies, may lag the real systems, and its
terms are unknown, so it is not a source here.

## Coverage table

| College | Status |
|---|---|
| Pasadena City College (49) | Supported |
| Everything else | Not surveyed to the level of a verified read |
