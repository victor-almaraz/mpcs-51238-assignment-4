# Specification Issues

Points where the specification in `cadmium-spec/` is silent, contradictory, or impossible to implement as written (`cadmium-spec/AGENTS.md`, "Rules for implementing agents"). Each entry has a marker in code naming its anchor. An entry is removed, with its markers, once a change to the specification resolves it.

## complete-doc-yaml-blocks

| Field | Value |
|---|---|
| Document | `AGENTS.md` |
| Section | Validation before finishing, item 3; Implementing the specification, Phases, phase 0 exit criterion |
| Marker | `tests/doc-blocks.ts` |

**Problem.** Every YAML block in `docs/` that is a complete pack file must validate against its schema, but nothing marks which blocks are complete files, or which file they are. Some blocks are fragments (the `map:` example in `setting-packs.md#maps`, the `requirement:` example in `setting-packs.md#checks-in-requirements`). One file is split across two blocks: in `setting-packs.md#tablesyaml`, the first block lacks the required `room_labels` table and the second block supplies it.

**Implemented.** A block is a complete pack file when the paragraph right before it names exactly one pack file in backticks, or, failing that, when its nearest level-2 heading is a pack file name. Consecutive blocks named by the same heading are joined into one document, except in `plot/`, `locations/`, and `npcs/`, which hold one record per file.

**Proposed resolution.** Mark complete pack files explicitly, for example with a fence info string such as ` ```yaml file=tables.yaml `, and keep each complete file in one block.
