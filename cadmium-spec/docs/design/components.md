# Components

Values refer to the tokens in [foundations.md](foundations.md).

## Icon buttons and tooltips

Actions are icon buttons. The button's name appears in a tooltip on hover and on keyboard focus, and is the button's accessible name.

### Anatomy

| Part | Value |
|---|---|
| Target | 36 px square; 28 px inside toolbars, within a 36 px row; never under 24 px (WCAG 2.5.8) |
| Icon | 20 px, 16 px in dense rows; Lucide, 1.75 px stroke |
| Rest | Icon in `ink` on no background |
| Hover | `accent-soft` background |
| Active or pressed | `accent-soft` background, icon in `accent`, `aria-pressed="true"` for toggles |
| Focus | 2 px `accent` ring, 2 px offset |
| Disabled | Icon in `muted`; stays focusable with `aria-disabled="true"` |

### Tooltip

| Rule | Value |
|---|---|
| Content | The action as a verb phrase in sentence case, then its keyboard shortcut: Add rule, R |
| Disabled buttons | The reason: Fix 2 problems to publish |
| Toggles | The action, whatever the state: Show secrets |
| Appearance | `ink` background, `page` text, Libertinus Sans Bold 13 px, 3 px radius, placed above the button unless clipped |
| Show | After 500 ms of hover; at once on keyboard focus |
| Stay | While the pointer is over the button or the tooltip (WCAG 1.4.13) |
| Hide | On Escape, without moving focus; when pointer and focus both leave |
| Touch | Long press shows the tooltip; release dismisses it |
| Accessibility | `aria-label` on the button equals the tooltip's action text; the tooltip is `role="tooltip"` and referenced by `aria-describedby` only when it adds a shortcut or reason |

### Buttons that keep a visible label

| Button | Treatment |
|---|---|
| The primary action of a view: Publish, Start instance, Create character, Send invitation | Filled `accent` button: icon and label in `page` |
| Destructive confirmation in a dialog: Delete arc | Outlined `danger` button with label |
| The cancel action beside it: Keep arc | Outlined button with label |
| Section navigation and the top bar's places | Icon and label; the current section is `accent` on `accent-soft` |
| Choices in play: setbacks, suggested actions | Text only; the words are the choice |

Narrow screens collapse section navigation to icons; the labels move into tooltips.

## Fields

| State | Treatment |
|---|---|
| Rest | `page` fill, 1 px `border`, 3 px radius; label above in Sans Bold 14 px |
| Focus | 2 px `accent` ring, 2 px offset |
| Error | 1.25 px `danger` outline, 2 px `danger` anchor bar to the left, numbered gutter mark, note in the margin |
| Disabled | `desk` fill, text in `muted` |

Hints sit below the field in Caption, `muted`. Prose fields (briefs, narration, profile answers) are set in Libertinus Serif.

## Selection controls

Checkboxes and radios are 13 px, with a 1 px `border` outline at rest and an `accent` fill when checked. Labels follow on the right in Control style. Switches are not used.

## Reference tokens and pickers

A reference to another record (a room, NPC, flag, stage) is an underlined token: text in `accent`, 1 px underline in `accent-line`, turning `accent` on hover and focus. Selecting it opens a picker that lists labels, never ids. A selected item in a picker is `accent-soft`.

## Menus, dialogs, toasts

| Component | Treatment |
|---|---|
| Menu | `raised` surface, 1 px `border`, 3 px radius; rows 28 px; the highlighted row `accent-soft`; a creation row (New NPC) in Sans Bold `accent` below a `rule` |
| Dialog | `raised` surface, 1 px `border`; title in Sans Bold 15 px naming the object; one sentence of consequence; buttons right-aligned, confirm last |
| Toast | `ink` background, `page` text; repeats the action's verb (Published 1.2.0); 5 s; never carries an error |

## Status

Status is a 7 px dot followed by a word: Active, Paused, Lobby, Ended, 2 problems. Dots use `success`, `warning`, `muted`, or `danger`.

## Margin notes

### Kinds

| Kind | Glyph | Colour | Use |
|---|---|---|---|
| Error | Filled circle with ! | `danger` | Blocks publishing |
| Warning | Open ring | `warning` | Publishing allowed |
| Hint | Pencil stroke | `muted` | Guidance while filling a form; removed once the field is valid |
| Trace | Numbered square | `accent` | Playtest and author views only: which rule fired, which condition failed |

### Anatomy

| Part | Treatment |
|---|---|
| Gutter mark | The note's glyph and number to the left of its line on the page |
| Anchor bar | 2 px bar in the note's colour on the left edge of the field or insert (errors and warnings) |
| Leader | 0.6 px line from the line to the margin, drawn only for the note in focus |
| Note | Glyph, number, and title in Sans Bold 13 px; one-sentence body in Caption; optional action link in `accent` |

### Placement

1. A note's title aligns with its line.
2. Overlapping notes stack downward with 8 px between them.
3. Hints that fall below the visible page collapse into one line, such as +2 hints below. Errors never collapse.
4. Notes about records in another section have no anchor; they collect above the first note with a link to the record.
5. Selecting a note focuses its field; focusing a field highlights its note.
6. Fixing an error removes its note. Dismissing a warning leaves a faint gutter tick for the rest of the draft.
7. Each note is linked to its field with `aria-describedby` and follows it in reading order. Leaders are decorative.

## Rule inserts

Adventure triggers are typeset on the page between two `rule` hairlines, with no box or shadow.

| State | Treatment |
|---|---|
| Collapsed | Title in Sans Bold, then one sentence with reference tokens: When a player asks the Archivist about the core, start Find the core |
| Expanded | Three rows: When (a moment), If (a state), Then (effects in order); each row's picker offers only the right kind. Narrate in Serif Italic. Add condition and Add effect as icon buttons |
| Triggered by | A list of checkboxes naming the moments, never typed ids |
| Problem | Anchor bar and gutter mark on the insert; the note in the margin |

## Art

Art is optional. Each context requests one kind and falls back in order:

| Context | Requested | Fallback chain |
|---|---|---|
| Character, NPC, or creature token on a map | `portrait` | portrait, icon, initial in a circle |
| Character panel, NPC conversation header | `portrait` | portrait, icon, initial |
| Object on a map: item, container, fixture, obstacle, door | `icon` | icon, plain shape |
| Inventory, abilities, lists | `icon` | icon, the default content icon for the kind |
| Terrain cell | `tile` | tile, the terrain's hatching |

Portraits and icons scale to the bounding box of the entity's footprint, keeping their aspect ratio. Tiles repeat once per cell. Dim and dark overlays, reach tints, and selection outlines draw over art. Every image carries its `alt` text; on maps, the text view lists it. Art never replaces a label: names stay in text beside or under it.

## Currency

A currency flag is shown as coins, largest denomination first, omitting denominations with a count of 0, in Sans with tabular figures: `1 scrip · 2 credit`. Hovering or focusing the line shows the total in the smallest unit.

## Graphs

Arc graphs are drawn like a drafting plate on the page.

| Element | Treatment |
|---|---|
| Canvas | The page itself: no grid, no minimap, no header bars |
| Node | 2 px radius card, 0.7 px `ink` outline; title in Sans Bold, first line of text in Serif `muted` |
| Selected node | 1.4 px `accent` outline, `accent-soft` fill |
| Stub (unwritten) | Dotted `muted` outline, title in Sans Italic |
| Node with a problem | The note's glyph in the top right corner |
| Transition | 0.7 px `ink` arrow, left to right for arcs |
| Transition with a rule | A small `accent` dot at the midpoint; hover shows the rule sentence |

Every graph has a list view that edits the same data, for keyboard and screen-reader use.

## Maps

Location maps are drawn on the page as a plan, in the same drafting style, in the map editor and in play.

| Element | Treatment |
|---|---|
| Cell | Square, 16 px at 100% zoom; zoom 50–400% |
| Floor | `page` |
| Wall | `ink` fill |
| Void | `desk`, no outline |
| Declared terrain | `rule` fill with a hatching pattern per type, named in the legend panel |
| Grid lines | 0.5 px `rule`, shown in the editor; hidden in play below 100% zoom |
| Room | Label in Sans `muted` at the room's top-left cell; selected room outlined 1.4 px `accent` |
| Door | A bar across the cell: open as a gap with two ticks, closed as a solid `ink` bar, locked with the `lock` icon |
| Link | The `move-up-right` icon in the cell, with its label on hover |
| Entity | Its art by the fallback chain in [Art](#art), inside its footprint; creatures in a circle, other entities square; hostile creatures with a `danger` ring |
| Character | Circle in `accent` with the character's initial; the viewer's own character filled |
| Unseen cells (play) | Not drawn |
| Dim cells (play) | Drawn with a 40% `desk` overlay |
| Dark or unperceived seen cells (play) | Drawn with a 75% `desk` overlay; entities on them are not drawn |
| Light source | A small `warning` dot on its icon while lit |
| Reach (play) | Cells within the actor's movement this turn tinted `accent-soft` while the Move shortcut is active |
| Problem (editor) | The note's glyph on the cell; the margin holds the note |

Every map has a text view for keyboard and screen-reader use: in the editor, the rows and legend as editable text; in play, a list of visible entities with distance and direction.
