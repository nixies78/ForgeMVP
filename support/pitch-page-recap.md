# Pitch & vote page - one-pager

**Goal:** let a small group of stakeholders look at the Forge landing page options, pick
their favourite, and tell us what to fix.

**Deliverable:** one new page, plus the existing mockups put online so people can click
through them. No backend, no running costs.

**Detail:** [pitch-page-deep-dive.md](pitch-page-deep-dive.md) - the evidence, the reasoning,
the specifics.

---

## 1. What the page is

1. **Hero** - what this is, and what we want from you.
2. **Top 3 designer picks** - three large cards, left to right.
3. **The other 11 styles** - compact grid, for comparison.
4. **Chart at the bottom** - vote counts per style.
5. **Same chrome as the mockups** - the shared 72px bar, 44px mark, 1136px column.

## 2. How someone uses it

1. **Click a thumb** - opens the real page. Nothing is embedded or faked.
2. **Type your name** once - remembered from then on, so your feedback is attributable.
3. **Vote** for one favourite - the page remembers it and shows "your vote" on return.
4. **Comment** on any style - a rating, "what would you improve?", a few quick chips.
5. **See the chart** - which styles are winning.

## 3. How it is wired

1. **Thumbs** link straight to the live pages.
2. **Votes and comments** go to a Google Form, which writes to a Sheet in Drive.
3. **The chart and the like-badges** read a second, published spreadsheet of counts only.
4. **Why two sheets:** names and comments stay private. Only the counts are ever public.
5. **Cost: £0.** Google Forms and Sheets are already in the Workspace we pay for.

## 4. Voting rules (honest version)

1. **One vote per browser**, best effort - a cookie remembers it.
2. **A cookie cannot stop a determined person** voting twice. Nothing can, without logins.
3. **The name is the real control** - duplicates get spotted and merged when we read the sheet.
4. **Names and comments are personal data** - one line of notice on the page, that is all.

## 5. The plan

| Phase | What | Needs |
|---|---|---|
| **A** | Put the whole mockup set online; verify every link and image | nothing |
| **B** | Build the pitch and vote page | nothing |
| **C** | Form, sheets, chart - about 20 minutes of Google setup | a Google account |
| **D** | Wire the three landing pages' buttons; point the cards at them | your call on targets |

Phases A and B can start immediately. C needs an account. D is yours, then a two-minute
change on my side.

## 6. Open decisions

1. **Host:** GitHub Pages (free, needs a deploy workflow) or Netlify (free, less plumbing)?
2. **Top 3:** which three? Designer's choice, fixed.
3. **Counts always visible, or revealed after voting?** Always-visible creates momentum;
   hiding it gives cleaner signal.
4. **Page lives at** `public/pitch/index.html` - recommended, avoids touching test files.

## 7. Not in scope

1. **No compare tray** - clicking a thumb goes to the real page instead.
2. **No login, no accounts** - and so no watertight one-vote-each.
3. **No access control** - the link is shared with a few people, not locked. The repo is public.
4. **No new design work** - we are not creating the missing prototype styles.

## 8. Known risks

1. **Most landing pages have no matching prototype designs yet.** Only one has all three
   ways in; no style has a chat page. Stakeholders will click into defaults sometimes.
2. **The Form-from-page submit uses an undocumented Google endpoint.** Test it in week one,
   not the day before.
3. **The set is inside a strict shared design contract.** Edits to mockups must still pass it.
