# Catalog coverage

Which of California's 116 community colleges this can read prerequisites
from, which it cannot, and why. Last census 2026-09-13.

The registry in `src/catalog/registry.ts` is the list of record. This is
the story behind it, so the next person does not have to rediscover it.

## What "covered" means

A college is in the registry when two things were checked and both held:
its catalog answers a request for a real course, and that course's
requisites come back through the parser in this repository. `npm run
catalog:verify` re-checks every entry against the colleges themselves.

A college that is not covered is not broken. The planner falls back to
reading course order out of course numbers, which is what it did
everywhere before any catalog was read, and the route says which of the
two ordered the plan.

## Covered: 38

| platform | colleges |
|---|---|
| CourseLeaf, course endpoint | Foothill, Moorpark, Mt. San Jacinto, Orange Coast, Oxnard, Pasadena, San Jose City, Ventura, Victor Valley |
| CourseLeaf, subject pages only | Cerritos, Cypress, Desert, Evergreen Valley, Fullerton, Mount San Antonio, Napa Valley, San Bernardino Valley, Santa Barbara City, Sequoias, Sierra |
| eLumen | Antelope Valley, Bakersfield, Cabrillo, Columbia, Contra Costa, De Anza, Diablo Valley, Glendale, Lake Tahoe, Marin, Mission, Modesto Junior, Palo Verde, Porterville, Redwoods, Santiago Canyon, Siskiyous, Solano |

Measured across four majors per college, biology, business, psychology
and computer science, the courses ASSIST names resolve at better than
90% at most of these and completely at several. What does not resolve
is stated in `git log` for the commit that measured it.

## Not covered: 78

### CurricUNET, about 29 colleges. Unreachable.

Allan Hancock, Berkeley City, Butte, Chabot, Chaffey, Alameda, Copper
Mountain, Crafton Hills, Feather River, Gavilan, Imperial Valley, Irvine
Valley, Laney, Las Positas, Merritt, Moreno Valley, Norco, Palomar, Rio
Hondo, Riverside City, Saddleback, San Diego City, San Diego Miramar,
Santa Ana, Shasta, and the State Center district: Fresno City, Reedley,
Clovis, Madera.

Every one of these publishes its catalog through CurricUNET at
`<college>.curriqunet.com`. From the network this was built on, that
host (live.curriqunet.com, 64.79.132.100) does not accept a TCP
connection on port 80 or 443: not a refusal, not a challenge, the
connection never opens. The in-app browser was denied the same way. It
may be reachable from elsewhere. Nothing can be verified from here, so
nothing was written for it.

This is the single largest gap and the one worth revisiting first, from
a network that can reach the host.

### CourseLeaf behind a bot challenge, 4

Citrus, Long Beach City, Monterey Peninsula, Southwestern. All readable,
all answering an AWS WAF challenge (HTTP 202, `x-amzn-waf-action:
challenge`) by the time they could be verified. Monterey parsed cleanly
before the challenge appeared, so it is tripped by repeated requests
rather than permanent, but a challenge is not a thing to build around.
Try `npm run catalog:verify` against them from a quiet network.

### Custom district websites, about 20

Los Angeles district (City, East, Harbor, Mission, Pierce, Southwest,
Trade-Technical, Valley, West), Los Rios (American River, Cosumnes River,
Folsom Lake, Sacramento City), San Mateo (Cañada, San Mateo, Skyline),
Yuba (Woodland, Yuba), West Hills (Coalinga, Lemoore).

Each district publishes on its own content management system, with no
platform in common and, for Los Angeles and Yuba, the catalog as a PDF
only. Each would need its own reader and its own exploration of where
the courses live. Skyline, for one, lists subjects on a page whose
course entries are not in the HTML served.

### Single colleges on platforms with one college each

- **Acalog**: San Joaquin Delta.
- **Coursedog**: Hartnell, Merced.
- **SmartCatalog**: Ohlone.
- **eLumen, tenant not answering**: Mendocino, West Valley.
- **CourseLeaf listing by discipline name**: MiraCosta, whose pages are
  `/disciplines/mathematics/` rather than by subject code and would need
  a name map this does not have.

### Not identified, about 15

Barstow, Cerro Coso, City College of San Francisco, Coastline, Compton,
Canyons, Cuesta, Cuyamaca, El Camino, Golden West, Grossmont, Lassen,
Los Medanos, San Diego Mesa, Santa Monica, Santa Rosa Junior, Taft. Their
catalog pages named no platform this recognises.

## Adding a college

1. Find the catalog and see which platform it is on.
2. If CourseLeaf or eLumen, add one line to the registry. For CourseLeaf,
   check whether the course endpoint answers; if it does not, find the
   subject page and set `subjectPage` with `subjectPageOnly`. For eLumen,
   pin `site` only if the tenant publishes more than one catalog.
3. Read the ASSIST id back from the institutions route, never guess it.
   Seven of the first eight guessed were wrong, and one would have
   pointed a college at another college's catalog.
4. Run `npm run catalog:verify`. It has to pass through the real parser.
