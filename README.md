# Motorsport Manager — Career Sim

A dark-mode, data-dense front end for an F1-style management simulation.
React 19 · TypeScript · Tailwind CSS v4 · Framer Motion · Lucide.

The centrepiece is a live circuit map: twenty cars move along a real SVG
path driven by a `progress` value between 0 and 1, with overtakes detected
by the simulation and surfaced simultaneously on the map and in the timing
tower.

Everything runs as **one career game**: a nine-phase loop from main menu
to post-race on the 2026 grid, with every sidebar screen reading and
writing the same MongoDB-backed save.

```bash
npm install
cp .env.example .env   # add your MONGODB_URI
npm run seed           # catalog + starter career
npm run server         # career API on :4000
npm run dev            # dashboard on :5173
```

The dashboard runs without the API too: if it cannot reach the backend it
fails over to an offline store and says so in the header.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run server` | Express + MongoDB career API |
| `npm run seed` | Seed the catalog (`--force` also clears save slots) |
| `npm run build` | Typecheck + production bundle |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run sim:check` | Headless assertions against the race engine |
| `npm run game:check` | Headless assertions against the career-game state machine |
| `npm run lint` | oxlint |

---

## Architecture

The app is split into three layers that know as little about each other as
possible. This is what makes swapping the mock data for a real backend a
configuration change rather than a rewrite.

```
  ┌─────────────────────────────────────────────┐
  │  views/ + components/    presentation only   │
  └───────────────────┬─────────────────────────┘
                      │ useRace()
  ┌───────────────────┴─────────────────────────┐
  │  state/RaceProvider      React ⇄ feed bridge │
  └───────────────────┬─────────────────────────┘
                      │ RaceFeed interface
  ┌───────────────────┴─────────────────────────┐
  │  services/raceFeed       transport            │
  │    ├── createLocalSimulationFeed()  (default) │
  │    └── createWebSocketFeed()        (backend) │
  └───────────────────┬─────────────────────────┘
                      │
  ┌───────────────────┴─────────────────────────┐
  │  engine/raceEngine       pure simulation      │
  │  engine/strategy         pure projections     │
  └─────────────────────────────────────────────┘
```

### `src/types/index.ts` — the contract

Every layer speaks in these shapes: `Driver`, `CarState`, `RaceState`,
`TelemetrySample`, `OvertakeEvent`, `RaceCommand`. Nothing else is shared.

### `src/engine/raceEngine.ts` — the simulation

Pure TypeScript. No DOM, no React, no timers of its own — the host decides
when to call `step(dtMs)`. It models per-lap pace from driver attributes,
tyre compound and wear (including the cliff), fuel load, DRS zones, the
slipstream, push mode and pit stops, and it emits confirmed overtakes.

Because it owns no timers it runs identically in the browser today and
inside a Node worker later. `npm run sim:check` exercises it headlessly.

### `src/services/raceFeed.ts` — the seam

The whole UI talks to the `RaceFeed` interface and nothing else. It exposes
two deliberately separate channels:

- **`onFrame`** — ~60 Hz, positions only. Written straight into Framer
  Motion `MotionValue`s so cars move without a single React render.
- **`onSnapshot`** — throttled to 5 Hz, immutable copies. Tables, charts and
  panels render from these.

### Pointing at a real backend

```bash
echo "VITE_RACE_WS_URL=ws://localhost:4000/race" > .env
```

`createRaceFeed()` then returns the WebSocket transport instead of the local
simulation. No component changes. The expected protocol is:

```jsonc
// server -> client
{ "type": "snapshot", "payload": /* RaceState */ }
{ "type": "frame",    "payload": /* RaceState */ }
{ "type": "overtake", "payload": /* OvertakeEvent */ }

// client -> server: a RaceCommand, verbatim
{ "type": "PIT_CALL", "driverId": "garcia" }
```

Reconnection with exponential backoff is already handled; the sidebar shows
the live transport status.

---

## The circuit map

`src/data/circuits.ts` defines a circuit as a list of **anchor points**.
`splinePath()` converts them into a smooth closed Catmull-Rom spline
expressed as cubic béziers — a real `d` attribute, easy to retune by nudging
one coordinate. The Suzuka-style layout is a genuine figure-of-eight: the
Degner → hairpin link crosses over the Spoon → 130R back straight.

`createPathSampler()` pre-computes 1,400 evenly spaced points along that
path, so placing a car at any progress value is an O(1) lerp rather than a
`getPointAtLength()` call per car per frame.

Corner labels, DRS zones and sector splits are authored against anchor
indices and converted to 0-1 progress. DRS zones are drawn by giving the
track path `pathLength={1}` and addressing sub-segments with a dash pattern
— the same 0-1 units the simulation uses.

### Overtake visualisation

A position swap alone is not a pass; cars running nose-to-tail trade places
constantly. The engine opens a *provisional* move on a swap and only reports
it once the overtaker is still ahead and clear by a margin. Moves that get
immediately reversed never surface. When one is confirmed:

1. The two cars swap order on the map and in the timing tower (animated via
   Framer Motion `layout`).
2. An `OVERTAKE!` callout tracks the overtaking dot, with a red attack arrow
   drawn back to the car that was passed — all transform-driven, so it
   follows both dots at 60 fps without re-rendering.
3. The overtaker's timing row turns red and expands to read
   `OVERTAKE COMMENCED`; the car passed shows `POSITION LOST`.

A scripted pass is armed at session start in the standalone race demo so the
behaviour is visible within ~15 seconds; career sessions leave passes to
emerge naturally.

---

## Layout

| Region | Contents |
| --- | --- |
| Sidebar | Grouped: **Career Game** (Season), **Race Weekend** (Team, Drivers, Car Dev, Race Strategy, Pitwall Live), **Career Mode** (Season Setup, Driver Market, R&D Center, Calendar), **Account** |
| Top bar | Budget, round/week, circuit, save location, projects in build, manager |
| Centre | Circuit map with live cars, DRS zones, sectors, pit lane |
| Right | Live timing: position, driver, gap, tyre + wear ring, status |
| Bottom | Speed controls, lap progress, tyre-degradation and fuel traces |

Pitwall Live carries the live race: circuit map, timing tower, pit-to-car
radio, tyre selection and the playback speed controls.

Sidebar collapses to icons under 1280px and is replaced by a compact,
horizontally scrolling top-bar nav under 768px that still reaches every
screen. No view scrolls horizontally at 375px.

---

## Notes

- The race-engine smoke test (`sim:check`) uses a fictional roster; the
  career game uses the 2026 grid.
- The race engine is seeded (`mulberry32`), so a given seed replays exactly.
- Driver "portraits" are generated helmet SVGs, deterministic per driver id.
- Car movement is driven by `requestAnimationFrame`; a backgrounded tab
  pauses the session rather than fast-forwarding on return.

---

# Management Screens

Season Setup, Driver Market, R&D Center and Calendar sit under **Career
Mode** in the sidebar. They are part of the same career game — each one
reads and writes the active save through `useGame()`; there is no separate
career store.

- **Season Setup** — race length, difficulty, championship length, fastest
  lap point, plus a drag-and-drop calendar builder (editable in pre-season).
- **Driver Market** — the full 2026 grid with straight two-way swaps.
- **R&D Center** — the component tech tree: nine components, each a
  five-node tree forking into two mutually exclusive philosophies, gated by
  development tokens and a seasonal cap.
- **Calendar** — the season with per-round results, and a hero card for the
  next race.

The circuit catalog and the component tech tree are generated in
`src/lib/careerGen.ts` and served from `GET /api/catalog`.


# Career Game

A nine-phase gameplay loop on the 2026 grid, driven by an explicit state
machine. Boot the app and it opens on the main menu.

> See the grid disclaimer under **One Flow (2026 rebuild)** below.

## The flow

```
                    ┌──────────────┐
                    │  MAIN_MENU   │◄──── Reset clears the slot
                    └──────┬───────┘
              New game     │     Continue (restores the saved phase)
                           ▼
   SETUP_CAREER ──► TEAM_SELECTION ──► PRE_SEASON
                                            │ Start Season
                                            ▼
                    ┌────────────────────► HUB ◄──────────────┐
                    │                       │ Proceed          │
                    │                       ▼                  │
                    │                  QUALIFYING              │
                    │                       │ Next: Start Race │
                    │                       ▼                  │
                    │                RACE_COUNTDOWN            │
                    │                       │ 10s countdown    │
                    │                       ▼                  │
                    │                  RACE_SESSION            │
                    │                       │ Chequered flag   │
                    │                       ▼                  │
                    └──────────────────  POST_RACE ────────────┘
                                     Continue to Next Week
```

## State machine

`src/game/machine.ts` holds two tables and a pure reducer:

- **`PHASE_TRANSITIONS`** — which events move the player to a new phase.
- **`PHASE_ACTIONS`** — which events mutate state *within* a phase.

Anything not listed for the current phase is **refused with a reason**
rather than silently ignored, so an out-of-order screen change cannot be
triggered from the UI. The refusal surfaces as a toast. Guards also cover
domain rules — you cannot race without qualifying, confirm a team without
selecting one, or invest beyond the budget.

`transition(state, event)` is pure: `src/state/GameProvider.tsx` owns the
side effects (autosave, toasts), so the machine is testable on its own.
`npm run game:check` exercises 62 assertions against it headlessly.

## Persistence — one slot

`localStorage` is authoritative: synchronous, offline, and exactly the
"one active save" semantics the game wants. Every accepted transition
autosaves. The same slot is mirrored to MongoDB (`PUT /api/save`) on a
best-effort basis, so a save survives clearing browser data — a failed
mirror never blocks the local write, and the app falls back to local-only
until the next reload.

Saves carry a `version`; a mismatch is discarded rather than migrated.
Resuming a save that was written mid-race falls back to the hub, since a
running session cannot be meaningfully restored.

## Screens

**Main Menu** — Start New Game (confirms before overwriting), Continue
(disabled with an empty slot, and shows the saved team, season, round and
phase), Reset Game (confirms, then clears local and cloud copies).

**Career Setup** — manager name, race length (25/50/75/100%), difficulty,
championship length (4-12 rounds) and the fastest-lap point.

**Team Selection** — all eleven 2026 constructors with car stats, both
drivers, budget and prestige. A weaker car is the harder, higher-reward
choice: the job market rewards over-delivering.

**Pre-Season** — R&D investment across aero, power unit, reliability and
pit crew, plus straight driver swaps with any team on the grid. A
prominent **Start Season** button sits top-right.

**Driver Market** — the squad, the market and the talks. See *Squads and
the entry list* and *Signing drivers* below.

**Mail** — the inbox. Results, board messages, driver complaints, contract
talks and rival bids all land here, and a message carrying a decision is
answered from the inbox rather than from the screen it came from. The
unread count sits on the sidebar.

**Social** — the paddock talking out loud: qualifying and race reaction,
transfers, team news, driver moods and rumour, posted by drivers, teams
and recurring press and fan voices. Generated from what actually happened
in the save and deterministic on it, so a reload cannot reroll the
paddock's opinion of you.

**Manager Hub** — next Grand Prix, both championship tables, and the job
market: every rival team's open role, budget, required rating and salary.
Applications are judged against `managerPerformanceScore`, which moves
with how far you beat (or miss) the position your car should deliver.

**Qualifying** — five timed laps per driver; only the best counts. Expand
any row to see all five with the best one highlighted. The classification
becomes the starting grid.

**Race** — a 10-second countdown with start lights holds the field on the
grid, then the session runs with 1x / 2x / 5x playback plus pause. The
grid strictly follows qualifying: the engine seeds positions from the
order of the drivers array, so the array is sorted by qualifying result.

**Post-Race** — classification with grid slot, positions gained, fastest
lap and points (25-18-15-12-10-8-6-4-2-1, plus one for the fastest lap in
the top ten), then the updated WDC and WCC. Continue loops back to the hub;
the final round rolls into a new season.

## Notes on the race session

The race reuses the existing race engine and live map rather than adding a
second simulation — `RaceProvider` takes the grid, circuit, lap count and
starting speed as props. Two consequences worth knowing:

- A Grand Prix is **time-compressed** (`TIME_COMPRESSION = 6` simulated
  seconds per real second at "1x") so a race fits into a couple of minutes.
  The 1x/2x/5x controls multiply on top; each button's tooltip shows the
  effective ratio.
- Car movement is driven by `requestAnimationFrame` through the shared
  feed, not `setInterval`. That keeps the twenty dots smooth; the speed
  controls scale simulated time exactly as an interval delay would. The
  countdown itself *is* a one-second `setInterval`.

The race and the pre-career screens take over the whole display —
navigating away mid-race would tear down the running session.

---

# One Flow (2026 rebuild)

Everything the sidebar shows is now the same career save. There is no
separate demo data and no second career store: pick a team, and Command
Center, Team, Drivers, Car Dev, Race Strategy, Pitwall, Season Setup,
Driver Market, R&D Center and Calendar all read *your* team, *your*
drivers, *your* budget and *this* round's circuit.

## The 2026 grid

Eleven teams, twenty-two cars, including Audi and Cadillac. Car statistics
carry an `electrical` axis alongside `powerUnit`, reflecting the roughly
50/50 combustion-electric split of the 2026 rules, and the "boost" radio
call stands in for the manual override that replaces DRS.

> Team and driver names reflect the announced 2026 entries. Unofficial fan
> project, unaffiliated with Formula 1, the FIA or any competitor. Car
> numbers for new entrants are provisional, and **every rating, budget and
> car statistic is invented** for gameplay balance.

## Database-backed save

MongoDB is authoritative. The game boots from `GET /api/save`, and every
accepted transition writes the complete state back with `PUT /api/save`:

| Persisted per save | Where it is edited |
| --- | --- |
| Drivers and transfers (`driverTeams`) | Driver Market, Pre-Season |
| Car statistics per team | Car Dev, R&D Center |
| Component tech tree (`rnd`) | R&D Center |
| Money / budget | Car Dev, Team, Driver Market |
| Facilities | Team |
| Calendar and track selection | Season Setup |
| Race strategy per driver | Race Strategy |
| Standings, history, manager rating | Race results |

localStorage keeps a mirror of the same slot so the game stays playable —
and still saves — when the database is unreachable; the header shows `DB`
or `Local` accordingly. Catalog data (tracks, components, the grid) is
served from `GET /api/catalog`.

## Pitwall Live — the race cockpit

Command Center is gone; the race is run entirely from Pitwall Live.

- **Speeds**: Pause · 1x · 2x · 3x · **5x**.
- **Tyre selection** per car — soft / medium / hard, queued for the next
  stop; the Box button names the compound it will fit.
- **Team radio**, per car, wired to real engine commands:
  - **Push** — attack mode; quicker laps, heavier tyre wear.
  - **Box** — pit this lap for the selected compound.
  - **Boost** — deploy the override (ERS/DRS burst); drains the energy store.
  - **Retire** — end that car's session, with a confirmation.

Each call is a `RaceCommand` sent straight to the running engine, so the
effect appears on the map and in the timing tower immediately.

**Off race day the screen is deliberately empty.** It shows where the
player actually is in the weekend — Hub → Qualifying → Race Day — with the
current step marked, and a button back to the season screen. There is no
engine running behind it, so the empty state is honest rather than
decorative.

The session is owned by `CareerRaceProvider`, mounted *above* the view
router: the player can move to R&D or the Driver Market mid-race and come
back without tearing the race down. On race day the app navigates to
Pitwall automatically, the sidebar entry gains a live pulse, and the season
screen becomes a signpost pointing at the pit wall rather than a second
cockpit.

## Where actions are legal

The state machine still refuses out-of-phase events, but the action table
now follows menu reachability: any screen you can open from the sidebar
can dispatch its own actions. `MANAGEMENT_ACTIONS` (R&D, transfers,
facilities, strategy, settings) are legal in `PRE_SEASON`, `HUB`,
`QUALIFYING` and `POST_RACE` — the phases where the dashboard shell is on
screen — and `npm run game:check` asserts that rule so it cannot regress.
The calendar remains editable only in `PRE_SEASON`.

---

## Squads and the entry list

A team's drivers and a team's cars are two different lists.

`driverTeams` is squad membership — a team may hold up to four drivers.
`lineups` is the running order within a squad, and the first two names in
it are the cars that take the grid. Everybody after them is a reserve:
under contract, paid out of the same wage bill, and not entered on Sunday.

That separation is what makes promotion mean promotion. Signing a junior
adds him to the squad — he takes a race seat if one is free and goes on
the bench if not, and nobody is released unless you name somebody to
release. Promoting a reserve moves him into the car and drops the second
race driver to the bench, still under contract and available again next
weekend.

Qualifying and the race are run from the entry list (`gridDriverIds`), so
a reserve never takes a grid slot off anybody and no team ever enters
more than two cars. Championship rows are built from whoever actually
raced, so points a reserve scored during a call-up stay on the
leaderboard afterwards. `src/game/roster.ts` owns all of it.

## Signing drivers

A move has parties and prices rather than a single number to accept.

Approach a driver and he names his terms; his team names a fee. An offer
that satisfies neither comes back as a counter, and three refusals end
the conversation. How keen he is on the move is worth real money — up to
20% either side of his asking salary — and it moves with the car on
offer, whether there is a race seat at the end of it, his morale, how
long is left on his deal and your own standing as a manager.

Contracts are live: a salary, a term and a release clause, wound down a
year at a time. Drivers can be renewed, released and offered out, and
rivals bid for yours between rounds — readily once you have made somebody
available, and unprompted when they are having a strong season. Teams
that have stopped counting on a driver shop him to you the same way.
`src/game/contracts.ts` owns the negotiation; `src/game/paddockFeed.ts`
turns the outcome into mail and posts.

Everything is deterministic on (season, round, driverId), so reloading
cannot fish for a better answer out of the same conversation.

## The pit wall owns the compound

Two rules pull in opposite directions and the engine keeps them apart.

A plan nobody has looked at since Saturday is reconciled with the track:
nobody starts a downpour on slicks because a dry race was written down,
and a car that stays on wets after the track dries has thrown the race
away. But a compound the pit wall calls for during the race is a
decision, and it is fitted exactly as asked — including inters in
standing water or full wets on a drying track, which is a real strategic
gamble. `compoundToFit` in `src/game/weather.ts` is the seam.

The queue lives on `CarState.nextCompound`, where the radio panel reads
it, rather than in a copy the panel keeps for itself; the AI's compound
rotation never touches a car the pit wall runs. And a team has one crew
and one box, so two cars called in together are stacked — the second
waits for the first rather than both being served at once.

## Grid bookkeeping (the pole-sitter bug)

A standing start lines cars 2..N up *behind* the start/finish line, at lap
progress ≈0.99 while the pole-sitter sits at 0.00. Race order is
`lap + lapProgress`, so the moment the simulation ticked, every trailing
car ranked a full lap ahead and **the pole-sitter dropped to last** — then
banked a phantom lap on its first crossing.

Each car now carries a `gridOffset` of `-1` until it crosses the line for
the first time. Race distance is `lap + lapProgress + gridOffset`, and that
first crossing settles the debt instead of crediting a lap. `sim:check`
asserts the pole-sitter never falls below P5 across the opening laps, that
no car banks a lap it did not run, and that the field never spreads by more
than one lap.
