# Replacing the pattern stops playback

Loading a pattern from the library and clearing the grid both halt the transport and clear
the playhead. Toggling a cell and retuning the tempo do not. The line is between editing
what is playing and changing what is being played: the scheduler re-reads the pattern every
tick precisely so an edit becomes audible without a break, and that is right for one cell
and wrong for a different piece of music.

This reverses v1.0.0, where clearing deliberately left the loop running — "an empty pattern
plays as silence rather than as a stop" — so that hits could be tapped straight back in over
a running pulse. That reading is not wrong; it lost to having one rule rather than two.

## Consequences

The rule lives in `src/state/session.svelte.ts`, a seam above both states, because transport
already imports pattern and the reverse would be a cycle. Every wholesale replacement goes
through that seam, so a later one — an imported file, an undo — inherits the rule instead of
having to remember it, and controls call the seam rather than `patternState` directly. The
live-erase workflow the v1 comment argued for is gone: clearing now costs a press of Play to
get the pulse back.
