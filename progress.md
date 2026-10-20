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
| Computer teammates + planner (Hint) + points lost | Done; a builder was improving strength (branch `bots`) |
| Play screen (phone + laptop) | Done |
| Online rooms (shared module, co-op) | Done; two-browser check passes on the real project |
| Table tab (real-table tracker) | Done |
| Study tab (win rates, danger map, last game chart, points lost) | Done (win-rate table needs `js/strength-data.js` filled) |
| Settings | Done |

## Authorized next steps
- 2026-10-20 (games brief): finish phase 2 for Pandemic: rules check, ideas, QA pass, live verification.

## Standing instructions (Tim's words)
- "add risk, clue, battleship, connect four, stratego, clue, checkers, pandemic, splendor, king of tokyo, 7 wonders, and evolution to the list of games." (2026-10-20)
- Global: never ask permission; $0; Tim decides looks, wording, names; phone-first dark look.

## Traps
- `node --test tests/` fails on Windows: run `node --test tests/engine.test.js` and `node tests/online.test.mjs`.
- Python's `http.server` on Windows shares ports with other processes (several agents' servers answered the same port). Serve with a Node server on port 0 and check the page title.
- The CSS class `.risk` is the phone risk strip. The map's risk rings are `.riskring` (the laptop hides `.risk`).
- Online re-renders arrive often (presence). The screens write HTML only when it changed (`put()` in app.js), otherwise buttons get replaced under a finger.
- `?autoplay` makes the computer play your seat too (used for whole-game screenshots). Don't link it anywhere.
- Hidden hands: the rulebook keeps hands private in Standard/Heroic. Computer teammates' hands are always shown (you'd ask them at a real table); people's hands are hidden online.

## Decisions
- Hands: "Rulebook" default (open in Introductory, hidden otherwise); Settings can force open or hidden.
- Population tie Chicago/Lima for first player: lower seat goes first (rulebook silent).
- Online events: playable when the game asks (before each infection step; Resilient Population during an Epidemic), not at any moment.
- Computer teammates in local games step one action at a time (speed in Settings).
- Map risk rings only on cities with cubes or with ≥12% chance, so the map isn't covered in rings at the start.

## NOT verified
- Real iPhone (only WebKit at 393 px via phone-view).
- Three- and four-person online rooms (tested two people).
- Host leaving mid-game with another person taking over (shared module feature; not tested for Pandemic).
- Event timing edge cases online (two people with events at the same window).

## Rejected / parked
- ~~Chain-reaction odds~~: heavy maths, rarely changes a decision (docs/ideas.md #12).
- ~~Role-pair win-rate table~~: needs far more games for clear numbers (#14).
