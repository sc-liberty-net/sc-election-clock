#!/usr/bin/env node
/**
 * The seats themselves — General Assembly and statewide executive.
 *
 * The state's calendar answers "when is an election", not "what is on it".
 * scvotes.gov publishes one "Statewide General Election" event and leaves the
 * offices unlisted, which is why the General Assembly and State Executive
 * panels had nothing to show. There is no machine-readable official roster of
 * South Carolina candidates — the Election Commission's candidate system
 * (VREMS) is an ASP.NET form that only renders results on POST, and the Ethics
 * Commission's public site is a JavaScript shell with no reachable API. So this
 * does not pretend to know who is running. It knows which SEATS exist and who
 * holds them now, which is checkable, and it says exactly that.
 *
 * Seats and incumbents come from Open States' current-people file for South
 * Carolina: one keyless CSV, dedicated to the public domain under CC0.
 *   https://data.openstates.org/people/current/sc.csv
 *   https://github.com/openstates/people
 *
 * Which years each office appears on the ballot is not fetched — it is law, and
 * the citations are in the table below.
 *
 * Writes data/seats.json. Safe to run without any key or secret.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "seats.json");
const CSV = process.env.OPENSTATES_CSV || "https://data.openstates.org/people/current/sc.csv";

/* ---------------------------------------------------------------------------
   Who is elected, when.

   House — 124 seats, two-year terms, every even year, no staggering.
     S.C. Const. Art. III sections 2 and 3; S.C. Code sections 2-1-20 and 2-1-40.

   Senate — 46 seats, four-year terms, presidential years. Last regular election
     2024, next 2028. NOTHING regular is on the 2026 ballot.
     S.C. Const. Art. III section 6.
     Special elections still happen and come from the state's calendar, not here.

   Executive — four-year terms, midterm years: 1974, 1978 ... 2022, 2026, 2030.
     S.C. Const. Art. IV sections 3 and 4, Art. VI section 7.

   Two corrections that a naive list would get wrong:
     Adjutant General is NOT elected. Amendment 2 of 2014 made it appointive;
     the last election was 4 November 2014 and the appointive system took effect
     in February 2019. It must never appear on a ballot list again.

     Lieutenant Governor is not a separate ballot line. Since the 2018 general
     election the Governor and Lieutenant Governor are elected jointly on one
     ticket — Art. IV section 8(C), implemented by 2014 Act No. 214.
--------------------------------------------------------------------------- */

/* Sitting officeholders, hand-verified 21 August 2026 against each office's own
   .gov site and cross-checked against sc.gov's constitutional-officers page.

   Hardcoded because there is nothing to fetch: Open States' sc-executive.csv
   returns 403, and no South Carolina .gov publishes these eight in a
   machine-readable form. Eight names reviewed once a cycle is a smaller risk
   than a scraper silently drifting.

   Comptroller General carries no party. Brian Gaines was APPOINTED in May 2023
   after Richard Eckstrom resigned, and holds the seat "until such time as the
   General Assembly shall elect a successor" — no .gov page states an
   affiliation, South Carolina has no party registration, and secondary sources
   disagree outright (Ballotpedia says Democrat, the SC Daily Gazette says
   Republican). Where the record does not settle it, the page does not either. */
const EXECUTIVE_VERIFIED = "2026-08-21";
const EXECUTIVE = [
  { office: "Governor", holder: "Henry McMaster", party: "R",
    url: "https://governor.sc.gov/governors-biography" },
  { office: "Lieutenant Governor", ticket: true, holder: "Pamela Evette", party: "R",
    url: "https://governor.sc.gov/lieutenant-governor/pamela-evette" },
  { office: "Attorney General", holder: "Alan Wilson", party: "R",
    url: "https://www.scag.gov/about-the-office/meet-the-attorney-general/" },
  { office: "Secretary of State", holder: "Mark Hammond", party: "R",
    url: "https://sos.sc.gov/about-us/secretarys-biography" },
  { office: "State Treasurer", holder: "Curtis M. Loftis, Jr.", party: "R",
    url: "https://treasurer.sc.gov/about-us/meet-the-treasurer/" },
  { office: "Comptroller General", holder: "Brian J. Gaines", party: null, appointed: true,
    url: "https://cg.sc.gov/meet-the-comptroller-general" },
  { office: "Superintendent of Education", holder: "Ellen E. Weaver", party: "R",
    url: "https://ed.sc.gov/about/superintendent-of-education/" },
  { office: "Commissioner of Agriculture", holder: "Hugh E. Weathers", party: "R",
    url: "https://agriculture.sc.gov/meet-the-commissioner" }
];

function fail(msg) {
  console.error("fetch-seats failed: " + msg);
  process.exit(1);
}

/* A small CSV reader rather than a dependency. Handles quoted fields with
   embedded commas and doubled quotes, which is all this file uses. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length > 1).map(r => {
    const o = {};
    head.forEach((h, i) => { o[h] = (r[i] || "").trim(); });
    return o;
  });
}

/* Open States scrapes scstatehouse.gov, so the member's own profile URL is
   already sitting in the row it hands back — in `sources`, sometimes in `links`.
   Lifting it beats guessing: member.php is keyed by an opaque ten-digit code,
   not by district, so there is no URL to construct. */
function memberProfile(row) {
  const hay = [row.links, row.sources, row.biography].filter(Boolean).join(" ");
  const all = hay.match(/https?:\/\/(?:www\.)?scstatehouse\.gov\/member\.php\?[^\s;",|]+/gi) || [];
  /* Open States lists both the bare and the www host. Prefer www — it is what
     scstatehouse.gov itself canonicalises to. */
  return all.find(u => /\/\/www\./i.test(u)) || all[0] || null;
}

/* ---------------------------------------------------------------------------
   Campaign websites, if you want them.

   There is no source for these. The Open States row carries the member's
   scstatehouse.gov profile and nothing else — no campaign domain, in `links` or
   in `sources`. Nothing else official publishes them either: campaign sites are
   private, change every cycle, and lapse between them. Guessing a domain from a
   name is how you end up linking a reader to a parked page or someone else's.

   So this is a slot, not a scraper. Add an entry and that member's name links to
   their campaign site instead of their official profile; leave it empty and the
   official profile stands. Keyed by chamber and district:

     "lower:75": "https://example-for-district-75.com",
     "upper:25": "https://example-for-senate-25.com",

   Verify each one by opening it before you add it.
--------------------------------------------------------------------------- */
const CAMPAIGN_SITES = {
};

const PARTY_SHORT = { Republican: "R", Democratic: "D", Democrat: "D", Independent: "I", Libertarian: "L", Green: "G" };

async function main() {
  const res = await fetch(CSV, { headers: { accept: "text/csv" } });
  if (!res.ok) fail(`HTTP ${res.status} fetching ${CSV}`);
  const people = parseCsv(await res.text());
  if (!people.length) fail("the roster came back empty — refusing to overwrite a good file");

  const chamber = { upper: [], lower: [] };
  for (const p of people) {
    const c = String(p.current_chamber || "").toLowerCase();
    if (c !== "upper" && c !== "lower") continue;
    const d = parseInt(p.current_district, 10);
    if (!Number.isFinite(d)) continue;
    chamber[c].push({
      district: d,
      incumbent: p.name || null,
      party: PARTY_SHORT[p.current_party] || p.current_party || null,
      profile: memberProfile(p),
      campaign: CAMPAIGN_SITES[c + ":" + d] || null
    });
  }
  chamber.upper.sort((a, b) => a.district - b.district);
  chamber.lower.sort((a, b) => a.district - b.district);

  /* A seat with no sitting member is still a seat. Fill the gaps so the page
     can render "vacant" rather than silently skipping a district. */
  const fill = (list, total) => {
    const have = new Set(list.map(s => s.district));
    for (let d = 1; d <= total; d++) {
      if (!have.has(d)) list.push({ district: d, incumbent: null, party: null, profile: null, campaign: null });
    }
    return list.sort((a, b) => a.district - b.district);
  };
  fill(chamber.lower, 124);
  fill(chamber.upper, 46);

  const sanity = [];
  if (chamber.lower.filter(s => s.incumbent).length < 100) sanity.push("fewer than 100 House incumbents");
  if (chamber.upper.filter(s => s.incumbent).length < 35) sanity.push("fewer than 35 Senate incumbents");
  if (sanity.length) fail("roster looks wrong (" + sanity.join("; ") + ") — refusing to write");

  const payload = {
    state: "SC",
    source: "Open States current-people file (CC0) for seats and incumbents; ballot cycles from statute",
    source_url: CSV,
    licence: "CC0 1.0 Universal",
    statutes: {
      house: "S.C. Const. Art. III sections 2-3; S.C. Code sections 2-1-20, 2-1-40 — 124 seats, 2-year terms, every even year",
      senate: "S.C. Const. Art. III section 6 — 46 seats, 4-year terms, presidential years (2024, 2028)",
      executive: "S.C. Const. Art. IV sections 3-4, Art. VI section 7 — 4-year terms, midterm years (2022, 2026, 2030)"
    },
    assembly: {
      house: { label: "S.C. House of Representatives", seats: 124, term_years: 2, ballot_rule: "even", districts: chamber.lower },
      senate: { label: "S.C. Senate", seats: 46, term_years: 4, ballot_rule: "presidential", districts: chamber.upper }
    },
    executive_verified: EXECUTIVE_VERIFIED,
    executive: EXECUTIVE.map(e => Object.assign({ term_years: 4, ballot_rule: "midterm" }, e)),
    notes: {
      executive: "Every office below serves a four-year term. The Lieutenant Governor is elected on the Governor\u2019s ticket, not separately.",
      assembly: "House terms run two years and every seat is contested each even year. Senate terms run four years, contested together in presidential years."
    },
    counts: {
      house_incumbents: chamber.lower.filter(s => s.incumbent).length,
      senate_incumbents: chamber.upper.filter(s => s.incumbent).length,
      profiles_linked: chamber.lower.concat(chamber.upper).filter(s => s.profile).length,
      campaign_sites: chamber.lower.concat(chamber.upper).filter(s => s.campaign).length
    }
  };

  /* No per-run timestamp on purpose. This file changes only when the roster
     changes, so Cronvass does not rewrite it four times a day for nothing. */
  const next = JSON.stringify(payload, null, 2) + "\n";
  let prev = null;
  try { prev = fs.readFileSync(OUT, "utf8"); } catch (e) { /* first run */ }
  if (prev === next) {
    console.log("Seat roster unchanged — leaving data/seats.json alone.");
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, next);
  console.log(`Wrote 124 House + 46 Senate districts and ${EXECUTIVE.length} statewide offices to ${OUT}`);
  console.log(`  incumbents on file: ${payload.counts.house_incumbents} House, ${payload.counts.senate_incumbents} Senate`);
}

main().catch(e => fail(e && e.message ? e.message : String(e)));
