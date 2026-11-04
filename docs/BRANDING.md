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

Canonical backend namespaces and metadata use Neistra. `NEISTRA_*` settings take
precedence over accepted `MOLWEAVE_*` aliases; old Python imports and source roots
remain thin compatibility entry points. Existing data stores are reused in place.
Fresh installations use `.neistra/neistra.db`; ambiguous/invalid stores fail safely.
Current UI exports `.neistra.zip`, imports accept both suffixes, and a secondary
Compatibility option exports `.molweave.zip` for older releases. Existing API
requests omitting filename style retain the old download suffix.

Preserve browser key `molweave-workspace-v1`, serialized MIME/job/plugin/model IDs,
historical evidence and original uploads. Never rewrite user names or server
provenance by text substitution. Versions remain coordinated; issue99 targets
minor0.27.0. D-150 and the approved issue99 feature contract supersede only the
technical-name retention provisions of the initial presentation rebrand.

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

Token tests check hover, selection, status and control pairs and verify that
all CSS variables resolve. Browser coverage checks restored first paint, actual
shell/WebGL pixels, application control focus and scoped axe checks in both themes.

The viewer uses a minimal canvas composition. Native viewport controls, settings,
hover-information overlays, notifications, task UI and logo are not mounted.
Application controls and feedback use Neistra tokens; scientific molecular colors
remain independent. The existing canvas orientation axes are retained by explicit
user guidance. Required canvas layout/background styles remain. Attribution
is maintained outside the viewer in [third-party notices](THIRD_PARTY_NOTICES.md)
and shipped license files. Historical native-popup evidence remains historical;
D-149 and the [issue #96 contract](plans/issue-96-application-owned-viewer.md)
govern the current interface boundary and its qualification status.

## Repository presentation

README light/dark lockups live in `docs/assets/`. Their 602×314 viewBox adds
100 units of clear space on every side of the 402×114 master. The same asset
generator produces them; no duplicated drawing or runtime font is involved.
Raster icons are stripped of timestamps/metadata, making repeated generation
byte-identical while preserving decoded pixels. Repository screenshots are
native, lossless 1440×900 captures of the actual 1STP fixture workspace in both
themes, with a descriptive entry name set through the normal rename workflow.
They are documentation assets, not part of the application bundle.

The private JavaScript names are `neistra` and `@neistra/web`; dependency and
application versions are unchanged. See [residual-name audit](REBRANDING_NAME_AUDIT.md)
for compatibility, historical and fixture exceptions. External rename and
release publication are separate from these local presentation changes.
