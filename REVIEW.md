# Adversarial review / QA report

This is a hostile review of the whole game: code read-through plus automated headless stress tests. All test hooks are in `main.js` and only turn on through URL flags:
- `?auto&turbo&check&speed=8&seed=N&teams=T&worms=W`: seeded all-CPU match at high speed with the invariant watchdog running every simulation step. The watchdog checks for NaN worm or projectile state, runaway projectile counts, and softlocks (a state that doesn't advance within turn time + 40 s).
- `?auto&fuzz&turbo&check...`: every team is "human" and driven by a random input fuzzer. It sends real `keydown`/`keyup` events (walk, aim, jump, backflip, fuse 1-5, Space charge and release), picks random weapons including jet pack, teleport, girder, air strike and homing, and fires at random targets, including ones off-map and inside terrain.

**Results:** after the fixes, the stress harness (`/workspace/stress.py`) ran 18 seeded matches: 12 all-CPU matches (2–4 teams, 2–4 worms) and 6 fuzz matches. There was also a scripted real-keyboard human turn and several earlier all-CPU runs. **18/18 reached the win screen** with 0 JS errors, 0 watchdog issues and a stable JS heap of about 20–35 MB.

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | AI planner result was lost. The generator's return value was read on a later frame after the generator had already finished, so every CPU turn became "Skip Go" | Critical | Fixed (found in the first run) |
| 2 | Jet pack still active when the turn timer ran out. The worm hung in mid-air and the settle phase waited for the 14 s failsafe every time | High | Fixed (the turn end cancels the jet) |
| 3 | Jet pack could fly unbounded above the map or past its sides | Medium | Fixed (clamped) |
| 4 | Teleport accepted off-map targets (instant suicide or out-of-bounds worm) and targets whose foot point was inside terrain | Medium | Fixed (bounds and solidity checks) |
| 5 | Girder overlap check only tested 40 px around the centre, so the ends of a 130 px girder could bury a worm (it got stuck in the terrain) or a resting grenade | Medium | Fixed (rotated-rectangle test against worms and projectiles) |
| 6 | Turn cap at 400 turns declared the first surviving team the winner instead of the healthiest one, or a draw | Low | Fixed |
| 7 | Hidden or throttled tab: the music scheduler fell behind and then fired a burst of overlapping notes when the tab came back | Medium | Fixed (scheduler skips ahead) |
| 8 | Window blur while holding Space or arrow keys: keys got stuck and the charge carried over | Medium | Fixed (blur clears keys and the charge) |
| 9 | GPU leaks: projectile and air-strike plane materials, and worm label and face materials, were never disposed over long or repeated matches | Medium | Fixed (dispose on remove and on new game) |
| 10 | Death sequence could re-kill a worm that drowned while queued, and worms had no death telegraph | Low | Fixed (guard, plus a shocked 0.8 s wobble before the death blast and a gravestone drop) |
| 11 | Win screen showed stale HP bars, a stale turn banner and timer | Low | Fixed |
| 12 | Sky and HDR overflow made black blobs through the colour grade (found in the first visual pass) | High (visual) | Fixed |
| 13 | Simultaneous wipe-out of all teams | – | Verified by code path: shows **DRAW!** |
| 14 | Team killed during its own turn, or the active worm drowns or is hurt | – | Verified: the turn ends and the next live team is picked |
| 15 | Zero-length fuse | – | Not reachable: fuse is 1–5 s only |
| 16 | Pausing mid-explosion | – | Simulation, particles and AI all freeze, and it resumes cleanly |
| 17 | Particle pools use `Array.shift()` when full, which is O(n) under heavy spam | Low (perf) | Open |
| 18 | Sudden-death water caps at 60% of map height, so worms on very high ground can make a match long (the 400-turn cap still resolves it) | Low | Open |
| 19 | Audio, real-GPU frame rate and touch input can't be checked headlessly | – | Open (untested) |
