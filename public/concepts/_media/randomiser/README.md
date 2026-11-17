# Randomiser reel images

Images for the randomiser reels (`/concepts/randomiser-1-slots/` and later randomiser designs).
None exist yet: until a file is added, the page shows a coloured placeholder with initials and "Image coming".
Drop a file at the exact path below and it appears on the next spin or reload - no code change.

**Format:** `.webp`, square, about 512x512 (shown roughly 180-200px wide; the reel crops to fill with `object-fit: cover`, so keep the subject centred).

**Slug rule** (same as `slugify()` in `/concepts/randomiser-1-slots/randomiser.js`): lowercase the name, turn every run of
characters that are not a-z or 0-9 into a single `-`, trim `-` from both ends (accents are dropped first).
So "K-Pop Demon Hunters" -> `k-pop-demon-hunters`, "Gentle — you can't really lose" -> `gentle-you-can-t-really-lose`.

Folders: `flavours/`, `brands/` (brands sit on the flavour reel), `game-types/`, `hooks/`.
If a name changes in `/data/randomiser.json`, its file name changes with it.

## Flavours (24)

| Name | File |
| --- | --- |
| Vampires | `/concepts/_media/randomiser/flavours/vampires.webp` |
| Dinosaurs | `/concepts/_media/randomiser/flavours/dinosaurs.webp` |
| Sci-fi future | `/concepts/_media/randomiser/flavours/sci-fi-future.webp` |
| Medieval fantasy | `/concepts/_media/randomiser/flavours/medieval-fantasy.webp` |
| Wild West | `/concepts/_media/randomiser/flavours/wild-west.webp` |
| Underwater | `/concepts/_media/randomiser/flavours/underwater.webp` |
| Space station | `/concepts/_media/randomiser/flavours/space-station.webp` |
| After the end | `/concepts/_media/randomiser/flavours/after-the-end.webp` |
| Ancient Egypt | `/concepts/_media/randomiser/flavours/ancient-egypt.webp` |
| Pirates | `/concepts/_media/randomiser/flavours/pirates.webp` |
| Cyberpunk | `/concepts/_media/randomiser/flavours/cyberpunk.webp` |
| Haunted house | `/concepts/_media/randomiser/flavours/haunted-house.webp` |
| Jungle | `/concepts/_media/randomiser/flavours/jungle.webp` |
| Arctic | `/concepts/_media/randomiser/flavours/arctic.webp` |
| Neon city | `/concepts/_media/randomiser/flavours/neon-city.webp` |
| Toy box | `/concepts/_media/randomiser/flavours/toy-box.webp` |
| Kitchen | `/concepts/_media/randomiser/flavours/kitchen.webp` |
| School | `/concepts/_media/randomiser/flavours/school.webp` |
| Prison | `/concepts/_media/randomiser/flavours/prison.webp` |
| Circus | `/concepts/_media/randomiser/flavours/circus.webp` |
| Superheroes | `/concepts/_media/randomiser/flavours/superheroes.webp` |
| Ninjas | `/concepts/_media/randomiser/flavours/ninjas.webp` |
| Zombies | `/concepts/_media/randomiser/flavours/zombies.webp` |
| Fairy tale | `/concepts/_media/randomiser/flavours/fairy-tale.webp` |

## Brands (7)

| Name | File |
| --- | --- |
| Star Wars | `/concepts/_media/randomiser/brands/star-wars.webp` |
| LEGO | `/concepts/_media/randomiser/brands/lego.webp` |
| TMNT | `/concepts/_media/randomiser/brands/tmnt.webp` |
| Fall Guys | `/concepts/_media/randomiser/brands/fall-guys.webp` |
| Squid Game | `/concepts/_media/randomiser/brands/squid-game.webp` |
| The Walking Dead | `/concepts/_media/randomiser/brands/the-walking-dead.webp` |
| K-Pop Demon Hunters | `/concepts/_media/randomiser/brands/k-pop-demon-hunters.webp` |

## Game types (24)

| Name | File |
| --- | --- |
| Box Fight | `/concepts/_media/randomiser/game-types/box-fight.webp` |
| Zone Wars | `/concepts/_media/randomiser/game-types/zone-wars.webp` |
| Red vs Blue | `/concepts/_media/randomiser/game-types/red-vs-blue.webp` |
| Gun Game | `/concepts/_media/randomiser/game-types/gun-game.webp` |
| Deathrun | `/concepts/_media/randomiser/game-types/deathrun.webp` |
| Parkour Obby | `/concepts/_media/randomiser/game-types/parkour-obby.webp` |
| Racing | `/concepts/_media/randomiser/game-types/racing.webp` |
| Prop Hunt | `/concepts/_media/randomiser/game-types/prop-hunt.webp` |
| Hide and Seek | `/concepts/_media/randomiser/game-types/hide-and-seek.webp` |
| Infection | `/concepts/_media/randomiser/game-types/infection.webp` |
| Murder Mystery | `/concepts/_media/randomiser/game-types/murder-mystery.webp` |
| Escape Room | `/concepts/_media/randomiser/game-types/escape-room.webp` |
| Horror Map | `/concepts/_media/randomiser/game-types/horror-map.webp` |
| Tycoon | `/concepts/_media/randomiser/game-types/tycoon.webp` |
| Simulator | `/concepts/_media/randomiser/game-types/simulator.webp` |
| Tower Defence | `/concepts/_media/randomiser/game-types/tower-defence.webp` |
| Horde Survival | `/concepts/_media/randomiser/game-types/horde-survival.webp` |
| Boss Fight | `/concepts/_media/randomiser/game-types/boss-fight.webp` |
| Capture the Flag | `/concepts/_media/randomiser/game-types/capture-the-flag.webp` |
| Sports Game | `/concepts/_media/randomiser/game-types/sports-game.webp` |
| Metroidvania | `/concepts/_media/randomiser/game-types/metroidvania.webp` |
| Open World Adventure | `/concepts/_media/randomiser/game-types/open-world-adventure.webp` |
| Heist | `/concepts/_media/randomiser/game-types/heist.webp` |
| Social Hub | `/concepts/_media/randomiser/game-types/social-hub.webp` |

## Hooks (13)

| Name | File |
| --- | --- |
| Dry and deadpan | `/concepts/_media/randomiser/hooks/dry-and-deadpan.webp` |
| Loud and stupid | `/concepts/_media/randomiser/hooks/loud-and-stupid.webp` |
| Punishing, and proud of it | `/concepts/_media/randomiser/hooks/punishing-and-proud-of-it.webp` |
| Brutal but fair | `/concepts/_media/randomiser/hooks/brutal-but-fair.webp` |
| Cute on the surface | `/concepts/_media/randomiser/hooks/cute-on-the-surface.webp` |
| Gentle — you can't really lose | `/concepts/_media/randomiser/hooks/gentle-you-can-t-really-lose.webp` |
| Cosy and unhurried | `/concepts/_media/randomiser/hooks/cosy-and-unhurried.webp` |
| Tense, then sudden | `/concepts/_media/randomiser/hooks/tense-then-sudden.webp` |
| Slow and creeping | `/concepts/_media/randomiser/hooks/slow-and-creeping.webp` |
| So fast you barely think | `/concepts/_media/randomiser/hooks/so-fast-you-barely-think.webp` |
| Chaotic — nobody's in control | `/concepts/_media/randomiser/hooks/chaotic-nobody-s-in-control.webp` |
| Grand and serious | `/concepts/_media/randomiser/hooks/grand-and-serious.webp` |
| Weird, played straight | `/concepts/_media/randomiser/hooks/weird-played-straight.webp` |
