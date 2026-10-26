# Foundations

## Layout

Every editing and play screen has three zones.

| Zone | Width | Holds |
|---|---|---|
| Desk | The window | Top bar (48 px), section navigation (12rem), toolbars, status bar |
| Page | 34rem for prose and forms; up to 48rem for graphs | Content: forms, rule inserts, graphs, the play log |
| Margin | 14rem, after a 2rem gutter | Numbered notes about lines on the page |

The page is centred in the space to the left of the margin. Text is left-aligned; only empty-state messages are centred. Prose runs 66 to 72 characters per line.

### Breakpoints

| Width | Layout |
|---|---|
| 1280 px and wider | Navigation, page, and margin side by side |
| 1024 to 1279 px | The margin becomes a drawer, opened from the note count; each noted line shows its gutter mark |
| Below 1024 px | Notes render under their line, marked with a down arrow and their number. Navigation becomes a menu. The page fills the width with 16 px insets |

## Colour

The palette is Graphite: warm pencil greys with a lavender accent. Light and dark modes share token names. The theme follows the system setting unless the user picks Light or Dark in Settings.

### Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `page` | `#FFFFFF` | `#3B3937` | Pages, inputs |
| `desk` | `#EEECEA` | `#2A2827` | Application ground, disabled fills |
| `raised` | `#FFFFFF` | `#494746` | Menus, dialogs, popovers |
| `rule` | `#DBD9D7` | `#5A5756` | Dividers and hairlines only |
| `border` | `#878481` | `#888682` | Outlines of inputs, checkboxes, radios |
| `ink` | `#282624` | `#F0EEEA` | Text, headings, icons, graph lines |
| `muted` | `#6A6761` | `#C3BDAE` | Secondary text, placeholders, hints |
| `accent` | `#604792` | `#C3B2F1` | Links, the primary button, focus, selection, trace notes |
| `accent-strong` | `#4A3079` | `#D6C7FF` | Primary button hover and pressed |
| `accent-soft` | `#F1EEFC` | `#4A435B` | Selected rows, tokens, active toggles, current section |
| `accent-line` | `#BCAFDF` | `#7E729F` | Underlines of reference tokens at rest |
| `danger` | `#A13124` | `#F2998A` | Errors and destructive actions |
| `danger-soft` | `#FDF0EE` | `#563E3A` | Behind an error note or field in focus |
| `warning` | `#845A0F` | `#E7BC81` | Warnings |
| `warning-soft` | `#FCF2E5` | `#4F4333` | Behind a warning in focus |
| `success` | `#376F44` | `#96CAA0` | Saved, valid, published |
| `success-soft` | `#EDF6EE` | `#3A4A3D` | Behind a success message |
| `selection` | `#E1D8FC` | `#504765` | Selected text |

Values are defined in OKLCH and stored as hex in `design/theme.css`.

### Contrast

| Pairing | Light | Dark | Minimum |
|---|---|---|---|
| `ink` on `page` | 15.1:1 | 9.9:1 | 7:1 |
| `muted` on `page` | 5.6:1 | 6.1:1 | 4.5:1 |
| `accent` on `page` | 7.5:1 | 6.0:1 | 4.5:1 |
| `danger` on `page` | 7.0:1 | 5.3:1 | 4.5:1 |
| `warning` on `page` | 6.1:1 | 6.5:1 | 4.5:1 |
| `success` on `page` | 6.0:1 | 6.2:1 | 4.5:1 |
| `border` on `page` | 3.7:1 | 3.2:1 | 3:1 (WCAG 1.4.11) |

Every token change is checked against these minimums in both modes, including text on desk, raised, selection, and soft tints.

### Rules

- The accent marks what can be acted on: links, the primary button, focus, selected items, underlined references. It is never decoration.
- One filled primary button per view.
- Red marks errors and destructive actions only.
- Soft status tints appear behind a note or field only while it is in focus.
- Players are told apart by name and indentation, never by colour.
- Every status also has a shape or a word: note glyphs, status dots with labels, anchor bars with numbered gutter marks. A screen with its colour removed loses no information.

## Typography

The family is Libertinus, under the SIL Open Font License, downloaded from its repository and served from the application's own domain. No font is requested from a third-party service.

| Face | Role |
|---|---|
| Libertinus Serif | The story: prose, narration, room text, briefs, headings |
| Libertinus Serif Display | Titles at 40 px and above |
| Libertinus Sans | The software: controls, labels, notes, status, tooltips |
| Libertinus Mono | Ids, YAML, the advanced editor |

### Scale

| Style | Face and weight | Size / line height | Use |
|---|---|---|---|
| Display | Serif Display | 40 / 46 px | Adventure and campaign titles on their overview pages |
| Title | Serif Semibold | 28 / 34 px | Page titles |
| Heading | Serif Semibold | 21 / 28 px | Record titles: an arc, a room, an NPC |
| Prose | Serif Regular | 17 / 27 px | Narration, briefs, room text |
| Prose small | Serif Regular | 15 / 23 px | Narration inside rule inserts and topic cards |
| Control | Sans Regular | 15 / 20 px | Inputs, menus, tabs |
| Label | Sans Bold | 14 / 20 px | Field labels, button labels, note titles, table headers |
| Caption | Sans Regular | 13 / 18 px | Hints, metadata, note bodies, tooltips |
| Code | Mono Regular | 14 / 20 px | Ids and YAML |

Libertinus has a small x-height, so prose is set at 17 px rather than 16. Narration uses Serif Italic for emphasis. Sentence case everywhere; no capitals or letter-spacing for labels. Numbers in the round bar, stats, and tables use tabular figures (`font-variant-numeric: tabular-nums`).

### Font files

1. Take `LibertinusSerif-Regular`, `-Italic`, `-Semibold`, `-SemiboldItalic`, `LibertinusSerifDisplay-Regular`, `LibertinusSans-Regular`, `-Italic`, `-Bold`, and `LibertinusMono-Regular` from the release archive, with `OFL.txt`.
2. Subset each to Latin, Latin Extended-A, general punctuation, and arrows with `pyftsubset`, keeping `kern`, `liga`, `tnum`, `onum`, `lnum`, and `smcp`; output WOFF2 (about 24 KB per style).
3. Serve from `/fonts/` and load with `next/font/local` or the `@font-face` rules in `design/theme.css`, with `font-display: swap`. Preload Serif Regular and Sans Regular only.

## Space, shape, and depth

| Property | Value |
|---|---|
| Spacing | 4 px base: 4, 8, 12, 16, 24, 32, 48, 64 |
| Radius | 3 px on controls and cards; 0 on pages, panels, and canvases; full on status dots |
| Borders | 1 px `border` on controls; 1 px `rule` on dividers and page edges |
| Focus | 2 px `accent` ring with 2 px offset on every interactive element; never removed |
| Depth | Desk, page, raised, each lighter than the last. Raised surfaces have a 1 px `border`. No shadows |

## Motion

Menus, drawers, and tooltips open in 120 ms with ease-out. Nothing animates on page load. With `prefers-reduced-motion`, changes are instant.

## Icons

### Interface icons

Lucide (ISC licence), imported one icon at a time from `lucide-react` with a pinned version.

| Property | Value |
|---|---|
| Size | 20 px; 16 px in dense rows and navigation |
| Stroke | 1.75 px with `absoluteStrokeWidth`, so the line is the same at every size |
| Colour | `ink`; `accent` when active or inside the primary button; `muted` when decorative |
| Active state | `accent-soft` background with the icon in `accent`. Lucide has one weight, so state is never shown by a filled icon |

### Vocabulary

| Concept | Lucide icon | Concept | Lucide icon |
|---|---|---|---|
| Add | `plus` | Adventure | `book-open` |
| Delete | `trash` | Location | `map` |
| Publish | `upload` | NPC | `drama` |
| Playtest | `play` | Item | `backpack` |
| Pause | `pause` | Flag | `flag` |
| Undo / Redo | `undo-2` / `redo-2` | Rule | `zap` |
| Edit as YAML | `code` | Locked door | `lock` |
| Search | `search` | Secret | `eye-off` |
| Settings | `settings` | Roll | `dices` |
| Notifications | `bell` | Attack | `swords` |
| Invite player | `user-plus` | Ability | `wand-sparkles` |
| Schedule | `calendar` | Rest | `moon` |
| Copy | `copy` | Talk | `message-circle` |
| Invite link | `link` | Move | `footprints` |
| More | `ellipsis` | Examine | `eye` |
| Close | `x` | Character | `user` |
| Help | `circle-question-mark` | Health | `heart` |
| Export | `download` | | |

One concept, one icon, everywhere. A concept not in this table is added to it before use.

### Content icons

Game-icons.net (CC BY 3.0): filled silhouettes that authors choose for items, abilities, creatures, and room features. They appear at 24 px in inventories, the character sheet, and graph nodes, and are never used for interface actions. Each shipped icon's artist is credited on the attribution page.
