# Writing

Interface text follows the same rules as this documentation: plain verbs, sentence case, one job per element.

## Rules

| Rule | Write | Not |
|---|---|---|
| Name actions by what happens | Publish, Invite player, Add rule, Start instance | Submit, OK, Go, Continue |
| Keep an action's name through the flow | Publish, then Publishing, then Published 1.2.0 | Publish, then Saving, then Success |
| Errors say what and how | Unknown item. Choose an item from this adventure or its settings. | Oops, something went wrong |
| Empty states invite the next step | No characters yet. Create a character to join a game. | Nothing to see here |
| Use the reader's words | Players, game, session, room | Instance participants, entities, nodes |
| Label, do not decorate | Starting room | STARTING ROOM, Starting Room: |
| Tooltips are actions | Copy invite link | Click here to copy |
| Disabled controls explain | Fix 2 problems to publish | Disabled |

## Voices

| Voice | Face | Used for |
|---|---|---|
| The story | Libertinus Serif | Narration, room text, NPC briefs, anything the author wrote |
| The players | Libertinus Sans, indented under the player's name | Player actions in the log |
| The software | Libertinus Sans | Labels, buttons, tooltips, notes, status, the trace |
| The data | Libertinus Mono | Ids and YAML |

Narration never carries interface vocabulary: no ids, dice notation, or token names unless the setting's narration style asks for it.
