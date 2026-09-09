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
