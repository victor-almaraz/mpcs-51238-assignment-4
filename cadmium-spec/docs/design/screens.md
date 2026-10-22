# Screens

Visual treatment of the main screens. Contents, routes, and behaviour are in [app-flow.md](../app-flow.md).

## Common frame

| Region | Treatment |
|---|---|
| Top bar | 48 px on `page` with a bottom `rule`. Product name left; page links with icons and labels; Search, Help, Notifications, and account as icon buttons on the right |
| Section navigation | 12rem column on the desk; icon and label per section; current section `accent` on `accent-soft` |
| Status bar | 36 px on `page` with a top `rule`. Note count with glyphs, Undo, Redo, Edit as YAML as icon buttons; Playtest as an icon button and Publish as the labelled primary button on the right |

## Dashboard

A contents page, not a grid of cards. The page holds titled lists, each row one line that leads somewhere:

| List | Row |
|---|---|
| Playing | Instance, adventure, the user's character, status dot and word, next session; row actions as icon buttons |
| Characters | Name, Quest role, where the character is |
| Adventures you write | Title, draft state, last published version; a numbered error mark in the gutter when the draft has problems |
| Campaigns you run | Title, instance count, player count |

The margin carries what needs attention: invitations with Accept and Decline, problem counts, pending invitations. New character and New adventure are icon buttons with tooltips beside their list headings.

## Character creation

Quest characters are created as sentences with blanks on the page, in Libertinus Serif 17 px: My name is Vale. I am a spy, and I work unseen. Each blank is an underlined token that opens a picker or a short text field. Abilities follow as a checklist with costs, counted against six. Hints in the margin say what is left to choose. Create character is the labelled primary button, disabled with its reason until the choices are complete.

## Campaign editor

Tabs on the desk above the page: Details, Materials, Members, Invitations, the current tab underlined in `accent`. The Invitations page has a message field and a note field, Create invitation as the labelled primary button, the new code and link with a Copy icon button shown once, a pending list with notes and Revoke icon buttons, and the campaign invite link with Copy, Rotate, and Disable as icon buttons.

## Adventure editor

| Area | Treatment |
|---|---|
| Page | Record title in Heading style with Add, Playtest from here, and More as icon buttons; the arc graph; rule inserts for the selected stage; secrets marked by an `accent` bar and a GM hint in the margin |
| Margin | Numbered errors, warnings, and hints beside their lines; unanchored notes at the top with links |
| Header | Note index: count per kind with glyphs; selecting a kind steps through its notes |

Locations show the map editor; NPCs, Flags, and Items are forms and tables on the page.

## Play

### Player view

| Area | Treatment |
|---|---|
| Desk, left | Character (health, AP, inventory with content icons), the map of the current location, and party, in Sans |
| Page | The log as a book page. Each player action in Sans under the player's name, indented; narration in Serif 17 px below it |
| Choice | When the rules system asks for a choice, the options are labelled outline buttons above the input |
| Input | Free text with up to three suggested actions as text chips; action shortcuts (Move, Examine, Talk, Attack, Ability, Item, Rest) as icon buttons that insert their verb |
| Margin | This round: who has acted, who is typing, time left |

### Playtest and author view

The same screen with the narrator's trace in the margin: numbered trace notes beside each narration naming the roll, the rule that fired, and what changed, and a What the narrator knows panel at the foot of the margin.

## Narrow screens

Below 1024 px the page fills the width. Notes appear under their line with their number and glyph, and a bar at the foot counts notes and steps between them.

### Play on narrow screens

The log and input fill the screen. A bar at the top holds the round status in one line and four icon buttons: Map, Character, Party, and Round.

| Element | Treatment |
|---|---|
| Map | Opens a sheet that covers the log from the top bar down to the action bar, leaving the input and action bar visible. The map centres on the viewer's character. Drag pans, pinch zooms, and a Centre icon button returns to the character. Tapping an entity, door, link, or room inserts its name into the input; the sheet stays open. A List icon button switches to the text view of visible entities with distance and direction. Close, or a downward swipe on the sheet's handle, returns to the log. |
| Map when the keyboard opens | The sheet shrinks to the space above the input; at less than 160 px it closes. |
| Character, Party | Open the same kind of sheet with the desk panel's contents. |
| Round | Opens the margin: round status, who has acted, and, in playtest and author views, the trace. |
| New events while a sheet is open | The Map or Round button shows a count badge; tokens on the open map move as commits arrive. |

Only one sheet is open at a time. Sheets use `raised` with the 3 px radius at their top corners; there are no shadows.

### Map editor on narrow screens

Below 1024 px the map editor shows the map read-only, with a note that editing needs a wider screen; the location's text view remains editable.

## Dark mode

The same layouts with the dark tokens: a lighter page on a darker desk, raised menus lighter again, and the lighter lavender accent. Nothing is pure black.
