# Data and theory ideas (Build / Skip)

Pandemic is about what's in the decks, so most of the useful maths is exact counting over the
known card layers. Decided 2026-10-20.

| # | Idea | Why it helps | Decision |
|---|---|---|---|
| 1 | **Exact chance each city is infected this turn**, from the known layers of the infection deck (cards put back on top after each Epidemic) | The core skill in Pandemic is knowing which cities come up next | **Build** (odds.js, map rings, risk strip, side table) |
| 2 | **Exact chance of an Epidemic in the next 2 cards**, from the pile sizes (one Epidemic per pile) | Tells you when to treat now vs move on | **Build** (status bar, risk strip, tracker) |
| 3 | **Odds after an Epidemic in the same draw** (mix of 0, 1 and 2 Epidemics, with the unknown bottom card) | The moment that loses most games; checked against 6000 simulated games | **Build** |
| 4 | **Outbreak risk per city** (3 cubes × chance of being drawn) | The number that matters for 3-cube cities | **Build** |
| 5 | **Real-table tracker**: tap cards as they're flipped at a real game, get the same odds | Use it next to the physical board | **Build** (Table tab) |
| 6 | **Planner hint**: best 4 actions by search over the turn | Learn good turns | **Build** (Hint button) |
| 7 | **Points lost per turn** vs the planner | Shows which turns cost you | **Build** (Study tab) |
| 8 | **Measured team win rate** per player count and difficulty | Tells you how hard each setup is and how good the computers are | **Build** (tools/build-strength.js → Study + setup) |
| 9 | **Danger map**: where outbreaks happen most in computer games | Shows the hubs (Hong Kong, Istanbul, Cairo…) | **Build** (Study tab heat map) |
| 10 | **Game timeline**: outbreaks, cubes on the board and cures per turn, Epidemics marked | See where your game turned | **Build** (Study tab chart) |
| 11 | **Forecast helper**: suggests an order (3-cube cities at the bottom) | Small, the rule of thumb is enough | Skip (one-line tip in the Forecast sheet instead) |
| 12 | Chain-reaction odds (chance an outbreak chain reaches a city) | Exact sums are heavy and rarely change a decision | Skip |
| 13 | Cards-to-cure counter (how many draws until a cure, expected) | Mostly obvious from the hand; adds clutter | Skip |
| 14 | Role-pair win rates (which 2 roles win most) | Needs ~50k games for clear numbers; free CPU is fine but the screen is busy | Skip for now |
| 15 | "Points lost" for events (when to play One Quiet Night) | The bot's event logic is simple; numbers would mislead | Skip |
| 16 | Infection deck "card counting" practice quiz | Nice, but a separate mode; the tracker covers the skill | Skip |
