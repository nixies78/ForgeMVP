# UEFN Game Guide — v2 Build Brief

**What this document is:** a complete, self-contained brief for building version 2 of this tool from scratch. It exists so a new AI can rebuild the *system* — the workflow, the questions, and the data behind them — with a **completely new design**. Design is deliberately out of scope; behaviour, question content and data are in scope.

**How to read it:** Part 1 is what the product is. Part 2 is the workflow you must reproduce. Part 3 is the question bank — the most important part, transcribed verbatim. Parts 4–6 are the reference data the questions resolve against. Part 7 is what was wrong with v1 and should not be repeated. Part 8 is test requirements. Part 9 is decisions you should ask the human about before starting.

Everything in Parts 3–6 is **verified content**, not placeholder. Do not rewrite the domain content — device names, Details-panel setting names and their recommended values were researched against Epic's official UEFN documentation. Treat that text as data to carry over, not prose to improve.

---

## Part 1 — What the product is

A wizard that walks a **non-technical person** through designing a Fortnite (UEFN) game, then building it. The user answers a short sequence of questions. The tool resolves those answers into:

- a concrete list of **UEFN devices** with exact **Details-panel settings**,
- a visual **core-loop diagram** (entry → repeating loop → win/lose outcomes),
- a 4–5 step **build walkthrough** with video slots.

**It is a guidance tool, not a generator.** It produces no files, no Verse code, no UEFN project. The output is on-screen instruction the user follows manually inside UEFN's editor.

**Product intent, from the project's own metadata:**

> "a tool that walks people through making a game in UEFN… will require continuous development… a lot of optional videos."

**The central design idea worth preserving — composition over authoring.** Device settings are researched **once, per device**, in a shared device library. Game types reference devices *by name* and inherit a category baseline. Adding a new game type is therefore *composition*, not fresh research. This is the reason the content model scales at all, and it replaced an earlier model where the same settings were copy-pasted into every genre that used them.

**The second idea worth preserving — provenance.** Every device in the final list carries a `sources[]` list saying *why* it's there ("Always needed", "Combat essentials", the game type label, or the question prompt that added it). This is surfaced in the UI and is a genuinely good affordance for a non-technical user.

**The third — the live/draft gate.** An honest way to ship a large taxonomy ahead of its research. 13 game types are fully researched ("live"); 74 are named and reachable but resolve only to their category baseline ("draft"). Drafts are hidden behind a dev-mode toggle.

---

## Part 2 — The workflow

### 2.1 Screens, in order

`state.screen` is one of:
`home | category | gametype | question | brand | restriction | summary | experience | walkthrough`
plus a `design_mode_placeholder` stub screen.

| # | Screen | Heading shown | Progress |
|---|---|---|---|
| 1 | Home | "Ready to make a game?" — 3 design-mode cards + saved games list | 0% |
| 2 | Category | "What type of game do you want to make?" — 10 categories | 4% |
| 3 | Game type | "Which one exactly?" — types sorted live → draft → custom | 10% |
| 4 | Question | One question per screen; footer reads "Question N of M" | 16% → 40% |
| 5 | Brand | "Now pick a brand template to build with." — logo strip + detail panel | 44% |
| 6 | Restriction | "**&lt;Brand&gt;** comes with some usage rules." — gate with a back route | 48% |
| 7 | Summary | Core-loop SVG, recap of every choice, name + save, "Start Building →" | 55% |
| 8 | Experience | "What's your experience level with UEFN?" — 4 levels, never saved | 58% |
| 9 | Walkthrough | 4–5 steps with video slots | 60% → 100% |

**Exact progress formula.**

```
home            0
category        4
gametype       10
question       16 + (qIndex / max(totalQ, 1)) * 24      // 16 → 40
brand          44
restriction    48
summary        55
experience     58
walkthrough    60 + stepIndex * (40 / max(steps.length - 1, 1))   // 60 → 100
```

Note the gap between 40% and 44%: brand selection occupies a fixed band regardless of how many questions were asked. Progress must increase monotonically across all screens — that is a test requirement (see Part 8).

### 2.2 Screen-by-screen behaviour

**1. Home.** Three "design mode" panels, then the saved-games list.

| id | Label | Button | Description | Status |
|---|---|---|---|---|
| `guided` | Answer Questions | Start questions | "Work through a short set of questions about the game you want. We'll narrow it down to an exact game type and build you a step-by-step plan." | **live** |
| `randomise` | Randomise | Spin the wheel | "Not sure what to make? Spin the wheel and let it pick a game idea for you — a game type, a twist and a brand to build around." | placeholder stub |
| `ai_chat` | Chat with AI | Start chatting | "Describe your idea in your own words and talk it through. The AI asks follow-ups and turns the conversation into a buildable plan." | placeholder stub |

Only `guided` routes into the real flow. The other two route to a "Coming soon" page. In v2, either build them or don't show them — a visible dead end is worse than no panel.

Saved games list: newest first, showing name, game-type label, saved date, a "· draft game type" note when the target type is a draft, and a delete control. Loading a saved game **jumps straight to Summary**.

**2. Category.** Ten cards from `meta.game_categories`. Each shows label, description, and counts. In dev mode the counts read live/draft; with dev mode off, categories with no live types are hidden — except that all ten custom "Just give me the basics" entries are marked `live`, so in practice all ten categories remain visible. (See Part 7, item 3.)

**3. Game type.** Types filtered to the chosen category, then sorted: **live named types → drafts → custom fallback last**. Badges: custom gets "Essentials only"; draft gets "Draft — core devices only" with its `research_notes` in the title attribute. Sub-heading explains that "Just give me the basics" starts you with the essential devices.

**4. Question.** One question per screen, in the order authored. Footer:

```
[ ← Back ]                                    [ Change game type ] [ Change category ]
```

Header breadcrumb: `«Category» › **«Game Type»** · Question N of M`. Back pops the most recent answer, or returns to the game-type screen when there are none. **Game types with zero questions skip this screen entirely** and go straight to Brand.

**5. Brand.** A strip of brand tiles (logo + label), plus a detail panel for the previewed/selected brand showing description, hero image, pitch, `provides[]` list and `caveat`. The panel badges which brands **suit the chosen game type** (inverse of v1's framing): if the current game type is in the brand's `suggested_game_types`, show that. There is an explicit "let's go back" route, because by this point the user has answered every design question and may discover a brand's restrictions don't suit them.

**6. Restriction.** A gate, not a checkbox. Renders the brand's `restriction_confirmation.sections[]` as titled rule lists, plus a footnote for licensed brands stating that the standard Fortnite Developer Rules apply on top, plus a link to the full official guidelines (`guidelines_label` / `guidelines_url`). Two buttons: **"← Let's go back"** (returns to Brand) and **"I'm okay with this →"** (to Summary).

**7. Summary.** Hand-built inline SVG core-loop diagram — entry box at top, arrow down into a circular track of coloured step nodes with tangent arrows, arrow out to WIN/LOSE outcome boxes at the bottom — followed by a text legend, a recap of every choice, and a **Name + Save** control. Save writes to localStorage. "Start Building →" is gated on a non-empty name.

**8. Experience.** Four cards, asked **fresh every session, never persisted with the game**:

| id | Label | Description |
|---|---|---|
| `beginner` | Complete beginner | "Explain everything, step by step." |
| `some` | Some experience | "Don't give me the basics — I've done this before." |
| `experienced` | Experienced | "Just give me the advanced topics." |
| `expert` | Expert | "Just here for inspiration." |

Only `beginner` changes anything: it alone inserts the Basic Navigation step. The other three promise advanced content that does not exist. In v2, either write that content or reword the options honestly.

**9. Walkthrough.** Steps in order:

| id | Title | Video file |
|---|---|---|
| `create_project` | Create Your Project | `videos/01_ProjectSetup.mp4` |
| `basic_nav` | Basic Navigation | `videos/02_BasicNavigation.mp4` |
| `block_out` | Block Out Your Island | `videos/03_BlockOut.mp4` |
| `core_devices` | Add Your Core Game Loop Devices | `videos/04_CoreDevices.mp4` |
| `look_good` | Make It Look Good | `videos/05_LookGood.mp4` |

`basic_nav` is filtered out unless `experienceLevel === 'beginner'`. Each step is a video slot plus body copy. A step tracker across the top shows done/active/upcoming. Footer has "← Back / ← Previous", an "Edit game type" escape hatch, and "Next: «next step» →" (final step: "Finish & back to my games").

**Step bodies (carry these over — they are good copy):**

- **Create Your Project** — open UEFN via the Epic Games Launcher or "Launch UEFN" from Fortnite's Creative options; New Project in the Project Browser; (branded) *"Choose the **«Brand»** brand template from the template picker so your project starts with its themed assets already loaded."* / (original) *"Choose a blank/default Fortnite template — no brand template needed for an original game."*; name it to match the idea; open it.
- **Basic Navigation** — camera (WASD fly, RMB drag to look, scroll or Q/E for fly speed); Outliner top right lists every object/device; **Details panel bottom right shows every setting for whatever is selected — this is where devices get configured later**; Content Browser at the bottom is where devices/props/assets are found; left-click to select, then Move/Rotate/Scale gizmo (W/E/R). Tip: *"Spend a few minutes just flying around and clicking on things in a blank project — muscle memory here will make every later step faster."*
- **Block Out Your Island** — rough out the physical layout with basic shapes before placing devices; don't worry about art. Tip box leads with `📐 For «Game Type»:` followed by the resolved `layout_tip`.
- **Add Your Core Game Loop Devices** — the generated device plan (see 2.3). Excludes `environment_atmosphere` devices. Header shows a device count. Includes a recap of the user's answers and a "Settings reminders" list combining answer-effect notes plus the game type's `extra_notes`.
- **Make It Look Good** — a brand info block (label, description, `provides[]`, `caveat`), a tip to reach for brand-themed assets wherever a device has an asset-picker setting, then the `environment_atmosphere` devices plus the three universal polish devices.

### 2.3 Device resolution — the core algorithm

`rebuildDevices()` returns `{ devices, notes, overrides }`:

- `devices` — `Map(deviceName → { device, purpose, category, settings, sources[] })`
- `notes` — `string[]`, free-text guidance not tied to one specific setting
- `overrides` — `Map(deviceName → Map(settingName → [{ source, value }]))`

Merge order, deduping into the map and **appending to `sources[]` rather than overwriting**:

```
1. universal_devices                    → source label "Always needed"
2. category baseline (if inherits_baseline) → source label "«Category» essentials"
3. game type devices                    → source label = game type label
4. game type base_set_settings          → override, source label "Base setup («Game Type»)"
5. each answer's effects:
     add_devices   → source label = the question prompt
     notes         → pushed onto notes[]
     set_settings  → override, source label "«question prompt» → «option label»"
```

Rendering then merges per device: each library setting starts as `{ source: "General guidance", text: <library default> }`, and any path-specific overrides for that setting name are appended underneath it. So a user sees *the general advice plus why their path changes it*. Devices are grouped by the eleven `meta.categories` roles, in that declared order, each with its own accent colour.

**Design note for v2:** this layering (general guidance + path override, each labelled with its source) is the part that makes the output feel expert rather than generic. Keep it. If you rebuild the data model, keep the ability to express *"this setting, generally X, but for your path Y."*

### 2.4 State and persistence

v1 state (a single global mutable object):

```js
{
  screen, categoryKey, gameTypeKey, brandKey, previewBrandKey,
  answers: [{ qId, qPrompt, optionValue, optionLabel }],
  stepIndex, gameId, gameName, devMode, experienceLevel
}
```

Saved-game record (schema 2):

```js
{
  schema: 2,
  id, name,
  categoryKey, gameTypeKey, brandKey,
  answers: [{ qId, qPrompt, optionValue, optionLabel }],
  savedAt: <ISO string>
}
```

Storage keys: `uefnGameCreatorGuide.savedGames`, `uefnGameCreatorGuide.devMode`.

`answers[]` is **positional** in v1 — `qIndex = answers.length`. This means you can only step back one question at a time and cannot edit a specific answer. See Part 7, item 9 — fix this in v2 by keying answers by `qId`.

---

## Part 3 — The question bank

**This is the heart of the tool.** 36 question instances across the 13 researched game types, 28 of them distinct. Transcribed verbatim.

Effect legend:

- `ADD` — adds device(s) to the plan. `ADD Device (purpose: …)` means the reference carries an overriding purpose string for that path.
- `SET` — overrides one setting on one device, with a reason.
- `NOTE` — free-text guidance shown in "Settings reminders".

Shared questions, reused across types: `loadout` (2 uses), `respawns` (2), `zone` (2), `boosts` (2), `fuel` (2), `traversal` (2), `vehicle_type` (2), `narrative` (2). Everything else appears once.

### 3.1 Combat

#### Elimination / Deathmatch — `combat_elimination_deathmatch` — 4 questions

**`team_mode`** — "Free-for-all, or team-based?"
- `ffa` — **Free-for-all**
  - SET `End Game` › `Game End Callout` = "Placement — treats individual finishing position as the win condition for a free-for-all."
- `teams` — **Team-based**
  - ADD `Team Settings and Inventory`
  - SET `End Game` › `Game End Callout` = "You Win/Lose — set this for a team vs. team outcome."

**`loadout`** — "Do players start with a fixed loadout, or scavenge weapons from the map?"
- `fixed` — **Fixed loadout** → ADD `Class Designer`, `Class and Team Selector`
- `scavenge` — **Scavenge from the map** → ADD `Item Spawner`

**`respawns`** — "Do eliminated players respawn, or are they out for the round?"
- `respawn` — **Respawns allowed** → ADD `Player Checkpoint`
- `out` — **Out for the round**
  - SET `Round Settings` › `Last Standing Wins` = "On — with no Player Checkpoint respawn in place, this makes the round end once only one player/team remains."

**`zone`** — "Fixed map boundary, or a shrinking storm/zone?"
- `fixed` — **Fixed boundary** → ADD `Barrier`
- `shrinking` — **Shrinking zone/storm**
  - ADD `Basic Storm Controller`, `Advanced Storm Controller`
  - NOTE "Pick ONE of Basic or Advanced Storm Controller, not both - Basic is simpler, Advanced supports per-phase tuning via Advanced Storm Beacon."

#### Team Elimination — `combat_team_elimination` — 3 questions

Same as Elimination / Deathmatch minus `team_mode`: **`loadout`**, **`respawns`**, **`zone`** — identical prompts, options and effects.

#### Zone Wars — `combat_zone_wars` — 3 questions

**`squad_size`** — "What squad size - solos, duos, or full squads?"
- `solo` — **Solos** → SET `Team Settings and Inventory` › `Max Initial Team Size` = "1 (solos)."
- `duo` — **Duos** → SET same = "2 (duos)."
- `squad` — **Full squads** → SET same = "3-4 (full squads)."

**`reboot`** — "Allow teammates to be revived/rebooted after elimination?"
- `yes` — **Yes** → ADD `Reboot Van`
- `no` — **No** → (no effects)

**`rounds`** — "Single round decider, or best-of-series?"
- `single` — **Single round** → NOTE "A single-round decider needs no extra config beyond one Round Settings device."
- `series` — **Best-of-series** → NOTE "UEFN has no single 'number of rounds' field — drive a best-of-series with a Score Manager win target (e.g. Score Award Type: Add, first team to 3 round-win points takes the match)."

#### Box Fights — `combat_box_fights` — 2 questions

**`size`** — "What team size - 1v1, 2v2, or larger squads?"
- `1v1` — **1v1** → NOTE "Configure two Player Spawners, one per side of the box."
- `2v2` — **2v2** → NOTE "Configure spawners for 2-player teams."
- `squad` — **Larger squads** → NOTE "Configure spawners for 3+ player teams and consider a larger box."

**`materials`** — "Infinite building materials, or a limited supply per round?"
- `infinite` — **Infinite** → NOTE "Grant a large starting material count via Team Settings and Inventory / Class Designer, and rely on Round Settings' 'Keep Items Between Rounds' = Off to top players back up each round."
- `limited` — **Limited** → NOTE "Grant a fixed, smaller starting material count via Team Settings and Inventory / Class Designer with no extra restock."

### 3.2 Survival & Horror

#### Horror Chase — `survival_horror_chase` — 2 questions

**`puzzles`** — "Does the experience include locked-door puzzles/clues (escape-room style)?"
- `yes` — **Yes, puzzles** → ADD `Lock`, `Attribute Evaluator`, `Switch`
- `no` — **No puzzles** → (no effects)

**`narrative`** — "Does it need narrative dialogue/clues delivered to the player?"
- `yes` — **Yes** → ADD `Conversation`, `Popup Dialog`
- `no` — **No** → (no effects)

### 3.3 Adventure & RPG

#### Action RPG — `adventure_action_rpg` — 4 questions

**`combat`** — "Does the adventure include combat encounters?"
- `yes` — **Yes**
  - ADD `Creature Spawner`, `Creature Manager`
  - ADD `Class Designer` (purpose: "Defines character build/class options with distinct loadouts.")
- `no` — **No, exploration/story only** → (no effects)

**`economy`** — "Does the world include shops/economy for gear or upgrades?"
- `yes` — **Yes**
  - ADD `Vending Machine` (purpose: "Sells items for an in-game currency.")
  - ADD `Stat Powerup` (purpose: "Grants/deducts the currency stat for purchases and rewards.")
- `no` — **No** → (no effects)

**`gating`** — "Are areas/dungeons gated behind keys, quests, or progression?"
- `yes` — **Yes**
  - ADD `Lock` (purpose: "Locks a door/area until a key or quest condition is met.")
  - ADD `Attribute Evaluator` (purpose: "Checks quest/progress conditions to unlock gated content.")
- `no` — **No, open world** → (no effects)

**`persistence`** — "Should player progress persist across play sessions (save/load)?"
- `yes` — **Yes** → ADD `Save Point`
- `no` — **No, single-session only** → (no effects)

### 3.4 Simulation & Tycoon

#### Tycoon — `sim_tycoon_tycoon` — 4 questions

**`currency_source`** — "How do players earn currency - idle generation, collecting resources, or combat?"
- `idle` — **Idle generation over time** → NOTE "Drive Stat Powerup from a repeating Timer instead of a player action."
- `collect` — **Collecting resources** → ADD `Collectible Object`
- `combat` — **Combat / eliminations** → ADD `Elimination Manager`

**`shop`** — "How do players spend currency - a Vending Machine style shop, or custom upgrade buttons?"
- `vending` — **Vending Machine shop** → ADD `Vending Machine`
- `custom` — **Custom upgrade buttons** → ADD `Conditional Button`

**`base_expansion`** — "Do upgrades physically expand/change the player's base (walls dropping, new rooms revealed)?"
- `yes` — **Yes, base changes physically** → ADD `Prop Mover`, `Prop Manipulator`
- `no` — **No, only stat/loadout upgrades** → (no effects)

**`win_condition`** — "Win by reaching a currency goal first, or highest currency when time runs out?"
- `goal` — **First to reach a goal** → SET `Tracker` › `When Target Is Reached` = "End Round — ends the moment a player's tracked currency stat hits your goal."
- `timelimit` — **Highest total at time limit** → SET `Timer` › `Completion Behavior` = "Stop or Disable at the time limit, then declare the winner as whoever has the highest Stat Creator (currency) value."

### 3.5 Platforming & Movement

#### Parkour — `platforming_parkour` — 1 question
#### Deathrun / Obby — `platforming_deathrun_obby` — 1 question (identical)

**`traversal`** — "Any special traversal mechanics (rails, boosters, teleport resets)?"
- `none` — **No, just jumping** → (no effects)
- `rails` — **Grind rails / vines** → ADD `Grind Rail`
- `boost` — **Boost pads / launchers** → ADD `Air Vent`, `Bouncer`
- `reset` — **Teleport back to checkpoint on fail** → ADD `Teleporter`

Note this question has **four** options and no "no" default — `none` is a real choice.

### 3.6 Puzzle & Mystery

#### Escape Room — `puzzle_escape_room` — 2 questions

**`narrative`** — "Does it need narrative dialogue/clues delivered to the player?"
- `yes` — **Yes** → ADD `Conversation`, `Popup Dialog`
- `no` — **No** → (no effects)

**`chaser`** — "Is there a monster/chaser NPC that hunts the player?"
- `yes` — **Yes**
  - ADD `Creature Placer`, `AI Patrol Path Node`, `Perception Trigger`
  - NOTE "Set 'End Game' fail condition to trigger when the chaser catches the player."
  - NOTE "There's no single 'fail state' field — wire the chaser catching a player (e.g. via a Damage Volume set to Elimination, or directly in Verse) into your normal elimination flow so Round Settings handles the fail state."
- `no` — **No, puzzles/atmosphere only** → (no effects)

### 3.7 Party & Minigames

#### Prop Hunt / Hide-and-Seek — `party_prop_hunt` — 3 questions

**`hide_time`** — "Give hiders a head-start to hide before seekers are released?"
- `yes` — **Yes, head-start** → ADD `Barrier` (purpose: "Temporarily contains Seekers in a holding area during the hide phase.")
- `no` — **No, release together** → (no effects)

**`seeker_weapon`** — "Do seekers get a weapon/ability to eliminate hiders, or must they melee/interact?"
- `weapon` — **Give seekers a weapon** → ADD `Item Granter`
- `melee` — **Melee/interact only** → (no effects)

**`instructions`** — "Show on-screen round instructions/reminders?"
- `yes` — **Yes** → ADD `HUD Message`
- `no` — **No** → (no effects)

### 3.8 Sports & Racing

#### Circuit Racing — `sports_circuit_racing` — 4 questions

**`vehicle_type`** — "Vehicle-based race, or on-foot race?"
- `vehicle` — **Vehicle-based**
  - ADD `Vehicle Spawner (specific type, e.g. Sports Car / ATK / Driftboard)`
  - NOTE "Pick the specific Vehicle Spawner device matching your chosen vehicle (e.g. Sports Car, ATK, Driftboard, Boat)."
- `onfoot` — **On-foot**
  - ADD `Player Movement Settings`
  - SET `Player Movement Settings` › `Walk Maximum Speed` = "Increase above 'Don't Override' so the foot race feels fast-paced."

**`boosts`** — "Include speed boosts or hazards along the track?"
- `boosts` — **Yes, boosts** → ADD `Nitro Hoop`, `Nitro Barrel Spawner`
- `hazards` — **Yes, hazards** → ADD `Physics Boulder`
- `none` — **No, clean track** → (no effects)

**`fuel`** — "Does the vehicle need fuel management?"
- `yes` — **Yes** → ADD `Fuel Pump`, `Vehicle Service Station`
- `no` — **No** → (no effects)

**`format`** — "Fixed number of laps, or point-to-point race?"
- `laps` — **Fixed laps** → SET `Volume` › `Player Events Enabled` = "On — chain multiple checkpoint Volumes in sequence and only count a lap once all are passed in order (this is done by wiring their events together, not a single dropdown)."
- `pointtopoint` — **Point-to-point** → SET `Volume` › `Player Events Enabled` = "On — wire the final checkpoint Volume's On Enter event to end the round for a point-to-point finish."

#### Time Trial — `sports_time_trial` — 3 questions

**`vehicle_type`**, **`boosts`**, **`fuel`** — identical to Circuit Racing. Time Trial excludes the `format` question and instead bakes its lap handling into `base_set_settings`.

### 3.9 Categories with no researched types

**Social & Roleplay** and **Strategy & Defense** have **zero** researched game types. Both are still reachable because their "Just give me the basics" custom entry is marked `live`. Both therefore offer only baseline advice while looking as complete as the other eight categories. See Part 7, item 3.

---

## Part 4 — Data model

Seven top-level keys.

```
meta                      title, version, description, how_it_works[], categories[],
                          game_categories[], brand_image_spec{}, brand_rules_research_note,
                          default_brand_id, dev_mode_default

universal_devices         [{ ref }]                      // Player Spawner, End Game
universal_polish_devices  [{ ref }]                      // Sky Dome, Customizable Light, Audio Player

device_library            { "<exact UEFN device name>": { category, purpose, settings[] } }
category_baselines        { <category_id>: { devices[], core_loop{}, layout_tip } }
game_types                { <game_type_id>: { … } }
brand_templates           [ { … } ]                      // an ARRAY, not an object
```

### 4.1 `device_library` entry

```js
"Round Settings": {
  category: "game_loop",
  purpose: "Controls per-round inventory reset and, via 'Last Standing Wins', the classic elimination-style win condition.",
  settings: [ { name: "Last Standing Wins", default: "On, for an elimination-style win condition…" }, … ]
}
```

`settings[].name` must be the **actual UEFN Details-panel field name**. `settings[].default` is a sentence of guidance, not just a value — it often explains the trade-off, not merely the recommended setting. This is deliberate and should survive into v2.

### 4.2 `game_types` entry

```js
"combat_zone_wars": {
  category: "combat",
  label: "Zone Wars",
  description: "Squad-based build-and-fight game inside a rapidly shrinking zone, usually with preset loadouts and building materials.",
  status: "live",                    // 'live' | 'draft'
  inherits_baseline: false,
  devices: [ { ref: "Team Settings and Inventory" }, … ],
  questions: [ { id, prompt, options: [ { value, label, effects } ] } ],
  base_set_settings: [ { device, setting, value } ],
  extra_notes: [ "…" ],
  layout_tip: "…",
  core_loop: { entry, loop: [], outcomes: [ { label, detail } ] },
  is_custom: true                    // only on the ten "Just give me the basics" entries
}
```

Draft entries carry `research_notes` (required) and empty `devices` / `questions` / `base_set_settings` / `extra_notes`, with `inherits_baseline: true`, `layout_tip: ""` and `core_loop: null`.

Effect shapes inside a question option:

```js
effects: {
  add_devices:  [ { ref: "Barrier", purpose?: "…" } ],
  notes:        [ "…" ],
  set_settings: [ { device: "End Game", setting: "Game End Callout", value: "…" } ]
}
```

### 4.3 `category_baselines` entry

```js
combat: {
  devices: [ { ref: "Score Manager" }, { ref: "Round Settings" }, … ],
  core_loop: { entry, loop: [], outcomes: [ { label, detail } ] },
  layout_tip: "…"
}
```

### 4.4 `meta.game_categories` — the ten categories

| id | Label | Description |
|---|---|---|
| `combat` | Combat | Fight players or enemies using weapons, abilities, or melee combat. |
| `survival_horror` | Survival & Horror | Stay alive against enemies, hazards, limited resources, or a pursuing threat. |
| `adventure_rpg` | Adventure & RPG | Explore a world, complete quests, grow stronger, and progress through an adventure. |
| `social_roleplay` | Social & Roleplay | Socialise, express an identity, or create player-led stories. |
| `sim_tycoon` | Simulation & Tycoon | Earn, build, collect, manage, and optimise systems over time. |
| `platforming` | Platforming & Movement | Complete courses using jumping, traversal, timing, and precision. |
| `puzzle_mystery` | Puzzle & Mystery | Progress by solving clues, mechanisms, or logical challenges. |
| `party_minigames` | Party & Minigames | Play short, replayable multiplayer rounds with simple rules. |
| `sports_racing` | Sports & Racing | Compete through vehicles, sports rules, laps, scores, or timed performance. |
| `strategy_defense` | Strategy & Defense | Win through planning, positioning, placement, and resource decisions. |

### 4.5 `meta.categories` — the eleven **device-role** groupings

Declared in this order; device cards are grouped and coloured in this sequence.

| id | Label | Colour (v1) |
|---|---|---|
| `game_loop` | Game Loop & Rules | `#7c5cff` |
| `player_setup` | Player Setup | `#3fd0c9` |
| `npc_setup` | NPC Setup | `#54c7ff` |
| `monster_setup` | Monster/Enemy Setup | `#ff6b6b` |
| `combat_hazards` | Combat & Hazards | `#ff9f5b` |
| `zones_boundaries` | Zones & Boundaries | `#f7d060` |
| `traversal_vehicles` | Traversal & Vehicles | `#5ba8ff` |
| `economy_progression` | Economy & Progression | `#8de08a` |
| `structures_interactables` | Structures & Interactables | `#c98bff` |
| `environment_atmosphere` | Environment & Atmosphere | `#57e0c0` |
| `ui_feedback` | UI & Feedback | `#ff8ac0` |

**Note:** `environment_atmosphere` is special-cased. Those devices are excluded from the "core game loop devices" step and shown in "Make It Look Good" instead. In v2 this should be data (a flag on the role), not a hardcoded id in two render functions.

### 4.6 `meta.how_it_works` (v1 text, 12 entries)

Carried over so v2 can rewrite it rather than rediscover it:

1. Step 1: 'What type of game do you want to make?' — the user picks one of 10 top-level game categories.
2. Step 2: 'Which one exactly?' — they pick an exact game type within that category (or 'Just give me the basics' for the category's essential devices only). Game types are 'live' (fully researched) or 'draft' (visible only in development mode; resolves to the category baseline device set until researched).
3. Step 3: The tool walks the ordered 'questions' list for that game type, one at a time.
4. Step 4: The user picks a Brand Template (Original, or a licensed IP) — this determines the starter asset pack available in their island, and highlights brands that suit the chosen game type. It does not change which devices the game needs mechanically.
5. Step 5: A restriction-confirmation screen summarizes that brand's usage rules (revenue share, asset limits, content restrictions) with a link to the full official guidelines, before confirming or going back.
6. Step 6: A Summary screen shows the game type's core loop as a circular diagram (entry point → repeating loop → win/lose outcomes), a recap of all choices, and a Name + Save (to localStorage) control.
7. Step 7: Before the build steps, an experience-level screen (Complete beginner / Some experience / Experienced / Expert) is asked fresh every time (never saved with the game). Anyone other than Complete beginner skips the Basic Navigation step.
8. Step 8: A 4-or-5-step build walkthrough (Basic Navigation only for Complete beginners): Create Your Project, [Basic Navigation], Block Out Your Island, Add Your Core Game Loop Devices, Make It Look Good — each with a video slot.
9. Devices live in a shared device_library keyed by device name (each with exact UEFN Details-panel settings). Game types reference devices by name; the final list merges universal_devices + the category baseline (for types that inherit it) + the game type's own devices + anything added by question answers, de-duplicated.
10. Each device carries a 'category' tag (see meta.categories) so the results screen groups devices by role.
11. Setting names and values reflect the ACTUAL UEFN Details panel property names and dropdown options (researched from Epic's official documentation).
12. Development mode (header toggle, persisted): off = only live game types are selectable; on = drafts appear too, badged with what hasn't been researched yet. Saved games always load regardless of the toggle.

---

## Part 5 — Reference data

### 5.1 Taxonomy — all 97 game types

23 `live` (13 researched + 10 custom), 74 `draft`.

**Combat** — L: Elimination / Deathmatch, Team Elimination, Zone Wars, Box Fights · D: Battle Royale, Objective Shooter, Hero / Class Arena, Melee / Fighting Arena, PvE Combat
**Survival & Horror** — L: Horror Chase · D: Wave / Horde Survival, Open-World Survival, Survival Crafting, Extraction, Zombie / Infection Survival, Asymmetric Hunter vs Survivors, Disaster Survival, Stealth Escape
**Adventure & RPG** — L: Action RPG · D: Story Adventure, Open-World Questing, Dungeon Crawler, Roguelike / Run-Based, Co-op Campaign, Exploration / Scavenger Hunt, Boss Rush, Combat Gauntlet
**Social & Roleplay** — **no live types** · D: Social Hangout, Life / Town Roleplay, Job / Career Roleplay, Character Roleplay, Avatar / Dress-Up, Build & Decorate Sandbox, Virtual Venue / Event, Community Hub
**Simulation & Tycoon** — L: Tycoon · D: Incremental / Clicker, Idle Game, Business / Shopkeeper, Farming / Life Sim, Management / Automation, Vehicle Simulator, Pet / Creature Collector, Trading / Economy Sandbox
**Platforming & Movement** — L: Parkour, Deathrun / Obby · D: Precision Platformer, Runner, Tower Climb, Movement Race, Stunt / Trick Course, Physics / Ragdoll Course
**Puzzle & Mystery** — L: Escape Room · D: Logic Puzzle, Cooperative Puzzle, Physics Puzzle, Investigation / Detective, Hidden Object / Search, Puzzle Platformer, Code / Pattern Puzzle
**Party & Minigames** — L: Prop Hunt / Hide-and-Seek · D: Minigame Collection, Social Deduction, Tag, Infection, Elimination Party Game, Trivia / Quiz, Drawing / Guessing, Music / Rhythm
**Sports & Racing** — L: Circuit Racing, Time Trial · D: Stunt Racing, Kart / Combat Racing, Team Sports, Individual Sports, Arena / Fantasy Sports, Vehicle Trials, Flight / Boat Racing
**Strategy & Defense** — **no live types** · D: Tower Defense, Base Defense, Real-Time Strategy, Tactical / Turn-Based, Territory Control, MOBA / Lane Strategy, Auto Battler, Board / Card Strategy, Resource War / Base Building

Plus one `«category»_custom` entry per category, labelled **"Just give me the basics"**, `status: 'live'`, `is_custom: true`, `inherits_baseline: true`, **zero questions**. All ten custom entries inherit their category baseline, so they resolve to real (if generic) device lists — which is what makes every category reachable with dev mode off.

Note the three-way split of the 97: **13 researched live** (`inherits_baseline: false`, own devices, own questions, own core loop) · **10 custom live** (baseline only, no questions) · **74 draft** (`inherits_baseline: true`, empty `devices`, empty `questions`, `core_loop: null`, `layout_tip: ""`, and a required `research_notes`). The 74 drafts and the 10 customs therefore resolve to **identical** device lists — the only difference is the badge and the presence of `research_notes`.

Game-type ids follow a `«category»_«type»` pattern: `combat_elimination_deathmatch`, `survival_horror_wave_horde_survival`, `adventure_rpg_boss_rush`, `platforming_deathrun_obby`, `puzzle_mystery_hidden_object_search`, `party_minigames_social_deduction`, `sports_racing_kart_combat_racing`, `strategy_defense_resource_war_base_building`, `sim_tycoon_incremental_clicker`, `social_roleplay_build_decorate_sandbox`.

**Coverage reality check.** 74 of 97 types are empty; 84 of 97 have no `core_loop`; mean questions per type is 0.37. All 74 drafts have empty `devices` and `questions`, so in practice "Draft" and "Just give me the basics" produce near-identical output. **The taxonomy is far ahead of the research.** v2 inherits a *content pipeline* problem, not a code problem — plan for it explicitly.

#### 5.1.1 Draft descriptions — carry these over

Every draft entry has a **real, hand-written one-line description**, shown on the game-type card. Without these, 74 of 97 cards render blank. Reproduce verbatim.

| Combat | |
|---|---|
| Battle Royale | Large-scale last-one-standing: drop in, loot up, and outlive everyone inside a shrinking zone. |
| Objective Shooter | Combat built around objectives — capture points, escort payloads, or plant/defuse — not just eliminations. |
| Hero / Class Arena | Pick a hero or class with distinct abilities and fight in arena battles. |
| Melee / Fighting Arena | Close-quarters melee duels and brawls — no guns, all footwork and timing. |
| PvE Combat | Fight AI enemies co-operatively instead of other players. |

| Survival & Horror | |
|---|---|
| Wave / Horde Survival | Hold out against escalating waves of enemies for as long as you can. |
| Open-World Survival | Manage hunger, resources and threats across a persistent open map. |
| Survival Crafting | Gather resources, craft gear and build shelter to survive the world. |
| Extraction | Get in, grab valuable loot, and get out alive — losing means losing what you carried. |
| Zombie / Infection Survival | Survive zombie hordes — or an infection that turns fallen players into the threat. |
| Asymmetric Hunter vs Survivors | One empowered hunter stalks a team of weaker survivors with their own objectives. |
| Disaster Survival | Survive scripted disasters — floods, fires, collapses — as the map turns against you. |
| Stealth Escape | Slip past guards and detection to escape without being caught. |

| Adventure & RPG | |
|---|---|
| Story Adventure | A guided narrative journey through set pieces, characters and scripted moments. |
| Open-World Questing | A free-roam world dotted with quests players tackle in their own order. |
| Dungeon Crawler | Descend room by room through enemies and loot toward a boss. |
| Roguelike / Run-Based | Short runs that end in death — each attempt earns progress toward stronger future runs. |
| Co-op Campaign | A campaign built for a squad to play through together, start to finish. |
| Exploration / Scavenger Hunt | Explore to find hidden items, secrets or collectibles scattered across the map. |
| Boss Rush | Back-to-back boss fights with escalating difficulty and minimal filler. |
| Combat Gauntlet | A linear sequence of combat arenas — clear one to unlock the next. |

| Social & Roleplay | |
|---|---|
| Social Hangout | A relaxed space built for chatting, emoting and hanging out with friends. |
| Life / Town Roleplay | Live a fictional daily life in a shared town — homes, jobs and neighbours. |
| Job / Career Roleplay | Play out a profession — police, medic, chef — with tasks that sell the fantasy. |
| Character Roleplay | Take on a persona and improvise stories with other players in a themed setting. |
| Avatar / Dress-Up | Style, pose and show off looks — expression is the gameplay. |
| Build & Decorate Sandbox | Claim a space and make it yours — building and decorating as the core activity. |
| Virtual Venue / Event | A stage for shows, screenings and live events with an audience. |
| Community Hub | A persistent home base for a community — notice boards, hangout zones and portals. |

| Simulation & Tycoon | |
|---|---|
| Incremental / Clicker | Tap, earn, upgrade, repeat — numbers that grow satisfyingly out of control. |
| Idle Game | Systems that keep earning while players are away — checking in is the loop. |
| Business / Shopkeeper | Run a shop: stock it, serve customers and reinvest the profits. |
| Farming / Life Sim | Plant, tend, harvest and slowly upgrade a homestead. |
| Management / Automation | Design systems that run themselves — conveyor logic, production chains, optimisation. |
| Vehicle Simulator | Drive, collect and upgrade vehicles as the core progression. |
| Pet / Creature Collector | Hatch, collect and upgrade pets or creatures — collection is the goal. |
| Trading / Economy Sandbox | A player-driven economy of gathering, trading and profit. |

| Platforming & Movement | |
|---|---|
| Precision Platformer | Tight, demanding jumps where a single mistimed input costs the run. |
| Runner | Constant forward motion — dodge, jump and slide through an onrushing course. |
| Tower Climb | Ascend a vertical course where falling means losing progress. |
| Movement Race | Head-to-head footraces through a traversal course. |
| Stunt / Trick Course | Chain stylish moves and stunts for points, not just completion. |
| Physics / Ragdoll Course | Wobbly physics chaos — the comedy of losing control is the point. |

| Puzzle & Mystery | |
|---|---|
| Logic Puzzle | Self-contained brain-teasers — sequences, deductions and aha moments. |
| Cooperative Puzzle | Puzzles that need two or more players acting in sync to solve. |
| Physics Puzzle | Move, stack and trigger objects — the physics engine is the puzzle. |
| Investigation / Detective | Gather evidence, interview suspects and name the culprit. |
| Hidden Object / Search | Find cleverly hidden items scattered through a detailed scene. |
| Puzzle Platformer | Traversal challenges where the route itself is the puzzle. |
| Code / Pattern Puzzle | Crack codes, ciphers and patterns to progress. |

| Party & Minigames | |
|---|---|
| Minigame Collection | A rotating set of quick minigames — variety keeps the lobby laughing. |
| Social Deduction | Hidden roles, accusations and votes — find the impostor before they win. |
| Tag | It chases everyone else — simple rules, instant fun. |
| Infection | Tagged players join the infected team until no survivors remain. |
| Elimination Party Game | Each quick round knocks players out until one remains. |
| Trivia / Quiz | Answer questions to score, survive or advance. |
| Drawing / Guessing | One player draws or performs, everyone else races to guess. |
| Music / Rhythm | Hit the beat — timing-based play set to music. |

| Sports & Racing | |
|---|---|
| Stunt Racing | Races scored on style — jumps, flips and near-misses count. |
| Kart / Combat Racing | Racing with pickups and sabotage — first place is always under attack. |
| Team Sports | Team vs. team ball or goal sports with positions and set plays. |
| Individual Sports | Solo athletic competition — golf, bowling, target sports and more. |
| Arena / Fantasy Sports | Invented sports with their own rules, arenas and physics. |
| Vehicle Trials | Technical vehicle courses that punish sloppy control. |
| Flight / Boat Racing | Racing in the air or on water — different physics, same finish line. |

| Strategy & Defense | |
|---|---|
| Tower Defense | Place defenses along enemy paths and survive escalating waves. |
| Base Defense | Fortify and defend a base against attacks from players or AI. |
| Real-Time Strategy | Gather, build and command in real time to out-produce and out-fight. |
| Tactical / Turn-Based | Deliberate, turn-by-turn positioning where planning beats reflexes. |
| Territory Control | Capture and hold zones — the map itself is the scoreboard. |
| MOBA / Lane Strategy | Lanes, minions and objectives — push toward the enemy core as a team. |
| Auto Battler | Draft and position units, then watch the fight resolve itself. |
| Board / Card Strategy | Board-game or card-game strategy rebuilt as an island. |
| Resource War / Base Building | Gather resources, build up, and crush the other bases. |

#### 5.1.2 Generated copy — templates

**Draft `research_notes`** — one template per category (10 distinct templates in v1, not 74 bespoke strings):

```
Draft — devices come from the «Category Label» baseline plus the universal set.
Game-type-specific devices, exact settings, follow-up questions and the core loop
haven't been researched for «Label» yet.
```

**Custom entry `description`** — also one template, per category:

```
Skip the specifics — start with the essential «Category Label» devices and shape the rest yourself as you build.
```

Both are safe to generate in v2 rather than store per-entry — but keep the exact wording, since the draft note is the user's only signal that a type is unresearched.

### 5.2 Device library — 59 devices

Format: **Device name** `[role]` — purpose, then its settings as `name` = guidance.

#### Game Loop & Rules (`game_loop`)

**End Game** — Configures how the round/match ends and who's declared the winner once triggered. There's no single built-in 'win condition' — you wire in an event from Round Settings, Score Manager, or a Tracker when your win condition is actually met.
- `What to End` = Options: End Round / End Game. End Round for a multi-round match, End Game for a single decisive match.
- `Winning Team` = There's no single 'win condition' field — wire an event from Round Settings, Score Manager, or a Tracker into this device once your win condition is met, and set Winning Team from that event.
- `Game End Callout` = Options: You Win/Lose / Placement / Cooperative. You Win/Lose for team vs team, Placement for FFA/battle-royale style.

**Round Settings** — Controls per-round inventory reset and, via 'Last Standing Wins', the classic elimination-style win condition.
- `Last Standing Wins` = On, for an elimination-style win condition (last player/team standing wins the round). Toggle via 'Override Last Standing Wins' first.
- `Round` = Set which round number(s) this configuration applies to, or All.
- `Keep Items Between Rounds` = Off for a fresh loadout each round, On for persistent progress.

**Score Manager** — Tracks eliminations/points per player or team.
- `Score Value` = Set the point value per elimination/objective (default 1).
- `Score Award Type` = Options: None / Add / Subtract / Set. Add for an ongoing tally, Set to force a specific value.
- `Activating Team` = Set to whichever team/player triggers a score change.

**Timer** — Round countdown for the hide/seek phase.
- `Duration` = Set to your intended round/escape/race time limit (default 1 min).
- `Count Down Direction` = Options: Count Down / Count Up. Count Down for a time-limited objective, Count Up for a race/best-time stopwatch.
- `Completion Behavior` = Options: Disable / Stop / Reset / Restart. Match what should happen when time runs out.

#### Player Setup (`player_setup`)

**Player Spawner** — Spawns agents into the island. Every experience needs at least one per team/role.
- `Player Team` = Set to match each team number; use None/Any for free-for-all.
- `Priority Group` = Leave 'Don't Override' unless you need a specific spawn order.
- `Enemy Range Check` = Set a minimum distance from enemies to avoid instant spawn-kills.

**Player Checkpoint** — Sets/refreshes an agent's respawn point.
- `Reset Inventory` = Off for parkour/racing (keep progress), On for elimination round resets.
- `Activating Team` = Restrict to the relevant team, or leave open if shared.
- `Enabled During Phase` = Match your game's phase structure (e.g. Gameplay Only).

**Team Settings and Inventory** — Assigns players to teams and configures per-team starting inventory.
- `Max Initial Team Size` = Set to your intended squad size (e.g. 1 for solos, 2 for duos, 4 for full squads).
- `Team` = Set which team number this configuration applies to.
- `Respawn Type` = Options: Individual / Wave. Individual for standard respawns, Wave for round-based team respawns.

**Class Designer** — Defines a custom class with a preset inventory loadout.
- `Class Name` = Give it a clear, thematic name players will recognize.
- `Max Health` = Adjust only if this class should be tankier/less tanky than default.
- `Allow Building` = Options: None / All / Traps Only / No Traps. Match your genre — e.g. No Traps for box fights.

**Class and Team Selector** — Controls which classes are available to which players/teams.
- `Class to Switch To` = Pick the Class Designer class this selector assigns.
- `Team To Switch To` = Pick the team this selector assigns, if any.
- `Clear Items On Switch` = Options: Never / Team / Class / Always. Always gives a clean reset on switch.

**Player Movement Settings** — Adjusts a player's movement speed/jump for a faster-paced on-foot race.
- `Walk Maximum Speed` = Increase above 'Don't Override' for a faster-paced foot race or traversal game.
- `Jump Velocity` = Raise above 'Don't Override' if your course/game relies on higher jumps than default.
- `Category Filter` = Filter to just the movement categories you're actually tuning (e.g. Walking, Jumping).

**Reboot Van** — Lets players bring eliminated teammates back into the game.
- `Recharge Time` = Shorter (below 30s default) for a fast-paced game, longer for a slower-burn match.
- `Reboot Progress Delay` = Options: Custom Decay / Instant Reset / Battle Royale. Instant Reset for quick reboots.

**Save Point** — Saves and loads a player's inventory, class, team, and stats across sessions.
- `Auto-Load Behavior` = Every Spawn, so returning players always pick up where they left off.
- `Save Loadout` = On, if class/inventory should persist across sessions.

**Disguise** — Core mechanic - lets Hiders transform into a prop cosmetically.
- `Disguise to Apply` = Pick a prop/cosmetic that blends into the environment players are hiding in.
- `Disguise Breaks on Damage` = Options: On Damaged / On Damaged By Opponent / On DBNO / On Eliminated / Off. On Damaged By Opponent so only real hits break cover.
- `Team to Apply To` = Restrict to the Hiders team.

#### NPC Setup (`npc_setup`)

**NPC Spawner** — Spawns quest-giver or friendly NPCs from a Character Definition asset.
- `NPC Character Definition` = Build the NPC's look/behavior in a Character Definition asset, then link it here.
- `Spawn Character at Game Start` = On, for a persistent quest-giver NPC.
- `Total Spawn Limit` = Cap it so quest-giver NPCs don't overpopulate the area.

**Conversation** — Branching narrative dialogue built via the Conversation Graph.
- `Conversation` = Build the dialogue tree in the Conversation Graph editor (a Conversation Bank asset), then link it here.
- `Conversation Type` = Options: Radial / Box / Custom. Radial for quick prompts, Box for longer scripted dialogue.

#### Monster / Enemy Setup (`monster_setup`)

**Creature Spawner** — Spawns waves of enemy creatures at intervals.
- `Number of Creatures` = Set to how many creatures spawn per wave (default 4).
- `Wave Timer` = Space waves out enough for players to catch their breath.
- `Creature Type` = Mix types for variety in later waves.

**Creature Placer** — Spawns the chaser NPC at a fixed location or on trigger.
- `Creature Type` = Choose the specific chaser/enemy creature for this encounter.
- `Enable on Game Phase` = Options: Never / Game Countdown / Game Start. Game Start for a standard encounter.
- `Despawn Type` = Options: Distance To Enemy / Distance To Spawner / Do Not Despawn. Distance To Enemy for a persistent chaser.

**Creature Manager** — Tunes creature health/damage/drops for difficulty scaling.
- `Creature Type` = Pick the creature/wildlife type this manager should tune (e.g. Fiend).
- `Health` = Scale up for later waves/harder difficulty, down for early encounters.
- `Affected Creatures` = Options: New Creatures Only / New and Existing Creatures. Pick the latter to apply retroactively.

**AI Patrol Path Node** — Defines a patrol route so the chaser doesn't stay static.
- `Patrolling Mode` = Options: Back and Forth / Looping / Stop at End. Use Looping for a continuous patrol route.
- `Enabled at Start` = On, so the patrol begins immediately when the game starts.

**Perception Trigger** — Detects when the chaser has line-of-sight to the player to escalate tension/attacks.
- `Activating Team` = Restrict to the team you want this to detect (e.g. Hiders), or leave Any.
- `Delay` = Add a short delay so detection doesn't feel instant/unfair.
- `Enabled on Game Start` = On.

#### Combat & Hazards (`combat_hazards`)

**Damage Volume** — Hazard area that damages/eliminates players who touch it.
- `Damage` = High enough to eliminate/deter on contact for a hazard; low for a 'slow' zone (default 10).
- `Damage Tick Rate` = Shorter interval (below the 2s default) is more punishing.
- `Damage Type` = Options: Elimination / Damage Over Time. Elimination for an instant-kill hazard, Damage Over Time for a gentler zone.

**Trick Tile** — Trap tile that destroys itself (and drops the player) when activated.
- `Trigger on Player Contact` = Yes, for a classic deathrun trap.
- `Activation Delay` = A short delay (e.g. 2 seconds or less) so it feels reactive, not instant.
- `Reset After` = Set a reset time if the trap should reappear; Never if it's a one-time trap.

**Pinball Bumper** — Knocks players off narrow paths as an obstacle.
- `Knockback Player` = Strong enough to matter but not so strong players fly off the course.
- `Damage` = Light chip damage for a fun bounce, higher if it should be a genuine hazard (default None).
- `Bumper Color` = Options: Blue / Blue Glow / Red / Silver / Pink Glow / Green Glow / Orange Glow / Gold. Match your theme.

**Physics Boulder** — Rolling obstacle that can damage/knock racers off course.
- `Health` = High enough to survive normal fights; low if it should be easily destroyed to disable the trap (default 180).
- `Damage to Players` = High enough to threaten (default 150); lower if it's a repeatable hazard.
- `Timed Respawn` = Set a respawn time (e.g. 15m) if the trap should reset.

**Elimination Manager** — Grants currency-equivalent items/stat when an agent is eliminated.
- `Number of Items Dropped` = Set to how much loot you want dropped on elimination (default All).
- `Target Type` = Players Only, unless you also want creature eliminations to drop loot.
- `Random Drop` = Options: Off / Random / No Repeats. Off for guaranteed drops, Random for variety.

#### Zones & Boundaries (`zones_boundaries`)

**Barrier** — Blocks movement and weapon fire at the play area edge.
- `Zone Shape` = Options: Box / Hollow Box / Cylinder. Match your play area's shape.
- `Barrier Material` = Translucent (Red) for a visible boundary players understand, or another style for a hidden kill-box.
- `Block Weapon Fire` = On, so the barrier fully blocks the boundary.

**Volume** — Used as checkpoint gates around the track to validate lap progress.
- `Volume Shape` = Options: Box / Cylinder / Sphere. Match the shape of the checkpoint gate or area you're detecting.
- `Player Events Enabled` = On, so player Enter/Exit actually fires events.
- `Volume Width/Depth/Height` = Size to fully cover the area you're detecting.

**Basic Storm Controller** — Simple single-phase shrinking storm; use for a lightweight zone.
- `Initial Radius` = Set to your starting safe-zone size (default 50M).
- `Final Radius` = Set to 0 (or a small end-circle) so the zone fully closes.
- `Damage Level` = Higher forces players in faster; keep low for a casual mode.

**Advanced Storm Controller** — Multi-phase (up to 50) storm for more tuned pacing; alternative to Basic Storm Controller.
- `Phase One Radius` = Set to your map's starting safe-zone size (default 200M, range 5-5000M).
- `Use Custom Storm Phases` = Yes, if you're placing Advanced Storm Beacon devices to customize individual phases.
- `Bounds Radius` = Set to your overall play-area radius (default 200M).

**Advanced Storm Beacon** — Customizes individual phases of the Advanced Storm Controller.
- `Phase` = Set to the phase number (2-50) you want this beacon to override.
- `Storm Radius` = Set the safe-zone size for this phase (has no effect if Phase = 1).
- `Damage Level` = Ramp this up on later phases — e.g. 5% early on, 25%+ or Instant Elimination by the final phase.

#### Traversal & Vehicles (`traversal_vehicles`)

**Grind Rail** — Rail section players grind along for a traversal segment.
- `Visual Style` = Options: Standard / Wire / Vine / Minerail. Match your theme.
- `Speed Preset` = Standard, or tune the underlying speed fields directly for a custom feel — faster for a thrill section, slower for precision.

**Air Vent** — Boosts players upward through the course.
- `Knockup Force Multiplier` = Options: None / Low / Medium / High / Very High / Super High / Mega High. Pick High or above to clear the gap/height you designed.
- `Enable on Phase` = Options: None / Always / Pre-Game Only / Gameplay Only / Create Only. Always unless it should only work during a specific phase.

**Bouncer** — Launches players across gaps.
- `Bounce Launch Value` = Tune above the 16 m/s default to clear the height/gap you designed.
- `Bounce Direction` = Options: Bouncer Orientation / Vertical. Vertical for a straight-up launch.
- `Is Indestructible` = True if it shouldn't be shot/broken; otherwise set Device Health.

**Teleporter** — Returns a failed player to their last checkpoint.
- `Teleporter Group` = Link this Teleporter to its matching exit via a shared group.
- `Change Teleporter Target` = Options: Never / On Entry / On Timer. Never for a fixed link, On Timer for a rotating destination.

**Vehicle Spawner (specific type, e.g. Sports Car / ATK / Driftboard)** — Spawns the chosen race vehicle for each player.
- `Activating Team` = Restrict to the racer's team, or leave Any.
- `Enable Respawn` = On, if vehicles can be destroyed/flipped and need to respawn.
- `Vehicle Speed Tunings` = Pick the tuning (e.g. Ch 4 Battle Royale) that matches your race's intended speed/handling feel. Note: exact property names vary slightly between vehicle types (e.g. Sedan vs Sports Car), so double-check against the specific spawner you place.

**Fuel Pump** — Refuels vehicles at pit stops along the track.
- `Fuel Capacity` = Full (default 1000) for casual play, lower for tighter fuel management.
- `Explosion Deals Damage` = Yes if it should be a hazard when destroyed.

**Vehicle Service Station** — Combined refuel/repair station.
- `Fuel Refill Percentage Per Restore Tick` = Faster (raise above the 5% default) for arcade-y racing, slower if fuel management should matter strategically.
- `Damageable` = No, if it should be indestructible infrastructure.

**Nitro Hoop** — Flaming hoop that grants a nitro speed boost when passed through.
- `Added Player Velocity` = Tune above the 45 m/s default for the straightaway it's placed on.
- `Enable Cooldown` = On, to prevent back-to-back boosting if the hoop is on a lap loop.

**Nitro Barrel Spawner** — Destructible barrel prop that grants a nitro boost.
- `Launch Force Multiplier` = Match your track's boost balance (default 1.0) — too much trivializes corners.
- `Should Respawn` = On for a repeatable boost, Off for a one-time pickup.

#### Economy & Progression (`economy_progression`)

**Stat Creator** — Creates the custom currency stat that drives the whole tycoon loop.
- `Stat Name` = Name it clearly (e.g. 'Gold', 'BestTime', 'QuestProgress').
- `Scope` = Options: Player / Team / Match. Player for individual stats, Team/Match for shared trackers.
- `Max Value` = Set only if this stat should drive a level-up system (pairs with Max Level).

**Stat Powerup** — Grants or deducts the currency stat when triggered (earning/spending).
- `Stat To Apply` = Point this to your custom Stat Creator stat (or a built-in stat like Score).
- `Magnitude` = Set how much currency/progress this grants or deducts per trigger (default 1).
- `Apply To` = Player, unless the reward should be shared with their team/class.

**Tracker** — Displays the player's currency/progress on their HUD.
- `Stat to Track` = Link to a custom Stat Creator stat, or a built-in stat like Eliminations/Score.
- `Target Value` = Set to the win/completion threshold, if any (default 10).
- `When Target Is Reached` = Options: Do Nothing / End Round / Complete Tracker. End Round if reaching the target should win.

**Button** — Core interaction point for purchases/upgrades.
- `Times Can Trigger` = Infinite for repeatable purchases, a fixed number for a one-time unlock.
- `Reset Delay` = Add a short delay (a few seconds) to prevent spam-clicking.
- `Activating Team` = Restrict to the team that should interact, or leave Any.

**Conditional Button** — Only activates the upgrade if the player has enough currency/required items.
- `Number of Key Item Slots` = 1 for a simple cost, 2-3 for a multi-item requirement.
- `Key Items Required` = Set to the quantity of the currency/key item needed.
- `Consume Key Items` = On for a one-time purchase, Off for a repeatable check.

**Vending Machine** — Sells up to 3 items for a currency cost.
- `First Item Resource Type` = Pick the currency type players will spend (Wood/Stone/Metal/Gold).
- `Cost of First Item` = Balance against how fast players earn that currency.

**Collectible Object** — Placeable pickup (coins/tokens) that grants currency on collection.
- `Collectible Object` = Pick a coin/token/gem visual that matches your theme.
- `Score` = Set to the currency/stat amount awarded per pickup (default 1).
- `Consume if Collected By` = Options: Self / Anyone / Team. Self for individual collection, Team to share credit.

#### Structures & Interactables (`structures_interactables`)

**Lock** — Locks a door until the player has the right key/item/condition.
- `Starts Locked` = Locked, for gated content.
- `Initial Door Position` = Closed, to match a locked door.

**Switch** — Puzzle interaction point (levers, combination inputs).
- `Initial State` = Off, for a puzzle that needs solving.
- `Limit Times Can Change` = On, then set Times Can Change if this should only be usable once or a few times.
- `Mutually Exclusive` = Group switches that should only allow one 'on' at a time (e.g. a 3-lever puzzle).

**Attribute Evaluator** — Checks whether a puzzle condition is met (e.g. correct items collected) and fires pass/fail events.
- `Tracked Stat` = Set to Score, or point it at your custom Stat Creator stat representing puzzle/quest progress.
- `Min Player Stat` = Set to the threshold value that counts as 'solved'.
- `Times Can Trigger` = Infinite, unless the check should only ever pass/fail once.

**Item Granter** — Grants Seekers a specific weapon at round start.
- `On Grant Action` = Options: Clear Inventory / Clear Items / Clear Resources / Keep All. Keep All to add to existing inventory, Clear Inventory for a fresh loadout.
- `Item List > Item Definition` = Set to the specific weapon/reward for this moment.
- `Item List > Item Quantity` = Set ammo/stack size to match how long the reward should last.

**Item Spawner** — Spawns pickup weapons/resources around the map.
- `Item List > Item Definition` = Choose weapons/resources appropriate to your game's power level.
- `Time Between Spawns` = Short for a high-loot game, long for scarcity-driven tension (paired with Respawn Item On Timer).
- `Random Spawns` = Options: Off / Random / No Repeats. Random adds variety across multiple spawners.

**Prop Mover** — Moves building pieces/walls to reveal new base areas on upgrade.
- `Movement Mode` = Options: Translation / Rotation. Translation for a sliding wall/platform, Rotation for a spinning/turning door.
- `Speed` = Slow enough to look intentional, fast enough not to feel sluggish.
- `Path Complete Action` = Options: None / Ping Pong / Repeat / Reset. Match whether this should move once, loop, or reset.

**Prop Manipulator** — Defines a zone that overrides resource-node behavior and/or prop health/destructibility for props inside it (not a direct push/pull/move device — that's Prop Mover).
- `Override Resources` = On, if this zone should change how resource nodes behave inside it.
- `Modify Prop Health` = On, then set Prop Health if you want props more/less durable in this zone.
- `Affects All Objects In a Zone` = On to affect everything in the zone, Off to target only tagged props.

#### Environment & Atmosphere (`environment_atmosphere`)

**Sky Dome** — Controls sky, lighting mood, fog, and atmosphere — the fastest way to make an island feel intentional rather than default.
- `Light Source` = Options: None / Sun / Moon 1 / Moon 2. Sun for daytime, Moon for a night scene.
- `Skydome Top/Middle/Bottom Color` = Match your mood — stormy/dark for horror, bright for racing.
- `Horizon Fog Density` = Higher for limited visibility/tension, lower for open exploration.

**Customizable Light** — Adds and colors light sources to set mood in specific areas.
- `Light Color` = Match your mood — cold blue/green for horror, warm for cozy scenes.
- `Rhythm Preset` = Options: Constant / Flicker / Wave / Short Circuit / Party / Windy / Flash. Flicker suits horror tension.
- `Light Intensity` = Dim for tension, bright for clarity in puzzle areas.

**Audio Player** — Layers in ambience, music, or stingers — sound design does as much for atmosphere as visuals.
- `Audio` = Pick the ambience/music/stinger sound asset for this moment.
- `Can be Heard By` = Options: Everyone / Instigator Only / Registered Players Only / Non-Registered Players Only. Everyone for ambience, Instigator Only for personal SFX.
- `Enable Spatialization` = True for a 3D-positioned sound, False for flat background music.

#### UI & Feedback (`ui_feedback`)

**HUD Message** — Displays round instructions/status to players.
- `Message` = Write the instruction/status update players need at this moment.
- `Display Time` = Long enough to read comfortably, short enough not to block the view (default 5 sec).
- `Message Recipient` = Options: All / Friendlies / Enemies / Triggering Player / a specific team. Target the relevant role when the message is role-specific.

**Popup Dialog** — Simple HUD text boxes for clues/choices.
- `Description` = Write the clue/choice text for this moment.
- `Response Type` = Add more buttons (up to 12) if the player's answer should branch.
- `Auto Display` = Options: Never / Pregame Lobby / Game Start. Game Start if it should appear automatically.

**HUD Controller** — Hides HUD elements (map, health bar, etc.) to increase immersion/tension.
- `Show HUD Messages / Show Minimap / etc.` = Set the specific HUD elements to No for immersion-focused genres like horror (each is its own Do Not Override / Yes / No dropdown).
- `Enabled During Phase` = All, unless it should only apply during a specific phase.

### 5.3 Category baselines — all 10

Each baseline supplies `devices[]`, `core_loop` and `layout_tip` for drafts and custom entries in that category.

**Combat** — `Score Manager`, `Round Settings`, `Item Spawner`, `Barrier`
- Loop: Spawn In → *Engage Opponents* → *Score Eliminations* → WIN "Meet the win condition — last standing or score target" / LOSE "Get eliminated or fall behind"
- Layout tip: Block out a combat space with a mix of open ground and cover — avoid one dominant sightline that controls the whole map.

**Survival & Horror** — `Timer`, `Round Settings`, `Creature Placer`, `Creature Spawner`, `Damage Volume`, `Customizable Light`, `Audio Player`
- Loop: Spawn In → *Scavenge & Prepare* → *Survive The Threat* → WIN "Survive to the end" / LOSE "The threat gets you"
- Layout tip: Block out safe zones, danger zones and escape routes — tension comes from players knowing where safety is and how far away it's getting.

**Adventure & RPG** — `Stat Creator`, `Tracker`, `Item Granter`, `Conversation`, `NPC Spawner`, `Creature Placer`, `Save Point`
- Loop: Spawn In World → *Take On Objectives* → *Fight & Explore* → *Grow Stronger* → COMPLETE "Finish the story or hit the progression goal"
- Layout tip: Block out distinct zones (hub, exploration areas, boss/goal space) connected by clear paths — get the traversal distances right before decorating.

**Social & Roleplay** — `Customizable Light`, `Sky Dome`, `Audio Player`, `HUD Message`, `Button`, `Teleporter`
- Loop: Arrive & Pick A Role → *Socialise & Express* → *Take Part In Activities* → ONGOING "No win state — the goal is a place people want to come back to"
- Layout tip: Block out gathering spots (a plaza, venue or hangout) plus smaller side spaces — social islands live or die on how naturally people bump into each other.

**Simulation & Tycoon** — `Stat Creator`, `Stat Powerup`, `Tracker`, `Button`, `Timer`, `Conditional Button`
- Loop: Spawn At Plot → *Earn* → *Spend & Upgrade* → *Grow* → WIN "Reach the goal first, or have the most when time runs out"
- Layout tip: Give each player a clearly bounded plot or system to grow, with visible headroom to expand into.

**Platforming & Movement** — `Player Checkpoint`, `Barrier`, `Timer`, `Stat Creator`
- Loop: Spawn At Start → *Navigate Obstacles* → *Reach Checkpoints* → WIN "Finish the course" / RETRY "Fall and restart from a checkpoint"
- Layout tip: Block out the course as one continuous path with simple shapes per obstacle — nail spacing and difficulty curve before any art.

**Puzzle & Mystery** — `Lock`, `Switch`, `Attribute Evaluator`, `Timer`, `Popup Dialog`
- Loop: Enter The Space → *Search For Clues* → *Solve & Unlock* → WIN "Solve everything and escape or finish" / LOSE "Time runs out"
- Layout tip: Block out the puzzle spaces as rooms/stations in solve order, and make sure players can't physically skip a step you haven't gated.

**Party & Minigames** — `Timer`, `Round Settings`, `Score Manager`, `HUD Message`
- Loop: Round Starts → *Play The Minigame* → *Score Or Survive* → WIN "Top the round or be the last one in" / NEXT ROUND "Rounds repeat fast — losing stings for seconds, not minutes"
- Layout tip: Keep the play space small and readable at a glance — party rounds die when players spend the round working out where to go.

**Sports & Racing** — `Volume`, `Timer`, `Stat Creator`, `Tracker`, `Barrier`
- Loop: Line Up → *Compete* → *Score Or Clock Time* → WIN "Best score or fastest time" / LOSE "Beaten on the scoreboard"
- Layout tip: Block out the full course or pitch first and drive/run it yourself — flow and fairness beat scenery at this stage.

**Strategy & Defense** — `Team Settings and Inventory`, `Round Settings`, `Score Manager`, `Creature Spawner`, `Barrier`, `Conditional Button`
- Loop: Plan & Place → *Waves Or Turns Play Out* → *Adapt Your Setup* → WIN "Hold out or out-plan the opposition" / LOSE "Your defenses or plans collapse"
- Layout tip: Block out attack lanes and defensive positions so the strategic choices are visible in the geometry itself.

### 5.4 Researched game type details

Descriptions, device lists, core loops, layout tips, base settings and extra notes for the 13 live researched types.

**Elimination / Deathmatch** `combat_elimination_deathmatch` — `inherits_baseline: false`
> Classic combat where players fight until a win condition (last one/team standing, or score target) is met.

Devices: `Score Manager`, `Round Settings`
Loop: Spawn In → *Find Weapons* → *Eliminate Opponents* → *Explore Map* → WIN "Be the last player or team standing" / LOSE "Get eliminated"
Layout tip: Block out a play space sized for your player count with a mix of open ground and cover — avoid huge open sightlines that let one spot dominate the whole match.
Extra notes: "Add 'Elimination Manager' if you want eliminated players to drop specific loot." · "Add 'Elimination Feed' for custom kill-feed messages."

**Team Elimination** `combat_team_elimination`
> Squad vs. squad combat — teams fight until one side is wiped or hits the score target.

Devices: `Score Manager`, `Round Settings`, `Team Settings and Inventory`
Base setting: `End Game` › `Game End Callout` = "You Win/Lose — set this for a team vs. team outcome."
Loop: Spawn With Your Team → *Find Weapons* → *Fight The Other Team* → *Hold Map Control* → WIN "Your team is the last one standing" / LOSE "Your team gets wiped"
Layout tip: (same as Elimination / Deathmatch)
Extra notes: same two as above.

**Zone Wars** `combat_zone_wars`
> Squad-based build-and-fight game inside a rapidly shrinking zone, usually with preset loadouts and building materials.

Devices: `Team Settings and Inventory`, `Advanced Storm Controller`, `Advanced Storm Beacon`, `Round Settings`, `Score Manager`
Base setting: `Round Settings` › `Last Standing Wins` = "On — this is the field that actually drives a Zone Wars round win."
Loop: Spawn In Squad → *Loot & Build* → *Reposition To Zone* → *Fight For Space* → WIN "Be the last squad standing" / LOSE "Your squad gets eliminated"
Layout tip: Lay out a compact-but-fair arena with a handful of distinct build-fight hotspots (a central high-ground, a couple of flanking routes) since the shrinking zone will force players together fast.

**Box Fights** `combat_box_fights`
> Fast, close-quarters build fights in a small enclosed arena, usually 1v1 to 4v4, best-of-series.

Devices: `Team Settings and Inventory`, `Round Settings`, `Score Manager`, `Player Checkpoint`, `Barrier`
Loop: Spawn In Box → *Build & Edit* → *Fight Close-Quarters* → WIN "Win the most rounds in the best-of-series" / LOSE "Lose the most rounds in the best-of-series"
Layout tip: Block out a small, fully enclosed box (or a few boxes) sized for close-quarters 1v1 to 4v4 fights — keep it tight, symmetrical, and free of long sightlines.
Extra note: "UEFN has no single 'number of rounds' field — track round wins with Score Manager (Score Award Type: Add) and set your own win target (e.g. best of 5)."

**Horror Chase** `survival_horror_chase`
> Atmosphere-driven survival: a hunting threat stalks players while they try to escape or hold out.

Devices: `Timer`, `Customizable Light`, `Sky Dome`, `Audio Player`, `HUD Controller`, `Creature Placer`, `AI Patrol Path Node`, `Perception Trigger`
Loop: Spawn In → *Explore In The Dark* → *Evade The Chaser* → WIN "Escape or survive until time runs out" / LOSE "Get caught by the chaser"
Layout tip: Block out sightline-breaking corridors, hiding spots and at least two escape routes from every area — a chaser is only scary when players almost get away.
Extra notes: "There's no single 'success' field on End Game — wire your final Lock/Attribute Evaluator puzzle-solved event into a Tracker's 'When Target Is Reached: End Round' (or directly into Round Settings) so solving the last puzzle ends the round as a win." · "Set 'End Game' fail condition to trigger when the chaser catches the player." · "There's no single 'fail state' field — wire the chaser catching a player (e.g. via a Damage Volume set to Elimination, or directly in Verse) into your normal elimination flow so Round Settings handles the fail state."

**Action RPG** `adventure_action_rpg`
> Exploration-driven experience with quests, NPCs, progression, and often combat and an economy.

Devices: `NPC Spawner`, `Conversation`, `Stat Creator`, `Tracker`, `Item Granter`
Loop: Spawn In World → *Take On Quests* → *Fight & Explore* → *Progress & Loot* → COMPLETE "Finish the main questline or reach max level"
Layout tip: Block out distinct zones (hub area, quest areas, combat encounters) connected by clear paths — rough in scale and landmarks now, detail and dressing come later.
Extra note: "Wire your main quest's final Attribute Evaluator 'On Pass' event into a Tracker's 'When Target Is Reached: End Round' so completing the quest ends the game."

**Tycoon** `sim_tycoon_tycoon`
> Players build/expand a personal base by earning and spending currency, usually racing to a goal or highest total.

Devices: `Stat Creator`, `Stat Powerup`, `Tracker`, `Button`, `Timer`
Loop: Spawn At Plot → *Earn Currency* → *Spend On Upgrades* → *Base Grows* → WIN "Reach the currency goal first, or have the highest total when time runs out"
Layout tip: Give each player their own separate, clearly bounded plot with room to expand outward or upward as they unlock upgrades — leave buildable space, don't over-detail it yet.
Extra note: "Each player typically needs their own private Player Spawner + isolated base plot so tycoons don't interfere with each other."

**Parkour** `platforming_parkour`
> A pure time-trial obstacle course — precision jumps, no hazards, fastest run wins.

Devices: `Player Checkpoint`, `Barrier`, `Timer`, `Stat Creator`
Base setting: `Timer` › `Count Down Direction` = "Count Up — track elapsed time as a stopwatch so the fastest completion wins."
Loop: Spawn At Start → *Chain Precision Jumps* → *Hit Checkpoints* → WIN "Set the fastest completion time"
Layout tip: Block out the course as a single continuous path first using simple shapes for each jump/obstacle — get the spacing and difficulty curve right before adding any art.
Extra notes: "Add 'Crash Pad' near fall-risk sections if you want to negate fall damage instead of punishing falls." · "Focus on precision jump geometry; no elimination hazards needed."

**Deathrun / Obby** `platforming_deathrun_obby`
> A hazard-filled obstacle course — traps eliminate the careless, and surviving to the end is the win.

Devices: `Player Checkpoint`, `Barrier`, `Timer`, `Stat Creator`, `Trick Tile`, `Damage Volume`, `Pinball Bumper`
Base setting: `Round Settings` › `Last Standing Wins` = "On — last player alive once hazards have eliminated everyone else wins the round."
Loop: Spawn At Start → *Read The Trap* → *Time Your Run* → *Respawn At Checkpoint* → WIN "Reach the end of the course" / LOSE "Eliminated by a hazard with no respawns left"
Layout tip: (same as Parkour)
Extra notes: "Add 'Crash Pad' near fall-risk sections if you want to negate fall damage instead of punishing falls." · "Set 'End Game' to 'Last Player Standing' once all others are eliminated by hazards."

**Escape Room** `puzzle_escape_room`
> Solve chained puzzles, clues and locks to escape a themed space before time runs out.

Devices: `Timer`, `Customizable Light`, `Sky Dome`, `Audio Player`, `HUD Controller`, `Lock`, `Attribute Evaluator`, `Switch`
Loop: Locked In → *Search For Clues* → *Solve Puzzles* → *Unlock The Next Room* → WIN "Escape before time runs out" / LOSE "Time runs out"
Layout tip: Block out the rooms in solve order and physically gate each stage — nothing kills an escape room like players walking past a puzzle they were meant to solve.
Extra note: (same as Horror Chase's first note)

**Prop Hunt / Hide-and-Seek** `party_prop_hunt`
> Asymmetric hide-and-seek: hiders disguise as props, seekers hunt them down before time runs out.

Devices: `Team Settings and Inventory`, `Disguise`, `Timer`, `Round Settings`, `Score Manager`
Base setting: `Timer` › `Completion Behavior` = "Set so the round ends when the Timer runs out; treat that as a Hiders win since Seekers failed to find everyone in time."
Loop: Round Starts, Roles Assigned → *Hide As A Prop* → *Search For Hiders* → HIDERS WIN "Survive undiscovered until time runs out" / SEEKERS WIN "Find every hider before time runs out"
Layout tip: Block out a space dense with believable, similarly-shaped props for Hiders to blend into, plus a few chokepoints Seekers have to search through — avoid huge empty rooms with nowhere to hide.

**Circuit Racing** `sports_circuit_racing`
> Vehicle or on-foot race around a track, scored by lap time or finishing position.

Devices: `Volume`, `Timer`, `Stat Creator`, `Tracker`, `Barrier`
Loop: Spawn At Grid → *Race The Track* → *Hit Lap Checkpoints* → WIN "Cross the finish line first" / LOSE "Finish behind the leader"
Layout tip: Block out the track's centerline first (loop or point-to-point) with basic ramps/barriers for width, and make sure upcoming turns are readable from a vehicle's speed and camera height.

**Time Trial** `sports_time_trial`
> Race the clock, not the pack — solo runs on a course where the fastest time tops the board.

Devices: `Volume`, `Timer`, `Stat Creator`, `Tracker`, `Barrier`
Base settings: `Volume` › `Player Events Enabled` = "On — chain multiple checkpoint Volumes in sequence and only count a lap once all are passed in order (this is done by wiring their events together, not a single dropdown)." · `Timer` › `Count Down Direction` = "Count Up — run it as a stopwatch so each attempt records a completion time to beat."
Loop: Start The Run → *Race The Course* → *Chase Your Best Splits* → WIN "Set the fastest time on the board"
Layout tip: (same as Circuit Racing)

### 5.5 Brand templates — all 8

`brand_templates` is an **array**. Each entry: `{ id, label, description, pitch, caveat, provides[], images{logo,hero}, suggested_game_types[], restriction_confirmation{ guidelines_url, guidelines_label, sections[], source_urls[] } }`.

`suggested_game_types` maps game types this brand suits. The brand screen uses it to badge suitability.

| id | Label | Suggested game types |
|---|---|---|
| `original` | Original (No Brand Template) | (none — matches everything) |
| `star_wars` | Star Wars | `combat_elimination_deathmatch`, `combat_team_elimination`, `adventure_action_rpg`, `survival_horror_chase`, `puzzle_escape_room` |
| `kpop_demon_hunters` | KPop Demon Hunters | `combat_elimination_deathmatch`, `combat_team_elimination`, `survival_horror_chase`, `puzzle_escape_room`, `adventure_action_rpg` |
| `lego` | LEGO | `sim_tycoon_tycoon`, `adventure_action_rpg`, `platforming_parkour`, `platforming_deathrun_obby` |
| `squid_game` | Squid Game | `combat_elimination_deathmatch`, `combat_team_elimination`, `combat_box_fights`, `party_prop_hunt` |
| `walking_dead` | The Walking Dead | `survival_horror_chase`, `puzzle_escape_room`, `combat_elimination_deathmatch`, `combat_team_elimination`, `adventure_action_rpg` |
| `tmnt` | Teenage Mutant Ninja Turtles | `combat_elimination_deathmatch`, `combat_team_elimination`, `adventure_action_rpg`, `combat_box_fights` |
| `fall_guys` | Fall Guys | `platforming_parkour`, `platforming_deathrun_obby`, `combat_box_fights` |

**Summary of the commercial terms** (this is the part most likely to go stale — see Part 7, item 10):

| Brand | Revenue share to rights holder | In-island V-Bucks sales | Rating ceiling |
|---|---|---|---|
| Original | none | supported, 50% (promo: 100% until 31 Jan 2027) | Fortnite standard (ESRB Teen / PEGI 12) |
| Star Wars | 20% engagement + 30% transactions to Disney | **supported — the only brand that is** | Fortnite standard |
| KPop Demon Hunters | 15% to Netflix | not supported | ESRB Teen / PEGI 12 (ClassInd 12 in Brazil) |
| LEGO | 15% to The LEGO Group | not supported | **ESRB E10+ / PEGI 7 — strictest; ~45 devices unavailable** |
| Squid Game | 15% to Netflix | not supported | Fortnite standard (thumbnail held to a higher bar) |
| The Walking Dead | **12% to Skybound — lowest** | not supported | ESRB Teen / PEGI 12 / USK 16 |
| TMNT | 15% to Paramount | not supported | ESRB Teen / PEGI 12 / USK 16 |
| Fall Guys | **none — Epic-owned** | not supported | **Everyone: ESRB E / PEGI 3 — combat disabled at platform level** |

**Descriptions, pitches and caveats:**

- **Original** — *Desc:* Build with Fortnite's default asset library — no licensed IP, no brand rules, no revenue share. *Pitch:* Total creative freedom. No brand rules to follow and no revenue to share — just you, Fortnite's full toolkit, and whatever you can imagine. *Caveat:* (none)
- **Star Wars** — *Desc:* Galaxy-themed starter assets across Hoth, Tatooine, Nevarro, and space — suits combat, adventure, or roleplay games with a sci-fi edge. *Pitch:* Hand your players a lightsaber. Four iconic planets, real Force powers, and 230+ authentic sound effects make this the most content-rich template on the list. *Caveat:* Shares 20% of engagement payout with Disney, plus 30% of any in-island transaction revenue. The only branded template that supports selling items for V-Bucks — but its asset rules are the strictest, and the licensed music has an expiry date that blocks future updates.
- **KPop Demon Hunters** — *Desc:* Character-driven melee/action assets inspired by Rumi, Mira, Zoey, and Jinu — suits combat or boss-encounter games with a stylish, supernatural edge. *Pitch:* Stylish, supernatural, and built for melee. Fight demons as Rumi, Mira, Zoey, or Jinu using the newest template Epic has shipped. *Caveat:* The newest of these templates (added late 2025/early 2026) — asset depth is less documented than the others. Publishing shares 15% of engagement payout with Netflix.
- **LEGO** — *Desc:* Blocky, minifigure-scale building assets and biome templates — distinct from the standalone 'LEGO Fortnite' game mode. Suits tycoon, adventure, or building-focused games. *Pitch:* Everything snaps together. Minifigure-scale building, three prebuilt biomes, and a ready-made farming tycoon — the friendliest starting point for an all-ages hit. *Caveat:* Don't confuse this with 'LEGO Fortnite,' a separate standalone survival-crafting game mode. Also the strictest age rating of any template (ESRB E10+ / PEGI 7), and around 45 devices are unavailable.
- **Squid Game** — *Desc:* Minigame and social-deduction assets themed around the show — suits elimination, box-fight-style minigames, or social deduction games. *Pitch:* High-stakes minigames with a built-in hook. Ships with both a Minigame Mastery and a Social Deduction template, so the trickiest logic is already wired up for you. *Caveat:* Epic delayed publishing after the show's 2025 content drop, which drew creator backlash over lost hype-window monetization — worth watching rollout timing on future content waves.
- **The Walking Dead** — *Desc:* Zombie-survival assets and NPC AI — suits horror, survival, or elimination games. *Pitch:* Zombies that actually behave like zombies. The Walker NPC template teaches you enemy AI you'll reuse in every horror game you make afterwards. *Caveat:* (none)
- **TMNT** — *Desc:* Sewer-to-Technodrome combat and sandbox assets — suits elimination, arcade-style, or narrative combat games. *Pitch:* Cowabunga, fully wired. Four Turtles, four villains, four weapon types, and a working arcade mode — drop in and start fighting. *Caveat:* (none)
- **Fall Guys** — *Desc:* Bouncy obstacle-course assets that automatically convert a player's Fortnite outfit into a Fall Guys 'Bean' — suits parkour, deathrun, or party-game minigames. *Pitch:* Instant party game. Every player's outfit auto-converts into a Fall Guys Bean, and the obstacle-course kit handles the rest. *Caveat:* The only branded template with no revenue share, but it's locked to an Everyone rating (ESRB E / PEGI 3) and combat is disabled at the platform level.

**`provides[]` arrays** (the asset packs, shown on the brand detail panel and the final walkthrough step):

- **Original** — Full access to Fortnite's standard galleries, props, and devices with no theming constraints.
- **Star Wars** — 4 starter islands: Hoth, Tatooine, Nevarro, and a space setting · 3 ready-made gameplay templates: Lightsabers & Force Powers, Team Conquest, and a cantina Narrative/Roleplay template · Galleries: Death Star, Tatooine Cantina, Resistance Base · Themed props: Holochess table, Sabacc table, Sandcrawlers · Custom UI and 230+ sound effects
- **KPop Demon Hunters** — Character-inspired cosmetic and weapon assets geared toward melee combat · Brand and Creator Rules for using the KPop Demon Hunters IP
- **LEGO** — 4 island templates (3 prebuilt biomes + 1 blank canvas) · LEGO Action Adventure template (Warrior/Thief/Blaster classes) · LEGO Bloom Tycoon template (farming/garden props, galleries, animals) · Minifigure-scale building mechanics
- **Squid Game** — Squid Game Starter Island (a Greasy Grove reskin) · Minigame Mastery Template · Social Deduction Template · Flat Grid / XL Flat Grid starters · Themed devices, props, galleries, and NPCs
- **The Walking Dead** — Prison Starter Island (a preconfigured showcase) · Walker NPC Template (a zombie/NPC AI teaching template) · Hero weapons: Lucille (bat), Shiva (shotgun)
- **TMNT** — Dimension X Starter Island (Technodrome prefab, custom skyboxes/VFX/terrain) · TMNT Arcade Template (a built-in arcade game mode) · Turtle weapons: Katanas, Sai, Staff, Nunchucks · Fully wired characters: Krang, Casey Jones, Bebop, Rocksteady, and the four Turtles
- **Fall Guys** — Automatic outfit-to-Bean conversion · Obstacle-course props/devices/galleries themed on the Stadium/Season 1 aesthetic · Example reference islands: Falling Up, Tumble Towers, Blunderdome Blast

**Restriction content.** Each brand supplies `restriction_confirmation.sections[]` — an array of `{ title, rules[] }`, where each rule is a sentence that may contain `<b>`/`<i>` inline markup. The licensed brands all use the same three section titles: *"What you're allowed to build with"*, *"What you get paid"*, *"Rules specific to this brand"*. Original uses *"What you're allowed to build with"*, *"What you get paid"*, *"Rules every island has to follow"*.

The full rule text lives in `uefn-brand` data and should be carried over verbatim — it was hand-transcribed from Epic's per-brand rules pages and is **legally flavoured content**. Key cross-brand patterns worth noting so v2 can structure the data rather than repeat prose:

- Every licensed brand requires joining the Fortnite Developer Program and signing the IP Partner Licensing Agreement (one signature covers all brands).
- Most licensed brands ban mixing with third-party IP, **even with the owner's permission**.
- Star Wars and TMNT both exclude *"IP derived from film or TV"* and *"characters from major game franchises, even if you own the rights"* from user-supplied assets — stricter than the others.
- Star Wars requires a specific attribution line in the island description and assigns rights in "Disney Derivative Work" to Disney.
- The Walking Dead is **comics only, never the TV show**, and has a named list of banned TV-only characters; the brand must be called "The Walking Dead Universe" or "TWDU", never "The Walking Dead" or "TWD".
- Squid Game allows the brand name in the island title (unusual) but bans **all** character names; its violence does not carry over — normal Fortnite rules still ban realistic gore.
- LEGO bans recreating real LEGO sets, reshaping bricks, and has project validators enforcing brick scale and materials.
- Fall Guys removes content and devices at the **platform level** (weapons, damage, eliminations, vehicles, health/shields, building, storms, guards, wildlife) and changes movement (no crouch, sprint, slide, hurdle, dive, grind, skydive).
- KPop Demon Hunters provides **no music or audio assets at all** — important if someone plans a rhythm or performance game.

### 5.6 Brand asset conventions

`meta.brand_image_spec`:

| Asset | Path | Size | Format | Notes |
|---|---|---|---|---|
| Logo | `images/brands/<id>_logo.png` | 160×160 (displayed at 44px) | PNG, transparent background | Keep the mark centred with ~10% padding inside the square so it doesn't touch the edges. Oversized so it stays sharp on high-DPI screens. |
| Hero | `images/brands/<id>_hero.jpg` | 1200×450 (8:3) | JPG (or PNG) — 8:3 cinematic banner | Shown atop the brand detail panel. 8:3 is a third shorter than 16:9, so compose for a letterbox crop rather than a full scene. Avoid important detail or text in the outer 5% — it's cropped with `object-fit: cover` on narrow windows. |

`brand_ids`: `original`, `star_wars`, `kpop_demon_hunters`, `lego`, `squid_game`, `walking_dead`, `tmnt`, `fall_guys`

Design-mode art: `images/design_modes/{guided,randomise,ai_chat}.jpg`, 900×600 (3:2).

### 5.7 Media conventions

Images and videos are **convention-based, not configured**. Drop a correctly named file in the right folder and reload — no code change. Every missing asset degrades through an `onerror` handler to a labelled placeholder naming the exact filename and required dimensions.

This is one of the genuinely good ideas in v1 and worth keeping: **non-technical contributors can add assets with no code change and no broken images.**

v1 shipped with **0 of 8 brand logos** and **0 of 3 design-mode images** present, and 2 of 5 walkthrough videos. The convention worked; the content didn't exist. Plan the asset pipeline, not just the convention.

---

## Part 6 — Saved-game migration

v1 bumped saves from schema 1 to schema 2 and migrated on read. Only relevant if you're importing existing user data — but the mapping is a good record of how the taxonomy was reorganised from the old 9 "genres" into the current 97 types.

Old flat `genreKey` → new `gameTypeKey`:

| Old genreKey | New gameTypeKey |
|---|---|
| `elimination` | `combat_elimination_deathmatch` |
| `zone_wars` | `combat_zone_wars` |
| `box_fights` | `combat_box_fights` |
| `prop_hunt` | `party_prop_hunt` |
| `tycoon` | `sim_tycoon_tycoon` |
| `racing` | `sports_circuit_racing` |
| `rpg_adventure` | `adventure_action_rpg` |
| `parkour_deathrun` | `platforming_parkour` **or** `platforming_deathrun_obby` — decided from the saved `mode` answer: `deathrun` → Deathrun/Obby, else Parkour |
| `horror_escape` | `puzzle_escape_room` **or** `survival_horror_chase` — `chaser === 'no' && puzzles === 'yes'` → Escape Room, else Horror Chase |

Answers referencing questions that no longer exist on the target type are dropped silently rather than throwing. Records that can't be migrated at all are **dropped with no user notice** — see Part 7, item 7.

---

## Part 7 — What was wrong with v1, and must not be repeated

Ordered roughly by how much it should influence v2's design.

### Structural

1. **Data was duplicated.** ~152 KB of JSON was inlined inside the HTML *and* lived as a separate `uefn_device_logic.json`. Two copies to keep in sync by hand, and the full payload parsed on every load even though only one game type is ever used. **v2: pick one home for the data** — either fetched at runtime or imported at build time. Never both.
2. **Content cliff.** 74 of 97 types are empty; 84 have no core loop. The taxonomy is far ahead of the research. This is a **content pipeline problem, not a code problem** — plan the pipeline (research → author → flip to `live` → test) as a first-class part of v2, not an afterthought.
3. **"Live" status was silently overloaded.** Because the ten custom "Just give me the basics" entries carry `status: 'live'`, every category stays visible with dev mode off — including Social & Roleplay and Strategy & Defense, which have **no researched types at all**. Both therefore offer only baseline advice while looking as complete as the other eight categories. Either give `is_custom` its own visibility rule, or surface "baseline only" honestly in the UI.
4. **No routing and no history.** Browser Back exits the app; refresh loses all progress; no deep links; no shareable state. If v2 is a hosted app, this is table stakes.
5. **Hardcoded prose.** The five walkthrough bodies were English strings in JS, outside the data model, while everything else was data. No i18n path. Move all user-facing copy into the data layer.
6. **Tooling lost.** The JSON→MD generator and the test harness were described in planning documents but never committed. Nothing was regenerable and nothing was tested.

### Correctness and safety

7. **No escaping anywhere.** User-supplied game names and all JSON strings (which intentionally contain `<b>` markup) went straight into `innerHTML` and into `onclick` attribute strings. A game name containing a quote breaks `onclick="loadGame('...')"`. Low risk in a local single-user file; **unacceptable if hosted or shared**. v2 must escape interpolated values and attach handlers properly.
8. **Lossy silent migration.** Unmigratable saves were dropped with no user notice.
9. **Unbounded localStorage.** No quota handling on write, no cap on saved games, no rename, and no confirmation on delete.
10. **Positional answers.** `qIndex = answers.length` meant you could only step back one question at a time and couldn't edit a specific answer. Worse, `goBackFromBrand()` popped an answer, so going back from Brand **discarded the last answer** rather than re-showing it. v2: key answers by `qId`, allow editing any answer, and give each screen an explicit predecessor instead of inferring one.
11. **Brand rules rot.** Restriction text was hand-transcribed and dated. `meta.brand_rules_research_note` already flags that Epic's IP-partner fee page omits Star Wars and KPop Demon Hunters entirely and wrongly implies Star Wars doesn't support in-island transactions. **This is legally flavoured content with no owner and a known expiry.** v2 needs a visible "verified on <date>" stamp per brand and a refresh cadence.

### Experience and code health

12. **Accessibility effectively absent.** One `sr-only` h1; zero `aria-*` or `role=`; focus reset to body on every `innerHTML` swap; `alt=""` on brand logos; status conveyed by colour only; no `prefers-reduced-motion`.
13. **Mobile unaddressed.** One media query, which only collapsed the design-mode cards. The loop diagram was a fixed 380px viewBox; step tracker, brand strip and device panels got no mobile treatment.
14. **Duplication in code.** Nav/breadcrumb markup was copy-pasted across seven render functions; `rebuildDevices()` ran twice per walkthrough with no memoisation; device-role colours lived in JS while all other content lived in JSON.
15. **Dead code and null-handling.** The `rc.rules` flat-list fallback on the restriction screen was unreachable (all 8 brands supply `sections`, verified). `state.stepIndex` was written but never read. More importantly, **84 of 97 types carry `core_loop: null` and `layout_tip: ""`**, so every consumer must fall back to the category baseline — v1 did this via `effectiveCoreLoop()` / `effectiveLayoutTip()`. Whatever renders a core loop *must* handle the null case, because it is the common case, not the edge case.

    Good news for v2: the rest of the shape is consistent. `devices`, `questions`, `base_set_settings` and `extra_notes` are **always arrays** on all 97 entries (never null, never a bare object or string). Keep it that way. `base_set_settings` and `extra_notes` legitimately being empty arrays is normal and means "nothing extra here".

### What a successor should keep

Stated plainly, because it is easy to throw out with the code:

- **The device library model.** 59 devices with verified UEFN Details-panel field names and recommended values is the expensive, hard-won part. Everything else is replaceable.
- **Composition over authoring** — universal → baseline → type → answers, with dedup and provenance. It is the reason the content model scales at all.
- **Source provenance in the UI.** Telling the user *why* a device is in their list is a genuinely good affordance.
- **The general-guidance + path-override merge** on each setting, both labelled with their source.
- **The live/draft status gate.** An honest way to ship a taxonomy ahead of its research.
- **Convention-based media with self-describing placeholders.** Contributors add assets with no code change and no broken images.
- **The brand restriction gate.** Showing a plain-English summary with a link to the official guidelines, *before* the user commits, is the right shape for content that carries legal weight.
- **The phased research plan** — specifically, researching **the 10 category baselines** is the highest value per hour and makes all 74 drafts genuinely useful instead of empty. It was identified in v1's planning and never done. **Do it early in v2.**

---

## Part 8 — Test requirements

v1 had no tests. v2 should ship with at least these.

**Data integrity (fast, run on every save):**
- Every device reference in every game type, category baseline, universal list and question effect **resolves against `device_library`** — no dangling names.
- Every game type resolves to a **non-empty device list** (proves baseline inheritance works).
- Every `suggested_game_types` entry points at a real game type.
- Every `set_settings` override names a **device that is actually in that resolved list** for that path — otherwise the override is invisible to the user.
- Every `set_settings` override names a setting that **exists on the target device's library entry**.
- No orphaned devices (in the library, referenced by nothing) without being intentional.
- Every `live` type has `core_loop`, `layout_tip` and at least one question **or** is explicitly marked `is_custom`.
- Every `draft` type has non-empty `research_notes`.
- `extra_notes` and `base_set_settings` are always arrays.

**Behaviour:**
- Dev mode off → only `live` types, and only categories containing them. Dev mode on → all 97.
- Saved games load regardless of dev mode; a save pointing at a draft type shows a note rather than disappearing.
- Progress increases monotonically across all screens, and the question band stays inside 16–40%.
- Zero-question game types skip the question screen entirely.
- `basic_nav` step appears only for `beginner`.
- Loop-diagram geometry: entry box, N step nodes, tangent arrows between consecutive nodes, outcome boxes for each `outcomes[]` entry, and correct height for 1 vs 2+ outcomes.
- Back navigation from Brand returns to the last **question with its answer intact**, not one answer popped.
- A game name containing `'`, `"`, `<` and `&` renders safely and doesn't break any handler.
- Scroll resets to top on every screen change.

**Content:**
- Every brand has a `restriction_confirmation` with at least one section and a `guidelines_url`.
- Every brand has a `verified_on` date (add this field) and a test warning when it's older than N months.

---

## Part 9 — Decisions to get from the human before building

These were open in v1 and are unresolved. Ask before writing code, because each one changes the architecture.

1. **Offline single file, or hosted app?** This single answer decides the escaping, data-loading, routing, and asset-hosting questions at once. v1 was a single offline HTML file opened from `file://`.
2. **What happens to the 74 drafts?** Ship a 13-type tool and hide the rest? Show them all badged? Or invest in the ten category baselines first so drafts become genuinely useful — the highest value-per-hour option, and v1's own recommendation.
3. **Dev mode: discoverable toggle or hidden?** A header toggle is discoverable by anyone the file is shared with. Alternatives: `?dev=1`, or a keyboard shortcut.
4. **Should "Just give me the basics" be visible with dev mode off** in categories that have no live types? v1 said yes (which is why Social & Roleplay and Strategy & Defense are reachable but thin). Confirm that's the intent.
5. **Time Trial and Team Elimination shipped `live` by reusing neighbouring research with one preset setting.** Is that bar acceptable, or should types be `draft` until independently researched?
6. **Who owns brand restriction text, and on what cadence?** It carries legal weight and has a known expiry.
7. **Are the two stub design modes (Randomise, Chat with AI) in scope for v2?** If not, don't show the panels at all.
8. **What does "experienced/expert" get?** v1 promised advanced content for three of four experience levels and delivered none. Either write that content or reword the options.

---

## Appendix A — Build order suggested

If you want a working v2 quickly rather than a complete one:

1. **Data layer first.** Load `device_library`, `category_baselines`, `game_types`, `brand_templates` from a single source of truth. Write the integrity tests from Part 8 against it *before* building any UI. This proves the model before you spend effort on screens.
2. **Then the resolution engine.** `rebuildDevices()` with its merge order, dedup and provenance. Test it headlessly against fixtures.
3. **Then routing and state**, with answers keyed by `qId` and an explicit predecessor per screen.
4. **Then the screens**, in flow order: Home → Category → Game type → Question → Brand → Restriction → Summary → Experience → Walkthrough.
5. **Then the output rendering.** Device groups by role, collapsible settings panels, general-guidance-plus-override display. Core-loop diagram. Walkthrough copy.
6. **Then the ten category baselines.** This is content work, and it's what turns the 74 drafts from empty shells into something usable.

## Appendix B — Source files in the v1 prototype

| Path | Size | Role |
|---|---|---|
| `uefn_game_wizard.html` | 230 KB | The entire v1 application — HTML + CSS + JS + a full inlined copy of the data. Single file, no build step, no framework, no network calls. |
| `uefn_device_logic.json` | 200 KB | Source-of-truth data. Duplicated verbatim inside the HTML. |
| `uefn_device_logic.md` | 80 KB | Human-readable render of the JSON (generated; generator lost). |
| `GAME_SELECTION_REBUILD_PLAN.md` | 13 KB | Plan for v1's last major refactor — the one that introduced categories, the device library and dev mode. Marked "awaiting approval"; the code shows it was executed. Contains the full original taxonomy table and the phasing plan. |
| `SPEC.md` | 16 KB | A review of v1 as built. Source of much of Part 7. |
| `images/brands/` | — | 8 brand hero JPGs present; **all 8 logos missing**. |
| `images/design_modes/` | — | README only; **all 3 images missing**. |
| `videos/` | — | 2 of 5 walkthrough videos present. |

v1 architecture, for reference only: vanilla JS, no framework, no build step, no CDN, no network calls, opens from `file://`. Three layers in one file: a `<style>` block (~24 KB, dark theme driven by CSS custom properties), an inlined `<script id="logic-data" type="application/json">` (~152 KB, 66% of the file), and ~53 KB of application logic. Every screen was a template-literal string assigned wholesale to `app.innerHTML` — no components, no diffing, no node reuse — with 100% inline event-handler attributes and zero `addEventListener`. **None of this is a recommendation.** It is the v1 baseline you are replacing.
