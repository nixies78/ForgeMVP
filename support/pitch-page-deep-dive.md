# Pitch & vote page - deep dive

Companion to [pitch-page-recap.md](pitch-page-recap.md), which is the shareable summary. This
document carries the evidence, the reasoning and the specifics.

**Status:** plan agreed in outline, not built. Written 2026-11-24.

---

## 1. What already exists

Evidence from the current checkout, so the plan is grounded rather than assumed.

| Thing | Where | Detail |
|---|---|---|
| 14 landing page mockups | `public/concepts/` (`1-cinematic` ... `13-patch-bay`) | Plus a `8-quiet-dark` / `8-quiet-dark-blue-indigo` pair |
| Prototype pages | `public/concepts/` | 9 question pages, 9 lesson pages, 8+ randomiser pages |
| The index of everything | `public/mockups/index.html` | Tabbed: Landing 14, Randomiser 8, Question 9, Lesson 9. Each entry is a link card with an accent colour, name and description |
| Outdated pointer | `public/concepts/index.html` | 5 lines: a meta-refresh to `../mockups/` |
| Shared chrome stylesheet | `public/concepts/_shared/chrome.css` | 10KB. Owns the 72px bar, 44px mark, locked wordmark, 1136px column, 120px footer |
| The shared brief | `support/home-concepts-brief.md` | 210 lines. The contract every mockup obeys |
| The server | `server.js` | Zero-dependency static file server. **Only two non-file routes:** `/healthz` and the dev-only `/__livereload`. No POST handling, no `/api/`, no database |
| The deploy config | `cloudbuild.yaml` | Google Cloud Run. `--min-instances=0 --max-instances=4` |
| Path rules | `tests/paths.test.mjs` | 137 lines. Bans root-relative URLs, bans directory links, asserts every reference resolves from disk |
| Chrome rules | `tests/browser-check.mjs` | 1,568 lines. Measures every mockup against the shared contract |

**The single most useful consequence:** because `tests/paths.test.mjs` has been enforcing
relative-only paths for every page, the mockup set is already structurally safe to publish
statically. No image or link path needs rewriting to go online.

---

## 2. Decisions taken

1. **No wiring work on the prototypes.** The owner will wire the three landing pages'
   buttons by hand and then link them. The pitch page only needs URLs.
2. **No compare tray.** Clicking a thumb opens the real page.
3. **Top 3 = the designers' picks**, fixed by the owner, not computed from votes.
4. **Voting = one favourite per browser**, with a name stored in a cookie.
5. **A live chart at the bottom**, plus a like-counter badge on every thumb.
6. **Feedback stored in Google Drive**, via Google Forms and Sheets. No new services.
7. **Static hosting.** No backend, because Git-based hosting runs no Node.

---

## 3. Phase A - getting the set online

### 3.1 Publishing options

| Option | Publishing the set | Form handling | Cost |
|---|---|---|---|
| **GitHub Pages** | Needs a GitHub Actions workflow that uploads `public/` as the Pages artifact | None - needs Google Form or similar | Free |
| **Netlify / Cloudflare Pages** | Connect the repo, set the publish directory to `public`. Nothing else | Netlify Forms is built in, with submissions in the dashboard | Free tier |

**Recommendation:** Netlify if the least plumbing is wanted, GitHub Pages to stay purely in
GitHub. Both work; the plan is host-agnostic apart from this step.

### 3.2 Three hosting hazards, and the fixes

**a. `public/` is not a selectable Pages source.** Pages offers only the repository root or
`/docs`. Pointing it at the root would publish `server.js`, `tests/`, `tools/` and put every
page at the wrong path. **Fix:** an Actions workflow uploading `public/` as the artifact.
Do *not* copy `public/` to `docs/` - that duplicates every file and drifts.

**b. `_shared/` and `_media/` begin with an underscore.** If Pages processes the branch with
Jekyll, `_`-prefixed folders are excluded - so `chrome.css` and every image would 404. This
is precisely the "broken images" risk. **Fix:** add `.nojekyll` at the published root.
Free insurance even where Jekyll is not run.

**c. The `healthz` link.** `public/js/guide/app.js:541` sets `health.href = 'healthz'`. That
is a route in `server.js` and exists on no disk, so on static hosting it 404s. **Fix:** point
it at a real page or drop it in the published build. It is allowlisted by name in
`tests/paths.test.mjs` under `SERVER_ROUTES`, so removing it is safe.

### 3.3 A correction on the stray files

The plan earlier said the two `index.html.*.bkp` files would be published. **They are
untracked**, so a git-based deploy never sees them. They only matter for a folder-upload
deploy (for example a Netlify drag-and-drop). Tidy them locally if a folder upload is used.

Similarly, `public/concepts/randomiser-2c-portrait/` is currently untracked - someone's
work in progress. It is not part of this plan and should not be committed by it.

### 3.4 Phase A checklist

1. Add the deploy workflow, publishing `public/`.
2. Add `.nojekyll`.
3. Fix the `healthz` link.
4. `npm test` green, commit, push.
5. Open the live URL and check: the mockups index, `public/concepts/index.html`, all 14
   landing pages, the shared stylesheet, a font, and a `_media` image.
6. Open one page straight from the filesystem and confirm it still renders - the set is
   meant to work both ways.

---

## 4. Phase B - the pitch and vote page

### 4.1 Anatomy

1. **Header** - the shared chrome, so it looks like part of the set: 72px bar, 44px mark,
   `Forge` wordmark, `chrome.css` linked last in `<head>`.
2. **Hero** - what the page is, and what is being asked of the visitor.
3. **Top 3 picks** - three large cards.
4. **The other 11** - compact grid.
5. **Chart** - vote counts per style.
6. **Footer** - the shared 120px footer with the locked slogan.

Every card carries: a thumb that links to the live page, a like badge, a "this is my
favourite" vote button, and a "suggest a change" comment affordance.

### 4.2 Location and its test consequences

**Recommended: `public/pitch/index.html`.**

| | `public/pitch/index.html` | `public/concepts/pitch/` |
|---|---|---|
| Swept by `npm run verify` | No | Yes - the whole chrome contract applies |
| Needs `tests/browser-check.mjs` edited | No | **Yes** |
| Why | | Its `FOOTER_PAGES` set is hard-coded. A page *not* in that set is asserted to have **no footer** - so a page that carries the shared footer must be added to it |

Either is workable, but the second means editing a 1,568-line shared test file, and the page
is a meta-page about the mockups rather than a mockup itself. `public/pitch/` is cleaner.

### 4.3 The name cookie

```js
// Sent once, then pre-filled on every visit.
document.cookie = 'forge_name=' + encodeURIComponent(name)
  + '; path=/; max-age=31536000; SameSite=Lax'
  + (location.protocol === 'https:' ? '; Secure' : '');
```

Three details that will otherwise cause confusion:

1. **The `Secure` flag must be conditional.** A `Secure` cookie is silently dropped over
   plain HTTP, so hard-coding it breaks the page on the local dev server
   (`http://forgeflavio.localhost:8650`).
2. **The `path` must match the deployment.** On a GitHub Pages project site the page is at
   `/<repo>/`, so `path=/<repo>/` stops the cookie colliding with other projects on the same
   `github.io` host. On Netlify with a subdomain, the site is at the root, so `path=/`.
3. **Store only the name and their choice.** Nothing here warrants a consent banner, but a
   single line of notice that names and comments are collected is right, since both land in
   the Workspace.

### 4.4 What the cookie can and cannot do

- **Can:** remember the name, remember the vote, show a "your vote" state, stop accidental
  double-votes from a refresh.
- **Cannot:** enforce one person, one vote. It is clearable, and incognito defeats it.
- **The real control is the name**, applied by a human when reading the sheet - "two votes
  from Dave, keep the later one."

The honest claim on the page is therefore **"one vote per browser"**, not "one vote each".

---

## 5. Phase C - the feedback plumbing

### 5.1 Why a Google Form, and not Drive directly

A static page **cannot write to Drive**. The Drive API requires OAuth with a client secret,
and anything shipped in a static page is public. The route that works:

> **Google Form -> Google Sheet -> in Drive**

Forms and Sheets are included in Workspace and free on a personal account. The Sheet lives
in Drive, belongs to the org, and exports to CSV.

### 5.2 The privacy trap, and the two-sheet fix

If the page reads results client-side to draw the chart, it must read something the public
can access - so **the responses sheet cannot be that thing**, or anyone viewing the page
could find its URL and read every comment and every name.

```
  Public page
      |  votes + comments (write)
      v
  Google Form  --->  Sheet A:  responses  (PRIVATE - names, comments)
                          |  IMPORTRANGE
                          v
                     Sheet B:  counts only  (PUBLISHED)
                          ^
      |  counts (read)
  Public page
```

Sheet B holds nothing but `style -> count`. Publishing it exposes counters and nothing else.
The chart and the like-badges both read Sheet B.

### 5.3 Reading the counts

A published Sheet is readable client-side with no key and no backend:

```
https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:json&sheet=<SheetName>
```

The response is wrapped in `/*O_o*/\ngoogle.visualization.Query.setResponse({...});`, so the
wrapper needs stripping before `JSON.parse`. Responses reach the Sheet within seconds, so
the chart is effectively live.

**Verify this early.** It depends on the sharing settings being right, and it is the one
piece that cannot be tested locally against the real data.

### 5.4 Writing the vote and the comment

Posting a Google Form from a page uses an undocumented endpoint:

```
POST https://docs.google.com/forms/d/e/<FORM_ID>/formResponse
Content-Type: application/x-www-form-urlencoded
entry.<FIELD_ID>=<value>      // repeated per field
```

with `mode: 'no-cors'`. The consequence of `no-cors` is that **the response is opaque** -
the page cannot confirm success, so it shows an optimistic "thanks" and the sheet is the
record of truth. The form's `entry.<FIELD_ID>` values come from the form's prefilled-link
code or its page source.

**This is undocumented Google behaviour and can change.** Test it in week one. The
bulletproof fallback is a plain link to the Form with the style pre-filled via
`?usp=pp_url&entry.<FIELD_ID>=<style>`, which needs no JavaScript at all.

**If more control is ever wanted**, a Google Apps Script web app can serve as the endpoint
(`doPost` to write, `doGet` returning JSONP to read aggregates without publishing anything).
It runs as the owner and reads the private sheet. More code, no third-party dependency, no
cost - but not needed for version one.

### 5.5 Cost

| Service | Free tier | Enough? |
|---|---|---|
| Google Forms + Sheets | Included in Workspace; free on a personal account | Yes - the recommendation |
| Netlify Forms | About 100 submissions/month on the free tier | Yes |
| Formspree | About 50 submissions/month on the free tier | Yes |
| Tally | Unlimited submissions on the free plan | Yes |
| GitHub Pages / Netlify / Cloudflare Pages | Free tiers | Yes |

For a round of 10-20 named stakeholders, **the whole thing costs nothing** and sits inside
the Workspace already being paid for.

---

## 6. The like badge and the chart

**Both are the same number.** The badge on a thumb and the bar in the chart are that style's
vote count, read from Sheet B. One source, one number.

Two design notes:

1. **A "like" and "my favourite" are different questions.** Instagram-style likes imply you
   can like several; a favourite is one only. Doing both means two form fields and two
   numbers per style, which doubles the chart's meaninglessness. **Recommendation:** the
   vote is the favourite, and the badge is the vote count.
2. **Always-visible counts bias the vote.** Showing tallies first creates a bandwagon
   effect. For a pitch to named stakeholders, momentum is probably worth more than
   neutrality - so defaults to visible. Revealing the counts and chart only after voting is
   a one-line change, and gives cleaner signal.

**Empty-state matters.** With a handful of voters the chart starts near-empty; it needs a
proper "no votes yet" state rather than looking broken.

---

## 7. Phase D - the owner's wiring

Feasible, and independent of the pitch page: the page needs only URLs.

Two gotchas for hand-wiring the three landing pages:

1. **Link to `index.html` by name, never the folder.** `../questions-2-quiet-blue-indigo/`
   works on a server and shows a file listing when opened from disk.
   `tests/paths.test.mjs` fails the build on it.
2. **The edits must still pass `npm run verify`** - 72px header, 44px mark, no box behind the
   logo, 1136px column, footer rules. Adding body CTA links does not touch those, but it is
   the check that catches drift.

### 7.1 Which landing page has which prototypes

Derived from the descriptions on `public/mockups/index.html`. `-` means no matching design
exists yet.

| Landing page | Question | Randomiser | Lesson |
|---|---|---|---|
| `8-quiet-dark-blue-indigo` | `questions-2-quiet-blue-indigo` | `randomiser-2-quiet-blue`, `randomiser-2b-compact` | `lessons-6-quiet-blue-indigo` |
| `1-cinematic` | - | - | `lessons-2-cinematic` |
| `2-funky` | - | - | `lessons-3-funky` |
| `3-lobby` | - | - | `lessons-4-lobby` |
| `4-editorial` | - | `randomiser-6-editorial`, `randomiser-6b-editorial-side` | - |
| `5-bento` | - | - | `lessons-5-bento` |
| `9-spotlight` | - | - | `lessons-7-spotlight` |
| `10-uefn-editor` | - | - | `lessons-8-editor` |
| `11-item-shop` | - | - | `lessons-9-item-shop` |
| `12-launcher` | `questions-6-launcher` | - | - |
| `6-one-question`, `7-three-steps`, `8-quiet-dark`, `13-patch-bay` | - | - | - |

Two consequences:

1. **Only `8-quiet-dark-blue-indigo` can be fully wired today** - it is the only landing page
   with all three siblings.
2. **No style has a chat prototype.** Chat exists only as the app's `public/chat.html`. The
   third way in has nowhere themed to go for any concept.

The pragmatic answer: each landing page's buttons go to **its sibling where one exists**, and
to the default (`questions-1-default`, `randomiser-1-slots`, `chat.html`) where they do not.
Picking `8-quiet-dark-blue-indigo` as one of the top three costs nothing here.

Also: `public/mockups/index.html:47` currently reads *"None of them is wired to the app yet -
the current Forge is still the real one."* That line needs updating once three of them are.

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `_shared/` / `_media/` 404 on Pages | **High** - breaks every page's look | `.nojekyll`; verify on the live URL before sharing |
| Responses sheet readable by the public | **High** - leaks names and comments | Two-sheet split; only counts are published |
| Form-from-page endpoint changes | Medium - votes silently stop recording | Test in week one; fallback is a plain link to the Form |
| `gviz` read blocked or unshared | Medium - chart empty | Verify early; fallback is updating counts manually |
| Stakeholders hit default prototypes | Low - looks unfinished | Pick `8b` as one of the three; say so in the hero if needed |
| Public URL found by strangers | Low | Accepted - this is a pitch, not a gated study |
| Edits to mockups break the chrome contract | Low | `npm run verify` before pushing |

---

## 9. Limitations, consolidated

1. **Static hosting runs no Node**, so there is no API and the site stores nothing itself.
   Votes and comments live in Google; the page reads counts.
2. **No access control.** A public URL shared with a few people is gated by obscurity, and
   the repository is public.
3. **No watertight one-vote-each.** Cookies are clearable; names are the real dedupe,
   applied by hand.
4. **Only one landing page has all three prototype siblings, and none has a chat design.**
   Wiring the others means either defaults or new design work.
5. **The agent cannot verify the live site or the Google plumbing.** It can test locally at
   `http://forgeflavio.localhost:8650/` and can write the workflow, but publishing, the
   Form, the sheets and their sharing settings are the owner's, and cannot be seen from here.
6. **`npm run verify` needs a headless Chrome**, and the whole mockup set sits inside the
   chrome contract.
7. **No real-device pass.** Checks are headless Chrome at fixed widths (1440, 1280x520, 420).
8. **The top three cannot be chosen by the agent** - and that choice now also determines how
   much Phase D wiring exists.

---

## 10. Open questions

1. **Host** - GitHub Pages or Netlify?
2. **The top three** - which?
3. **Counts visible always, or after voting?**
4. **Page location** - `public/pitch/index.html` (recommended) or under `public/concepts/`?
