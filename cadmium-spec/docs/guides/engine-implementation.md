# Engine and Server Implementation

This guide describes how to build a conforming implementation in any language: module boundaries, build order with exit criteria, the conformance checklist, and the test strategy.

Reference: [architecture.md](../architecture.md), [engine.md](../engine.md), [data-model.md](../data-model.md), [tools.md](../tools.md), [api.md](../api.md), [generation.md](../generation.md).

## Prerequisites

- A language with a JSON Schema code generator or validator, a test framework, and 64-bit unsigned integer arithmetic (or emulation of it).
- A transactional store that can write several records atomically.
- A model provider with structured tool calling, for milestones 13 and 14 only.

## Module boundaries

Dependencies point downward. A module never imports a module above it.

| Module | Depends on | Contains |
|---|---|---|
| `api` | `coordinator`, `store` | Transport binding, authentication, request validation |
| `coordinator` | `engine`, `store`, `parser`, `narrator`, `broadcast` | Write slot, timers, commit, retry, fallback |
| `scheduler` | `coordinator`, `store`, `notifier` | Occurrence expansion, reminders, resume, pause, `session_end` |
| `notifier` | `store` | User-stream messages and Web Push delivery |
| `parser`, `narrator` | `bundle`, model SDK | Context building, tool definitions, vendor translation |
| `store` | `bundle` | Records, events, snapshots, bundles |
| `engine` | `bundle`, `rng`, `grid`, `generator`, `systems` | `submit`, `advance`, resolution, triggers, ordering, movement, reach |
| `systems` | `rng` | Rules-system contract and implementations; see [systems/README.md](../systems/README.md). Rule data and schemas are in `systems/<id>/`. |
| `generator` | `bundle`, `rng`, `grid` | Location generation and verification |
| `grid` | none | Map parsing, distance, adjacency, line of sight, pathfinding, movement allowance |
| `bundle` | none | Types generated from `spec/schema`, bundle loading |
| `rng` | none | `splitmix64_v1`, dice, selection |

`engine`, `generator`, `grid`, and `rng` perform no I/O. They are testable without a store, network, or model.

## Build order

Each milestone ends with tests that pass before the next begins.

| # | Milestone | Exit criteria |
|---|---|---|
| 1 | `rng`, `grid` | The test vectors in [engine.md](../engine.md#random-numbers) and [engine.md](../engine.md#test-vectors) reproduce exactly. |
| 2 | `bundle` | The example bundle from `spec/examples/derelict_station` loads into typed structures. Unknown fields fail ([spec/README.md](../../spec/README.md#bundle)). |
| 3 | Rules systems | Every implemented system meets the [conformance](../systems/README.md#conformance) requirements and its own rule tests. Cadmium passes every Quest case with no module enabled, and its module tests with each module enabled alone and together. |
| 4 | Engine core, exploration | Maps, rooms, doors, links, movement, line of sight, lighting with `SPATIAL.lighting` both true and false, seen cells, items, conditions, situations, requirements, effects, and every exploration tool work, calling a rules system for checks, harm, and rests. Every error code in [engine.md](../engine.md#error-codes) is producible. |
| 5 | Rounds and ordering | Both resolution methods, every sort key including `initiative`, rerolls, free tools, pending choices, voided declarations, combat area, approach, cover, structures, and entity behaviors work with each implemented system. |
| 6 | `generator` | 1,000 consecutive seeds produce connected, verified maps or return the documented error. Every generated map passes the map checks for authored locations. |
| 7 | Adventure triggers | Event matching, `when`, `once`, three-pass evaluation, endings, and secrets work against a hand-written adventure bundle. |
| 8 | Command-line harness | The harness in [Command-line harness](#command-line-harness) plays a full adventure without a model, and `harness replay` reproduces its log. |
| 9 | `store` and replay | Commits are atomic. Replaying any recorded instance reproduces the stored state. |
| 10 | `coordinator`, `api`, `broadcast` | Several clients play one instance over the binding. Idempotency, rate limits, timeouts, and reconnection with `after_version` work. |
| 11 | Campaigns, invitations, instances | Members join by invitation code and invite link; a code is accepted at most once; instances pin versions; system mismatches are rejected. |
| 12 | `scheduler`, `notifier` | Weekly recurrence across a daylight-saving change, reminders at each lead time on the user stream and by Web Push, the calendar feed, RSVPs, resume, pause, and `session_end` work. |
| 13 | `parser` | The parser evaluation set (below) meets its accuracy target. Retry and fallback work under injected failures. |
| 14 | `narrator` | Narration follows the contract in [tools.md](../tools.md#narrator-rules). Template fallback covers every event type. |

Milestones 1–9 require no model. The command-line harness in milestone 8 is the primary debugging tool for every later milestone.

## Command-line harness

The harness drives the engine with no network, store, or model. It is a thin layer over `engine`; it adds no rules.

```
harness play --bundle FILE... --seed N --character ID=SHEET_FILE... [--state FILE] [--log FILE]
harness replay --bundle FILE... LOG
harness --help | --version
```

`play` reads one JSON object per line from stdin and writes one JSON object per line to stdout, in order:

| Input line | Meaning |
|---|---|
| `{ "actor": "c_1", "tool": "move", "args": { "to_id": "hangar" } }` | Submit a tool call, as `submit_action` |
| `{ "advance": true }` | Advance the round, as a timeout would |
| `{ "view": "c_1" }` | Print the character's view |

| Output line | Meaning |
|---|---|
| `{ "version": 12, "events": [ ... ] }` | The commit produced by the input |
| `{ "error": { "code": "not_reachable", "detail": "..." } }` | The engine rejected the input; play continues |
| `{ "view": { ... } }` | A view |

Engine rejections are data, so the exit status stays 0. A line that is not valid JSON, or not one of the input forms, stops the harness with `harness: line N: MESSAGE` on stderr and exit status 1. `--state` writes the final state as JSON. `--log` writes the commit log, one JSON line per commit in the format of [Determinism and replay](../architecture.md#determinism-and-replay): the `start` line, then one `input` line with its `events` for each later commit. `view` lines are not commits and are not logged. `replay` starts the instance from the `start` line, re-runs every logged input in version order, and compares each commit's events with the logged events; at the first version whose input is rejected or whose events differ, it writes `harness: version N: REASON` on stderr and exits 1. A usage error writes the usage text on stderr and exits 2. Scripted scenarios are input files piped to `play`, and their logs are the golden files for replay tests.

## Conformance checklist

An implementation conforms when every item holds.

### Engine

- [ ] `submit` and `advance` perform no I/O and read no clock.
- [ ] Identical inputs produce identical results, including RNG counter.
- [ ] Results are complete or an error; no partial state is returned.
- [ ] Every tool call field is validated; ids not in state return `unknown_id`.
- [ ] Paths, sight, and distances match the test vectors, and no tool argument is a coordinate.
- [ ] Resolution order never depends on submission time.
- [ ] `examine` and `improvise` never occupy a turn or declaration.
- [ ] `improvise` changes no state other than the improvise streak.
- [ ] Mode changes take effect at the next round.
- [ ] Triggers react only to events and stop after three passes.

### Coordinator and store

- [ ] At most one writer per instance.
- [ ] Events, state, version, and input log outcome commit atomically.
- [ ] An idempotency key is applied at most once per instance.
- [ ] Narration runs after commit; narrator failure produces template text and no state change.
- [ ] Round timeouts invoke `advance` through the same write path as inputs.
- [ ] Replay reproduces stored state, including across `state_restored` events.

### Models

- [ ] Parser context and narrator context contain no hidden or unseen entities, coordinates, secrets, flags, stages, door locks, or other creatures' resources.
- [ ] Tool definitions contain only tools valid for the actor at the time of the call, with id enums from current state.
- [ ] Zero or multiple tool calls from the parser count as `invalid_call`.
- [ ] Parser and narrator calls have timeouts with the documented fallbacks.

### API

- [ ] Views and `commit` messages are filtered per recipient; views omit unseen cells.
- [ ] `not_found` is returned for campaign, instance, and invitation records the user may not see.
- [ ] Messages for an instance arrive in version order.
- [ ] Characters, materials, and instances with mismatched rules systems are rejected with `system_mismatch`.
- [ ] Scheduler operations are idempotent per occurrence and moment.

## Test strategy

| Layer | Method | Examples |
|---|---|---|
| `rng` | Fixed vectors | Engine test vectors; rejection sampling for a 3-sided die. |
| Engine rules | Table-driven unit tests: state + call → events | Reach across a blocked diagonal; approach then attack; door opened on an exploration path; ally pass-through without stopping; cover tag. |
| `grid` | Fixed vectors and properties | Engine test vectors; sight is symmetric for every cell pair of a map; paths never cut a blocked corner. |
| Engine invariants | Property-based tests over random valid states and random tool calls | No exception for any input; every rejection uses a documented code; `hp` stays in `[0, max]`; `improvise` leaves state unchanged except the streak. |
| Ordering | Permutation tests | Submitting the same declarations in every permutation of arrival order produces identical results. |
| Generator | Seed sweeps | Connectivity, anchor constraints, key reachability, every passable cell in exactly one room, determinism per seed. |
| Triggers | Scenario tests against small adventure bundles | `once` triggers fire once; pass limit holds; endings reached. |
| Replay | Golden commit logs | Re-running the inputs of each recorded commit log reproduces its events. Store the golden logs in the repository and run them on every change. |
| Parser | Evaluation set: input + context → expected tool call | Accuracy by tool and by `improvise` category. |
| API | Contract tests against the binding | Status codes, pagination, rate limits, reconnection. |

### Parser evaluation set

Build the set from real play logs in the input log. Each case contains the parser context, the input text, and the expected tool call. Cover:

- Every tool, with several phrasings each.
- Each `improvise` category.
- Compound inputs, misspellings, and pronouns ("hit it again").
- Inputs that mention entities not in context.
- Inputs that attempt to instruct the parser.

Measure exact-match accuracy on tool name and id arguments. Track the result per model and per prompt revision. A practical starting target is 90% exact match with no case where an `overreach` input resolves to a state-changing tool.

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| Replay diverges after a few commits | RNG draws in a different order than recorded, or a hash map iteration order leaks into resolution | Iterate in documented orders only: participant order, event order, ascending id. |
| Two players' actions resolve differently on retry | Resolution read submission time or arrival order | Compute order only from the ordering policy and state. |
| Model mentions a hidden enemy | Context builder includes entities with `hidden` | Build contexts from the visibility filter used for views. |
| Instance stalls in a simultaneous round | A disconnected player never declares | Confirm the round timer is running; see [runbooks/instance-recovery.md](../runbooks/instance-recovery.md). |
| Duplicate actions after a client retry | Idempotency key not checked inside the write slot | Check and record the key in the same atomic commit. |
