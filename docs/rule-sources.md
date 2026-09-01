# Where the rules come from

*Last reviewed 2026-08-31.*

Every number and rule this tool applies, with the primary source behind it and
an honest grade of how well that source supports it. This exists so the
planner can be argued with, and so a student or counsellor can check the tool
against the regulation rather than against the tool's own confidence.

Unlike a training app, almost nothing here is a research finding. These are
**published standards and regulations**, which is a better class of source: they
either say the thing or they do not.

## How to read the grades

| Grade | Meaning |
|---|---|
| **Primary** | A regulation or published standard states this, and it is quoted |
| **Derived** | Arithmetic on a Primary source, with the working shown |
| **Practical** | No source sets this. It is a default or a heuristic, and it is labelled as one |

Most of this file is Primary, and that is the point of building on ASSIST and
ICAS rather than on folklore.

---

## Transfer eligibility

### The Golden Four, 60 units, 2.0 GPA, good standing

**Primary.** [Cal. Code Regs. Tit. 5, § 40803](https://www.law.cornell.edu/regulations/california/5-CCR-40803),
"Applicants Who Are California Residents and Who Have Completed the Prescribed
Number of Units of College Credit". Subsection (a) states, verbatim:

> has completed at least 60 semester (90 quarter) units of transferable college
> credit, of which 30 semester (45 quarter) units are at a level equivalent to
> general education courses

> has attained a grade point average of 2.0 or better across all transferable
> college courses attempted

> is in good standing at the last college attended

Subsections (b) and (c) carry the impaction language: impacted campuses and
programs may require supplemental criteria including a higher GPA or additional
courses.

**The tool does not check any of this.** It states the floor and says it is not
checking it. Stating the numbers beats sending a student away with "ask a
counsellor" when the regulation is this short.

**On the citation link.** The section was read from the free public California
Code of Regulations at
[govt.westlaw.com](https://govt.westlaw.com/calregs/Document/I8B3C7C2050BE11EFB192F93929D89113),
which serves it without a sign-on, and the text was then compared word for word
against Cornell LII. Both work. The link above points at LII only because its
URL is a stable path rather than a document GUID carrying session query
parameters.

Reaching it at all takes a detour worth recording: `calstate.edu` serves its own
copies of this material behind a human-verification check, and § 40601 is *not*
the transfer rule (it is the definitions section). The transfer requirements are
§ 40803 for California residents and § 40803.1 for everyone else.

---

## General education patterns

### Cal-GETC

**Primary.** [Cal-GETC Standards, Version 1.4](https://icas-ca.org/wp-content/uploads/2026/07/Cal-GETC_Standards_1v4_Final_r.pdf),
published by the Intersegmental Committee of Academic Senates. Area structure
and unit counts are taken from the standards document, not reconstructed.

### IGETC

**Primary.** [IGETC Standards, Policies and Procedures, Version 2.4 (2023), section 1.1](https://icas-ca.org/wp-content/uploads/2023/10/IGETC_Standards_2023_v2_4-rev1.pdf).

### CSU GE-Breadth

**Primary for the areas, Derived for the counts.** The area structure is
Executive Order 1100,
[archived copy](https://web.archive.org/web/2018/http://www.calstate.edu/EO/EO-1100-rev-8-23-17.html)
because the original CSU URL no longer resolves.

The counts in `patterns.ts` are deliberately **lower** than the totals printed
in EO 1100, and the source comment shows the arithmetic: EO 1100 states totals
that include upper-division work a transfer student completes after transfer,
so the lower-division portion is what a community college plan can actually
contain. Each area's subtraction is written out in the code.

### Area F, Ethnic Studies

**Primary, from a different instrument.** Area F is **not** in EO 1100. It was
added by [AB 1460 (2020)](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=201920200AB1460)
and is codified at [California Education Code § 89032](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=EDC&sectionNum=89032),
which sets the size directly:

> the completion of, at minimum, one three-unit course in ethnic studies

The statute also provides that the university "shall not increase the number of
units required to graduate" by enforcing it, which is why Area F sits inside the
pattern total rather than on top of it. ICAS records the same size in IGETC
Standards 2.4 section 10.7.2. Verified against both sources 2026-08-31.

This is the one place where getting the sourcing right changed the numbers: an
implementation that read only EO 1100 would be missing an area that is now
statutory.

---

## Units

### Semester to quarter conversion, factor 1.5

**Derived, from a Primary source.** Not a rounding convention. It is the ratio
the regulation itself uses everywhere it states a threshold in both systems:
5 CCR § 40803(a) gives "60 semester (**90 quarter**) units" and "30 semester
(**45 quarter**) units". 60 × 1.5 = 90 and 30 × 1.5 = 45.

Community colleges report semester units; UC and several receiving institutions
run on quarters, so a total shown to a student has to be converted before it
means anything to them.

---

## Term planning

### Default load: 12 units per term

**Practical.** Twelve units is full-time enrolment at a California community
college, which makes it the least surprising default: it is the load that
financial aid, athletic eligibility and F-1 status are generally defined
against.

It is a **default the student overrides**, not a rule the planner enforces.
Nothing is flagged for exceeding or undershooting it.

### Summer load: half the term load, floor of 3

**Practical.** A summer session is shorter, so packing a full term into it is
unrealistic. Half, with a floor of one course, is a judgment. No source sets it,
and the student can override it.

### Term ordering and packing

**Practical.** The planner fills terms in calendar order, respecting
prerequisites where the agreement expresses them. How aggressively it packs is
a heuristic, not a regulation.

---

## What this tool does not source, because it does not decide it

Everything about **which courses satisfy which requirements** comes from ASSIST
and is not this tool's judgment. Requirements, accepted course options and
section rules are read from the agreement. Where the agreement and this tool
disagree, the agreement is right, and the about page says so:

> If this ever disagrees with ASSIST, ASSIST is right.

Coverage is exactly as good as ASSIST's. Where ASSIST publishes no agreement,
the interface says so rather than guessing.

## Standing limitations

This tool reads a published agreement and does arithmetic on it. It does not
know your GPA, your residency, whether a course you took transfers under a
different catalog year, or whether a campus is impacted. It is not advice, and
it is not affiliated with ASSIST or any college.
