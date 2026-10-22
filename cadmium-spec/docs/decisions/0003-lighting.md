# ADR-0003: Lighting

**Status:** Accepted
**Date:** 2026-10-22
**Deciders:** Project team

## Context

Dungeon settings depend on darkness: torches, lit halls, creatures that see without light. Rulesets differ. Some limit sight by light and grant darkvision; others, such as Quest, have no vision rules and leave darkness to description. Grid maps ([ADR-0002](0002-grid-maps.md)) give the engine the geometry to compute light, but not the authority to decide what darkness does in a given ruleset.

## Decision

The engine computes illumination for every cell (`bright`, `dim`, `dark`) from room ambient light and light sources, using the same metric and line of sight as the rest of the map. Materials declare ambient light per room and light sources on entities.

The rules system decides the consequence:

- `SPATIAL.lighting` states whether illumination limits perception.
- `senses(combatant)` returns darkvision distance.
- Situation tags `dim` and `dark` reach every roll; systems interpret or ignore them.

Illumination is always reported in views, parser context, narrator context, requirements, and events, whatever the system's setting.

## Options Considered

| Option | Assessment |
|---|---|
| No lighting | Simplest; darkness exists only in prose, and triggers and narration cannot depend on it. |
| Lighting with fixed engine rules for sight | Consistent, but imposes vision rules on rulesets that have none. |
| Engine computes, system decides (chosen) | Every system gets the data; only systems with vision rules change perception. |

## Consequences

- Adventures can write triggers and narration that depend on light for any system.
- Quest ships with `lighting: false`; turning it on is a rules-system release.
- Illumination is recomputed after every action and is not stored.
- Clients draw dim and dark cells from the view's `map.light`.
