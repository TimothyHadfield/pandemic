# Pandemic Lab: session log

## 2026-10-20: first build (builder for the games wave)
- **Asked:** Tim, verbatim: "add risk, clue, battleship, connect four, stratego, clue, checkers, pandemic, splendor, king of tokyo, 7 wonders, and evolution to the list of games." Brief: 2nd edition rules exactly, 48 cities, 7 roles, 5 events, 4/5/6 epidemics; table companion with exact infection odds including after an epidemic; computer teammates + planner; measured team win rate per difficulty; online seats via the shared module (co-op).
- **Built:** engine + exact odds + computer teammates + planner; screens Play / Table / Study / Settings; online rooms; tests; rules check with sources; ideas list.
- **Verified:** see progress.md (tests, mutation checks, phone-view 393 px + laptop, a whole game in WebKit, two-browser online run).
- **Open:** see progress.md NOT verified.
- **Design pass (same day):** Tim: "once you're finished with all the games, review them again for design improvements especially visually." Before/after screenshots at 393 px + 1440 px, a read-only reviewer ranked 15 problems; fixed taps, cards, map, game-over box, role buttons, desktop sizing (see progress.md Status). Tests 23/23 + online 6/6.
- **Real map (same day):** Tim: "the map of the US in TTR looks nothing like the US. Fix this and any other similar problems accross the games". Replaced the hand-drawn continents with Natural Earth land + lakes, cities on real spots with one smooth warp (tools/build-map.js). Verified: tests 23/23 + online 6/6 + over-prompts, phone-view 393 px + 1440 px (play, zoomed play, study), no console errors or overflow, reviewer agent found no major errors.
- **Later the same day:** merged the stronger computer teammates (route-based turn search; about 14% → 28% overall over 300 fixed games), rebuilt the win-rate table, and fixed the 11 QA findings (see progress.md Status).
