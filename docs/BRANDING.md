# Neistra brand implementation

Neistra (NAY-stra) is the Molecular Workspace formerly named MolWeave.
The primary tagline is **Shape molecular structure.** Interface language stays
scientific and direct: Import structures, Rotate selection, Save checkpoint.
The brand metaphor does not rename operations or add unimplemented features.

## Production assets

`apps/web/public/brand/` contains path-only SVG marks and outlined wordmark
lockups for light and dark surfaces, a monochrome mark, compact icons,
adaptive SVG favicon, 16px/32px raster favicon fallbacks and a 180px touch icon.
Generate them with `node scripts/build-brand-assets.mjs` using Node and
ImageMagick. Raster assets are rendered from vectors at 432 DPI before reduction.
The supplied raster artwork and brand guide are never modified or bundled.

The mark is a clean, flat construction of the supplied Sparked N. The spark
sits above the right stroke; the alternate spark-over-i wordmark is excluded.
Graphite/Steel strokes become light neutral strokes in dark mode; Ember and
Spark keep their identity. No outline, glow, flame or animation is added.
Glyph outlines are authored geometry, not runtime font references. No new
third-party font or artwork license is introduced, and no trademark claim is
implied by using the user-supplied identity.

Standalone clear space equals the rendered N height. The welcome lockup is
220px wide with 56px margin; the empty-project mark is 40px wide with 46px
margin. The header lockup is 113×32px; at the existing 840px breakpoint it
becomes a 32×32px compact icon. Toolbar/icon padding follows the guide's compact
application examples, distinct from standalone lockup clear space. Never
stretch or shrink the wordmark independently of the mark.

Brand images are decorative when a surrounding control or heading supplies
their meaning. The top-bar logo remains the keyboard-accessible Projects
action. The tagline appears on the welcome and repository presentation,
not around loaded scientific content.

## Compatibility

The backend and scientific model keep their existing MolWeave technical names.
Archives remain `.molweave.zip`; browser preferences remain under
`molweave-workspace-v1`; configuration remains `MOLWEAVE_*`. API/worker modules,
job/plugin identifiers, original uploads and server-provided diagnostics are
not rebranded by substitution. Version values remain synchronized and unchanged.
See D-048 for the boundary and rationale.

## Theme and typography contract

`apps/web/src/theme.ts` owns the seven brand primitives and all light/dark
semantic color values. Vite injects those CSS properties and synchronous legacy
preference restoration into the document head before the application module.
The viewer adapter consumes the same opaque Ash (`#F4F1EB`) / Graphite
(`#171A1F`) background values. No theme data enters projects, scenes or history.
Blocked browser storage permits session-only use; malformed values safely fall
back without executing persisted actions or accepting invalid layout shapes.

UI typography uses system sans-serif, the welcome tagline uses Georgia/Times,
and data/logs use system monospace. The size scale is 10/11/12/13/14/16px, with
10px restricted to compact supporting labels; dense workflows must remain
readable without clipping. Spacing uses 4/8/12/16/24/32px and radii 4/6px.
No font download, theme animation or scientific color substitution is added.

Ember is the light action background with white text, not Ash text. Dark actions
use Spark with Graphite text. Light secondary text is the derived `#555B63`,
not low-contrast Tempered; dark secondary text is `#BAC4CB`. Warning, error,
success and information each have distinct foreground/soft-surface pairs;
labels and icons continue to communicate status independently of color.
The source module is the authoritative reference for all derived shades.

Representative opaque contrast ratios (rounded to two decimals):

| Rendered semantic pair | Light | Dark |
| --- | ---: | ---: |
| Main text / workspace background | 15.47 | 15.47 |
| Secondary text / muted surface | 5.51 | 7.49 |
| Action text / action background | 4.53 | 9.85 |
| Warning text / warning surface | 6.13 | 8.19 |
| Focus indicator / surface | 6.51 | 8.57 |
| Strong control border / surface | 4.19 | 4.16 |

Token tests also check hover, selection, status and control pairs and verify
that every CSS variable resolves. Browser tests check restored first paint,
actual shell/WebGL pixels, vendor button colors and keyboard focus, and scoped
axe checks in both themes. These do not constitute a whole-product accessibility
certification; the workflow review and final qualification remain separate gates.
Mol* DOM controls are overridden only within the viewer host, including narrowly
scoped important declarations needed to supersede vendor toggle/focus rules.
The vendor attribution remains visible and receives an accessible link label.
