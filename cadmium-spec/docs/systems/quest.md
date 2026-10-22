# Quest

| | |
|---|---|
| System id | `quest` |
| Version | 1.2.0 |
| Modules | None |
| Data and schemas | `systems/quest/` |
| Implementation | `lib/systems/quest` in the web application |
| Source | Quest by The Adventure Guild — https://www.adventure.game/rules/ |
| License | Quest Creators Resource, CC BY 4.0 (see `quest/NOTICE`). Full ability and treasure text is outside the Creators Resource and is not included; settings supply abilities as materials. |

## Summary

Quest resolves every roll with one unmodified d20. Characters have no attributes or skills. They differ by role and by abilities, which cost Adventure Points (AP). AP has no maximum and does not recharge; characters earn more during play. Every character has 10 HP. At 0 HP a character is at death's door, and further harm can kill them.

## Character sheet

Schema: `character.schema.json`.

| Field | Meaning |
|---|---|
| `role` | One of `fighter`, `invoker`, `ranger`, `naturalist`, `doctor`, `spy`, `magician`, `wizard`. |
| `hp` | `{ value, max }`; `max` is 10. |
| `ap` | Integer, starting at 10. No maximum. |
| `abilities` | Ability refs from the instance's setting packs. |
| `inventory` | Up to 12 items. |
| `status` | `active`, `deaths_door`, or `dead`. |
| `profile` | Free-text answers to character questions. |

## Character creation

Choices:

```json
{ "role": "spy", "abilities": ["crypt:a1", "crypt:a2", "crypt:a3", "crypt:a4", "crypt:a5", "crypt:a6"],
  "items": [], "profile": { "look": "…" } }
```

The player chooses exactly `starting_abilities` (6) distinct abilities. The engine verifies, when the character joins an instance, that each ref exists in the instance's materials. `system_stats.roles` is informational for authors and pickers; the engine does not enforce it.

## Outcome tiers

| d20 | Tier | Quest name |
|---|---|---|
| 20 | `critical_success` | Triumph |
| 11–19 | `success` | Success |
| 6–10 | `partial` | Tough choice |
| 2–5 | `failure` | Failure |
| 1 | `critical_failure` | Catastrophe |

The roll is never modified. `situation` is ignored.

## Checks

Check specification: `{ "tags": [...] }` (tags are recorded, not used).

- `partial`: the action succeeds, and the character must choose one of two setbacks drawn from `setbacks.tough_choice`. The engine offers them as a pending choice.
- `failure`: the action fails, and one setback from `setbacks.failure` is applied.
- `critical_failure`: the action fails, and one setback from `setbacks.severe` is applied.

Creatures' checks return the tier without setbacks.

## Attacks

| Tier | Damage dealt |
|---|---|
| `critical_success` | Double |
| `success` | Standard |
| `partial` | Standard, plus the attacker's tough choice |
| `failure` | None, plus a setback for the attacker |
| `critical_failure` | None, plus a severe setback for the attacker |

Standard damage is the weapon's `damage` (default 2), 1 unarmed, or a creature's `damage`. Creatures roll for their own attacks and receive no setbacks.

## Harm, death, and healing

- Harm reduces HP, minimum 0.
- A character reaching 0 HP gains status `deaths_door`.
- Harm to a character at death's door rolls a d20. A result at or below the harm dealt kills the character.
- A creature reaching 0 HP dies.
- Healing restores HP up to the maximum and returns a character at death's door to `active`.

## Resting

| Kind | Effect |
|---|---|
| `short` | Regain half of maximum HP. |
| `long` | Regain all HP. AP is unchanged. |

## Abilities

Ability `system_stats` (schema `ability.schema.json`):

```yaml
system_stats: { roles: [invoker], path: light, cost: { ap: 2 }, roll: true }
```

`pay_cost` deducts AP and fails with `requirement_unmet` when AP is insufficient. When `roll` is true, the engine calls `check` and applies the ability's effects on a passing tier.

## Creatures and items

Creature `system_stats`:

| Field | Meaning |
|---|---|
| `template` | `commoner`, `minion`, or `boss`. Sets default HP from `npc_templates`. |
| `hp` | Optional override. |
| `damage` | Damage per hit. Default 2. |
| `speed` | Optional cells per combat turn. Default `spatial.speed`. |
| `ranged` | Optional. True: attacks any visible target. |

Item `system_stats`: `{ weapon: bool, damage: int, ranged: bool }`. A weapon with `ranged: true` reaches any visible target. `use_item` returns null for every item: Quest items have no rules effect when used. `can_carry` holds while an inventory has at most 12 items.

Structure `system_stats` (schema `structure.schema.json`), for destructible obstacles and doors: `{ hp: int }`. Harm reduces HP; at 0 HP the structure's status becomes `destroyed`. Structures cannot be healed.

## Movement, reach, and vision

Quest is played without a grid. This implementation supplies spatial values from `spatial` in `data.json`:

| Value | Default | Meaning |
|---|---|---|
| `metric` | `chebyshev` | Diagonal steps count as one cell. |
| `speed` | 6 | Cells per combat turn for characters and creatures without `speed`. |
| `melee_reach` | 1 | Unarmed attacks, non-ranged weapons, and creatures without `ranged` reach adjacent targets. |
| `ranged_range` | null | Ranged weapons and creatures reach any visible target. |
| `approach` | true | An attack or interaction on an out-of-reach target moves the actor toward it first. |
| `lighting` | false | Darkness does not limit what characters perceive. Quest has no vision rules; illumination still reaches narration, triggers, and views. |
| `darkvision` | 0 | Returned by `senses` for every combatant. |

`reach` returns the tag `melee` or `ranged`. Quest ignores the situation, so `cover` and the tags have no rules effect.

## Ordering

| Mode | Resolution | Order |
|---|---|---|
| Exploration | `simultaneous` | `tool_priority` |
| Combat | `simultaneous` | `side`: characters first |

Quest has no initiative. Simultaneous rounds with characters first preserve its freeform turn-taking without a Guide.

## Automation adaptations

The Quest Guide makes several decisions that the engine makes from data:

| Guide decision | Automated as |
|---|---|
| Which two setbacks a tough choice offers | Two distinct entries drawn by RNG from `setbacks.tough_choice`, excluding those that do not apply |
| The setback for a failure | One entry drawn by RNG from `setbacks.failure` |
| AP awarded during play | `session_end` adds `ap_award_per_session` when a scheduled session occurrence ends |
| The severe setback on a catastrophe | One entry drawn by RNG from `setbacks.severe` |
| How enemies act | Entity behavior; see [engine.md](../engine.md#entity-turns) |
| How far a character can move or reach | The `spatial` values above |
| When to roll at all | Only tools that call `check` or `attack` roll |

## Values to confirm

Confirmed from the Quest rules page and Creators Resource: tiers, 10 HP, rest recovery, death's door, 10 starting AP with no recharge, 6 starting abilities, 12 inventory slots, the eight roles, weapon damage 2 and unarmed 1.

Still to confirm in `data.json`: `ap_award_per_session` (a secondary source gives 5), `npc_templates` (a secondary source gives Commoner 2, Minion 4, Boss 10 HP), the `setbacks` lists, which are written for this implementation and are not Quest text, and the `spatial` values, which Quest does not define.
