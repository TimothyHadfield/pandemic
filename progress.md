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
| Auto-fit zoom (2026-10-20) | Done: map always opens in auto (whole board fits, 8 px sea margin, re-fits with a glide on resize/rotation; Play tab return and new game = auto); one-finger drag does nothing in auto; pinch / wheel / ctrl-pinch / + − zoom (max 4×), drag pans clamped to the board; fit button (beside − +; top-left since the table look) dimmed in auto, lit blue when zoomed; double tap on empty sea while zoomed = back to auto. Removed: menu "Whole map" item, double-tap zoom-in. Test `node tests/zoom.test.mjs` (WebKit, 393×659, 659×393, 1280×800): 28 fails on old code, all pass now. Study danger map is static (not zoomable). Screenshots: scratchpad `design/pandemic-zoom/before|after` |
| Sounds, celebrations, animations (2026-10-20) | Done: `js/fx.js` (shared library, copied unchanged from `_fx`), `js/sfx.js` (what happened between two views -> timed sounds/motion; local, computer and online moves alike), Settings "Sound & effects" panel. Test `node tests/fx.test.mjs` (node + Chromium): failed on the old code, 40 checks pass. Screenshots: scratchpad `design/pandemic-fx/` |
| Real-table look (2026-10-20) | Done: Play view is a wood table (shared kit `css/table.css` + `js/table.js` from `_table`, copied unchanged). Board drawn like the printed 2nd-edition board: frame + fold creases, infection-rate track top centre-right, infection deck + discard top-right, outbreaks zig-zag lower left, cures row bottom, player deck + discard bottom-right; decks with thickness + counts, messy face-up discard piles; 3-D cubes, house stations, pawns, round markers, vial cure markers. Cards at 63:88 with our own faces (city colour, name, mini world map with the city, population; events golden; Epidemic green; role cards). Teammates sit across the top (role card + held cards, backs when hidden); your role card + fanned hand at the bottom; draws fly off the deck and flip face up. Laptop: side panel with info, odds, log. Zoom buttons now top-left. Screenshots: scratchpad `table/pandemic/before|after` |
| Edge pass (2026-10-20) | 51 weird scenarios tested (list + results: scratchpad `edge/pandemic/`), 14 failed, all fixed: Epidemic with an empty infection deck crashed the engine (now: rate up, no bottom card, Intensify); Forecast with an empty deck says why; double taps (Treat/moves/Infect spend one action; End turn's box no longer closes itself; sheets ignore the 2nd tap); Back with a confirm box only closes it; the end box's New game / Review buttons did nothing (fixed); two tabs no longer save over each other (a tab picks up the other's saves; only the visible tab moves computers); a 2nd game ending the same turn the same way now gets its end card; tracker says when 8 outbreaks / no cubes means a loss. Look (Step 0 reviewer): end box is now a card laid on the table; city names show at phone size (7.2 px, no overlaps, busiest cities first); teammate seats have no box; board track panels fainter. Shared kit `_table` 1.0.1 copied (flip faces checked in WebKit), `.gitattributes` added. Test `node tests/edge.test.mjs` (WebKit, 31 checks; 9 failed on the old code) |
| QA pass (2026-10-20) | 11 findings fixed: broken saves (game or tracker) start fresh instead of a blank tab; flip strip shows once (not on taps or reload); typed `#tab` addresses and Back work, Back with a sheet open only closes it; tracker blocks Flip/Treat mid-Epidemic, refuses more Epidemics than the setup has, resolves an Epidemic with an empty infection deck; Dispatcher row wraps at 393 px; 3–4 player chips show role only for computers; own Forecast prompt. Re-checked with the QA scripts in the scratchpad (qa1, flip4, disp4 screenshot) |

## Authorized next steps
- 2026-10-20 (games brief): finish phase 2 for Pandemic: rules check, ideas, QA pass, live verification.

## Standing instructions (Tim's words)
- "add risk, clue, battleship, connect four, stratego, clue, checkers, pandemic, splendor, king of tokyo, 7 wonders, and evolution to the list of games." (2026-10-20)
- "the map of the US in TTR looks nothing like the US. Fix this and any other similar problems accross the games" (2026-10-20): the board must be recognisable at a glance, every city on its real spot of land.
- "some games have maps and whatnot you can zoom in and out of often. Make it so that there is only an auto zoom that automatically fits the whole board in sight and then you can zoom if you want with easily reseting back to auto mode." (2026-10-20): auto fit is the only zoom mode; + / − / fit are the only controls; no saved zoom.
- "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered." (2026-10-20)
- "could you also make sure that each of the games also have a look to them so that the game (either board or card layout) looks almost identical to how the board or card layout looks like in real life, so it's easy to understand if you've already played it before, and also so it feels more like you're actually playing in real life rather than you're playing it online. Even things like how youre cards or other things are laid out infront of you, make it look like they are actual cards laid out similar to how it looks like in real life. Make the decks look like actual decks. Make the board have the same design as it does in real life with the same layouts. It should look kind of like you're looking through a camera that is connected to a user's glasses that is playing in real life (not actually, but the layout and style of everything should be similar)." (2026-10-20)
- "I've noticed the games often have good user interfaces but could be improved especially when a scenario happens that the game might've not really thought about or whatnot. Could you focus on making each game perfect especially in scenarios that the game doesn't expect or are a little weird." (2026-10-20)
- Global: never ask permission; $0; Tim decides looks, wording, names; phone-first dark look.

## Traps
- `node --test tests/` fails on Windows: run `node --test tests/engine.test.js`, `node tests/online.test.mjs`, `node tests/over-prompts.test.mjs`, `node tests/zoom.test.mjs`, `node tests/fx.test.mjs` and `node tests/edge.test.mjs` (the last four need Playwright in `~/.claude/tools`).
- `js/fx.js` is the shared library: never edit it here (copy a new version from `_fx`). Game sounds live in `js/sfx.js` + `runFx` in app.js. Headless WebKit runs about 17 frames/s, so confetti looks stuck in its screenshots; use `--engine chrome` to see it.
- Python's `http.server` on Windows shares ports with other processes (several agents' servers answered the same port). Serve with a Node server on port 0 and check the page title.
- The CSS class `.risk` is the phone risk strip. The map's risk rings are `.riskring` (the laptop hides `.risk`).
- Online re-renders arrive often (presence). The screens write HTML only when it changed (`put()` in app.js), otherwise buttons get replaced under a finger.
- Never hand-edit city x/y in `js/data.js` or `js/map-data.js`: change `tools/build-map.js` (MIN spacing, lat/lon) and rerun it, or the land and the cities stop agreeing. `package.json` is dev-only (d3-geo); it has no `"type"` field on purpose (`"type": "commonjs"` breaks `tests/online.test.mjs`).
- `?autoplay` makes the computer play your seat too (used for whole-game screenshots). Don't link it anywhere.
- `css/table.css` + `js/table.js` are the shared table kit: never edit them here (copy from `_table`). Test servers must serve `.css` as `text/css` or WebKit drops the stylesheet (cards render 300 px wide).
- Double-tap guard: `act()` ignores a move within 350 ms of the end of the last move's screen update (`TAP_GAP`); sheets ignore taps in their first 350 ms; confirm boxes only ignore early taps on the backdrop (tests click Yes at once). The end card (`.banner`) sits outside `#v-play`, so its buttons use `data-end` and their own handler.
- Two tabs: a `storage` listener adopts the other tab's saved game; computers move only in the visible tab (`document.hidden`).
- `#g-fan` has a fixed CSS height (`!important`): the kit's fan sets its own height on resize, which looped with the board's auto-fit ("ResizeObserver loop" page errors).
- Card mini maps use one blob-URL picture of the coastline (`world()` in art.js), not a live `<use>` of the 80 KB path in every card.
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
- Edge pass look (not Tim's choices): end card green "Cured!" / red "Game over" with an icon (4 vials / outbreak star / cube / deck), the reason and "Turn N · N outbreaks", rotated -2°, buttons under it; phone city names 7.2 px, under the dot, else over, else beside; teammate seats without a box.
- Epidemic with an empty infection deck: no rulebook case; skip Infect, still Intensify (rules-check.md).
- Table look (not Tim's choices, plainest version): dark wood surface; helpers stay as dark glass panels on the wood; your role card glows warm on your turn; zoom buttons moved top-left (top-right covered the infection deck); zoom test waits until the map settles instead of fixed sleeps (slow paint on a busy machine).
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
- Table look: zoom glide smoothness on a real iPhone (headless WebKit paints the busier board slower than before; the phone city names are re-placed on every glide frame). Reviewer notes left open (Tim's call or helpers we keep): zoom buttons sit on the board's corner, phone action buttons are app-sized (40 px tap rule), deck count badges, risk rings, your role card's turn glow, teammates' fanned card names overlap on laptop with 6–7 cards (like a real held fan).
- Edge pass: online leaving / host leaving / AFK not run with two people; a real finger's double tap (tested with two mouse clicks 90 ms apart in WebKit).
- Hint speed on a real iPhone (laptop: about 60 ms average, up to about 360 ms).
- Online: a decision picker (Resilient Population, Airlift, event confirm) left open when someone else's infection ends the game now closes (reasoned from the code; not run with two people). The Forecast-after-game-over bug is fixed and tested (`tests/over-prompts.test.mjs`).

## Rejected / parked
- ~~Chain-reaction odds~~: heavy maths, rarely changes a decision (docs/ideas.md #12).
- ~~Role-pair win-rate table~~: needs far more games for clear numbers (#14).
