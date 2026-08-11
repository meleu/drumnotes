# The v1.0.0 baseline, and the price of going past it

v1.0.0 is a two-bar sixteenth-note sketchpad for hi-hat, snare and kick: tap cells on a
grid, read the groove back as engraved notation, hear it loop, export a PNG, and find it
still there on the next visit. It is deployed as a static site, with lint, typecheck and
both suites gating every push. That is the whole of it, and this ADR is the list of what it
is not — deferred deliberately rather than overlooked.

Nothing on that list is forbidden now. The tag is the point where the scope bar comes down
and each item becomes buildable when it is asked for. What the list still carries is the
price.

Three cost almost nothing, because holding the door open cost nothing at the time:

- **Articulations** — flams, drags, accents and ghost notes. A cell is a boolean, so widening
  it to carry an articulation is a mechanical, type-checked refactor rather than a redesign.
  The GMRockKit's softest snare and hardest rimshot are the samples that arrive with ghost
  notes and accents.
- **More bars** — `BARS` is a constant and every bar boundary is derived from it, so a longer
  pattern is a data change. Nothing hardcodes two.
- **A ride cymbal** — the closed hi-hat sits in the space above the top line, leaving the top
  line itself free for the ride at its conventional position (`src/core/pattern.ts`).

Everything else has design work in front of it and is anticipated nowhere in the code:
further instruments (open hi-hat, ride bell, crash, toms, cowbell), other time signatures,
triplet subdivisions, drag-to-paint or any gesture beyond tap-to-toggle, undo/redo, a
metronome, a count-in, swing, per-hit velocity, round-robin or velocity-layered samples,
sharing of any kind (no URL-encoded patterns, no server, no accounts, no second saved
pattern), and export formats other than PNG (no MusicXML, MIDI, PDF or audio).

Styling is plain scoped CSS, no framework, light theme only. Visual refinement is a later
pass, not an oversight.

## Consequences

Three doors, and no more. A request for anything else is not a small change on the grounds
that v1 kept it in mind — v1 specifically did not, and an estimate should start from that.
Time signatures and triplets in particular land on the beat ceiling (ADR 0001), which
assumes four sixteenths to a beat: they are not a feature to add but a rule to reopen.
