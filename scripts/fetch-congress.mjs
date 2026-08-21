#!/usr/bin/env node
/**
 * Federal races, from the people who register them.
 *
 * The state's calendar does not enumerate congressional seats. Regular U.S.
 * House and Senate races ride the statewide general election ballot, so
 * scvotes.gov lists one event — "Statewide General Election" — and the page's
 * Congressional panel had nothing to show but an explanation of why it was
 * empty. The Federal Election Commission does enumerate them, because every
 * candidate for federal office has to file with it.
 *
 * This writes data/congress.json. It is deliberately OPTIONAL: without an
 * FEC_API_KEY it prints why and exits 0, so a repository that never sets the
 * secret still runs Cronvass cleanly and the page simply omits these rows.
 *
 * Source: OpenFEC, https://api.open.fec.gov/developers/
 * FEC data is a work of the United States government — public domain under
 * 17 USC 105, with a CC0 dedication on top. No attribution is required; the
 * page cites it anyway.
 *
 * Note on 52 USC 30111(a)(4): the sale-or-use restriction covers individual
 * CONTRIBUTORS' names and addresses. Nothing here touches contributor data —
 * candidate names, parties, districts and election dates are unrestricted.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "congress.json");

const API = "https://api.open.fec.gov/v1";
/* Who actually holds the seat, as opposed to who has filed to run for it.
   The @unitedstates congress-legislators project is the standard machine-readable
   roster of sitting members, public domain (CC0), and it is corrected within days
   of a death, resignation or appointment. That currency is the point: the FEC's
   incumbent flag is attached to a CANDIDATE record filed months earlier and does
   not move when a seat changes hands mid-term. Where the two disagree about who
   holds a seat, the roster wins — it is the more recently updated page.
     https://unitedstates.github.io/congress-legislators/ */
const ROSTER_CSV = process.env.LEGISLATORS_CSV ||
  "https://unitedstates.github.io/congress-legislators/legislators-current.csv";
const KEY = process.env.FEC_API_KEY;
const STATE = "SC";

/* South Carolina's seven U.S. House districts, held fixed by the 2020
   apportionment through the 2030 census. The skeleton is hardcoded on purpose:
   /candidates/ lists filers, not seats, so a district nobody has filed in yet
   is simply absent from the response. Without a skeleton, "no candidates yet"
   would render as "this district does not exist". */
const HOUSE_DISTRICTS = ["01", "02", "03", "04", "05", "06", "07"];

/* South Carolina has two U.S. Senate seats and they are never both on the ballot
   in the same year, so both are listed and each says which. The FEC has no
   Senate-class field anywhere in its API — I checked every model — so the class
   arithmetic lives here: Class II was elected in 2020 and is up in 2026, 2032;
   Class III in 2022, 2028, 2034. Six-year terms, staggered by two.

   Nothing else on this page hardcodes a schedule, and this is the one place it
   cannot be avoided: the API simply does not carry the fact. */
const SENATE_CLASSES = [
  { class: "II",  anchor: 2026 },
  { class: "III", anchor: 2028 }
];
const senateOnBallot = (klass, cycle) => (cycle - klass.anchor) % 6 === 0;

/* A small CSV reader rather than a dependency: quoted fields with embedded
   commas and doubled quotes are all this file uses. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length > 1).map(r => {
    const o = {}; head.forEach((h, i) => { o[h] = (r[i] || "").trim(); }); return o;
  });
}

async function currentDelegation() {
  try {
    const res = await fetch(ROSTER_CSV, { headers: { accept: "text/csv" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return parseCsv(await res.text()).filter(r => r.state === STATE);
  } catch (e) {
    console.log("Could not read the congressional roster (" + e.message + ") — seats will list no incumbent.");
    return [];
  }
}

const PARTY_SHORT = { REP: "R", DEM: "D", LIB: "L", GRE: "G", CON: "C", IND: "I", UNK: "?" };

function fail(msg) {
  console.error("fetch-congress failed: " + msg);
  process.exit(1);
}

async function get(pathname, params) {
  const qs = new URLSearchParams({ ...params, api_key: KEY });
  const url = `${API}${pathname}?${qs}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 429) fail("rate limited by api.data.gov (HTTP 429). The key allows 1,000 calls an hour.");
  if (!res.ok) fail(`HTTP ${res.status} on ${pathname}`);
  return res.json();
}

/* Pages until the API says there are no more. `pagination.pages` is
   authoritative; the loop is also bounded so a malformed response cannot spin. */
async function getAll(pathname, params) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const body = await get(pathname, { ...params, per_page: 100, page });
    const results = Array.isArray(body.results) ? body.results : [];
    out.push(...results);
    const pages = body.pagination && body.pagination.pages;
    if (!results.length || !pages || page >= pages) break;
  }
  return out;
}

function cycleFor(now) {
  /* Federal elections fall in even years. In an odd year the cycle that matters
     is the one about to happen, not the one that just did. */
  const y = now.getUTCFullYear();
  return y % 2 === 0 ? y : y + 1;
}

async function main() {
  if (!KEY) {
    console.log("No FEC_API_KEY set — skipping the federal roster. This is not an error;");
    console.log("the page omits the congressional rows when data/congress.json is absent.");
    console.log("A free key takes a minute: https://api.data.gov/signup/");
    process.exit(0);
  }

  const now = new Date();
  const cycle = cycleFor(now);

  /* Two calls, two jobs. election-dates is the FEC's own calendar and carries
     real dates plus a type code (G, P, SG for a special general, and so on).
     candidates is the roster. Neither alone answers "which federal races are on
     the ballot, and who is running". */
  const [dates, candidates, delegation] = await Promise.all([
    getAll("/election-dates/", { election_state: STATE, election_year: cycle }),
    getAll("/candidates/", {
      election_year: cycle, state: STATE, office: ["H", "S"], candidate_status: "C", sort: "name"
    }),
    currentDelegation()
  ]);

  const general = dates.find(d => d.election_type_id === "G") || null;
  const primary = dates.find(d => d.election_type_id === "P") || null;

  const seatFor = (office, district, klass) => ({
    office,
    district: office === "H" ? district : null,
    senate_class: klass ? klass.class : null,
    on_ballot: office === "S" ? senateOnBallot(klass, cycle) : true,
    ballot_year: office === "S"
      ? klass.anchor + 6 * Math.max(0, Math.ceil((cycle - klass.anchor) / 6))
      : cycle,
    /* Both seats are titled plainly "U.S. Senate". South Carolina has two
       senators and both belong on the page; the incumbent is what tells them
       apart, and `ballot_year` keeps each dated to its own next election. */
    label: office === "S" ? "U.S. Senate" : `U.S. House District ${Number(district)}`,
    where: office === "S" ? "Statewide" : `${STATE} District ${Number(district)}`,
    url: office === "S"
      ? `https://www.fec.gov/data/elections/senate/${STATE}/${cycle}/`
      : `https://www.fec.gov/data/elections/house/${STATE}/${district}/${cycle}/`,
    candidates: []
  });

  const seats = [];
  for (const k of SENATE_CLASSES) seats.push(seatFor("S", null, k));
  for (const d of HOUSE_DISTRICTS) seats.push(seatFor("H", d, null));

  /* Filed Senate candidates belong to whichever class is actually on this
     cycle's ballot. The FEC cannot tell us which that is, but the arithmetic
     above can, and only one class is ever up in a given year. */
  const liveSenate = seats.find(s => s.office === "S" && s.on_ballot) || null;

  for (const c of candidates) {
    if (c.candidate_inactive) continue;
    const seat = c.office === "S"
      ? liveSenate
      : seats.find(s => s.office === "H" && s.district === String(c.district || "").padStart(2, "0"));
    if (!seat) continue;
    seat.candidates.push({
      name: c.name || "",
      party: PARTY_SHORT[c.party] || c.party || "?",
      party_full: c.party_full || null,
      incumbent: c.incumbent_challenge === "I"
    });
  }

  /* Attach the sitting member. Senators match on class, representatives on
     district. This runs AFTER the candidate loop so it overwrites anything the
     FEC's incumbent flag inferred — see the note on ROSTER_CSV above. */
  const PARTY_LETTER = { Republican: "R", Democrat: "D", Democratic: "D", Independent: "I", Libertarian: "L" };
  for (const s of seats) {
    const m = s.office === "S"
      ? delegation.find(r => r.type === "sen" && String(r.senate_class) === String(s.senate_class === "II" ? 2 : s.senate_class === "III" ? 3 : ""))
      : delegation.find(r => r.type === "rep" && String(r.district) === String(Number(s.district)));
    s.incumbent = m
      ? {
          name: m.full_name || [m.first_name, m.last_name].filter(Boolean).join(" "),
          party: PARTY_LETTER[m.party] || m.party || null,
          url: m.url || null,
          bioguide: m.bioguide_id || null
        }
      : null;
  }

  /* A one-line summary per seat, computed here rather than in the page: the
     browser should render facts, not derive them. */
  for (const s of seats) {
    const n = s.candidates.length;
    const tally = {};
    for (const c of s.candidates) tally[c.party] = (tally[c.party] || 0) + 1;
    const parties = Object.keys(tally).sort().map(p => tally[p] + " " + p).join(", ");
    s.filed = n;
    s.summary = !s.on_ballot
      ? `Not on the ${cycle} ballot — next contested in ${s.ballot_year}`
      : n === 0
        ? "No candidate has filed with the FEC yet"
        : n + (n === 1 ? " candidate filed" : " candidates filed") + (parties ? " · " + parties : "");
  }

  const payload = {
    checked_at: now.toISOString(),
    cycle,
    state: STATE,
    source: "Federal Election Commission (OpenFEC) for filings; @unitedstates congress-legislators for sitting members",
    roster_url: ROSTER_CSV,
    api: API,
    licence: "Public domain, 17 USC 105 / CC0 1.0",
    general_election_date: general ? general.election_date : null,
    primary_election_date: primary ? primary.election_date : null,
    senate_classes: SENATE_CLASSES.map(k => ({ class: k.class, on_ballot: senateOnBallot(k, cycle) })),
    count: seats.length,
    seats
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
  const filed = seats.reduce((a, s) => a + s.filed, 0);
  console.log(`Wrote ${seats.length} federal seats for the ${cycle} cycle (${filed} candidates filed) to ${OUT}`);
  if (!general) console.log("Note: the FEC has no general election date on file for this cycle yet.");
}

main().catch(e => fail(e && e.message ? e.message : String(e)));
