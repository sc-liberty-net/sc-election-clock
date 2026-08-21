# Putting The SC Election Clock Online

Everything below is done in a web browser. There is no command line, and nothing to install.
Budget about twenty minutes.

---

## Part One — Choosing A Host

You need two things from a host: somewhere to serve a single HTML file, and somewhere to run
a small script on a timer. All three options below do both, free.

### GitHub Pages + GitHub Actions — **Recommended**

| | |
| --- | --- |
| **Cost** | Free, no card on file, no trial that expires. |
| **Your URL** | `https://<your-username>.github.io/sc-election-clock/` |
| **The Timer** | GitHub Actions. Free for public repositories, with no minute cap. |
| **Why It Wins Here** | The page and the robot that feeds it live in the same place. The robot writes the data file by committing it, so every refresh is a visible, reversible, timestamped change you can read. If the state's calendar ever changes shape you can see exactly when the data stopped making sense. |
| **The Catch** | GitHub pauses scheduled jobs on repositories with **60 days of no activity**. It emails you first, and re-enabling is one button. Because Cronvass commits four times a day, this is unlikely to bite — but know that the email is real and not spam. |
| **Second Catch** | The page is served through a CDN that caches for roughly ten minutes, so a data refresh can take that long to appear. The page adds a cache-busting stamp to its request, which mostly sidesteps this. |

### Cloudflare Pages + Cron Triggers

| | |
| --- | --- |
| **Cost** | Free tier is generous. |
| **Your URL** | `https://sc-election-clock.pages.dev`, or your own domain in about two minutes. |
| **The Timer** | A separate Cloudflare Worker with a Cron Trigger. |
| **Why You Might** | Fastest global delivery, the cleanest custom-domain setup of the three, and no 60-day pause rule. |
| **The Catch** | The script would have to be rewritten as a Worker, and Workers cannot commit to a repository — you would need Cloudflare KV or R2 to hold the JSON. That is a second dashboard, a second set of credentials, and a second thing to remember how to fix in a year. For a page one person maintains, that is a real cost. |

### Netlify

| | |
| --- | --- |
| **Cost** | Free tier. |
| **Your URL** | `https://sc-election-clock.netlify.app` |
| **The Timer** | Netlify Scheduled Functions. |
| **Why You Might** | The friendliest first-time deploy — you can literally drag the folder onto the page. |
| **The Catch** | Scheduled Functions draw on a capped pool of free build/function minutes, and Netlify has trimmed its free tier more than once. Same storage problem as Cloudflare: the function has no repository to commit to. |

**The recommendation is GitHub Pages.** Not because it is the slickest — it isn't — but because
this project's whole point is that it keeps working when nobody is watching it. One account, one
place to look, and a data file whose entire history is readable. The rest of this document assumes
that choice.

---

## Part Two — Get The Files Onto GitHub

### Step 1 — Make A GitHub Account

Go to **github.com** and sign up if you have not already. The free plan is all you need.
Your username becomes part of your URL, so pick one you would not mind printing on a flyer.

### Step 2 — Create The Repository

1. Click the **+** in the top-right corner → **New repository**.
2. **Repository name:** `sc-election-clock`
   (this becomes the last part of your URL, so keep it lowercase with hyphens)
3. **Description:** `A live countdown to every South Carolina election.`
4. Select **Public**. This matters — GitHub Actions is only unlimited-free on public repos,
   and Pages requires public on the free plan.
5. Leave "Add a README file" **unchecked**. You already have one.
6. Click **Create repository**.

### Step 3 — Upload The Files

You will land on a mostly empty page with a link that says
*"uploading an existing file"*. Click it.

1. Unzip `sc-election-clock.zip` somewhere you can see it — the Desktop is fine.
2. Open the unzipped folder, select **everything inside it** (Ctrl/Cmd + A), and drag it
   onto the GitHub upload area. Drag the *contents*, not the folder itself.
3. Scroll down. In the commit box type `Initial upload`.
4. Click **Commit changes**.

> **If the `.github` folder does not upload** — some file managers hide folders whose names
> start with a dot, so it can silently get left behind. Check: after uploading, do you see a
> `.github` folder in the file list? If not, do this instead:
>
> 1. Click the **Actions** tab.
> 2. Click **set up a workflow yourself**.
> 3. Rename the file at the top from `main.yml` to `cronvass.yml`.
> 4. Delete everything in the editor, then paste the entire contents of
>    `.github/workflows/cronvass.yml` from the unzipped folder.
> 5. Click **Commit changes** → **Commit changes** again.

### Step 4 — Let The Robot Write

The scheduled job needs permission to save the data file back into your repository.

1. Click **Settings** (the repository's own Settings, in the tab row — not your account settings).
2. In the left sidebar: **Actions** → **General**.
3. Scroll to **Workflow permissions**.
4. Select **Read and write permissions**.
5. Click **Save**.

### Step 5 — Turn On The Website

1. Still in **Settings**, click **Pages** in the left sidebar.
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
3. Under **Branch**, choose **main** and the folder **/ (root)**.
4. Click **Save**.
5. Wait one to two minutes, then refresh the page. A green box appears with your live URL:

   ```
   https://<your-username>.github.io/sc-election-clock/
   ```

That URL is now shareable with anyone, forever, at no cost. It works on phones.

### Step 6 — Wake Up Cronvass

Do not wait six hours to find out whether the robot works.

1. Click the **Actions** tab.
2. If you see a banner asking you to enable workflows, click **I understand my workflows, go ahead and enable them**.
3. In the left sidebar click **Cronvass — Refresh Election Data**.
4. On the right, click **Run workflow** → **Run workflow**.
5. Wait about thirty seconds and refresh. A green checkmark means it worked.

Click into the run and open the **Pull The Election Calendar** step. You should see a line like:

```
Wrote 47 elections (12 special) to /home/runner/work/.../data/elections.json
```

Then open your live URL. The **Special & Local Elections** panel should show a green
**Live Feed** chip and a "last checked" time from a minute ago.

**If the run fails**, open the failed step and read the last line. The two likely causes are
a missed Step 4 (the error mentions permission or 403) or scvotes.gov being briefly down
(the error mentions HTTP 5xx — just run it again).

---

## Part Three — Living With It

### The Two Ways The Page Gets Current

**The button.** Under the Special & Local Elections panel there is a **Check For New
Elections** button. Pressing it calls the state's calendar API directly from your browser and
repaints the list from the answer, naming any race that was not there a moment ago. Nothing
has to be running anywhere for this to work.

Whether your browser is *permitted* to make that call is the state's decision. Browsers only
accept a cross-origin reply that carries an `Access-Control-Allow-Origin` header; WordPress
sends one by default, but a CDN or firewall in front of scvotes.gov can strip it. **Press the
button once as soon as your site is live — that is the test, and it answers in a second.**
If it reports the request was blocked, nothing is broken: the list stays as it was, and the
scheduled job below keeps doing the work. If it succeeds, you have instant on-demand refresh
for anyone who clicks.

Either way, what the button learns it learns for one reader only. A browser has no credentials
to write back to your repository, and putting credentials in a public page would be a far worse
problem than the one it solved.

**The schedule.** Four times a day — at 00:17, 06:17, 12:17 and 18:17 UTC — GitHub runs
Cronvass. It asks scvotes.gov for every election on the calendar from January 1st of the
current year forward, rewrites `data/elections.json`, and commits. Your page picks that up on
the next visitor's load.

It commits on **every** run, even when nothing changed, and the commit message tells you which
happened — `election data CHANGED` or `checked, no change`. That keeps the repository active so
GitHub never disables the schedule (see below), and it costs about 1 MB of history a year.

This is the part that matters for the visitor who never presses anything, which is most of
them. A special election called on a Tuesday afternoon to fill a vacancy will be on your page
within six hours, with no involvement from you, from me, or from any Claude session.

### The 60-Day Rule, And Why It No Longer Applies

GitHub disables scheduled workflows after 60 days of repository inactivity. Because Cronvass now
commits on every run, the repository is never idle for more than six hours, so the timer never
gets close. You should never see the warning email — but if you ever do, click the link in it or
press **Enable workflow** on the Actions tab.

### Changing The Refresh Rate

Edit `.github/workflows/cronvass.yml` in GitHub's own editor (click the file, then the pencil).
The line to change is:

```yaml
    - cron: "17 */6 * * *"
```

`*/6` means every six hours. `*/3` gives you every three; `17 8 * * *` gives you once a day at
8:17 UTC. Anything more frequent than hourly is wasted — the state does not update that often.

### Switching To The Warm Civic Palette

The palette lives in one quarantined block, so a whole recolour is one paste. A warm civic
alternative (palmetto indigo on warm paper) was delivered alongside this repo as
`civic-palette-preview.html`; it is deliberately **not** committed here, because a second full
copy of the page in the repo would be served publicly and would drift out of date. To swap:

1. Open `index.html` on GitHub and click the pencil.
2. Find the block between `/* ==== PALETTE START ==== */` and `/* ==== PALETTE END ==== */`.
3. Replace it with the matching block from the preview file.
4. Commit.

Nothing else in the file needs to change — the palette is deliberately quarantined to that one block.

If you ever change a colour by hand, check it before trusting it:

```
node scripts/check-contrast.mjs
```

It scores every text-and-surface pair against the WCAG minimums and exits non-zero if any
falls short. Pass a filename to check the civic preview instead.

### Using Your Own Domain

If you buy something like `scelectionclock.com` (roughly $12 a year at Cloudflare Registrar,
Namecheap, or Porkbun):

1. At your registrar, add these DNS records:

   | Type | Name | Value |
   | --- | --- | --- |
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |
   | CNAME | www | `<your-username>.github.io` |

2. In your repository: **Settings** → **Pages** → **Custom domain**, type the domain, click **Save**.
3. Wait for the DNS check to go green (usually minutes, occasionally a day), then tick
   **Enforce HTTPS**.

---

## Part Four — Verifying It Yourself

Do not take the page's word for anything. Three checks:

1. **Is the countdown honest?** Open the live URL, then open
   [scvotes.gov's upcoming elections list](https://scvotes.gov/elections-statistics/upcoming-elections/)
   in another tab. The names and dates in the panel should match one for one.
2. **Is the clock right?** The "Right Now In South Carolina" line at the top should match a
   phone set to Eastern time, to the second.
3. **Does the button work from your browser?** Press **Check For New Elections**. Either it
   turns green and says *read live from scvotes.gov*, or it turns red and says the request was
   blocked. Both are useful answers; neither breaks anything.
4. **Does it survive a broken file?** In GitHub, rename `data/elections.json` to
   `data/elections.json.bak` and reload the page. You should get a red message and the short
   built-in list, not a blank panel. Rename it back afterwards.
