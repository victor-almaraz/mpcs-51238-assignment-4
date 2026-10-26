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

| Choice | Rule |
|---|---|
| `role` | One of the roles in `roles`. |
| `abilities` | Exactly `starting_abilities` (6) distinct ability refs. |
| `items` | Optional list of at most `inventory_max` (12) item refs, default empty. Each becomes an `inventory` entry `{ ref }`. |
| `profile` | Optional answers to character questions, each a string of at most 200 characters. |

The character starts with `hp` at `hp_max` (10), `ap` at `ap_start` (10), and status `active`. The engine verifies, when the character joins an instance, that each ability and item ref exists in the instance's materials, and creates each listed item as an item the character carries; each setting's `starting_items` are drawn in addition. `system_stats.roles` is informational for authors and pickers; the engine does not enforce it.

### Starting abilities

Quest's abilities are setting material: every ability a character takes comes from a setting pack's `abilities`, so creating a character requires settings that together supply at least `starting_abilities` abilities, and the character joins only instances whose settings include each of its abilities. A setting intended for character creation SHOULD supply, for each role, exactly `starting_abilities` abilities whose `system_stats.roles` names that role alone. The example setting `lantern_coast` supplies six such abilities for each of the eight roles.

A role's *quick start* is the set of abilities that one setting tags for that role alone, taken from the first setting, in the order the settings are offered, that has exactly `starting_abilities` of them. A role has no quick start when no setting has exactly that many. The system's `CreationForm` offers each role's quick start as a single choice of all its abilities.

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

Check specification: `{ "tags": [...] }`, with `tags` optional (tags are recorded, not used). The empty specification `{}` is valid.

- `partial`: the action succeeds, and the character chooses one of up to two setbacks drawn from `setbacks.tough_choice`. The engine offers them as a pending choice.
- `failure`: the action fails, and one setback from `setbacks.failure` is applied.
- `critical_failure`: the action fails, and one setback from `setbacks.severe` is applied.

`check` emits `check_rolled` with `target` (the actor), `outcome` (the tier), and `roll` (the d20 result). Creatures' checks return the tier without setbacks.

### Setbacks

Each setback entry in `data.json` has an `id`, a `label`, and one consequence field:

| Field | Consequence | Applies when |
|---|---|---|
| `harm_actor` | A `damage` effect of that amount on the actor | Always |
| `lose_ap` | The actor's AP falls by that amount, minimum 0, as a sheet update with `resource_changed` | The actor has at least 1 AP |
| `drop_item` | A `drop_item` effect for the item in use | An item is in use: the weapon of an attack. A check has no item in use. |

A tough choice draws from the entries of `setbacks.tough_choice` that apply, in list order: each draw is a selection by RNG among the entries not yet drawn, until two are drawn or none remain. The options are offered in draw order. A failure or severe setback is one selection by RNG from the whole list; an entry that does not apply has no effect. Only characters receive setbacks.

The engine applies a setback's effects after the resolution's sheet updates. A `lose_ap` option's sheet update is computed from the actor's sheet when the choice is offered.

## Attacks

| Tier | Damage dealt |
|---|---|
| `critical_success` | Double |
| `success` | Standard |
| `partial` | Standard, plus the attacker's tough choice; half, rounded up, for a creature |
| `failure` | None, plus a setback for the attacker |
| `critical_failure` | None, plus a severe setback for the attacker |

Standard damage is the weapon's `damage` (default `damage.weapon`, 2), `damage.unarmed` (1) unarmed, or a creature's `damage`. Creatures roll for their own attacks and receive no setbacks; a creature's `partial` attack deals half its damage, rounded up, so damage 1 still lands for 1.

`attack` emits `attacked` with `actor`, `target`, `roll` (the d20 result), `outcome` (the tier), and `damage`, the damage dealt after the tier, before the target's sheet changes it. The harm to the target follows.

## Harm, death, and healing

- Harm reduces HP, minimum 0, and emits `damaged` with `amount`, the harm dealt, and `remaining`, the HP after it. Harm of 0, and harm to a target that is dead or destroyed, changes nothing and emits nothing.
- A character reaching 0 HP gains status `deaths_door`.
- Harm to a character at death's door emits `damaged` with `remaining: 0` and rolls a d20. A result at or below the harm dealt kills the character: its status becomes `dead`, and `died` follows.
- A creature reaching 0 HP dies, with `died`.
- Healing restores HP up to the maximum, returns a character at death's door to `active`, and emits `healed` with `amount`, the HP restored.

## Resting

| Kind | Effect |
|---|---|
| `short` (regroup) | Regain HP up to half the maximum, rounded down: a character below 5 of 10 HP rises to 5, and a character at or above it regains nothing. |
| `long` | Regain all HP. AP is unchanged. |

Both rests return a character at death's door to `active`, even when no HP is restored, and emit `healed`. A dead character regains nothing.

## Abilities

Ability `system_stats` (schema `ability.schema.json`):

```yaml
system_stats: { roles: [invoker], path: light, cost: { ap: 2 }, roll: true }
```

`pay_cost` deducts AP and fails with `requirement_unmet` when AP is insufficient. When `roll` is true, the engine calls `check` with the empty specification `{}` and applies the ability's effects on a passing tier; see [engine.md](../engine.md#action-resolution).

## Creatures and items

Creature `system_stats`:

| Field | Meaning |
|---|---|
| `template` | `commoner`, `minion`, or `boss`. Sets default HP from `npc_templates` and default damage from `npc_attack`. |
| `hp` | Optional override. |
| `damage` | Optional damage per hit. Default the template's attack rating in `npc_attack`: commoner 1, minion 2, boss 4. |
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
| Exploration | `simultaneous` | `tool_priority`, with `tools`: `move`, `talk`, `interact`, `take`, `give`, `drop`, `use`, `ability`, `attack`, `search`, `wait` |
| Combat | `simultaneous` | `side`: characters first |

`rest` is absent from the `tools` list, so a declared rest resolves after every listed tool. Neither policy rerolls.

Quest has no initiative. Simultaneous rounds with characters first preserve its freeform turn-taking without a Guide.

## Automation adaptations

The Quest Guide makes several decisions that the engine makes from data:

| Guide decision | Automated as |
|---|---|
| Which two setbacks a tough choice offers | Up to two distinct entries drawn by RNG from the entries of `setbacks.tough_choice` that apply; see [Setbacks](#setbacks) |
| The setback for a failure | One entry drawn by RNG from `setbacks.failure` |
| AP awarded during play | `session_end` adds `ap_award_per_session` when a scheduled session occurrence ends |
| The severe setback on a catastrophe | One entry drawn by RNG from `setbacks.severe` |
| How enemies act | Entity behavior; see [engine.md](../engine.md#entity-turns) |
| How far a character can move or reach | The `spatial` values above |
| When to roll at all | Only tools that call `check` or `attack` roll |

## Values to confirm

Confirmed from the Quest rules page and the Quest Creators Resource v1.01: tiers, 10 HP, rest recovery up to half the maximum (page 12), death's door, 10 starting AP with no recharge, `ap_award_per_session` of 5 (page 13), 6 starting abilities, 12 inventory slots, the eight roles, weapon damage 2 and unarmed 1, half damage for a creature's tough choice (page 19), and `npc_templates` and `npc_attack`: commoner 2 HP and attack 1, minion 4 HP and attack 2, boss 10 HP and attack 4 (page 42).

Still to confirm in `data.json`: the `setbacks` lists, which are written for this implementation and are not Quest text, and the `spatial` values, which Quest does not define: Quest measures distance in relative bands (in reach, nearby, in range, too far), not cells.
