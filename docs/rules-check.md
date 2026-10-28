# Rules check (Pandemic, 2013 second edition)

Every rule and number the engine uses, with where it comes from. Checked 2026-10-20.

**Sources**
- **[R]** Official Z-Man rulebook (2nd ed.), PDF: https://images-cdn.zmangames.com/us-east-1/filer_public/25/12/251252dd-1338-4f78-b90d-afe073c72363/zm7101_pandemic_rules.pdf
- **[P]** marcsingleton/Pydemic (Python engine): https://github.com/marcsingleton/Pydemic
- **[B]** BlopaSc/PAIndemic (AI research engine): https://github.com/BlopaSc/PAIndemic
- **[T]** GAIGResearch/TabletopGames, Pandemic module: https://github.com/GAIGResearch/TabletopGames
- **[G]** GerryFudd/pandemic (board data): https://github.com/GerryFudd/pandemic
- **[A]** boardgameanalysis.com, graph analysis of the Pandemic map (degrees per city)
- **[OB]** Pandemic: On the Brink expansion rules (Legendary = 7 Epidemics; 2 events per player from the mixed pool), as commonly summarised (e.g. The Hobbyist's how-to video, youtube.com/watch?v=OAF-VtnveRs). Our variants follow its idea, with our own names

Status: ✅ two or more sources agree · ☑️ one source, or our reading of it · ⚠️ open question (see the end)

## Board
| Rule / number | Engine | Source | Status |
|---|---|---|---|
| 48 cities, 12 per colour (blue, yellow, black, red) | `data.js CITIES` | R, P, G | ✅ |
| Connections: 93 links (incl. 3 across the Pacific edge) | `LINKS`, test "board facts" | P, G, A | ✅ |
| Hong Kong and Istanbul have the most links (6); Santiago has the fewest (1) | test | A, P | ✅ |
| Pacific wrap links: San Francisco–Tokyo, San Francisco–Manila, Los Angeles–Sydney | `WRAP` | R map, P, G | ✅ |
| City populations (used for who goes first and shown on cards) | `pop` | P, G (London 8,586,000 by majority) | ✅ |
| Start: all pawns and one research station in Atlanta | `newGame` | R, P | ✅ |

## Setup
| Rule / number | Engine | Source | Status |
|---|---|---|---|
| 24 cubes per colour (96 total) | `CUBES_PER_COLOR` | R, T | ✅ |
| 6 research stations | `MAX_STATIONS` | R, T | ✅ |
| Initial infection: 3 cards × 3 cubes, 3 × 2, 3 × 1, cards to the discard pile | `newGame` | R, P, B | ✅ |
| Hand size dealt: 2 players 4 cards, 3 players 3, 4 players 2 | `DEAL` | R, P, T | ✅ |
| Player deck: 48 city cards + events; Epidemics 4 (Introductory), 5 (Standard), 6 (Heroic) | `newGame` | R, T | ✅ |
| Deck built by splitting into as many piles as Epidemics, one Epidemic shuffled into each, larger piles on top | `newGame`, odds `epidemicChances` | R, P | ✅ |
| 5 event cards in the 2nd edition box: Airlift, Forecast, Government Grant, One Quiet Night, Resilient Population | `EVENTS` | R, T | ✅ |
| All 5 events go in the deck (59 player cards = 48 + 5 + 6 in the box) | `newGame` | R | ✅ |
| 7 roles in the 2nd edition: Contingency Planner, Dispatcher, Medic, Operations Expert, Quarantine Specialist, Researcher, Scientist | `ROLES` | R, T | ✅ |
| First player: whoever holds the city card with the highest population | `newGame` | R, P | ✅ |
| Tie on population (Chicago and Lima are both 9,121,000): the rulebook gives no tie-break. We take the lower seat | `newGame` | — | ☑️ |
| The Quarantine Specialist and Medic do not affect the setup infection | `s.setup` flag | R (setup happens before roles act) | ☑️ |

## Turn
| Rule / number | Engine | Source | Status |
|---|---|---|---|
| 4 actions: Drive/Ferry, Direct Flight, Charter Flight, Shuttle Flight, Build, Treat, Share, Cure | `legalActions` | R, P, B | ✅ |
| Treat removes 1 cube, or all cubes of a cured colour | `treat` | R, P | ✅ |
| Share Knowledge: give or take the card of the city you are both in | `give/take` | R, P | ✅ |
| Cure: 5 cards of one colour at a research station (Scientist 4) | `needFor` | R, P, T | ✅ |
| Draw 2 player cards; Epidemic is resolved at once | `queue` | R, P | ✅ |
| Hand limit 7: discard (or play events) straight away when over | `HAND_LIMIT`, phase `discard` | R, T | ✅ |
| Not enough player cards to draw 2 → the team loses | `lose('cards')` | R, P | ✅ |
| Infection rate track 2, 2, 2, 3, 3, 4, 4 | `RATE_TRACK` | P, T, B | ✅ (rulebook image shows the same track) |

## Epidemic, infection, outbreak
| Rule / number | Engine | Source | Status |
|---|---|---|---|
| Epidemic: Increase rate, Infect (bottom card, 3 cubes), Intensify (shuffle the discard pile, put it on top) | `epidemic` | R, P, B | ✅ |
| The bottom card goes to the discard before Intensify, so it comes back on top | `epidemic` | R, P | ✅ |
| Outbreak: a city that would get a 4th cube gets 1 cube in each connected city instead; chains; a city outbreaks once per chain | `infect/outbreak` | R, P, B | ✅ |
| 8 outbreaks → the team loses | `MAX_OUTBREAKS` | R, T | ✅ |
| Running out of cubes of a colour → the team loses | `lose('cubes')` | R, P | ✅ |
| Eradicated (cured and no cubes left): infection cards of that colour do nothing | `checkErad`, `infect` | R, P | ✅ |
| Win: all 4 cures discovered (at once, even mid-turn) | `cure` | R, T | ✅ |

## Roles
| Role | Rule | Source | Status |
|---|---|---|---|
| Contingency Planner | Action: take an event from the player discard pile; only 1 stored; the stored event is removed from the game when played | R, T | ✅ |
| Dispatcher | Move any pawn to a city with another pawn; move other pawns as if they were his own (with his cards) | R, P | ✅ |
| Medic | Treat removes all cubes of a colour; cured colours are removed on entering a city (also when a cure happens with him there: our reading) and can't be placed where he is | R, P | ☑️ (the "at the moment of the cure" part) |
| Operations Expert | Build without a card; once per turn, from a station move to any city by discarding any city card | R, T | ✅ |
| Quarantine Specialist | Prevents cube placement in his city and the connected cities | R, P | ✅ |
| Researcher | May give any city card when sharing, on either player's turn | R, P | ✅ |
| Scientist | Needs only 4 cards to cure | R, P | ✅ |

## Events
| Event | Rule | Source | Status |
|---|---|---|---|
| Any time | Events can be played at any time, by anyone, without an action, except between drawing a card and resolving it | R | ☑️ |
| Airlift | Move any pawn to any city | R, T | ✅ |
| Forecast | Look at the top 6 infection cards, put them back in any order | R, T | ✅ |
| Government Grant | Build a research station in any city, no card needed | R, T | ✅ |
| One Quiet Night | Skip the next Infect Cities step | R, T | ✅ |
| Resilient Population | Remove any card in the infection discard pile from the game; may be played between Infect and Intensify of an Epidemic | R, P | ✅ |

## Variants (Settings)
| Variant | Rule | Source |
|---|---|---|
| Difficulty | 4 / 5 / 6 Epidemics | R |
| Legendary level (switch, off by default) | 7 Epidemics, 7 piles. The On the Brink expansion's top level (Legendary) | OB, ☑️ |
| Extra roles & events (switch, off by default) | 3 more roles + 3 more events in our own names. Event count = 2 per player drawn at random from all 8 (the On the Brink rule for mixing in extra events). Roles: Veteran (5 actions, like the Generalist), Responder (enter a city with 2+ cubes of a colour: remove 1, our own), Analyst (once a turn take any city card from a player in your city, free; a softer Researcher-in-reverse, our own). Events: Extra Shift (2 more actions, like Borrowed Time), Remote Care (remove any 2 cubes, like Remote Treatment), Travel Ban (infection rate 1 until your next turn, like Infection Zone Ban / Commercial Travel Ban) | OB, ☑️ (our own variants, not exact copies) |
| Open or hidden hands | Rulebook: hands are face up in Introductory games only. Groups often play open hands; the setting allows both | R |
| Pause for events | Not a rule: a convenience that stops before infections when you hold an event | — |

## Open questions ⚠️
- **Government Grant with all 6 stations out:** the 2nd edition card text was not in the PDF we read. We use the usual ruling for the Build action: move a station from elsewhere.
- **Forecast with fewer than 6 cards left:** you reorder what is left (engine does this). With none left it can't be played ("The infection deck is empty").
- **Epidemic with no infection cards left** (every card in the discard pile or removed; almost impossible in a real game): the rulebook [R] has no case for it. The engine raises the rate, skips the Infect step (there is no bottom card) and still does Intensify, the same as the Table tracker. Before 2026-10-20 the engine crashed here (test "epidemic with an empty infection deck").
- **Online event timing:** in online games you can play events when the game asks you (before each infection step, and during an Epidemic for Resilient Population), not at an arbitrary moment. At a real table events can be played almost any time; this simplification avoids two people acting at once.
