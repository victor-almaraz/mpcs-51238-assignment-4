# Licenses

Each part of the repository carries the most permissive license its sources allow.

| Path | License | Notes |
|---|---|---|
| Application code implementing this specification | MIT | See [LICENSE](LICENSE). |
| `docs/` | CC0 1.0 | Original documentation, dedicated to the public domain. |
| `spec/schema/`, `spec/examples/` | CC0 1.0 | Original schemas and example packs. |
| `systems/*/` schema files | CC0 1.0 | Original schemas. |
| `systems/quest/data.json` | CC BY 4.0 | Derived from the Quest Creators Resource. See the folder's `NOTICE`. |
| `systems/cadmium/data.json` | CC BY 4.0 | Quest-derived values, modified and extended. See the folder's `NOTICE`. |
| `systems/cadmium/modules.json` | CC0 1.0 | Original module data. |
| `assets/` in packs | As declared per asset in `assets.yaml` | Each asset's `license` and `credit` are shown on `/attribution`. |
| `design/theme.css` | CC0 1.0 | Design tokens. |
| `design/explorations/` | CC0 1.0 | Design studies. Fonts and icons embedded in them keep their own licences. |

## Third-party assets shipped with the application

| Asset | Licence | Source | Obligation |
|---|---|---|---|
| Libertinus Serif, Serif Display, Sans, Mono | SIL OFL 1.1 | github.com/alerque/libertinus | Ship `OFL.txt` with the font files. Subsetting is a modification; subset files keep the OFL and do not use the reserved names "Linux Libertine" or "Biolinum". |
| Lucide icons | ISC | github.com/lucide-icons/lucide | Keep the licence text in the repository. No visible credit required. |
| game-icons.net icons | CC BY 3.0 | github.com/game-icons/icons | Credit each artist of each shipped icon on the attribution page, with a link to game-icons.net and the licence. |

The attribution page (`/attribution`) lists every entry in this file that requires credit.

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/legalcode
CC BY 4.0: https://creativecommons.org/licenses/by/4.0/legalcode

## Rules for added data

- Quest and Cadmium material: CC BY 4.0 for Quest-derived values, keeping the attributions in `systems/quest/NOTICE` and `systems/cadmium/NOTICE`. The name Quest identifies compatibility only. Full ability and treasure text from the Quest book is outside the Creators Resource and MUST NOT be added.
- A new rules system's folder carries its own `NOTICE` and the most permissive license its source allows, and gets a row in the table above. Share-alike or AELF-licensed source text makes the containing data file carry that license; restating mechanics from a more permissive source avoids it. Known status of deferred candidates is in [docs/systems/README.md](docs/systems/README.md#candidate-systems).
- Trademarks (such as the Quest logo) are not used; names identify compatibility only.

This file is not legal advice.
