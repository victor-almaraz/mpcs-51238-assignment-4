# Cadmium pattern library

The interface patterns of this application. They replace the specification's Margin design
(`cadmium-spec/docs/design/`) for this application; see
[SPEC_ISSUES.md](../../SPEC_ISSUES.md#design-system). Routes, contents, and behaviour stay as
`cadmium-spec/docs/app-flow.md` specifies them. The patterns follow how comparable tools lay out the
same tasks; [Sources](#sources) lists them.

## Principles

| Principle | Meaning |
|---|---|
| Work surfaces fill the window | Play and the adventure editor are workspaces of panes that use the full width, not a centred column. |
| Lists lead to details | Hub pages list things; each row or card opens a detail page that holds that thing's actions. |
| Problems appear where they are and in one list | A field or entity shows its own error; a count in the toolbar opens the list of all of them. No numbered footnotes. |
| Status is always in view | Round, turn, save state, and connection sit in a bar that does not scroll away. |
| The story is set like a book; the software is not | Narration, room text, briefs, and page and section titles use Libertinus Serif. Controls, data, and card titles use the system font. |
| Colour means something | The lavender accent marks what can be acted on and the current selection; cadmium yellow marks what is happening now; red marks errors and destructive actions. Every status also has an icon or a word. |

## Foundations

### Size classes

| Class | Width | Layout |
|---|---|---|
| Compact | below 640 px | One pane. Workspaces switch panes with a tab bar at the foot. Navigation is a menu. |
| Medium | 640 to 1023 px | Hub grids take two columns; detail pages stack their aside under the main column. Workspaces show the main pane and one side pane. |
| Expanded | 1024 px and wider | Hub grids take up to three columns; detail pages put the aside beside the main column; workspaces show all panes. |

### Page widths

| Layout | Width |
|---|---|
| Hub and detail pages | Up to 72rem, centred, 24 px insets (16 px compact) |
| Forms | Up to 40rem for the form column |
| Prose (terms, narration, briefs) | 66 to 72 characters per line |
| Workspaces | The full window below the top bar |

### Colour

The Graphite palette stays, with its light and dark values and contrast minimums: `page`, `desk`,
`raised`, `rule`, `border`, `ink`, `muted`, `accent`, `accent-strong`, `accent-soft`, `accent-line`,
`danger`, `warning`, `success` and their `-soft` tints, `selection`, and the pigment set `pigment`,
`pigment-ink`, `pigment-line`, `pigment-soft` (`app/theme.css`; see Identity). Surfaces: `desk` behind workspaces and hub pages; `page` for cards, panels, and
inputs; `raised` for menus, dialogs, and sheets. The theme follows the system unless the user picks
Light or Dark in Settings.

### Typography

| Role | Face | Size / line height |
|---|---|---|
| Page title | Libertinus Serif, semibold | 34 / 40 px (28 / 34 compact) |
| Section heading | Libertinus Serif, semibold | 21 / 28 px |
| Card, panel, and pane heading | System UI, semibold | 18 / 26 px |
| Card or record title | System UI, semibold | 16 / 24 px |
| Body and controls | System UI | 15 / 22 px |
| Label | System UI, medium | 14 / 20 px |
| Caption and metadata | System UI | 13 / 18 px |
| Story (narration, room text, briefs) | Libertinus Serif | 17 / 27 px; italic for emphasis |
| Ids, YAML, code | System monospace | 14 / 20 px |

The system stack is `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Libertinus Serif
(Regular, Italic, Semibold; SIL Open Font License) is served from `/fonts/` with `font-display: swap`.
Sentence case everywhere. Numbers in trackers, stats, and tables use tabular figures.

### Space, shape, depth

| Property | Value |
|---|---|
| Spacing | 4 px base: 4, 8, 12, 16, 24, 32, 48 |
| Radius | 6 px on cards, panels, and dialogs; 4 px on controls; full on badges and avatars |
| Borders | 1 px `rule` around cards and between panes; 1 px `border` on inputs |
| Depth | Surfaces differ in lightness. Menus, dialogs, and sheets add a soft shadow, so they read as above the page |
| Focus | 2 px `accent` ring, 2 px offset, on every interactive element; never removed |
| Motion | Menus, sheets, and toasts open in 120 ms ease-out; nothing animates with `prefers-reduced-motion` |

### Icons

Lucide through `lucide-react`, 20 px (16 px in dense rows), stroke 1.75 with `absoluteStrokeWidth`,
in `currentColor`. An icon-only button always has an accessible name and a tooltip. The icon vocabulary
of `cadmium-spec/docs/design/foundations.md` (Icons, Vocabulary) stands: one concept, one icon. The
product mark is the cadmium tile, Cd, drawn as a Lucide-style icon (`components/ui/logo.tsx`).

### Identity

Three devices give the interface its character. Each has one meaning and is used only for it.

| Device | Rule |
|---|---|
| Element tile | A hint of the logo's periodic-table tile marks things in the game world on hub cards: characters, campaigns, games, and adventures. A small bordered square (40 px) holds a two-letter symbol written as chemical symbols are (Wren Halloway is Wh, The Sunken Archive is Sa; leading articles are skipped). It carries no other labels. Party members in play use the same square as their avatar. A session date uses a date tile: the month in the corner, the day as the symbol, the weekday under it. Detail-page headers and list rows have no tile. Tiles are decorative (`aria-hidden`); the name beside them is the text. |
| Pigment | Cadmium yellow (`pigment` fill, `pigment-line` border) marks what is happening now: the viewer's turn, the current actor in the turn tracker, an active game, a live session, and a session within 24 hours. Text on it is always `pigment-ink` (9:1 in light, 8.3:1 in dark). It is a fill, never a text colour, so it does not compete with `warning` and `danger`. At most a few pigment marks show on one screen. |
| Serif titles | Page titles (`h1`) and section headings (`h2`) are set in Libertinus Serif, the story face; everything inside a card, panel, or pane stays in the system font. |

Tile tones: `pigment` for now (an active game, a session within 24 hours), `accent` for what is the
viewer's or open to them (their characters, a game in its lobby, an upcoming date), and `neutral`
otherwise.

## App frame

| Region | Pattern |
|---|---|
| Top bar | 56 px on `page` with a bottom `rule`: the mark and name, then Dashboard, Characters, Campaigns, Adventures; on the right Notifications (with an unread count), Settings, and the account. Compact: the mark, a Notifications button, and a menu button that opens the destinations in a sheet. |
| Current place | The active destination is `accent` text on `accent-soft`, with `aria-current="page"`. |
| Footer | Terms, Privacy, Attribution, on hub and detail pages only; workspaces have none. |
| Banners | Site-wide notices (the takedown date, a closed account) sit under the top bar in a full-width banner with an icon and text. |

## Page layouts

| Layout | Use | Structure |
|---|---|---|
| Hub | Dashboard, Characters, Campaigns, Adventures, Notifications | Page header (title, one-line description, primary action); a "Needs you" strip when anything does; titled sections of cards or rows; an empty state per section with the action that fills it |
| Detail | Campaign, game lobby, character, schedule, history | Page header with breadcrumb, title, status badge, and actions; a main column of sections; an aside (summary facts, people, next session) beside it on expanded screens and under it otherwise |
| Form | New character, new campaign, new adventure, campaign editor, settings sections, accept terms | Page header; an error summary at the top after a failed submit; fields in titled groups; actions at the foot, primary first |
| Workspace | Play, adventure editor | A toolbar; panes; a status bar. See [Play](#play) and [Adventure editor](#adventure-editor) |

## Components

All live in `components/ui/`. Each is the only way the application draws that thing.

| Component | Pattern | Accessibility |
|---|---|---|
| `Button` | Variants `primary` (filled accent; one per view), `secondary` (outline), `quiet` (text), `danger` (outline red; filled only in a confirm dialog). Sizes `md` (36 px) and `sm` (32 px). Optional leading icon | A real `<button>` or `<a>`; disabled buttons say why in adjacent text |
| `IconButton` | 36 px square (32 px dense), icon only | `aria-label` and a tooltip with the same words |
| `PageHeader` | Optional breadcrumb, title, description, status, and actions on the right (under the title on compact) | One `h1` per page |
| `Section` | Titled region with optional actions | `h2`, labelled `section` |
| `Card` | `page` surface, `rule` border, 6 px radius, 16 px padding; a whole-card link uses the title as the link | The title is the link text; no nested interactive elements inside a whole-card link |
| `List` / `ListRow` | Rows with an optional icon, a title, metadata, a status badge, and trailing actions | A `ul`; trailing actions are separate buttons |
| `ElementTile` / `DateTile` | The identity tile in sizes `sm` (40 px, cards and avatars), `md` (56 px), and `lg` (72 px, the dashboard's next session), tones `accent`, `pigment`, `neutral`; `elementSymbol` derives the symbol from a name | Decorative unless given a `label` |
| `Badge` | A word with an optional dot or icon: neutral, accent, success, warning, danger, and pigment (Your turn, Live now) | Colour is never the only signal |
| `Field` | Label above the control, hint under the label, error under the control with an icon | `label` bound to the control; hint and error joined by `aria-describedby`; `aria-invalid` on error |
| `TextInput`, `TextArea`, `Select`, `Checkbox`, `Radio` | 40 px controls (checkboxes 20 px with a 40 px hit area) | Native elements |
| `ErrorSummary` | A `danger` box at the top of a form listing each error as a link to its field | Receives focus after a failed submit; `role="alert"` |
| `Notice` | Inline message with icon: info, success, warning, danger | `role="status"` for success, `alert` for errors |
| `Tabs` | Underlined tabs for sections of one page | APG tabs: arrow keys move, `aria-selected` |
| `EmptyState` | Centred icon, one sentence, and the action that fills the space | |
| `Sheet` / `Dialog` | Dialog centred; sheets slide from the side (expanded) or the foot (compact) on `raised` | APG modal dialog: focus moves in, stays in, Escape closes, focus returns |
| `Toast` | Short confirmations (Saved, Copied) at the foot, 4 s | A polite live region |
| `DescriptionList` | Facts as term and value | `dl` |

## Screens

### Dashboard

A hub. **Needs you** first: invitations to answer, RSVPs due for the next session, and drafts with
problems, each with its action inline. Then **Next session** as a card (date in the viewer's time zone,
game, RSVP buttons, Join when it is live). Then **Your games**: cards with the game, campaign, the
user's character, a status badge, and Continue. Then **Campaigns**, **Characters**, and
**Adventures** as card grids with a New button in each section header and an empty state when empty.

### Character creation

One page in titled steps that can be revisited: System, Role, Abilities (a checklist counted against
six, with the remaining count beside the heading), Name and description, and, for Cadmium, For
campaign with its module facts. A summary card beside the steps (under them on compact) lists each
choice with a Change link. Create character is the primary button, disabled with its reason until the
choices are complete.

### Campaign

A detail page. Tabs: Overview (games with their status and Open, the next session), Members,
Invitations (create, the code shown once with Copy, the pending list with Revoke, the invite link with
Copy, Rotate, Disable), and Materials. The aside holds the system, modules, and the campaign's
adventure. Edit campaign is a secondary action in the header.

### Game lobby, schedule, history

Detail pages. The lobby lists the party with each character's owner and a Remove action, Add
character, and Start as the primary action once the party can start. The schedule lists sessions and
occurrences with RSVP controls and the calendar links. History is a filterable log of commits and
narration, newest last, with version numbers.

### Play

A workspace for the turn-based game.

| Region | Expanded | Medium and compact |
|---|---|---|
| Turn tracker | A bar across the top: round number, mode (exploration or combat), resolution, each party member with acted, waiting, or current marks, time left, and Advance | The same bar, one line, scrolling sideways if needed |
| Log | Centre pane: `role="log"`; narration in Libertinus Serif; system events (combat starts, damage) as compact rows with icons | The default pane |
| Composer | Pinned under the log: a pending choice as buttons, up to three suggested actions as chips, the text input with Send, and quick actions (Look, Search, Wait, Rest) | Pinned at the foot above the tab bar |
| Map | Right pane, as large as it fits: zoom and centre controls, List view toggle; clicking a room, door, or thing selects it and offers its actions; selection is also possible from the list view | A pane in the tab bar |
| Character and party | Left pane with tabs: Character (HP, AP, armor, conditions, inventory with Use and Drop, abilities with Use) and Party | Panes in the tab bar |
| Your turn and errors | An alert live region announces "Your turn" and rejected actions | Same |

The tab bar on compact screens has Log, Map, Character, Party; a count badge marks new events on a
pane that is not shown.

### Adventure editor

A workspace modelled on entity editors with a problems panel.

| Region | Pattern |
|---|---|
| Toolbar | Title, save state (Saved, Saving, Unsaved), Undo, Redo, Edit as YAML, Playtest, Publish (primary) |
| Outline | Left pane: Overview, Flags, Plot (each arc), Locations, NPCs, Items & creatures, with a count and a problem badge per section; compact: a menu |
| Editor | Centre pane: the selected section's form, map editor, or arc graph |
| Problems | A bottom panel listing every problem with its severity icon, message, and location; selecting one opens its section and focuses its field; a count in the status bar toggles the panel; the panel remembers whether it was open |
| Inline problems | The field or entity shows its own message, in the field's error slot |
| Playtest | Opens as a side pane beside the editor (a full pane on compact); its trace lists each step with the trigger that fired or why it did not |

### Settings

A form page with sections down one column: Account, Appearance, Reminders, Calendar, Your data, and
a Danger zone (delete account) set apart with a `danger` border.

### Notifications

A hub list of reminders and invitations, newest first, each row with its time, a link to what it
concerns, and its action.

### Operator console, legal and public pages

The console uses detail-page sections with tables. Terms, Privacy, and Attribution use the prose
width. Invitation and invite-link pages are centred cards with the campaign, the inviter, and Accept
and Decline.

## Feedback and status

| Event | Pattern |
|---|---|
| A save, a copy, a sent RSVP | Toast |
| A form fails | Error summary, focused, and inline field errors |
| A page-level problem (paused game, closed account) | Notice at the top of the content |
| Long operations | The button shows a spinner and "Saving…" and is disabled; nothing else moves |
| Connection lost in play | The tracker shows "Reconnecting" with an icon; play continues by polling |

## Accessibility checklist

Every screen meets WCAG 2.2 AA:

- One `h1`; headings in order; landmarks `header`, `nav`, `main`, `footer`.
- Every control has a visible label or an accessible name; icon buttons have tooltips.
- Focus is always visible and never hidden behind sticky bars (2.4.11): sticky regions set
  `scroll-padding`.
- Targets are at least 24 × 24 px (2.5.8); controls here are 32 to 40 px.
- Colour contrast as in the Graphite token table; status never by colour alone.
- The game log is `role="log"`; "Your turn" and rejected actions use an alert region.
- The map is operable without dragging (2.5.7): every map target is also in the list view, and zoom
  has buttons.
- Dialogs and sheets follow the APG modal dialog pattern; non-modal panes do not trap focus.
- `prefers-reduced-motion` turns off transitions.

## Sources

- Foundry VTT v13 release notes (sidebar, chat field, notification tray, pause banner):
  https://foundryvtt.com/releases/13.341; combat tracker: https://foundryvtt.com/article/combat/
- D&D Beyond Maps and Game Log: https://www.dndbeyond.com/posts/1841
- Figma panels: https://help.figma.com/hc/en-us/articles/360039832014
- articy:draft Navigator and Flow: https://www.articy.com/help/adx/UI_Navigator.html
- Arcweave interface: https://docs.arcweave.com/introduction/quick-tour/ui
- Twine story map: https://twinery.org/reference/en/editing-stories/navigating.html
- Inky (inline errors, issue browser, play pane): https://github.com/inkle/inky
- VS Code problems: https://code.visualstudio.com/docs/editing/editingevolved
- GitHub dashboard: https://docs.github.com/en/account-and-profile/reference/personal-dashboard
- Linear inbox: https://linear.app/docs/inbox
- AI Dungeon play modes: https://help.aidungeon.com/faq/how-to-play
- GOV.UK error summary and check answers: https://design-system.service.gov.uk/components/error-summary/,
  https://design-system.service.gov.uk/patterns/check-answers/
- Android window size classes:
  https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
- WAI-ARIA APG grid and modal dialog: https://www.w3.org/WAI/ARIA/apg/patterns/grid/,
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/; ARIA log role:
  https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role
- WCAG 2.2 understanding documents: focus not obscured, target size, dragging movements, status
  messages (https://www.w3.org/WAI/WCAG22/Understanding/)
