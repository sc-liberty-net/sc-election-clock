# SC Election Clock

A live countdown to every South Carolina election — statewide, municipal, school board,
and special — that keeps itself current without anyone editing it.

**What's in this folder**

| File | What It Does |
| --- | --- |
| `index.html` | The page itself. Open it in any browser; it needs no build step and no server. |
| `data/elections.json` | The machine-readable election list the page reads. Rewritten on every check. Ships with a small hand-made seed; Cronvass replaces it with the state's full calendar on its first run. |
| `scripts/fetch-elections.mjs` | **Cronvass** — the script that reads the state's calendar and rewrites `data/elections.json`. |
| `scripts/fetch-congress.mjs` | Reads the Federal Election Commission's roster and writes `data/congress.json`. Optional — needs a free API key. |
| `scripts/check-contrast.mjs` | Scores every colour pair in a palette against WCAG minimums. Run it after any colour change. |
| `.github/workflows/cronvass.yml` | The schedule that runs Cronvass every six hours. |
| `INSTALL.md` | **Start here.** Step-by-step upload and verification. |
| `SETUP.md` | Background on hosting choices and how the pieces fit. |
| `scripts/fetch-seats.mjs` | Seats and incumbents for the General Assembly, plus the statewide officeholders. |

**Security**

Every value on this page arrives from somewhere else — the state's calendar, two public rosters,
the FEC — and is written into the DOM. Two rules keep that safe.

`esc()` makes a string safe as **text**. It does not make it safe as a **URL**:
`javascript:alert(1)` contains none of the characters `esc()` escapes, so it survives untouched
and becomes a live script handler the moment a reader clicks. Every href is therefore built
through `safeUrl()`, which parses the value with `new URL()` and returns it only if the scheme
is `http:` or `https:`. Anything else renders as plain text with no link.

Panel notes are escaped too. They arrive in `data/seats.json`, which is fetched like everything
else; inserting them as raw markup was an executing cross-site scripting hole.

A `<meta>` Content-Security-Policy closes what is left: no external scripts, no objects, no
frames, no form submissions, and `connect-src` limited to this origin plus scvotes.gov, so a
tampered file cannot exfiltrate anywhere. Every outbound link carries
`rel="noopener noreferrer"`.

**Where The Data Comes From**

scvotes.gov runs WordPress with The Events Calendar plugin, which publishes a documented
JSON endpoint at `https://scvotes.gov/wp-json/tribe/events/v1/events`. Every election on
the state's public calendar is there, tagged with a county code (`02-AIKEN`) and an
election type (`Special`, `General`, `Primary`, `Runoff`).

Cronvass reads that endpoint, not the HTML of the page — so a redesign of scvotes.gov
does not break it.

**When Two Sources Disagree, The Fresher Page Wins**

Both the FEC and the @unitedstates congress-legislators roster can tell you who
"the incumbent" is, and they can disagree — because they answer different questions.
The FEC's incumbent flag is attached to a **candidate record filed months earlier**; it
does not move when a seat changes hands mid-term. The roster is corrected within days of
a death, resignation or appointment.

That distinction is not hypothetical. Senator Lindsey Graham died in July 2026 after
winning renomination; Governor McMaster appointed **Darline Graham** to serve out the term.
The FEC still carries "GRAHAM, LINDSEY O." as the filed incumbent. The roster carries
Darline Graham. **The page shows Darline Graham**, because the roster is the more recently
updated page and the question being asked is "who holds this seat now."

So the rule is: the FEC is authoritative for *filings*, the roster for *membership*, and
membership overwrites anything filing data implied. Applied in that order in
`fetch-congress.mjs` — the roster pass runs after the candidate pass, deliberately.

**Where The Congressional Panel Comes From**

South Carolina's calendar does not enumerate federal seats. Regular U.S. House and Senate
races ride the statewide general election ballot, so scvotes.gov lists one event —
"Statewide General Election" — and the Congressional panel had nothing to show but an
explanation of why it was empty.

The FEC does enumerate them, because every candidate for federal office has to file with it.
`scripts/fetch-congress.mjs` reads two OpenFEC endpoints — `/election-dates/` for the real
calendar dates and `/candidates/` for the roster — and writes `data/congress.json`: one entry
per seat, with who has filed, their party, and the incumbent.

Three things about that file are deliberate.

**All seven House districts are listed, filed or not.** `/candidates/` returns filers, not
seats, so a district nobody has filed in yet is simply absent from the response. The seven
districts are hardcoded and the API results are laid over them, because "No candidate has
filed with the FEC yet" is information and a missing row reads as a missing seat.

**The Senate seat appears only when the FEC says there is one.** There is no Senate-class
field anywhere in the API. Rather than hardcode the class arithmetic and let it rot, the seat
is included when the FEC reports either a Senate election date or a filed Senate candidate for
the cycle.

**Seat rows and state rows are matched on the seat, not the title.** scvotes.gov says
"U.S. Senate General Election"; the FEC says "U.S. Senate". Nothing title-based can collapse
those, so the merge matches on office-plus-district for a given date and lets the FEC row win,
since it is the one carrying candidates. Special elections are excluded from that matching — a
special for a House seat can share a date with the regular election for the same seat, and
they are two different races.

**Setting it up.** Get a free key at <https://api.data.gov/signup/>, then add it at
**Settings -> Secrets and variables -> Actions -> New repository secret**, named `FEC_API_KEY`.
The whole thing is optional: with no key the script prints why and exits 0, with no
`data/congress.json` the page omits these rows, and neither case fails the workflow or shows
the reader an error. FEC data is public domain under 17 USC 105 with a CC0 dedication, so
there is nothing to license.

**One Race, One Row**

The state's calendar is not clean, and the page has to be. The January 13 North Charleston
special election is present **seven times** in the state's own feed: five straight republishes
under five different ids (14897, 15196, 15399, 16259, 16496) with the same title and date,
plus two county-split copies suffixed `(CHARLESTON)` and `(DORCHESTER)`.

Deduplicating on the event id collapses none of that — all seven ids differ. Deduplicating on
the exact title collapses the five but not the two. So the key is **the title with a trailing
ALL-CAPS parenthetical stripped, plus the date**, and collapsing merges rather than discards:
counties unite, so a Dorchester reader still finds the race, and the type is taken from
whichever record's own tag agrees with its own title — the five republished copies are tagged
`General` while calling themselves a special election, and the two county rows are tagged
`Special`. The tag that matches the name is the one to trust.

Cronvass applies this before writing the file, and the page applies it again to anything the
**Check For New Elections** button pulls live, so both routes produce the same rows.

**The Quiet Pull On Load**

Cronvass refreshes the saved file every six hours. That is fine for a school board race
scheduled a year out and not fine for a special election called on Tuesday to fill a seat
vacated on Monday — those are the races nothing on this page can predict, so those are the
only ones worth asking the state about the instant someone opens it.

So the page presses its own **Check Upcoming Elections** button once on load, narrowed three
ways: **specials only**, **merged rather than replacing** (the other five panels keep reading
the published copy), and **silent on failure**. It runs the same duplicate collapse as the
button and Cronvass, so a race the saved file already holds cannot reappear under a
republished id or a `(CHARLESTON)` suffix. It speaks up only when it finds something the
published copy has not caught up with, and if scvotes.gov refuses the browser the saved list
simply stands.

**How Many Races To Expect**

Cronvass asks for everything from January 1 of the current year onward; the state's API caps
the far end at about two years out. That is a few hundred records — 193 as of August 2026 —
most of them already held, because the window deliberately starts at the top of the year so a
whole year stays browsable on the year dial.

Each panel therefore shows what is **coming** and folds what is **done** behind a
"3 Races Already Held" disclosure. Badges count upcoming races only: a panel reading
"12 Listed" next to eleven finished elections reports history as if it were news.

The **Check For New Elections** button uses a narrower window than Cronvass: it asks for
**today onward**, dated in Eastern time. Cronvass is writing the record, so it keeps the year;
the button is answering "what is coming?", and eight months of finished races answers a
different question. Because a live check returns only future races, the "Already Held" folds
empty out after you press it — reloading the page restores the saved calendar with its history.

**Two Ways The Page Gets Current**

**On demand.** The **Check For New Elections** button under the panel calls the state's
calendar API straight from the reader's browser and repaints the list from the answer.
It is instant and needs nothing running anywhere.

Whether the browser will *allow* that call is the state's decision, not ours. A browser
only accepts a cross-origin reply carrying an `Access-Control-Allow-Origin` header.
WordPress sends one by default, but a CDN or firewall in front of scvotes.gov can strip
it, and the answer can differ by network. So the button reports what actually happened
rather than assuming: on success it stamps the list *read live from scvotes.gov*, and on
refusal it says the request was blocked, leaves the existing list untouched, and links to
the state's page. Press it once after deploying — that is the test.

**On a schedule.** Cronvass runs on GitHub's machines every six hours and commits the
result to `data/elections.json`. This is what the page loads on first paint, and it is the
only thing that makes the page current for a visitor who never presses the button.

**Two timestamps, and the difference matters.** `checked_at` moves on every run and says when
the state's calendar was last read. `generated_at` moves only when the election list actually
differs and says when the news last changed. The page shows both, because reporting only the
second makes a healthy feed look stale during a quiet month, and reporting only the first hides
how long the list has stood.

Cronvass commits every run, not only when the data changed — `checked_at` guarantees the file
differs. That is deliberate: GitHub disables scheduled workflows after 60 days of repository
inactivity, and a job that only commits when the news is interesting will eventually go quiet
long enough to switch itself off. Measured cost of a year at four commits a day: **about 1 MB**
of packed history, no extra Actions minutes, and no extra requests to scvotes.gov.

The two are complements, not alternatives. The button cannot replace the job, because a
browser has no credentials to write back to this repository — and putting credentials in a
public page would be worse than the problem. What one reader's click learns, it learns for
that reader only.

**If Both Are Unavailable**

The page says so plainly — "the saved calendar could not be loaded" — and leaves the panels
empty rather than filling them with a substitute. The two statewide clocks are unaffected,
because those dates are computed from statute inside the page and need no network at all.

An earlier build carried a hand-entered fallback list. It was removed: every entry in it was
a 2026 race, so from 2027 on it would have answered "nothing is scheduled," which is a
different and worse claim than "the calendar could not be loaded."

**One Palette**

A desaturated navy, and no light mode or toggle — the page ships the colours it was designed
in. Nothing is pure black or pure white: the darkest surface is `#151b27`, because `#000` as a
page background maximises the halation that smears light text on an LCD. Every text-on-surface
pair clears 4.5:1 and every accent clears 3:1, checked with `scripts/check-contrast.mjs` rather
than by eye. Run that script after changing any colour — it exits non-zero if a pair falls
short, so it can gate a commit.

**Accuracy Of Times**

Every time on the page is South Carolina local time, resolved through the
`America/New_York` IANA zone via `Intl.DateTimeFormat` rather than a hard-coded
daylight-saving rule. A visitor in Denver or Tokyo sees South Carolina's clock, and the
page says so if their device is on a different offset.

**Licence**

Public information, freely reusable. The election data belongs to the South Carolina
Election Commission; this page is not affiliated with or endorsed by the Commission.
Always reconfirm at [scvotes.gov](https://scvotes.gov) before relying on a date near its cutoff.
