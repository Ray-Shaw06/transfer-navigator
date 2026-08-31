# Reading ASSIST

*What it takes to integrate with the California articulation database: no CORS,
an antiforgery handshake, and a rate limit that becomes a whole-site budget.*

[ASSIST](https://assist.org) is the official record of which community college
courses satisfy which requirements at which UC, CSU and private campus. If you
are transferring in California, it is the document your entire plan hangs on,
and reading it is genuinely hard: the agreements are dense two-column PDFs, the
rules are per-section, and nothing tells you whether the four courses you
already took actually got you anywhere.

Transfer Navigator reads it for you. It covers 116 community colleges and 65
receiving institutions, and the interesting part is not the planner. It is
everything you have to do to talk to ASSIST at all.

## One missing header, four consequences

ASSIST sends no CORS headers. That single fact determines the shape of the
entire application, and each step below is forced by the one above it:

1. **The browser cannot call ASSIST.** No CORS means a client-side fetch is
   refused before it starts. There is no flag to set and no header to add from
   this side.
2. **So every request goes through a server.** Five route handlers proxy it.
   `src/assist/client.ts` is explicitly marked as never importable into a
   browser bundle.
3. **So every visitor shares one egress IP.** On a hosted deployment the whole
   site leaves from the same address, which is what the rate limit is measured
   against.
4. **So a per-user limit becomes the site's total budget.** Fifty calls per five
   minutes is not fifty per student. It is fifty for everyone, at once, forever.

A rate limit that would be generous per user is tight for a whole site. Getting
this wrong does not produce an error you can catch cleanly either, which is the
next problem.

## The 51st call is not JSON

Over the limit, ASSIST does not return a 429 with a structured body. It returns
plain text:

```
API calls quota exceeded! Maximum admitted 50 per 5m.
```

So the failure arrives as a JSON parse error in the middle of the mapper, at a
point in the stack that has nothing to do with rate limiting. It looks like a
bug in your parser. It is not.

Three layers keep the site inside the ceiling, and it is worth being honest
about which one is actually doing the work:

| Layer | What it does |
|---|---|
| **Real** | CDN cache in front of the functions. Agreements are republished about once a year, so they are cached for a week to a month. A second student asking for the same agreement is served without the function running and *without ASSIST being called at all*. |
| **Margin** | A token bucket set to 40, below the ceiling of 50, so the site stops itself before ASSIST stops it. It is per-instance state, so it under-counts when several instances run at once. A safety margin, not a guarantee, and the code says so. |
| **Honest** | When it does run out, the interface says exactly that and points at the PDF upload, which does not touch ASSIST at all. A dead end with an explanation beats a spinner. |

One detail worth defending in review: **failures are never cached.** Successes
get a month, errors get `no-store`. Cache a blip for a month and one bad
five-second window sticks to a URL until the TTL expires, which is a far worse
outcome than the original failure.

## Proving you are a browser

Two more things stand between a server and the data.

ASSIST answers browsers and sends a plain `400` to anything that does not look
like one, so the client carries a real desktop Chrome User-Agent. Then `/api` is
protected by ASP.NET's double-submit antiforgery: you `GET` the site root once
to be issued an `X-XSRF-TOKEN` cookie, then send that cookie *and* the same
value as a header on every call. Cookie alone is a 400. Header alone is a 400. A
forged value is a 400.

Worth saying plainly, because it looks like credential handling and is not: **no
account is involved and nothing here identifies a user.** It is an antiforgery
handshake, not authentication. The affinity cookies come back too, because the
API is load balanced behind them, and dropping them gets you routed somewhere
your token is not valid.

## Then there is the PDF

The upload path exists precisely because it does not touch ASSIST, which makes
it the fallback when the quota is gone. Agreements are two-column PDFs:
receiving-institution requirements on the left, your college's equivalents on
the right. There is no table structure in the file. There are glyphs with
coordinates.

Finding the column boundary is the load-bearing step, and the obvious answer is
a trap. "Split at the widest gap" sounds right and is wrong: on a real agreement
the widest run of empty space is *inside* the left column, between a
requirement's code and its title, not between the two columns at all. Split
there and every row is shredded.

What works is to seed at the page midpoint and snap to the nearest gap between
observed x values. The midpoint is roughly right, and snapping guarantees the
boundary lands in whitespace rather than through text:

```ts
const seed = pageWidth / 2;
const xs = [...new Set(items.map((i) => i.x))].sort();

// Start at the page midpoint, then snap to the nearest gap
// between x values so the boundary never lands inside a column.
for (let i = 0; i < xs.length - 1; i++) {
  const [lo, hi] = [xs[i], xs[i + 1]];
  const distance = seed >= lo && seed <= hi
    ? 0
    : Math.min(Math.abs(seed - lo), Math.abs(seed - hi));
  if (distance < best) { best = distance; splitX = (lo + hi) / 2; }
}
```

Above that sit line assembly with wrapped titles, connector parsing (`AND`,
`OR`), section headers with choose-at-least quantifiers, and page-break
spanning. Ten modules in `src/parser/`, and every one of them exists because a
real agreement broke the version before it.

## Testing something you are not allowed to redistribute

Agreement content is ASSIST's, not mine, so **the repository carries none of
it.** No saved responses, no sample PDFs. Which raises the obvious question of
how the parser is tested at all.

Two answers. First, an acceptance gate that runs the mapper over real saved
responses from a directory you point at with `ASSIST_CACHE_DIR`. If the variable
is not set the gate skips *and prints a warning saying it skipped*, so a green
check never quietly implies it ran.

Second, and this is the part that actually holds in CI. The eight tests that use
the real agreement are all gitignored and skip everywhere except the one machine
that happens to have the PDF, which meant **CI was going green having never once
run a PDF through pdfjs.** The fix is a test that builds an agreement PDF from
scratch, with invented institutions and course codes, computing the xref byte
offsets rather than hand-typing them, and runs the whole pipeline over it
including pdfjs. It deliberately carries the shapes that have caused real bugs
here:

- A **receiving-side AND**, where one requirement needs two courses
- A **cell with nothing articulated**, which is a real and common answer
- A **choose-at-least section**, where the quantifier lives in the header
- A **receiving-side OR**, two routes through one requirement
- A **section spanning a page break**, where naive parsers lose state

223 tests as of 2026-08-31. The ones that need a real transcript skip cleanly
on a fresh clone: 209 still run and 14 report themselves as skipped, rather than
the suite quietly shrinking.

## The thing students actually get wrong

One planner feature is worth more than the rest combined, and it is not
sophisticated. A course can satisfy a major requirement *and* clear a general
education area at the same time. Students routinely take the cheapest course for
the major, then take a second course for the GE area the first one would have
covered.

Counting that after the fact, in a GE panel, is too late. The double-count index
puts it on the route and on every accepted option, at the moment the choice is
made. Areas are reported the way the pattern names them rather than the way
ASSIST tags them, so a course tagged 3B reads as Area 3, which is what the
printed standards say and what the rest of the interface shows.

## Deference as a design rule

> If this ever disagrees with ASSIST, ASSIST is right.

That line is in the app's own about page. This tool is a reading of an
authoritative source, not a replacement for it, and a student about to enrol in
a course on the strength of it deserves to know which one they are looking at.

It also does not pretend to cover what it does not. Coverage is exactly as good
as ASSIST's, private colleges included, and where ASSIST has no agreement the
interface says so instead of guessing. Catalog years narrow to the ones an
agreement actually exists under, because years are published well before
agreements land beneath them and offering all of them would show confident empty
results.
