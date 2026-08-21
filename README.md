# SC Election Clock

A live countdown to every South Carolina election — statewide, municipal, school board,
and special — that keeps itself current without anyone editing it.

**What's in this folder**

| File | What It Does |
| --- | --- |
| `index.html` | The page itself. Open it in any browser; it needs no build step and no server. |
| `data/elections.json` | The machine-readable election list the page reads. Rewritten on every check. |
| `scripts/fetch-elections.mjs` | **Cronvass** — the script that reads the state's calendar and rewrites `data/elections.json`. |
| `scripts/check-contrast.mjs` | Scores every colour pair in a palette against WCAG minimums. Run it after any colour change. |
| `.github/workflows/cronvass.yml` | The schedule that runs Cronvass every six hours. |
| `SETUP.md` | Step-by-step instructions for putting this online at its own URL. |

**Where The Data Comes From**

scvotes.gov runs WordPress with The Events Calendar plugin, which publishes a documented
JSON endpoint at `https://scvotes.gov/wp-json/tribe/events/v1/events`. Every election on
the state's public calendar is there, tagged with a county code (`02-AIKEN`) and an
election type (`Special`, `General`, `Primary`, `Runoff`).

Cronvass reads that endpoint, not the HTML of the page — so a redesign of scvotes.gov
does not break it.

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
