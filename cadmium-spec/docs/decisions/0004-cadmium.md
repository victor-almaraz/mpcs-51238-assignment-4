# ADR-0004: Cadmium as a Quest Derivative

**Status:** Accepted
**Date:** 2026-10-23
**Deciders:** Project team

## Context

Quest is a published ruleset with no armor, no stacking inventory, and no storage rules. Adventures written for Cadmium need such mechanics, and groups want house rules. Changing Quest's implementation would make `quest` mean something other than the published ruleset.

## Decision

Add the system `cadmium`, the default system of the specification. Its implementation composes Quest's and delegates every contract function to it. Optional modules (`armor`, `stash`) extend functions only while a campaign enables them. With no module enabled, Cadmium returns Quest's results exactly. A Cadmium campaign accepts characters and packs written for Quest.

Modules are a contract feature available to every system: `MODULES` lists them, `configure(modules)` enables them, materials declare required modules in `system.modules`, and campaigns and instances record the enabled list.

Engine features that are not rules, such as storage in containers, character-scoped flags, and currency, belong to the engine for every system, not to a module.

## Options Considered

| Option | Assessment |
|---|---|
| Modify Quest in place | Rejected. `quest` would stop meaning the published ruleset, and existing Quest campaigns would change. |
| A parameterized core with rulesets as configuration (option A of ADR-0001) | Rejected for the reasons in ADR-0001. |
| A derived system composing Quest, with modules (chosen) | Quest stays strict; Cadmium adds mechanics per campaign; Quest content works unchanged. |

## Consequences

- The contract gains `MODULES`, `configure`, `use_item`, and `can_carry` over the resulting inventory, and `harm` receives the damage type.
- Cadmium's conformance tests include every Quest case, run with no module enabled.
- Quest-derived values keep CC BY 4.0 attribution; module data and schemas are CC0 1.0.
