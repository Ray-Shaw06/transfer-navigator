# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
California community college students planning a transfer to a UC, CSU or private campus. They arrive with a college, a target campus and a major in mind, and need to know what is left to take, in which term, and whether they make the term they are aiming for. The home page is for these students only (confirmed 2026-10-11). Recruiters will also see the site, but the page is not written for them.

## Product Purpose
Reads a published ASSIST articulation agreement and returns a term-by-term route: which courses to take, in what order, whether the student is on time, and how general education overlaps with major preparation. Tick what is already finished and the plan updates. Success is a student leaving with a plan they can take to a counselor.

## Positioning
It reads the agreement rather than just displaying it. It adds prerequisites from the sending college's own catalog, schedules around them, counts courses that clear a general education area and a major requirement once, and states a verdict on whether the target term is reachable. It also says plainly what it cannot check.

## Operating Context
Data comes from assist.org's JSON API through this app's server routes, or from an agreement PDF parsed entirely in the browser tab. ASSIST allows 50 calls per 5 minutes per IP, so responses are CDN-cached and an outbound token bucket protects the budget. The whole plan lives in the URL query string, so a plan is shareable as a link. Nothing about the student is sent to any server.

## Capabilities and Constraints
- 116 California community colleges, 65 receiving institutions (9 UC, 23 CSU, 33 private or independent), every major agreement ASSIST publishes.
- Majors only. Department and general education agreements are not read. Private college coverage is partial.
- Cal-GETC, IGETC and CSU GE-Breadth patterns, chosen by catalog year.
- Does not check minimum transferable units, GPA, or admission itself. Agreements carry no prerequisites; the college catalog does, where it can be read.
- Stack: Next.js 16 App Router, React 19, TypeScript, Vitest, deployed on Vercel. Existing `/compare`, `/about` ("How it works") and system pages.
- Terminology: "agreement", "route", "verdict", "major preparation", "Cal-GETC".

## Brand Commitments
Name is Transfer Navigator. Not affiliated with ASSIST, the University of California, the California State University, or any college. The not-affiliated line and the pointer to assist.org as the official source must stay. Voice is plain and precise, never promotional.

## Evidence on Hand
Real: the live plans themselves (for example Pasadena City College to UC Irvine, Computer Science, 2025-2026, reached by `app/lib/example.ts`), 437 passing tests, the ASSIST rate-limit design, in-browser PDF parsing. Absent and must not be invented: testimonials, user counts, usage statistics, partner logos, counselor endorsements. Vercel Analytics was added 2026-10-06 and has no reported numbers yet.

## Product Principles
1. Be honest about limits. Every claim the tool cannot back says so.
2. Show the plan, not a promise. A real route beats a description of one.
3. Nothing about the student leaves the browser.
4. Defer to ASSIST and the student's counselor on anything the tool does not read.

## Accessibility & Inclusion
Students read this on phones, often between classes. Readable at small sizes, keyboard operable, WCAG AA contrast in both themes, respects prefers-reduced-motion.
