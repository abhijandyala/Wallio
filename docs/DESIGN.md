# Wallio Design System (v0.2)

Look and feel: **calm, precise, expensive.** Dark-first. Three brand colors, nothing else.
Code lives in `web/src/app/globals.css` (tokens) and `web/src/components/kit/` (foundation).

## Hard rules (these are what keep it from looking AI-generated)

1. **Use the whole width, lean right.** No sidebar. Content fills the screen on a 12-column grid; navigation lives in the slim Wallio rail on the left edge. Wide panels (tables, the main content) go on the right; narrow ones (inbox, summaries) on the left.
2. **No pills.** Buttons and inputs are radius 8, panels radius 20. No `rounded-full` anywhere except avatars if we ever add photos.
3. **Only the palette.** Mint-tinted blacks, Lavender, Lime, and the mint-gray text tiers (shared with the landing page). No amber, blue, or extra greens. Red is reserved for errors and destructive confirmations.
4. **No tag-title-description-subdescription stacks.** A block gets a **title** and **one** of: a value, a sentence, a list, or a table. Never a colored micro-label above the title, never a second line of fine print below.
5. **One line per row.** Lists and tables don't wrap a second detail line under each item. If it needs explaining, it goes on the detail page or in a tooltip.
6. **One loud thing per screen.** Either the pale accent panel or a primary button leads. Not both fighting.
7. **No decoration beyond the shared light.** The only gradients are the landing page's: the pale lavender-to-mint gradient (primary button, accent panel), a faint mint light at the top of each panel, and the dim drifting mint glow behind the app (`GlowCanvas`, strength 0.5, never under data). No other glows, orbs, sparkles, or mono uppercase eyebrows.
8. **Tight gutters.** Panels sit **12px** apart (`gap-gutter`), horizontally and vertically. Never 24px+ between panels. The page header sits **16px** above the content (`gap-section`). Content starts **24px** from the sidebar and the top.
9. **No highlight boxes.** Selected nav items, rows and options don't get a background fill on hover or select. State is shown with text color, the lavender icon, or the checkbox. No focus rings or tap highlights anywhere.

## Palette

| Token | Value | Use |
|---|---|---|
| `bg` | `#020806` | mint-tinted black canvas (same as the landing page) |
| `surface-1` / `-2` / `-3` | `#071810` / `#0C2219` / `#122D22` | panels / hover & inputs / menus & modals. Keep them opaque: sticky headers and fades rely on it |
| `line` / `line-strong` | mint `rgba(170,240,210)` at 9% / 16% | hairline borders |
| `text-1` / `-2` / `-3` | `#F2F7F4` / `#AAB7B1` / `#84918B` | primary / secondary / labels. All at least 4.5:1 on every surface |
| `lavender` | `#AD96F1` | active nav icon, "needs you" marks, dates that matter, charts |
| `lime` | `#58F6B1` | money saved, budget meter, "Tested", the winning bar |
| pale gradient | `#DDD0FF` → `#FFFDFA` → `#EFFFF8` → `#C9FFE6` | primary button (`.w-btn-primary`, slides on hover over 600ms) and the accent panel |
| `ink` | `#03140D` | text and buttons on lavender, lime and the pale gradient |
| `danger` | `#FF6B6B` | errors and destructive confirmations only |

## Type (Geist)

The **Wallio** wordmark is the one exception: **Poppins Bold**, via `Wordmark` / the `font-brand` utility. Never use Poppins anywhere else.

| Role | Size / line | Weight |
|---|---|---|
| Hero title | 32 / 38 | 500, -0.02em |
| Big number | 44 / 48 | 500, -0.02em |
| Page title | 28 / 34 | 500, -0.02em |
| Stat value | 28 / 32 | 500 |
| Panel title | 15 / 22 | 500 |
| Body | 14 / 20 | 400 |
| Label / meta | 13 / 18 | 400, `text-3` |

All money uses `.tnum` (even-width digits), right-aligned in tables, cents at 50% opacity. Unknown is "Unknown", never `$0`.

## Spacing and layout

- 4/8 scale. Gutter between panels **12** (`gap-gutter`). Header to content **16** (`gap-section`). Content inset **24** from sidebar and top. Panel padding **24**. Panel header height **56**. Table/list row height **56**.
- Rail 56px (44px phones). Content starts 24px right of the rail (16px on phones).

## Foundation components (`web/src/components/kit/`)

Build every page from these. Don't hand-roll new containers.

| Component | What it is |
|---|---|
| `AppShell` | The `RailNav` on the left edge + full-width content beside it. Wraps every page (in `layout.tsx`). |
| `RailNav` | The navigation. A slim rail on the left edge (56px, 44px on phones): W mark at top, "Wallio" vertical in Poppins Bold, waiting count at the bottom. Hover it (120ms delay) or click/tap it and every section slides out as a full-height card, layered left to right with rounded right edges, label rotated -90°. Current section is lavender, the rest graded darks. Hovering a card decodes its label, in place, into what that section does (`ScrambleText`), and decodes back on leave. Closing is one ease-in slide, rightmost card first. Leaving the area, Esc, or clicking outside closes it. Destinations live in `nav-items.ts`. |
| `PageHeader` | Page title, optional single subtitle line, actions on the right. |
| `Panel` | The container. Title + optional single action link. `variant="accent"` = lavender surface (once per screen). `flush` for tables and lists. |
| `Stat`, `StatStrip` | Label above a value. Strip = row of stats separated by hairlines. `tone="positive"` = lime value. |
| `Table`, `Th`, `Tr`, `Td` | One-line rows, hairline dividers, right-aligned numbers. |
| `List`, `ListItem` | One-line rows: title left, short meta right. `highlight` = lavender mark. |
| `Button` (`ui/button`), `ButtonLink` | Variants: `primary` (pale gradient), `secondary`, `ghost`, `inverse` (black, on lavender), `inverse-ghost`. Sizes `sm`/`md`/`lg`. |
| `Tag` | Evidence label: small square mark + word. Tested (lime), Researched (lavender), Your input, Sample data, Unknown. |
| `Money`, `NumberTicker`, `Meter` | Formatted cents, count-up numbers, thin lime progress bar. |
| `KeyValue`, `KeyValueRow` | Label left, value right, one line per row. Facts, settings, approval details. |
| `ChoiceList` | Selectable one-line rows (radio = square dot, checkbox = check). Lavender when selected. |
| `StepList` | Live agent run steps: waiting, working, done (lime), blocked, failed. |
| `Segmented` | Small switcher for filtering one view. Not for page navigation. |
| `ScrambleText` | Decode effect: glyphs flicker in at random positions in lime and lavender, then lock to the real text (Geist Mono, uppercase). Used for nav hints only. Respects reduced motion. |
| `charts.tsx` | Hand-built charts, no library: `BlockBarChart` (flat-shaded 3D blocks: front, lighter top, darker side; dim lavender history, bright lavender current with a lime edge; hover lights a block and shows a readout), `Sparkbars`, `SegmentBar` + `SegmentSwatch`, `EvidenceDots`, `RenewalTimeline`, `PassBar` (same 3D blocks, lime for the winner), and the `hatch()` texture (empty-state examples and category segments only). |
| `ToolMark` | Two-letter monogram for a tool. |
| `LogoMark` | The W mark, white (`currentColor`). |
| `Wordmark` | W mark + "Wallio" in Poppins Bold. Used where a horizontal lockup is needed; the rail sets the same Poppins text vertically. |
| `PlannedPage` | Honest placeholder for unbuilt tabs. |

## Libraries

shadcn/ui on Base UI (dropdown, tooltip), Tailwind v4, Phosphor icons, Motion (sparingly: count-ups, nothing that loops).

## Research notes (5 Nov 2026)

Measured live: Ramp (TWK Lausanne, 14/20 body, 400-weight headlines, one lime CTA, 12px cards), Mercury (Arcadia, 480-weight headlines, 12px cards), Linear (Inter, bg `#08090A`, hairlines at 8% white, text tiers `#F7F8F8`/`#D0D6E0`/`#8A8F98`), Datadog (National, dense 4px radius). Shared pattern: light weights, one accent, depth from surface steps and hairlines instead of shadows.
