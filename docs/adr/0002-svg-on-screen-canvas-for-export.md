# SVG on screen, a fresh canvas render for export

The score is drawn twice from one `Score` through one drawing routine: to SVG for
display, and to an offscreen canvas at 2× for the PNG export. Rasterising the on-screen
SVG instead would require base64-inlining the music font into the markup, and without
that the PNG comes out with no noteheads at all — re-rendering from the `Score` sidesteps
the problem rather than working around it.

## Consequences

The export path has no container to measure, so it uses a fixed logical width and always
lays both bars on one system. It also omits the playhead and the measure highlight, which
falls out of re-rendering rather than needing to be undone.
