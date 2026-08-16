# Grace hits sound before the beat, and dynamics are recordings

Two decisions about how an articulation reaches the ear, kept together because both are
about the moment a cell is handed to the hardware.

## Dynamics are chosen, not scaled

An accent plays a harder recording, a ghost note a softer one — `-Hardest` and `-Softest`
against the plain rung, which is `-Med` for every instrument but the closed hi-hat, whose
recordings are loud enough that its plain hit reads from `-Soft`. Which file a rung names
is the audio adapter's business; the rungs themselves are the domain's. There is no gain
stage anywhere and no per-hit velocity,
which ADR 0004 listed as unanticipated and which stays that way. A hit struck harder is
not the same hit turned up: the attack changes, the ring changes, and a kit that ships
five dynamics per instrument already has all of it recorded. The price is the kit's
weight — four samples per instrument instead of one — and the grid still waits for every
one of them to decode before a cell is tappable, because an audition that plays the wrong
sound is worse than one that waits.

## Grace hits precede their own step

A flam leads its hit with one grace hit, a drag with two, at a lead of
`min(20ms, step ÷ 3)`. The lead is real time rather than a subdivision: a flam is a
gesture of the hand and does not scale with tempo, so a proportional lead would read as a
written 32nd at 40 BPM and be inaudible at 240. The ceiling exists only because a drag's
two grace hits at a fixed lead would otherwise reach back past the previous sixteenth at
some tempo; at 20ms the fastest playable step still holds one, with almost nothing to
spare, and the cap stays as the guard.

The lead was 30ms to begin with, which is a flam a drummer would recognise but a drag
whose accent is heard arriving late: the ear takes the first stroke of an ornament as the
beat, and 60ms of grace hits ahead of the step is enough to hear the backbeat lagging.
Tightening it to 20ms keeps the drag twice the flam's width — which is what tells the two
apart by ear — inside a span the beat survives. Tightening it further, to 15ms, starts
shading a drag into a buzz.

This dents the tiling invariant ADR 0003 rests on. Windows were half-open and abutting so
that every hit was handed over exactly once; a grace hit belonging to the step at a
window's opening edge sounds *before* that edge, in a window already closed. Handing the
hardware a time in the past sounds it immediately, which collapses a flam into a smear.

So the window moves rather than the music. A tick's horizon runs forward by the longest
lead the vocabulary allows — two grace leads, a drag's first — and every sound of every
step in the window is emitted at its own time, some of them behind the step that owns
them. The bookkeeping stays in step time rather than sound time, which is what keeps a
tempo change from dropping or doubling a step at the seam: the lead moves with the tempo,
and a window edge measured in sound time would move with it.

Play sets the loop's origin a longest-lead further out to match, so the gap between the
press and the *first sound* — grace hit or not — stays exactly the slack it was.

Windows still tile, every sound is still handed over once, and none of it depends on the
lookahead happening to be longer than the lead.

The rejected alternative was to put the grace hit on the beat and delay the main hit by
the lead. Nothing would ever schedule into the past, but a flam's primary stroke *is* the
beat: the backbeat would drag against the kick and against the playhead.

## Consequences

The scheduler's window arithmetic is now tempo-dependent in two places rather than one —
the step duration and the grace lead both derive from tempo, and a retune moves both. The
lead is bounded by a third of a step, so it can never swallow a whole step however the
tempo is driven.

Playback and the playhead part company by up to a drag's two leads on ornamented steps, by design: the
playhead follows steps, and a grace hit belongs to a step it sounds before. Nothing
highlights a grace hit, and nothing should — there is no cell for it to light up.
