# Putting The SC Election Clock On GitHub

Everything in this folder goes into **https://github.com/drugsforrobots/sc-election-clock**,
replacing what is there now. Allow about fifteen minutes. Step 4 is the one people skip and
then wonder why nothing updates.

---

## Step 1 — Unzip, And Unhide The Dot Folder

Download `sc-election-clock.zip` and unzip it. At the top level you should see:

```
index.html          README.md          INSTALL.md         SETUP.md
data/               scripts/           .github/
```

**Make hidden files visible before going further.** `.github` starts with a dot, so macOS and
Windows hide it — and a hidden folder cannot be dragged into a browser. This is the single most
common way this upload goes wrong: you get a green checkmark and no workflow.

- **macOS Finder:** <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>.</kbd> (period). Press again later to re-hide.
- **Windows Explorer:** View → Show → Hidden items.

---

## Step 2 — Upload Everything Except `.github`

1. Go to **https://github.com/drugsforrobots/sc-election-clock**
2. **Add file** → **Upload files**
3. Drag in `index.html`, `README.md`, `INSTALL.md`, `SETUP.md`, and the `data` and `scripts`
   **folders** — drag the folders themselves, not their contents.
4. Commit message: `Deploy the self-updating build`
5. Leave **Commit directly to the main branch** selected → **Commit changes**

`index.html` will say "replace existing file." That is correct.

---

## Step 3 — Create The Workflow By Hand

Do not drag `.github`. Even with hidden files shown, browsers routinely drop dot-folders during
upload and fail silently. Type the path instead:

1. **Add file** → **Create new file**
2. In the filename box type exactly, **including both slashes**:

   ```
   .github/workflows/cronvass.yml
   ```

   Each `/` you type turns the segment before it into a folder. The breadcrumb should read
   `sc-election-clock / .github / workflows /` with `cronvass.yml` in the name field.

3. Open `.github/workflows/cronvass.yml` from your unzipped folder in any text editor, select
   all, copy, paste into the big box.
4. Commit message: `Add Cronvass, the six-hour refresh` → **Commit changes**

---

## Step 4 — Let The Robot Write

Cronvass commits to your repository, and it does not have permission by default.

1. Repo → **Settings** (gear, top bar) → **Actions** (left sidebar) → **General**
2. Scroll to **Workflow permissions**
3. Select **Read and write permissions** → **Save**

Skip this and the workflow will fetch correctly and then die on `git push` with
`403 Permission denied`. If you ever see that error, this is why.

---

## Step 5 — Optional: A Free FEC Key

Without it, the page works and simply omits the seat-by-seat federal rows. With it, the
U.S. Congressional panel fills in with both Senate seats and all seven House districts.

1. Get a key at **https://api.data.gov/signup/** — takes a minute, no cost.
2. Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
3. Name: `FEC_API_KEY`. Value: your key. → **Add secret**

The workflow step is already marked `continue-on-error`, so a missing or bad key never fails
the run.

---

## Step 6 — Run It Once, Now

Do not wait six hours to find out whether it works.

1. Repo → **Actions** tab
2. Click **Cronvass — Refresh Election Data** in the left sidebar
3. **Run workflow** (grey button, right) → **Run workflow**
4. Refresh after ten seconds; a run appears.

Green checkmark means it worked. Click into the run and read the three fetch steps:

```
Pull The Election Calendar   Collapsed 41 duplicate record(s) into 152 race(s).
                             Wrote 152 elections (23 special) to .../data/elections.json
Pull The Seat Roster         Wrote 124 House + 46 Senate districts and 8 statewide offices
                             incumbents on file: 122 House, 45 Senate
Pull The Federal Roster      Wrote 9 federal seats for the 2026 cycle (14 candidates filed)
```

Exact numbers will differ — they depend on the calendar that day. What matters is that each
step wrote a file. Then check the repo's front page: the newest commit should be from
**cronvass[bot]**.

---

## Step 7 — Confirm The Live Site

GitHub Pages takes 30–60 seconds to publish after a commit.

**First, check the data files are actually being served.** Open these directly:

```
https://drugsforrobots.github.io/sc-election-clock/data/elections.json
https://drugsforrobots.github.io/sc-election-clock/data/seats.json
https://drugsforrobots.github.io/sc-election-clock/data/congress.json
```

The first two must return raw JSON. The third only exists if you did Step 5. A GitHub 404 on
the first two means the `data` folder did not upload — redo Step 2.

**Then open the page** at https://drugsforrobots.github.io/sc-election-clock/ and check:

| Look at | It should say |
|---|---|
| The two clocks | Counting down by the second |
| Right Now In South Carolina | Eastern time, whatever zone you are in |
| Status line under the buttons | `N elections listed above… Last checked … (under an hour ago)` in grey, not red |
| Special Elections badge | A number, e.g. `4 Upcoming` — **not** `Unavailable` |
| General Assembly | 124 rows, each naming a sitting member — **not** "Member roster not loaded yet" |
| State Executive Officer Elections | 8 offices, each naming its holder |
| Any race listed twice | Should not happen. If it does, tell me the title and date |

**Then open it on your phone** and swipe left. The page must not move sideways at all.

---

## Step 8 — What Happens From Here

Nothing to do. Just know the rhythm:

- Cronvass runs at **00:17, 06:17, 12:17 and 18:17 UTC** — four times a day.
- It commits on **every** run, even with no news. That is deliberate: GitHub disables scheduled
  workflows in any repository with no commits for 60 days, and a job that commits only when
  something changed would eventually go quiet long enough to switch itself off. About 1,460
  commits a year, roughly 1 MB of packed history.
- `data/seats.json` is rewritten only when the roster actually changes, so it does not churn.
- Come back tomorrow and confirm the Actions tab shows four green runs.

---

## If Something Goes Wrong

| Symptom | Cause | Fix |
|---|---|---|
| No **Actions** tab, or no workflow listed | The workflow file is missing or at the wrong path | Redo Step 3; the file's URL must contain `/.github/workflows/` |
| Run is red: `Permission denied` / `403` | Workflow permissions still read-only | Step 4 |
| Run is red: `HTTP 403 on page 1` | scvotes.gov refused GitHub's request, usually transient | Wait for the next scheduled run |
| "Pull The Federal Roster" says "No FEC_API_KEY set" | Expected without Step 5 | Optional — do Step 5 or ignore |
| Run green but the site is unchanged | Pages has not rebuilt | Wait a minute, hard-refresh (<kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>) |
| Red "saved calendar could not be loaded" | `data/elections.json` is 404ing | Open the JSON URL from Step 7, then redo Step 2 |
| General Assembly says "Member roster not loaded yet" | `data/seats.json` has no incumbents | Cronvass has not run yet, or the seat step failed — check the Actions log |
| **Check For New Elections** shows a CORS error | scvotes.gov did not grant your browser cross-origin access | Not a fault. The button is a bonus; Cronvass reads the same data server-side |

---

## Making Changes Later

**Recolour the page.** The palette lives in one block between
`/* ==== PALETTE START ==== */` and `/* ==== PALETTE END ==== */` in `index.html`. Replace the
block, commit, done. Then check it: `node scripts/check-contrast.mjs` scores every pair against
WCAG minimums and exits non-zero if any fails.

**Add a campaign website for a legislator.** `CAMPAIGN_SITES` at the top of
`scripts/fetch-seats.mjs`, keyed by chamber and district:

```js
const CAMPAIGN_SITES = {
  "lower:75": "https://…",
  "upper:25": "https://…",
};
```

That member's name then links there instead of to their scstatehouse.gov profile. Verify each
URL by opening it first — there is no source for these, which is why it is a hand-filled list.

**Re-check the statewide officeholders.** They are hardcoded in `scripts/fetch-seats.mjs` with a
`EXECUTIVE_VERIFIED` date, because nothing publishes them machine-readably. Review them once a
cycle and bump the date.
