# Glossary

Terms are used with these meanings throughout the documentation.

| Term | Definition |
|---|---|
| User | A registered person, with auth details, characters, active campaigns, and authored campaigns. |
| Terms version | The hash that identifies the current text of the Terms of Service and Privacy Policy together; a user accepts it again whenever it changes. See [data-model.md](data-model.md#user). |
| Character | A user's playable entity, bound to one rules system and holding the attributes that system mandates. |
| Rules system | A swappable module that decides ruleset-specific outcomes: sheets, checks, attacks, harm, rests, initiative. Implemented: `quest`. |
| Campaign | What an author prepares: a rules system, members, materials, and invitations. Campaigns hold no play state. |
| Campaign instance | One playthrough of a campaign: its characters, state, event log, and schedule. What actually gets played. |
| Member | A user who belongs to a campaign, as `author` or `player`. |
| Invitation | A single-use code that makes whoever accepts it a member of a campaign. |
| Invite link | A campaign's reusable join code, which the author can rotate or disable. |
| Scheduled session | A planned sitting of an instance, optionally recurring weekly. |
| Occurrence | One dated sitting of a scheduled session. |
| RSVP | A member's `yes`, `no`, or `maybe` answer for an occurrence. |
| Material | A setting pack or adventure pack. |
| Setting pack | Material that supplies a setting's vocabulary and generic content for one rules system. |
| Adventure pack | Material that supplies a story: plot, locations, NPCs, and adventure-specific content. |
| Bundle | The compiled, validated JSON form of a setting pack or adventure pack. |
| `system_stats` | Rules-system data on a creature, item, or ability, validated against the system's schema. |
| Rolled ability | An ability whose `system_stats.roll` is `true`: using it calls `check`, and its effects apply only on a passing outcome. See [engine.md](engine.md#action-resolution). |
| Quick start | A role's six starting abilities that one setting tags for that role alone, offered in character creation as a single choice. See [systems/quest.md](systems/quest.md#starting-abilities). |
| Sheet | A combatant's rules-system data in instance state: a character sheet, a creature sheet built by `instantiate`, or a structure sheet built by `instantiate_structure`. |
| State | The authoritative snapshot of an instance's world. |
| Event | An immutable record of one state change. |
| Commit | The input that produced one instance version, stored with that version's events; replay re-runs commits. See [data-model.md](data-model.md#commit). |
| Input | A player's raw natural-language text. |
| Tool call | The structured action the parser produces from an input. |
| Parser | The model role that converts an input into a tool call. |
| Narrator | The model role that converts events into prose. |
| Engine | The deterministic component that runs rounds, applies effects and triggers, and calls the rules system. |
| Mode | The instance's interaction regime: `exploration` or `combat`. |
| Round | One cycle in which every participant acts once, in an order computed by the engine. |
| Participant | A creature included in the current round. |
| Ordering policy | A rules system's resolution method and sort keys for a mode. |
| Declaration | A validated action stored until a simultaneous round closes. |
| Free tool | A tool that resolves immediately and is never ordered: `examine`, `improvise`, `choose`. Only an active character calls one, and under sequential resolution only on its turn, except `choose`. |
| Exploration-only tools | `interact`, `search`, `take`, `drop`, `give`, and `rest`, which a character in the combat area cannot use during combat. See [engine.md](engine.md#rounds). |
| Pending choice | A decision the rules system asks a player to make mid-resolution, answered with `choose`. |
| Situation | Roll adjustments the engine derives from conditions and passes to the rules system. |
| Outcome tier | `critical_failure`, `failure`, `partial`, `success`, or `critical_success`. |
| Map | A location's square grid of cells: terrain, rooms, links, and placed entities. |
| Cell | One square of a map, written `[x, y]`; `x` increases east and `y` south. |
| Terrain | The unchanging type of a cell, such as floor or wall, with what it obstructs and its movement cost. |
| Footprint | The `[width, height]` cells an entity occupies, anchored at its top-left cell. |
| Obstacle | An entity that obstructs movement, sight, or both, and MAY be destructible. |
| Door | An entity on one cell that can be open or closed and MAY be locked. |
| Lock | A door's requirement to open. A generated lock-and-key pair is a locked door with its key item placed reachable before it. |
| Room | A named set of cells used for places, triggers, combat, and narration. |
| Link | A cell that leads to a link in another location. |
| Line of sight | Whether one cell sees another, decided by the line procedure in the engine specification. |
| Seen cells | Cells any character has seen; the part of a map the party's views show. |
| Combat area | The rooms in which combat takes place, starting with the room where it began. |
| Illumination | A cell's light: `bright`, `dim`, or `dark`, from its room's ambient light and nearby light sources. |
| Light source | An entity that emits bright and dim light within set radii while lit. |
| Perceive | To see a cell and, when the rules system enables lighting, have it light enough or within darkvision. |
| Structure | A destructible obstacle or door, with a sheet built by the rules system. |
| Requirement | A condition that must hold for a door to open or an action to succeed. |
| Effect | A primitive state change defined by the engine and referenced by materials. |
| Trigger | An adventure rule that applies effects when a matching event occurs and its condition holds. |
| Namespace | The prefix that identifies a bundle's content in references: a setting pack's declared `namespace`, or an adventure's id. |
| Ref | A reference to content, written `namespace:key`. |
| Anchor | A placement that a generated location must satisfy, such as a plot item at a minimum depth. |
| Weighted selection | Choosing one entry of a weighted table with one die whose faces number the sum of the weights. See [engine.md](engine.md#random-numbers). |
| Table draw | A draw of `picks` entries from a table, each a weighted selection yielding its `ref` `count` times. See [engine.md](engine.md#random-numbers). |
| Action-menu mode | A deployment setting in which every character receives selectable actions at each round or turn start. |
| Operator | A user with `operator: true`, permitted to run administrative operations. |
| Page (design) | The content column of a screen: forms, rule inserts, graphs, the play log. |
| Margin (design) | The column beside the page holding numbered notes about its lines. |
| Desk (design) | The ground around the page holding navigation, toolbars, and status. |
| Margin note | A numbered error, warning, hint, or trace shown in the margin beside the line it concerns. |
| Rule insert | An adventure trigger typeset on the page between hairlines, collapsed to one sentence or expanded into When, If, and Then. |
| Reference token | An underlined link to another record, such as a room or flag, chosen from a picker. |
| Art | An optional image for content, declared in a pack's `assets.yaml`: an icon, a portrait, or a tile. |
| Asset | One stored image, identified by the hash of its bytes, from a pack or uploaded by a player. |
| Content icon | An icon for content: a game-icons.net silhouette, or a pack's own icon asset, chosen by an author. |
| Portrait | Art showing a character, NPC, or creature. |
| Tile | Art drawn in every cell of a terrain type. |
| Push subscription | A browser registered to receive Web Push reminders for a user. |
| Calendar feed | A user's secret iCalendar URL listing upcoming occurrences, for calendar applications. |
| Module | An optional part of a rules system that a campaign enables, such as Cadmium's `armor`. |
| Module field | A schema property whose `description` begins with `Module <id>:`, present only while that module is enabled. See [systems/README.md](systems/README.md#modules). |
| Cadmium | The default rules system: Quest with optional modules. |
| Character-scoped flag | A flag with one value per character instead of one for the party. |
| Currency | A setting's money: integer amounts in a smallest unit, shown as coins of declared denominations. |
| Capacity | The number of items characters can store in a container. |
