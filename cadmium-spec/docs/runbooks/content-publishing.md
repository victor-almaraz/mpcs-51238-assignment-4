# Runbook: Content Publishing

## When to use

- Publishing a setting pack or adventure pack version.
- Withdrawing a version from listings.
- Releasing a fix to published content.

## Prerequisites

- An account with `operator: true`.
- The content directory at the version to publish.
- The Content Compiler (`lib/materials`), with the `materials` command line from [spec/README.md](../../spec/README.md#compiler-interface).
- For adventures: the compiled bundles of setting pack versions that satisfy `requires_settings`.
- The rules system the material binds to, installed in the deployment at a version within the material's range.

## Versioning

Bundles are immutable. Every change requires a new version. Choose the increment by the change:

| Increment | Setting pack changes | Adventure pack changes |
|---|---|---|
| Major | Removing or renaming any key; changing `namespace`; changing `system` or narrowing its range; changing `system_stats` in ways that alter balance; removing a damage type, terrain type, lock, or condition; changing `format_version` | Removing an ending; changing `system` or `requires_settings` to an incompatible range |
| Minor | Adding entities, tables, rooms, abilities, conditions, resources, damage types, terrain types, or locks | Adding arcs, triggers, locations, NPCs, topics, or endings |
| Patch | Balance changes to existing values; label and text changes; parser hints | Text changes; balance changes; trigger fixes that do not change stages or endings |

Adventures reference setting packs by range (`derelict_station` `^3.0`). A major setting version requires adventure updates before those adventures can use it. A major rules-system version requires new material versions bound to it.

## Publish

1. Validate:

   Run `materials check` on the pack directory. Exit status MUST be 0.

2. Confirm `version` in the manifest is higher than every published version of the same id, and that the increment matches [Versioning](#versioning).
3. Run `materials build -o <id>-<version>.json` on the pack directory.

4. Play-test on a non-production deployment: create a campaign and an instance, and play to at least one ending for each adventure that uses the content.
5. Publish:

   ```
   publish_bundle(kind="setting", bundle=<contents of <id>-<version>.json>)
   ```

6. Confirm `list_materials` returns the new version.

For adventures, steps 1 and 3 use the adventure compiler, and `publish_bundle` uses `kind="adventure"`. Publication fails if no published setting satisfies `requires_settings`.

## Withdraw

1. Unlist the version:

   ```
   set_listed(kind, id, version, listed=false)
   ```

2. Confirm the version is absent from listings. The previous listed version, if any, is returned instead.

Unlisting affects only campaigns and instances created afterwards. Existing instances keep their pinned version and continue.

## Release a fix

1. Apply the fix in the content directory and increment the version (normally patch).
2. Follow [Publish](#publish).
3. Unlist the defective version.
4. Instances pinned to the defective version continue on it. To move a group to the fix, the campaign author calls `set_materials` with the fixed version, ends the instance, and creates a new one.

## Rollback

To revert a publication, unlist the new version and relist the previous version:

```
set_listed(kind, id, new_version, listed=false)
set_listed(kind, id, previous_version, listed=true)
```

Bundles are never deleted. Instances created on the reverted version continue on it.

## Escalation

Escalate to the engine maintainers when a bundle passes the compiler but instances fail at start (`conflict` from `start_instance` on generation) or during play with errors not explained by the content. Include the bundle file, the instance id, and the seed.
