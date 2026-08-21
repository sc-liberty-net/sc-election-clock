/**
 * Cronvass — the scheduled canvasser for the SC Election Clock.
 *
 * Pulls every scheduled election off the South Carolina Election Commission's
 * public events API and writes a flat JSON file the page can read.
 *
 * scvotes.gov runs WordPress with The Events Calendar plugin, which exposes a
 * documented REST endpoint. Each event carries category tags of two kinds:
 *   - a county code, e.g. "02-AIKEN"
 *   - an election type, e.g. "Special", "General", "Primary", "Runoff"
 * That is everything the page needs, so nothing here parses HTML and nothing
 * breaks when the state restyles its website.
 *
 * Two timestamps, and the difference matters. `checked_at` moves on every run
 * and says when the state's calendar was last confirmed. `generated_at` moves
 * only when the election list actually differs and says when it last changed.
 * A page that shows one and calls it the other cannot tell a reader whether
 * quiet means current or means broken.
 *
 * Because checked_at changes every run, the file changes every run, so the
 * repository is never idle — which is what keeps GitHub from disabling the
 * schedule after 60 days of no activity.
 *
 * This file keeps EVERY event on the state's calendar and sorts none of it into
 * categories. That is deliberate: the page groups elections into panels — special,
 * school board, town and city, General Assembly, state executive, congressional —
 * and those rules live in index.html, in one place. A scraper that also knew the
 * rules would be a second copy to keep in step, and the two would drift.
 *
 * The store holds facts; the render decides what they mean.
 *
 * Zero dependencies. Node 18+ (built-in fetch).
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "..", "data", "elections.json");

const API = "https://scvotes.gov/wp-json/tribe/events/v1/events";
const PER_PAGE = 50;
const MAX_PAGES = 40;              // hard stop; ~2000 events
const UA = "sc-election-clock/1.0 (+https://github.com/)";

/* ---------- helpers ---------- */

const TYPES = new Set(["special", "general", "primary", "runoff", "referendum", "municipal"]);

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s'\-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

// "02-AIKEN" -> "Aiken";  "15-COLLETON" -> "Colleton"
function countyFromCategory(name) {
  const m = /^\d{2}\s*-\s*(.+)$/.exec(name.trim());
  return m ? titleCase(m[1].trim()) : null;
}

function classify(categories) {
  const counties = [];
  let type = null;
  for (const c of categories || []) {
    const name = String(c.name || "").trim();
    const county = countyFromCategory(name);
    if (county) { counties.push(county); continue; }
    if (TYPES.has(name.toLowerCase())) type = titleCase(name);
  }
  return { counties: [...new Set(counties)].sort(), type: type || "Election" };
}

// The API returns "2026-08-25 07:00:00" in the event's own zone (America/New_York)
// and "2026-08-25 11:00:00" as UTC. Normalise the UTC one into a real ISO string.
async function getPage(page, startDate) {
  const url = `${API}?per_page=${PER_PAGE}&page=${page}&start_date=${startDate}&status=publish`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (res.status === 404 && page > 1) return { events: [] };   // TEC 404s past the last page
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
  return res.json();
}

/* ---------- main ---------- */

async function main() {
  const now = new Date();
  // Look back to 1 January of the current year so recently-held elections still
  // render as struck-through "held" rows rather than vanishing.
  const startDate = `${now.getUTCFullYear()}-01-01`;

  const raw = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await getPage(page, startDate);
    const batch = body.events || [];
    raw.push(...batch);
    if (batch.length < PER_PAGE || !body.next_rest_url) break;
  }

  if (!raw.length) throw new Error("API returned zero events — refusing to overwrite a good file with an empty one.");

  const seen = new Set();
  let elections = [];

  for (const ev of raw) {
    const key = String(ev.id);
    if (seen.has(key)) continue;
    seen.add(key);

    const { counties, type } = classify(ev.categories);
    const date = String(ev.start_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    elections.push({
      id: ev.id,
      title: String(ev.title || "").replace(/&#8217;/g, "’").replace(/&amp;/g, "&").trim(),
      date,
      start_et: String(ev.start_date || "").trim() || null,
      end_et: String(ev.end_date || "").trim() || null,
      /* utc_start, utc_end and statewide used to be written here. The page
         never read any of them, and all three are recoverable from what stays:
         the ET stamps carry the same instants, and statewide is exactly
         counties.length === 0. Dropping them takes about 22% off a file this
         job rewrites every six hours. */
      type,
      counties,
      where: counties.length === 0
        ? "Statewide"
        : counties.map(c => `${c} County`).join(", "),
      url: ev.url || null
    });
  }

  /* ---------- one race, one row ----------
     The state's calendar carries the same election more than once, two ways:

       1. Straight republishes. The January 13 North Charleston special election
          is present five times — ids 14897, 15196, 15399, 16259, 16496 — under
          one title and date, because re-publishing mints a new id.
       2. County splits. The same race is listed once per county it touches with
          the county appended in capitals: "(CHARLESTON)", "(DORCHESTER)".

     Deduping on the id catches neither, since all seven ids differ. Deduping on
     the exact title catches the five but not the two. The key is the title with
     a trailing ALL-CAPS parenthetical stripped, plus the date.

     Merging matters as much as collapsing: counties unite, so a Dorchester
     reader still finds the race, and the type is taken from whichever record's
     own tag agrees with its own title — the five republished copies are tagged
     "General" while calling themselves a special election, and the two county
     rows are tagged "Special". Trust the tag that matches the name. */
  const stripCounty = t => String(t || "").replace(/\s*\([A-Z][A-Z .'-]*\)\s*$/, "").trim();
  const raceKey = e => stripCounty(e.title).toLowerCase()
    .replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim() + "|" + e.date;
  const agrees = e => {
    const t = String(e.type || "").toLowerCase();
    return t && new RegExp(`\\b${t}\\b`, "i").test(String(e.title || "")) ? 2 : 1;
  };

  const byRace = new Map();
  for (const e of elections) {
    const k = raceKey(e);
    const prev = byRace.get(k);
    if (!prev) { byRace.set(k, e); continue; }
    const union = [...new Set([...(prev.counties || []), ...(e.counties || [])])].sort();
    const keep = agrees(e) > agrees(prev) ? e : prev;
    keep.counties = union;
    keep.where = union.length ? union.map(c => `${c} County`).join(", ") : "Statewide";
    keep.title = stripCounty(keep.title);
    keep.url = keep.url || prev.url || e.url;
    byRace.set(k, keep);
  }
  const collapsed = byRace.size;
  if (collapsed < elections.length) {
    console.log(`Collapsed ${elections.length - collapsed} duplicate record(s) into ${collapsed} race(s).`);
  }
  elections = [...byRace.values()];

  elections.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));

  // Read the previous file for two reasons: the sanity gate below, and to carry
  // forward when the data last actually changed.
  let prev = null;
  if (existsSync(OUT)) {
    try { prev = JSON.parse(readFileSync(OUT, "utf8")); } catch (e) { prev = null; }
  }

  // Sanity gate: if the new pull is drastically smaller than the last good one,
  // something upstream is broken. Keep the old file and fail loudly.
  if (prev) {
    const prevCount = (prev.elections || []).length;
    if (prevCount > 5 && elections.length < prevCount * 0.4) {
      throw new Error(`Refusing to write: ${elections.length} events vs ${prevCount} previously. Upstream may be broken.`);
    }
  }

  // Compare on content, not on the whole file — the timestamps differ every run
  // by design, so comparing files would report a change on every run.
  const fingerprint = list => JSON.stringify((list || []).map(e =>
    [e.id, e.title, e.date, e.start_et, e.end_et, e.type, (e.counties || []).join("|"), e.url]));
  const changed = !prev || fingerprint(prev.elections) !== fingerprint(elections);

  const et = d => new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short"
  }).format(d);

  const payload = {
    // Moves every run: when the state's calendar was last confirmed.
    checked_at: now.toISOString(),
    checked_at_et: et(now),
    // Moves only when the list differs: when the data last actually changed.
    generated_at: changed ? now.toISOString() : (prev.generated_at || now.toISOString()),
    generated_at_et: changed ? et(now) : (prev.generated_at_et || et(now)),
    changed_this_run: changed,
    source: "https://scvotes.gov/elections-statistics/upcoming-elections/",
    api: API,
    window_start: startDate,
    filter: "none — every event on the state's calendar; the page groups them",
    count: elections.length,
    elections
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");

  const specials = elections.filter(e => /special/i.test(e.title) || e.type === "Special").length;
  console.log(`Wrote ${elections.length} elections (${specials} special) to ${OUT}`);
  console.log(changed
    ? "The list CHANGED this run — generated_at advanced."
    : "No change to the list; only checked_at advanced.");
}

main().catch(err => {
  console.error("Cronvass failed:", err.message);
  process.exit(1);
});
