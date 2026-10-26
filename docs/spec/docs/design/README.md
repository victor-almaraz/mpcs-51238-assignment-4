# Design System

The interface is called Margin. It treats the product as what it mostly is, a document editor: a page of content set like a book, a margin beside it for the editor's notes, and a desk around both for the software's controls.

## Principles

| Principle | Meaning |
|---|---|
| The page holds content | Everything a person writes or reads sits on a page: one column, Libertinus Serif. |
| The margin holds notes | Problems, hints, and the narrator's trace appear beside the line they concern, numbered. Nothing else goes in the margin. |
| The desk holds the software | Navigation, toolbars, and status, set in Libertinus Sans and kept quiet. |
| Icons for actions, names for places | Actions are icon buttons named on hover and focus. Sections, menus, and choices in play are words. |
| Colour means something | The lavender accent marks what can be acted on; red marks errors. Every status also has a shape or a word. |
| Depth by lightness | Desk, page, and raised surfaces differ in lightness. There are no shadows. |

## Documents

| Document | Contents |
|---|---|
| [foundations.md](foundations.md) | Layout, colour, typography, space and shape, motion, icons |
| [components.md](components.md) | Icon buttons and tooltips, fields, selection controls, menus, dialogs, toasts, status, margin notes, rule inserts, graphs, maps |
| [screens.md](screens.md) | Dashboard, character creation, campaign editor, adventure editor, play, narrow screens |
| [writing.md](writing.md) | Interface copy and the voices of the product |

Pages, routes, and behaviour are specified in [app-flow.md](../app-flow.md); this section specifies how they look.

## Sources of truth

| Item | Location |
|---|---|
| Colour, type, space, and size tokens | `design/theme.css` |
| Contrast minimums | [foundations.md](foundations.md#contrast); every token change is checked against them in both modes |
| Fonts | Libertinus 7.051 from github.com/alerque/libertinus, self-hosted |
| Interface icons | Lucide from github.com/lucide-icons/lucide, through `lucide-react` |
| Content icons | game-icons.net from github.com/game-icons/icons |
| Explorations | PDFs in `design/explorations/`: alternative palettes, typefaces, and icon sets that were compared. They are reference material, not specification. |

Licences for fonts and icons are listed in [LICENSES.md](../../LICENSES.md).

## Substitution

Margin is the reference design. A deployment MAY replace it with its own design system, documented in the application repository, that lays out the pages and regions of [app-flow.md](../app-flow.md) differently: for example, workspaces that fill the window instead of a page column, inline field errors and a problems list instead of numbered margin notes, and a persistent round and turn tracker instead of round status in the margin. A substitute design system keeps these requirements of Margin:

| Requirement | Source |
|---|---|
| Contrast minimums in both modes, for every token | [foundations.md](foundations.md#contrast) |
| Every status also has a shape, an icon, or a word; a screen with its colour removed loses no information | [foundations.md](foundations.md#rules) |
| One accent colour for what can be acted on, never decoration; one colour for errors and destructive actions only | [foundations.md](foundations.md#rules) |
| Reduced motion makes changes instant | [foundations.md](foundations.md#motion) |
| The interface icon vocabulary | [foundations.md](foundations.md#vocabulary) |
| Interface copy and voices | [writing.md](writing.md) |
| Self-hosted fonts and icons, with their licences on the attribution page | [app-flow.md](../app-flow.md#stack-constraints) |

Pages, routes, contents, and behaviour follow [app-flow.md](../app-flow.md) under either design.
