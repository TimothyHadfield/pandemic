# Pandemic Lab: progress

## START HERE
Read this file, then `CLAUDE.md` (files, commands), then `docs/rules-check.md` if you touch rules. Last updated: 2026-10-20.
Live: https://timothyhadfield.github.io/pandemic/ · repo TimothyHadfield/pandemic (public) · main branch = live.

## Goal right now
First version is live: play Pandemic (2nd edition) with computer teammates or friends online, a real-table infection tracker with exact odds, a planner, and measured team win rates. Next: whatever Tim asks after trying it.

## Status
| Part | State |
|---|---|
| Rules engine (48 cities, 93 links, 7 roles, 5 events, 4/5/6 Epidemics, rate track, outbreaks, 24 cubes) | Done, 23 node tests |
| Exact odds (infection per city, Epidemic in the next 2 cards, after an Epidemic, outbreak risk) | Done; matches 6000 simulated games; exact bottom-card test |
| Computer teammates + planner (Hint) + points lost | Done; route-based turn search (branch `bots`, merged). Team win rate, 200 games per box (2/3/4 players): Introductory 56/42/30%, Standard 35/24/14%, Heroic 22/12/5% (same seeds before the new search: about 23/12/10% at Standard) |
| Play screen (phone + laptop) | Done |
| Online rooms (shared module, co-op) | Done; two-browser check passes on the real project |
| Table tab (real-table tracker) | Done |
| Study tab (win rates, danger map, last game chart, points lost) | Done (`js/strength-data.js` rebuilt with `node tools/build-strength.js 200`, about 12 min) |
| Settings | Done |
| Design pass (2026-10-20) | Done: phone taps all ≥40 px (status, risk, player chips), role buttons stack icon over name, bigger hand cards with soft hyphens (all 53 card names fit at 393 px and laptop, measured), seamless map ocean, black cities outlined, colour swatches visible, one set of game-over buttons + dim backdrop, desktop setup/hand/table/study sized up, phone Study chart no longer clipped. Screenshots: scratchpad `design/pandemic/before|after` |
| Real world map (2026-10-20) | Done: Natural Earth 1:50m land + big lakes (public domain), Mercator, cities on their real spots, crowded areas spread by one smooth warp that bends the coast too (`node tools/build-map.js` after `npm install`; writes `js/map-data.js` and the x/y in `js/data.js`). Closest city pair 58 units (was 47.7); phone tap radius min 10.7 px (was 8.8), median 10.9 px (was 12.1). Reviewer agent named it a world map at a glance, no major errors. Screenshots: scratchpad `design/pandemic-maps/before|after` |
| Auto-fit zoom (2026-10-20) | Done: map always opens in auto (whole board fits, 8 px sea margin, re-fits with a glide on resize/rotation; Play tab return and new game = auto); one-finger drag does nothing in auto; pinch / wheel / ctrl-pinch / + − zoom (max 4×), drag pans clamped to the board; fit button (top-right, beside − +) dimmed in auto, lit blue when zoomed; double tap on empty sea while zoomed = back to auto. Removed: menu "Whole map" item, double-tap zoom-in. Test `node tests/zoom.test.mjs` (WebKit, 393×659, 659×393, 1280×800): 28 fails on old code, all pass now. Study danger map is static (not zoomable). Screenshots: scratchpad `design/pandemic-zoom/before|after` |
| Sounds, celebrations, animations (2026-10-20) | Done: `js/fx.js` (shared library, copied unchanged from `_fx`), `js/sfx.js` (what happened between two views -> timed sounds/motion; local, computer and online moves alike), Settings "Sound & effects" panel. Test `node tests/fx.test.mjs` (node + Chromium): failed on the old code, 40 checks pass. Screenshots: scratchpad `design/pandemic-fx/` |
| QA pass (2026-10-20) | 11 findings fixed: broken saves (game or tracker) start fresh instead of a blank tab; flip strip shows once (not on taps or reload); typed `#tab` addresses and Back work, Back with a sheet open only closes it; tracker blocks Flip/Treat mid-Epidemic, refuses more Epidemics than the setup has, resolves an Epidemic with an empty infection deck; Dispatcher row wraps at 393 px; 3–4 player chips show role only for computers; own Forecast prompt. Re-checked with the QA scripts in the scratchpad (qa1, flip4, disp4 screenshot) |

## Authorized next steps
- 2026-10-20 (games brief): finish phase 2 for Pandemic: rules check, ideas, QA pass, live verification.

## Standing instructions (Tim's words)
- "add risk, clue, battleship, connect four, stratego, clue, checkers, pandemic, splendor, king of tokyo, 7 wonders, and evolution to the list of games." (2026-10-20)
- "the map of the US in TTR looks nothing like the US. Fix this and any other similar problems accross the games" (2026-10-20): the board must be recognisable at a glance, every city on its real spot of land.
- "some games have maps and whatnot you can zoom in and out of often. Make it so that there is only an auto zoom that automatically fits the whole board in sight and then you can zoom if you want with easily reseting back to auto mode." (2026-10-20): auto fit is the only zoom mode; + / − / fit are the only controls; no saved zoom.
- "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered." (2026-10-20)
- Global: never ask permission; $0; Tim decides looks, wording, names; phone-first dark look.

## Traps
- `node --test tests/` fails on Windows: run `node --test tests/engine.test.js`, `node tests/online.test.mjs`, `node tests/over-prompts.test.mjs`, `node tests/zoom.test.mjs` and `node tests/fx.test.mjs` (the last three need Playwright in `~/.claude/tools`).
- `js/fx.js` is the shared library: never edit it here (copy a new version from `_fx`). Game sounds live in `js/sfx.js` + `runFx` in app.js. Headless WebKit runs about 17 frames/s, so confetti looks stuck in its screenshots; use `--engine chrome` to see it.
- Python's `http.server` on Windows shares ports with other processes (several agents' servers answered the same port). Serve with a Node server on port 0 and check the page title.
- The CSS class `.risk` is the phone risk strip. The map's risk rings are `.riskring` (the laptop hides `.risk`).
- Online re-renders arrive often (presence). The screens write HTML only when it changed (`put()` in app.js), otherwise buttons get replaced under a finger.
- Never hand-edit city x/y in `js/data.js` or `js/map-data.js`: change `tools/build-map.js` (MIN spacing, lat/lon) and rerun it, or the land and the cities stop agreeing. `package.json` is dev-only (d3-geo); it has no `"type"` field on purpose (`"type": "commonjs"` breaks `tests/online.test.mjs`).
- `?autoplay` makes the computer play your seat too (used for whole-game screenshots). Don't link it anywhere.
- Hidden hands: the rulebook keeps hands private in Standard/Heroic. Computer teammates' hands are always shown (you'd ask them at a real table); people's hands are hidden online.

## Sound map (js/sfx.js, js/app.js)
Play: drive -> `slide` · fly / charter / shuttle / Dispatcher send -> `whoosh` · build station -> `place` · treat -> `pop` + "−N" floats on the city · give / take / keep / discard -> `cardSlide` · event card -> `cardFlip` (+ Airlift `whoosh`, Grant `place`, Resilient Population `cardSlide`) · Forecast put back -> `cardSlide` · player card drawn -> `cardDeal` · Epidemic -> `alarm` + map red flash + shake, `place` (3 cubes), `shuffle` (Intensify) · infection card -> `cardFlip` then `place` when its cube lands (map cube drop delayed to match) · outbreak -> `explosion` per city of a chain, 260 ms apart, ring on the city at that moment, map shake, outbreak counter pop + "+1" · cure -> big sparkle at the vial (`ding`) · eradicated -> `stamp` + vial pop · your turn starts -> `turn` + glow on the info box · team wins -> `celebrate win` (confetti + fanfare) · team loses (8 outbreaks / cubes / cards) -> `celebrate lose` · illegal tap / refused move -> `error` · new game -> `shuffle` · buttons -> library `tap`. Timing = flip strip (draws, Epidemics, infections, 140 ms apart; 77 ms on Fast).
Table tracker: flip -> `cardFlip` + `place` (or `explosion` per outbreak) · Epidemic bottom card -> same + `shuffle` · Drew 2 -> 2 × `cardDeal` (+ `alarm` for Epidemic buttons) · treat -> `pop` · Resilient Population / Undo -> `cardSlide` · Forecast taps -> `cardFlip` · refused taps -> `error`.
Settings: Animations off also makes the game's own CSS motion instant (`html.fx-still`); Fast halves it (`html.fx-fast`). No catch-up burst when you come back to Play from another tab.

## Decisions
- Hands: "Rulebook" default (open in Introductory, hidden otherwise); Settings can force open or hidden.
- Population tie Chicago/Lima for first player: lower seat goes first (rulebook silent).
- Online events: playable when the game asks (before each infection step; Resilient Population during an Epidemic), not at any moment.
- Computer teammates in local games step one action at a time (speed in Settings).
- Real map: Mercator lat ~70N to 45S; closest city pair ≥ 58 units; coastline stroke 1 (was 1.5, the detailed coast looked heavy); land #2c4a52 + coast #5b8290 (was #1a2c38/#2a4456, too faint at 1440 px; coordinator asked for clearly lighter land, sea kept dark; screenshots `design/pandemic-maps/land-after`); Santiago's label sits above its dot (clash below).
- Map risk rings only on cities with cubes or with ≥12% chance, so the map isn't covered in rings at the start.

## NOT verified
- Sounds heard by a person (only measured: FX.play calls + Web Audio nodes in headless Chromium; WebKit on Windows has no Web Audio). Real iPhone audio unlock and the silent switch not tried.
- Sounds in a two-person online room (same code path as local, driven by the snapshot diff; not run with two browsers).
- Real iPhone (only WebKit at 393 px via phone-view).
- Zoom: real finger pinch and a real Mac trackpad pinch (the test uses synthetic two-pointer events and mouse wheel); Safari's toolbar resizing the box on a real phone.
- Real map: small direction shifts from the spreading (Mumbai nearly straight below Delhi, Cairo a little west of Istanbul, Montréal above Washington); New Zealand sits just past the board's right edge (shows only on wide boxes).
- Three- and four-person online rooms (tested two people).
- Host leaving mid-game with another person taking over (shared module feature; not tested for Pandemic).
- Event timing edge cases online (two people with events at the same window).
- Online: an uncaught FirebaseError `auth/network-request-failed` can come from an auth call in the shared `_online/online.js` with no catch (flaky network). Reported to the shared-module owner; not fixed here.
- Hint speed on a real iPhone (laptop: about 60 ms average, up to about 360 ms).
- Online: a decision picker (Resilient Population, Airlift, event confirm) left open when someone else's infection ends the game now closes (reasoned from the code; not run with two people). The Forecast-after-game-over bug is fixed and tested (`tests/over-prompts.test.mjs`).

## Rejected / parked
- ~~Chain-reaction odds~~: heavy maths, rarely changes a decision (docs/ideas.md #12).
- ~~Role-pair win-rate table~~: needs far more games for clear numbers (#14).
