# What v1 leaves out, and the three doors it holds open

v1 is a two-bar sixteenth-note sketchpad for hi-hat, snare and kick. Everything below was
deferred deliberately rather than overlooked, and only three of them have a door held open —
each because holding it open cost nothing at the time.

- **Articulations** — flams, drags, accents and ghost notes. A cell is a boolean, so widening
  it to carry an articulation is a mechanical, type-checked refactor rather than a redesign.
  The GMRockKit's softest snare and hardest rimshot are the samples that arrive with ghost
  notes and accents.
- **More bars** — `BARS` is a constant and every bar boundary is derived from it, so a longer
  pattern is a data change. Nothing hardcodes two.
- **A ride cymbal** — the closed hi-hat sits in the space above the top line, leaving the top
  line itself free for the ride at its conventional position (`src/core/pattern.ts`).

Nothing else on the list is anticipated anywhere in the code, and none of it should be
designed around beyond this paragraph: further instruments (open hi-hat, ride bell, crash,
toms, cowbell), other time signatures, triplet subdivisions, drag-to-paint or any gesture
beyond tap-to-toggle, undo/redo, a metronome, a count-in, swing, per-hit velocity,
round-robin or velocity-layered samples, sharing of any kind (no URL-encoded patterns, no
server, no accounts, no second saved pattern), export formats other than PNG (no MusicXML,
MIDI, PDF or audio), and continuous integration or hosting.

Styling is plain scoped CSS, no framework, light theme only. Visual refinement is a later
pass, not an oversight.

## Consequences

Those three doors are the only ones. Everything else on the list has design work in front of
it, and a request for one is not a small change on the grounds that v1 kept it in mind — v1
specifically did not. Time signatures and triplets in particular land on the beat ceiling
(ADR 0001), which assumes four sixteenths to a beat.
