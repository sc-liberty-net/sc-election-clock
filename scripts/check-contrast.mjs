/**
 * Palette contrast checker for the SC Election Clock.
 *
 * Reads the :root blocks out of a page and scores every text-on-surface and
 * accent-on-surface pair against WCAG 2.1 contrast minimums. Run it after any
 * palette edit — swapping in the warm civic block, tweaking a hex by eye —
 * before deciding the new colours are fine.
 *
 *   node scripts/check-contrast.mjs            # checks index.html
 *   node scripts/check-contrast.mjs civic-palette-preview.html
 *
 * Exits non-zero if any pair falls short, so it can gate a commit.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const file = resolve(HERE, "..", process.argv[2] || "index.html");

/* ---------- colour maths (WCAG 2.1 relative luminance) ---------- */

function rgb(h) {
  h = h.replace("#", "").trim();
  if (h.length === 3) h = [...h].map(c => c + c).join("");
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
const channel = c => (c /= 255, c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = h => { const [r, g, b] = rgb(h).map(channel); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ---------- what has to clear what ----------
   4.5 for anything that is read as running text; 3.0 for the large countdown
   numerals, the accent bars and the small uppercase tags, which WCAG treats as
   large or non-text. The border/surface pairs are not accessibility limits —
   they are a legibility floor, because a border under about 1.2:1 stops
   separating one panel from the next. -------------------------------------- */

const PAIRS = [
  ["ink", "bg", 4.5], ["ink", "panel", 4.5], ["ink", "panel-2", 4.5],
  ["ink-dim", "bg", 4.5], ["ink-dim", "panel", 4.5], ["ink-dim", "panel-2", 4.5],
  ["ink-faint", "bg", 3.0], ["ink-faint", "panel", 3.0], ["ink-faint", "panel-2", 3.0],
  ["ev", "panel", 3.0], ["ev", "panel-2", 3.0],
  ["ed", "panel", 3.0], ["ed", "panel-2", 3.0],
  ["good", "panel", 3.0], ["proj", "panel", 3.0],
  ["sp", "panel", 3.0], ["sp", "panel-2", 3.0],
  ["line", "panel", 1.2], ["line", "bg", 1.15]
];

/* ---------- pull the palettes out of the file ---------- */

function paletteFrom(css) {
  const out = {};
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[m[1]] = m[2];
  return out;
}

const html = readFileSync(file, "utf8");
const section = html.slice(html.indexOf("PALETTE START"), html.indexOf("PALETTE END"));

const blocks = [];
// The base :root block, then each themed override block.
const rootMatch = /:root\s*\{([^}]*)\}/.exec(section);
if (rootMatch) blocks.push(["base (:root)", paletteFrom(rootMatch[1])]);
for (const m of section.matchAll(/:root(\[data-theme="([a-z]+)"\]|:not\(\[data-theme\]\))\s*\{([^}]*)\}/g)) {
  const label = m[2] ? `[data-theme="${m[2]}"]` : "system override";
  blocks.push([label, paletteFrom(m[3])]);
}

if (!blocks.length) {
  console.error("Could not find a :root block between the PALETTE markers in " + file);
  process.exit(2);
}

/* ---------- score ---------- */

let failed = 0;
const base = blocks[0][1];

for (const [label, vars] of blocks) {
  // A themed block only restates what it changes; everything else inherits.
  const p = { ...base, ...vars };
  console.log(`\n=== ${file.split("/").pop()} — ${label} ===`);
  for (const [a, b, min] of PAIRS) {
    if (!p[a] || !p[b]) { console.log(`${(a + " / " + b).padEnd(22)}  (not defined)`); continue; }
    const r = contrast(p[a], p[b]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`${(a + " / " + b).padEnd(22)} ${r.toFixed(2).padStart(6)}   ${ok ? "ok" : "LOW — needs " + min.toFixed(1)}`);
  }
}

console.log(failed ? `\n${failed} pair(s) below target.` : "\nEvery pair meets its target.");
process.exit(failed ? 1 : 0);
