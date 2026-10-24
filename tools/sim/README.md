# Balance simulation

Monte Carlo fights for the exemplar adventure, `sunken_archive` on `lantern_coast`, as the
specification's phase 11 asks: seeded, replayable, and outside the specification repository.

```bash
pnpm sim [--runs N] [--seed S] [--out FILE]
```

The command writes [REPORT.md](REPORT.md). The default is 50 fights per row, from seed 1, which
takes about three minutes.

## Method

| Part | What it does |
|---|---|
| [encounters.ts](encounters.ts) | The exemplar's fights, by creature template, and whether every route passes them |
| [arena.ts](arena.ts) | One small adventure per encounter on `lantern_coast`: an open 16 × 5 field with the party on its gear at the west edge and the creatures at the east. Statistic overrides copy the templates into the arena's own entities |
| [run.ts](run.ts) | One fight. Each character takes its gear, dons its armor, and attacks the first active foe with its weapon. On a tough choice it loses AP while it has some, and otherwise takes the strain |
| [cli.ts](cli.ts) | The sweeps and the report |

Every action goes through the engine on a harness session. A fight is therefore reproduced by its
encounter, configuration, and seed, and its log replays; [sim.test.ts](sim.test.ts) checks both.
Characters are Cadmium fighters (10 HP, 10 AP) with `armor` and `stash`. The sweeps cover party
sizes 1, 2, and 4, four loadouts, `armor.max` from 3 to 8, and the octopus's hit points.

A fight counts as won when every foe is down and a character stands. Rows for creatures with the
same Quest statistics (minions with damage 2: pirates, drowned, wharf-hands, boars) are identical,
because a seed then produces the same rolls.

The policy is simple: no abilities, no retreat, no healing, no use of cover. Real parties should do
better than these numbers.

## Findings

| Question | Finding |
|---|---|
| `armor.max` (Cadmium `tune`) | The largest loadout gives 5 points (jerkin and shield). At 4 or 3 the pool wastes points and outcomes worsen; at 6 and 8 they are identical. |
| `armor.bypass_types` (Cadmium `tune`) | Quest's attacks carry no damage type, so the list never applies to combat. It affects only typed effect damage, such as `fevered` (poison) in the Salinara marsh. |
| One character | The octopus, on every route, wins 30% unarmored and 48% in full armor. The gallery ambush, also on every route, wins 68% and 84%. Passing both, a solo character reaches an ending about one time in five unarmored and two in five in full armor. |
| Two characters | Every required fight is won at least 98% of the time, even unarmored. |
| Four characters | Every fight is won; the party barely loses hit points. |
| The rivals at the mooring (`rival_lead` 5) | The deadliest fight: two unarmored characters win 52% and 14% die. It punishes the rumor path's head start, as the draft intends. |
| Octopus hit points | At 6 HP, one character wins 66% unarmored and 80% in full armor; at 8 HP, 48% and 66%. Two characters win every time at 6 and 8 HP, and 98% at 10. |

## Proposed values

| Value | Proposal | Where |
|---|---|---|
| `armor.max` | Keep 6: one point above the largest loadout, room for a creature's dropped shield, and no gain above it | `systems/cadmium/modules.json` ([SPEC_ISSUES.md](../../SPEC_ISSUES.md#armor-tuning)) |
| `armor.bypass_types` | Keep `[]`, and state that it applies only to typed effect damage | `systems/cadmium/modules.json` |
| The great octopus | `hp: 6` in `sunken_archive`'s own copy of the template, if one character should usually finish; otherwise the adventure's minimum players becomes 2 | The author's choice; not applied |
| Weapons and shop prices | No change: the boarding axe (damage 3) helps one character most, and two characters win without it | The draft, section 14.7 |

The draft says the designers set target ranges before the runs. These proposals wait for those
targets; the packs keep the draft's values.
