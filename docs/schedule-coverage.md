# Class schedule coverage

Which colleges this can read class schedules from. Today: **6 of 116**: Pasadena
City College (`pcc.ts`), the three San Diego CCD colleges (`sdccd.ts`) and the two
North Orange County CCD colleges, Cypress and Fullerton (`nocccd.ts`). This file is the working record for the
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

## Multi-college districts, biggest first

Looked at with the browser and the pages' own source, 2026-10-11.

| District (colleges) | Result |
|---|---|
| Los Angeles CCD (9) | **Blocked.** laccd.edu answers automated visitors with 403. Not worked around. Needs a different way in, or the colleges' own sites |
| San Diego CCD (3) | **Supported, estimates only.** Each term is a static JSON file at `sdccd.edu/docs/StudentServices/schedule/<term>.json`. Published files stop at Summer 2026. The current term is served only by a token gated proxy built for the college's own page, which is deliberately not used |
| North Orange County CCD (2 credit colleges) | **Supported, real next term.** `schedule.nocccd.edu/data/<term>/sections.json` and `courses.json`, the files its own search page loads. No login or token. Winter/Spring 2027 is already published. Winter and Spring share one term code, split by campus code `NH` |
| 4CD: Diablo Valley, Los Medanos, Contra Costa (3) | **Decision needed.** Uses Visual Schedule Builder (`vsb.4cd.edu`, a Modern Campus product that other colleges also run). Its `api/class-data` calls carry a client-computed time check (`t` and `e` parameters) and answer a wrong one with "correct your device's timezone". Reproducing it is trivial but it is a request check, so it is not done without a decision. If allowed, one adapter may cover several colleges |
| Peralta (4) | **Not feasible.** Class schedules are one PDF per college and a HubSpot link. No feed |
| Los Rios (4) | Public search takes its filters in the query string and appears to render results on the server. No JSON found. Would mean reading HTML |
| Riverside CCD (3) | Class finder at `rcc.edu/academics/class-finder.html` posts to the site search. Term PDFs on `docrepo.rccd.edu`. No feed found |
| Foothill-De Anza (2) | De Anza answers automated visitors with 403. Foothill's schedule page found, not examined further |
| Coast, Orange Coast and others | Not yet examined |

## What decides whether a district is worth an adapter

A public JSON feed or a static data file, with no login and no gate meant to
keep other sites out. SDCCD and PCC have one. A page that must be read as
rendered HTML is possible but fragile, so it comes after the feeds.

## Coverage table

| College | Status |
|---|---|
| Pasadena City College (49) | Supported |
| San Diego City (54), Mesa (101), Miramar (45) | Supported, estimates only |
| Cypress (71), Fullerton (134) | Supported, real next term |
| Everything else | Not supported |
