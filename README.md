# Cadmium

The web application for Cadmium, a multiplayer text dungeon crawler run by software. The specification lives in [`cadmium-spec/`](cadmium-spec/); start with [`cadmium-spec/AGENTS.md`](cadmium-spec/AGENTS.md) and [`cadmium-spec/docs/README.md`](cadmium-spec/docs/README.md). The specification is the requirement: this repository implements it and does not edit it.

The work is planned in [SPRINTS.md](SPRINTS.md). Gaps in the specification found during implementation are recorded in [SPEC_ISSUES.md](SPEC_ISSUES.md).

## Stack

Next.js (App Router), TypeScript in strict mode, Tailwind CSS, Clerk, Supabase, Vercel, and Groq, as listed in [`app-flow.md`](cadmium-spec/docs/app-flow.md#stack). Schemas are validated with Ajv (`Ajv2020`), YAML is read with `yaml` as YAML 1.2, and tests run on Vitest.

## Setup

Requires [pnpm](https://pnpm.io) 12. pnpm downloads the Node.js version pinned in `package.json` (`devEngines.runtime`), so no separate Node.js install is needed; run tools through `pnpm`.

```bash
pnpm install
```

```bash
pnpm dev
```

## Scripts

| Script | Job |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm gen` | Regenerate `lib/bundle/schemas.generated.ts` and `lib/bundle/types/` from the specification |
| `pnpm gen:check` | Regenerate and fail if the generated files differ from the committed ones |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest: unit tests, test vectors, and specification validation |
| `pnpm check` | Every gate: `gen:check`, `typecheck`, `lint --max-warnings 0`, `test`, and `build` |

Vercel deploys from GitHub and runs `pnpm build` only. Run `pnpm check` before every commit; it is the gate that the specification's CI requirement describes.

## Layout

| Path | Contents |
|---|---|
| `cadmium-spec/` | The specification: documents, JSON Schemas, example packs, rules data, design tokens |
| `app/` | Next.js routes and pages |
| `lib/rng/` | `splitmix64_v1` draws, dice, selection by RNG, `fnv1a64` |
| `lib/grid/` | Map parsing, distance, adjacency, line of sight, pathfinding, movement allowance |
| `lib/systems/` | Rules-system contract, registry, implementations, and the reusable conformance suite in `testing/` |
| `lib/bundle/` | Schema registry and generated types; generated files are never edited by hand |
| `lib/materials/` | Content Compiler |
| `scripts/` | Build-time scripts, such as type generation |
| `tests/` | Tests that span modules, such as specification validation |

Modules under `lib/` follow the boundaries in [`engine-implementation.md`](cadmium-spec/docs/guides/engine-implementation.md#module-boundaries). `rng`, `grid`, `generator`, and `engine` perform no I/O.

## Specification version

`cadmium-spec/` is a copy of the specification at commit `54f4adcdffe5bf3c8547a5c89a9f55fefbeb2fef`. It is to become a git submodule pinned to that commit once the specification repository's URL is available. Updating the specification is its own change, with the specification diff summarized.

## License

Application code: MIT. The specification's licenses are in [`cadmium-spec/LICENSES.md`](cadmium-spec/LICENSES.md).
