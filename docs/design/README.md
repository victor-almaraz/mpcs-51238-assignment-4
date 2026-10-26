# Cadmium pattern library

The interface patterns of this application. They replace the specification's Margin design
(`cadmium-spec/docs/design/`) for this application; see
[SPEC_ISSUES.md](../../SPEC_ISSUES.md#design-system). Routes, contents, and behaviour follow
`cadmium-spec/docs/app-flow.md`. The patterns follow how comparable tools lay out the
same tasks; [Sources](#sources) lists them.

## Principles

| Principle | Meaning |
|---|---|
| Work surfaces fill the window | Play and the adventure editor are workspaces of panes that use the full width, not a centred column. |
| Lists lead to details | Hub pages list things; each row or card opens a detail page that holds that thing's actions. |
| Problems appear where they are and in one list | A field or entity shows its own error; a count in the toolbar opens the list of all of them. No numbered footnotes. |
| Status is always in view | Round, turn, save state, and connection sit in a bar that does not scroll away. |
| The story is set like a book; the software is not | Narration, room text, briefs, and page and section titles use Libertinus Serif. Controls, data, and card titles use the system font. |
| Colour means something | The cadmium orange accent marks what can be acted on and the current selection; cadmium yellow marks what is happening now; cadmium red marks errors and destructive actions. Every status also has an icon or a word. |

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

The Graphite neutrals stay, with their light and dark values and contrast minimums: `page`, `desk`,
`raised`, `rule`, `border`, `ink`, `muted`. The colours are named for cadmium pigments:

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `accent` | `#B4490F` cadmium orange | `#F5A66A` | Links, primary buttons, selection, the current item, focus rings, the logo |
| `pigment` | `#F2C14E` cadmium yellow | `#EDB93B` | What is happening now (see Identity); a fill behind `pigment-ink` only |
| `danger` | `#A81E2A` cadmium red deep | `#FF9AA2` | Errors and destructive actions |
| `warning` | `#7F5B00` cadmium yellow deep | `#E5C65C` | Waiting states (lobby, maybe, draft) and warnings |
| `success` | `#006B3C` cadmium green | `#86CFA4` | Done, available, published |

Each has `-soft` (a tinted background) and the accent also `-strong` (hover) and `-line` (decorative
borders); `selection` tints selected rows. Accent, danger, warning, and success text meet 4.5:1 on
`page`, `desk`, and their `-soft` tint in both themes, and white text meets 4.5:1 on an accent fill.
Danger takes the deep, blue side of cadmium red and warning the deep side of cadmium yellow, so
neither shares the accent's hue and no status reads as an action (`app/theme.css`).
Surfaces: `desk` behind workspaces and hub pages; `page` for cards, panels, and
inputs; `raised` for menus, dialogs, and sheets. The theme follows the system unless the user picks
Light or Dark in Settings.

### Typography

| Role | Face | Size / line height |
|---|---|---|
| Page title (`display`, `title` compact) | Libertinus Serif, semibold | 34 / 40 px (28 / 34 compact) |
| Section heading (`section`) | Libertinus Serif, semibold | 21 / 28 px |
| Workspace centre-pane title (`section`) | System UI, semibold | 21 / 28 px |
| Card title: cards, panels, field groups, steps, danger zones (`heading`) | System UI, semibold | 16 / 24 px |
| Body and controls | System UI | 15 / 22 px |
| Label; group label inside a card or pane (medium, `muted`) | System UI, medium | 14 / 20 px |
| Caption and metadata | System UI | 13 / 18 px |
| Story (narration, room text, briefs) | Libertinus Serif | 17 / 27 px; italic for emphasis |
| Ids, YAML, code | System monospace | 14 / 20 px |

The system stack is `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Libertinus Serif
(Regular, Italic, Semibold; SIL Open Font License) is served from `/fonts/` with `font-display: swap`.
Sentence case everywhere. Numbers in trackers, stats, and tables use tabular figures.

Three weights: regular for body text, values, and controls' content; medium for labels, buttons,
tabs, navigation, and badges; semibold for titles and a card's one key value. No bold.

**Fewer words.** Text is there only when it tells the reader something the layout does not:

| Rule | Applies as |
|---|---|
| A description adds to its heading | No page or section description that restates the title or lists what the page shows. A description stays when it sets a scope (Sessions in the next 7 days) or a constraint (Read-only; it changes in play). |
| The default state has no badge | Available characters, campaigns the viewer plays in, and adventures without problems carry no badge; only a state that differs (You run, In Thursday table, 2 problems, Retired) does. |
| A state is said once | Either a badge or a metadata line, not both: an in-game character's badge names the game. |
| A linked title is the way in | A row or card whose title is a link has no Open button. |
| A card has three lines at most | Title, one metadata line, and one line of description or action. |
| Badges are a word on a tint | No dot, except a live state (Live now). |

### Hierarchy

Two rules order every page: **alignment** (things that belong together share an edge) and
**weight** (a thing's size, boldness, colour, and border match its rank). The levels of the
Typography table are the only heading sizes; nothing between them.

**Alignment**

| Rule | Applies as |
|---|---|
| One content edge | Breadcrumb, page title, section headings, tab labels, side navigation labels, and card edges start on the content's left edge. Controls with a hover area (tabs, side navigation links) keep their label on the edge: tabs have no side padding, and navigation links take a negative margin equal to their padding. |
| One card inset | Every card, panel, field group, step, and danger zone has 16 px padding at every size, so the content of stacked cards shares one inner edge. Standalone pages (sign-in, invitations) are the one exception: a single panel at 24 px (32 px from medium). |
| One right edge | Page actions, section actions, and the aside end on the content's right edge; card actions end on the card's inner edge. |
| Columns are whole | Anything placed in a card grid spans whole grid columns. A detail page's aside starts level with the first section of the main column. Sections placed side by side keep one-line descriptions, so their cards start on one line. |
| A button follows its field | A button that acts on one field sits on the field's bottom edge, 12 px after the control; the control fills its field. |
| Label and value columns | Facts are a `DescriptionList`: terms in one column, values in the next. |

**Weight**

| Rule | Applies as |
|---|---|
| Sections head content, cards hold it | A section heading (serif) sits above its cards, never inside one. Inside a card the only heading is a card title (16 px), and under it group labels (14 px, medium, `muted`). |
| Pages pick one structure | Hub and detail pages are sections of cards, and a detail page's aside is `Panel`s. Form pages (new, edit, settings, publish) are field groups under the page title, with no section headings. |
| No cards in cards | A choice between things (rules systems, roles) is a grid of cards inside a section, not cards inside a card. |
| One primary button per view | Every other button is secondary or quiet; destructive buttons are `danger`. |
| Emphasis is spent once | A thing gets one emphasis, not a stack: a destructive action is a `DangerZone` (red border and a `danger` button; the title stays ink, with no icon); a status is a badge; the current item is accent. Bold is for titles and the one key value of a card (a session's date). |
| Ink, muted, accent | Titles and values are ink; descriptions, hints, and metadata are muted; accent is only for links, selection, and the current item. |

`pnpm audit:ui` checks four of these on every screen: headings only at the scale's sizes, no serif
heading inside a card, the 16 px card inset, and the page title, section headings, and tab labels on
one content edge.

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
in `currentColor`. The icon vocabulary
of `cadmium-spec/docs/design/foundations.md` (Icons, Vocabulary) stands: one concept, one icon. The
product mark is the cadmium tile, Cd, drawn as a Lucide-style icon (`components/ui/logo.tsx`).

**Icon or word.** An action is an icon-only button with a tooltip when its icon is conventional and
the action is one of:

- repeated on every row (remove, delete, revoke: `UserMinus`, `Trash2`, `Ban`, in `danger`);
- a toolbar control or toggle (undo, redo, Edit as YAML, List view, snapshots, export, zoom);
- a secondary create action in a section header on the dashboard (`Plus`, outlined);
- an app-frame destination (notifications, settings, menu, close).

An action keeps its words when it is the view's primary action, when it submits a form, when two
destructive actions sit together (Cancel this one, Cancel the series), or when no icon names it
without doubt (Advance, Playtest, Continue). Metadata stays in words.

**Tooltips** (`components/ui/tip.tsx`) show the control's accessible name, on hover and on keyboard
focus, under the control (aligned to its end at the right edge of a bar). The pointer can move onto a
tooltip, and Escape hides it (WCAG 1.4.13). Touch screens show tooltips on focus only. Non-interactive
status (the round's mode and resolution, the time left) carries an icon with a `title` and a visually
hidden word.

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
| Form | New character, new campaign, new adventure, campaign editor, settings sections, accept terms | Page header; fields in titled groups; actions at the foot, primary first; after a failed submit, the error in a `danger` notice under the fields |
| Workspace | Play, adventure editor | A toolbar; panes; a status bar. See [Play](#play) and [Adventure editor](#adventure-editor) |

## Components

All live in `components/ui/`. Each is the only way the application draws that thing.

| Component | Pattern | Accessibility |
|---|---|---|
| `Button` | Variants `primary` (filled accent; one per view), `secondary` (outline), `quiet` (text), `danger` (outline red; filled only in a confirm dialog). Sizes `md` (36 px) and `sm` (32 px). Optional leading icon | A real `<button>` or `<a>`; disabled buttons say why in adjacent text |
| `IconButton` / `IconLink` | 36 px square (32 px dense), icon only; tones `ink`, `danger`, and `outline` (toolbar toggles, with `aria-pressed`) | `aria-label` and a tooltip with the same words |
| `PageHeader` | Optional breadcrumb, title, description, status, and actions on the right (under the title on compact) | One `h1` per page |
| `Section` | Titled region with optional actions | `h2`, labelled `section` |
| `Card` | `page` surface, `rule` border, 6 px radius, 16 px padding; a whole-card link uses the title as the link | The title is the link text; no nested interactive elements inside a whole-card link |
| `Panel` | A card with a card title, for a detail page's aside | `h2` at the card-title size |
| `FieldGroup` | A card of related fields with its legend as the card title, for form pages | `fieldset` and `legend` |
| `DangerZone` | The page's destructive action, last: red border, ink card title, one sentence, a `danger` button | Labelled `section` |
| `List` / `ListRow` | Rows with an optional icon, a title, metadata, a status badge, and trailing actions | A `ul`; trailing actions are separate buttons |
| `ElementTile` / `DateTile` | The identity tile in sizes `sm` (40 px, cards and avatars), `md` (56 px), and `lg` (72 px, the dashboard's next session), tones `accent`, `pigment`, `neutral`; `elementSymbol` derives the symbol from a name | Decorative unless given a `label` |
| `Badge` | A word on a tint, with an optional icon (a dot only for a live state): neutral, accent, success, warning, danger, and pigment (Your turn, Live now) | Colour is never the only signal |
| `Field` | Label above the control, hint under the label, error under the control with an icon | `label` bound to the control; hint and error joined by `aria-describedby`; `aria-invalid` on error |
| `TextInput`, `TextArea`, `Select`, `Checkbox`, `Radio` | 40 px controls (checkboxes 20 px with a 40 px hit area) | Native elements |
| `Notice` | Inline message with icon: info, success, warning, danger | `role="status"` for success, `alert` for errors |
| `Tabs` | Underlined tabs for sections of one page; labels sit on the content edge, 24 px apart | APG tabs: arrow keys move, `aria-selected` |
| `EmptyState` | Centred icon, one sentence, and the action that fills the space | |
| `Sheet` / `Dialog` | Dialog centred; sheets slide from the side (expanded) or the foot (compact) on `raised` | APG modal dialog: focus moves in, stays in, Escape closes, focus returns |
| `ConfirmButton` | A `danger` button (or icon button) for an action that cannot be undone, such as End or Remove member; it opens a centred dialog with the question, one sentence on the consequence, Cancel, and a filled `danger` button that submits | APG alert dialog: Cancel has focus first, Escape and the backdrop close, focus returns to the trigger |
| `Toast` | Short confirmations (Saved, Copied) at the foot, 4 s | A polite live region |
| `DescriptionList` | Facts as term and value | `dl` |

## Screens

### Dashboard

A hub. **Needs you** first: invitations to answer, RSVPs due for the next session, and drafts with
problems, each with its action inline. Then **Next session** as a card (date in the viewer's time zone,
game, RSVP buttons, Join when it is live). Then **Your games**: cards with the game, campaign, the
user's character, a status badge, and Continue. Then **Campaigns**, **Characters**, and
**Adventures** as card grids with a New button in each section header and an empty state when empty.

### Campaigns

A hub: **You run** and **You play** as card grids, the code form, then **Archived** as a list with
Unarchive on each campaign the viewer runs, and **Recently deleted** (shown when not empty) with each
deletion's date, the last day to restore it, and Restore. The campaign editor ends with Archive
campaign in a plain card (or the archived notice with Unarchive), then Delete campaign in the danger
zone, confirmed by typing the title. An archived campaign's page shows the archived notice under its
header.

### Character creation

One page in titled steps that can be revisited: System, Role, Abilities (a checklist counted against
six, with the remaining count beside the heading), Name and description, and, for Cadmium, For
campaign with its module facts. A summary card beside the steps (under them on compact) lists each
choice with a Change link. Create character is the primary button, disabled with its reason until the
choices are complete.

Information for new players sits behind info icons (`components/ui/with-info.tsx`), so the choices stay
short: an icon button beside the subject, named for it ("About the fighter"), with `aria-expanded`,
shows the details under it. Beside the Role step's hint, "New to Quest?" (or Cadmium) gives attributes,
roles, AP, rolls, and HP in one sentence each, with the system's numbers. A role's icon gives its
learning paths and how many abilities suggest it. An ability's icon gives its description where its
pack ships one, its cost, roll, target, and path, and its effect in a sentence. The character page's
abilities have the same icons (`components/systems/ability-info.tsx`, for Quest and Cadmium).

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

A form page of field groups down one column: Account, Appearance, Reminders, Calendar, Your data,
and, last, Delete account as a `DangerZone`.

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
- Colour contrast as in the Colour table, in both themes (`pnpm audit:ui --scheme dark` checks the dark one); status never by colour alone.
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
- GOV.UK check answers: https://design-system.service.gov.uk/patterns/check-answers/
- Android window size classes:
  https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
- WAI-ARIA APG grid and modal dialog: https://www.w3.org/WAI/ARIA/apg/patterns/grid/,
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/; ARIA log role:
  https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role
- WCAG 2.2 understanding documents: focus not obscured, target size, dragging movements, status
  messages (https://www.w3.org/WAI/WCAG22/Understanding/)
