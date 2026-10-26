# ADR-0001: Pluggable Rules Systems

**Status:** Accepted; amended 2026-10-20; spatial model superseded by [ADR-0002](0002-grid-maps.md)
**Date:** 2026-10-20
**Deciders:** Project team

## Context

The engine contained one fixed rules core: three stats, d20 roll-under checks, attacks that always hit, and a choice of two death rules. Settings could rename stats and tune parameters but not change how play works.

Campaigns need to run established rulesets whose mechanics differ at the root:

| Ruleset | Roll | Health | Ordering |
|---|---|---|---|
| OSRIC | d20 against class and level tables | Hit points to −10 | Side initiative |
| Flexpiel | d6 pool counting successes | Three wound slots | Player-facing, no initiative |
| Quest | Unmodified d20 with five outcome tiers | 10 HP and death's door | No initiative |

No parameter set over the fixed core can express all three. The domain model also needs to change: a campaign is the unit of play and binds a ruleset, players, characters, materials, and state; a user owns characters and takes part in or authors campaigns.

## Decision

Split rules into swappable system modules behind a fixed contract (see [systems/README.md](../systems/README.md)). The engine keeps everything ruleset-independent: rooms, zones, conditions, rounds, ordering mechanics, requirements, effects, triggers, events, and random numbers. Each system supplies schemas for its sheets and statistics, character creation, checks, attacks, harm, healing, rests, end-of-round changes, initiative, costs, and carrying capacity, plus its ordering policy.

A campaign binds one system and version at creation. Characters, setting packs, and adventure packs declare the system they are written for. Material statistics live in a `system_stats` field validated against the bound system's schemas at compile time.

Replace groups and sessions with campaigns. A campaign has a system, players, player characters, materials, and state.

## Options Considered

### Option A: Parameterized single core

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Coverage | Cannot express pools, wound slots, outcome tiers, or table lookups |
| Testing | One rules core to test |

**Pros:** Smallest code base. Materials stay portable across settings.
**Cons:** Does not meet the requirement. Each new ruleset adds parameters until the core becomes a rules language.

### Option B: Scriptable rules in materials

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Coverage | Any ruleset |
| Testing | Every material pack is untested code |

**Pros:** Authors add rulesets without engine releases.
**Cons:** Arbitrary logic in content breaks static validation, determinism guarantees, and the trust boundary that keeps models and content away from rules.

### Option C: System modules behind a contract (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Coverage | Any ruleset that fits rounds, zones, and the resolution shape |
| Testing | Each system tested once; contract tests across all systems |

**Pros:** Each ruleset is implemented faithfully, in code, with tests. The engine stays small. Determinism holds because systems are pure and draw only from the engine's `Rng`.
**Cons:** Adding a ruleset requires a code release. Materials are not portable across systems.

## Trade-off Analysis

Option C trades portability of materials for fidelity to each ruleset. Portability across systems is of limited value because stat blocks, abilities, and balance differ by ruleset even when themes match. Keeping rules in code, not content, preserves the properties the architecture depends on: static validation, replay, and a narrow model role.

## Consequences

- Campaigns, characters, and materials carry a system binding; mismatches are rejected at join and publish time.
- Material compilation requires the rules system package to validate `system_stats` and check specifications.
- Rules that need a player decision mid-resolution use pending choices and the `choose` tool.
- Referee judgments in rulings-first games such as Quest become data: tags, condition situations, and setback tables. Each system document lists its adaptations.
- Rule numbers not verified against source texts are listed in each system's `confirm` array and must be checked before publication.

## Amendment: Quest only

The first release implements Quest only. OSRIC and Flexpiel are deferred because their source data or licensing is incomplete; findings are recorded in [systems/README.md](../systems/README.md#candidate-systems). The contract, the system binding on characters, campaigns, instances, and materials, and the per-system schemas are retained unchanged, so deferred or new systems are added through the extension points listed in [Adding a system](../systems/README.md#adding-a-system).

## Action Items

1. [x] Contract, Quest implementation, and contract tests.
2. [x] Setting pack schemas and compiler bind to a system and validate `system_stats`.
3. [x] Data model and API separate campaigns from instances and bind both to a system.
4. [ ] Confirm the Quest values listed in `confirm`.
5. [x] Write adventure pack schemas (`spec/schema/`).
6. [ ] Write the Content Compiler (`lib/materials`), shared by setting packs, the adventure editor, and publishing.
7. [ ] Add further systems when their data and licenses are complete.
