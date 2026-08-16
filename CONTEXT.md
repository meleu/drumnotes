# drumnotes

A drum groove sketched on a step grid and read as real drum notation — two views of
one document. This glossary is the language the code, the tests and the prose are all
expected to speak.

## Language

### The pattern

**Groove**:
The music itself — what a drummer plays and hears, independent of tempo and of how it is
written down. Two patterns at different tempos can be the same groove.
_Avoid_: beat (a beat is one quarter note), rhythm, feel, riff

**Pattern**:
The whole document: a groove at a chosen tempo, held as one lane per instrument across
every bar. An immutable value — it is replaced, never edited in place.
_Avoid_: document, project, song, track, sequence, groove (a groove is the music; a
pattern is what stores it, at a tempo)

**Lane**:
One instrument's steps across the entire pattern, from the first bar to the last.
_Avoid_: row, track, channel, sequence

**Step**:
One sixteenth-note slot, indexed absolutely from the start of the pattern. The unit of
time everything else is counted in.
_Avoid_: tick, slot, column, frame, position

**Cell**:
Where a lane meets a step — the thing a drummer taps. The grid's word for a step in one
instrument's lane, and the smallest thing the pattern records: one articulation, or
silence.
_Avoid_: square, pad, box, button

**Hit**:
One instrument sounding once — what a cell's articulation is played out as. A plain cell
is one hit; a flam is a grace hit and the hit it leads into.
_Avoid_: filled cell, filled step, onset, strike, stroke, note, event

**Articulation**:
How a cell is struck — plain, accented, ghosted, flammed or dragged. One value and never
two, so an accented flam is unwritable. It gathers the accent marks and the ornaments,
which engraving keeps apart, because a cell has one slot for both. Silence carries none:
rubbing a cell out takes its articulation with it.
_Avoid_: dynamic, ornament, stroke type, velocity

**Accent**:
The articulation struck hardest. Written as a single mark on the whole stroke — above for
hands, below for feet — so a stroke whose heads disagree still carries one accent, and the
staff says the stroke is loud rather than which instrument is.
_Avoid_: emphasis, stress, marcato, sforzando

**Ghost note**:
The articulation struck softest, written as parentheses around its own notehead and no
other. Unlike an accent, it names the instrument it belongs to.
_Avoid_: ghost hit, dead note, ghosted stroke, grace note (a grace note leads into a hit;
a ghost note is one)

**Flam**:
The articulation whose hit is led by one grace hit.
_Avoid_: grace, ornament, ruff

**Drag**:
The articulation whose hit is led by two grace hits.
_Avoid_: ruff, roll, double grace, buzz

**Grace hit**:
A hit sounding a sliver ahead of the step it belongs to, softer than the hit it leads
into. A flam has one, a drag two, and no other articulation has any.
_Avoid_: grace note (that is the written form), grace stroke (a stroke is a stack on one
stem), ruff, ornament hit

**Stroke**:
Everything one voice plays on a single step: one or more hits, written on one stem. A
hi-hat and a snare struck together are one stroke, not two. There is no empty stroke —
silence is the absence of one. (_Strike_ is the verb; a stroke is what gets struck.)
_Avoid_: chord, attack, onset, voice hit, simultaneous hits

**Beat**:
A quarter note — four steps. Also the hard ceiling on how long anything written can
last (see **Beat ceiling**).
_Avoid_: pulse, quarter

**Bar**:
One bar's worth of steps in the pattern. The word for the pattern, grid and playback
side of the app; the same span of music on the staff is a **Measure**.
_Avoid_: measure (in pattern, grid or playback code), block, section

**Tempo**:
Beats per minute, carried by the pattern and clamped to a playable range on every route
in. A tempo that reaches anything downstream is always playable.
_Avoid_: speed, BPM (as a concept — BPM is the unit)

**Instrument**:
A hi-hat, snare or kick. Identified by a stable id, and paired once with the voice it is
written in, its staff position, its notehead and its sample.
_Avoid_: drum, sound, pad, voice, part

**Sample**:
The recorded audio one instrument plays at one dynamic. Bundled with the app, and picked
by what is being sounded — hardest for an accent, softest for a ghost note or a grace hit
— so a dynamic is a different recording rather than the same one turned up.
_Avoid_: sound, clip, buffer, velocity layer

### The notation

**Score**:
The plain-data notation model a pattern is translated into — measures of voices of
entries. Every musical decision is made producing it, and none after.
_Avoid_: notation model, IR alone, VexFlow model

**Measure**:
One bar as written on the staff: always both voices, each accounting for the full
measure on its own. The notation-side counterpart of **Bar**.
_Avoid_: bar (in notation code)

**Voice**:
An independent rhythmic line sharing the staff — **hands** (hi-hat and snare, stems up)
or **feet** (kick, stems down). Each carries its own rhythm, its own rests and its own
rest height, so neither fragments the other.
_Avoid_: part, layer, stream, staff

**Entry**:
One written symbol in a voice — a note or a rest — with the step it starts on, a
duration and its dots.
_Avoid_: event, element, item, symbol

**Note**:
An entry that sounds — the written form of exactly one **Stroke**, its heads on a single
stem.
_Avoid_: hit, strike, chord (a chord is a note with several heads)

**Grace note**:
The small note a grace hit is written as, drawn before its stroke and stealing no time
from the bar. Grace hits landing together share a stem, exactly as a stroke's heads do.
_Avoid_: acciaccatura, appoggiatura, ornament, grace hit (that is the sound)

**Rest**:
An entry that is silent, standing where a voice has no stroke. Written at its voice's own
height rather than the renderer's default, so two voices' rests never collide.
_Avoid_: silence, gap, pause

**Notehead**:
Where one head of a note sits on the staff, and what shape it is drawn with — a cross
for cymbals, a plain head otherwise — together with whether it is bracketed as a ghost
note, which is the one mark a head carries on its own rather than sharing with its stroke.
_Avoid_: head, glyph, notation symbol

**Staff position**:
A height on the staff, written as scientific pitch. A place, not a sound — nobody plays
the pitch a percussion notehead sits on.
_Avoid_: pitch, note, line

**Duration**:
The base note value a symbol is drawn as — whole, quarter, eighth or sixteenth. Not how
long it lasts: that is its **Note value**.
_Avoid_: length, value, note length

**Note value**:
A duration together with its dots — the full length a symbol actually occupies. A dotted
eighth and an eighth share a duration and are different note values.
_Avoid_: duration, length

**Beat ceiling**:
The rule that nothing written outlasts the beat it starts on. A note or rest holds until
its voice's next stroke or until its beat runs out, whichever comes first — which is why
nothing crosses a beat or a barline, every length has exactly one spelling, and ties are
impossible.
_Avoid_: beat boundary rule, quantisation

**System**:
One row of measures on the page, read left to right before the eye drops to the next. How
many measures share one is a page decision, never a musical one — the same `Score` lays out
as one system on the export and two on a phone.
_Avoid_: row, line, stave, staff (a staff is the five lines; a system is a row of them)

**Placement**:
The patch of page one measure occupies, and whether it opens with a clef or a time
signature. The one answer the drawing and the playhead shading both read, so they cannot
disagree about where a measure is.
_Avoid_: box, rect, bounds, position (a staff position is a height on the staff)

**Beam group**:
The entries a single beam joins, decided when the score is built and never by the
renderer. One group per beat at most, and none where fewer than two notes could be
joined.
_Avoid_: beam, group, beaming

### Playback

**Transport**:
Whether the pattern is playing, and where the playhead is. The one thing Play and Stop
act on.
_Avoid_: player, sequencer, playback engine

**Loop**:
The tempo being played, anchored by the audio-clock moment step 0 sounded. Retuning
moves the anchor rather than the tempo alone, so the groove carries on from where it had
got to.
_Avoid_: cycle, playback state, timeline

**Pass**:
One traversal of the whole pattern. Playback runs pass after pass indefinitely.
_Avoid_: cycle, iteration, repeat, loop (a loop is the thing being traversed)

**Tick**:
One firing of the scheduling timer. Its accuracy never reaches the ear — it only has to
come often enough to stay ahead of the audio hardware.
_Avoid_: pass, poll, frame, wake (waking is what the audio context does)

**Window**:
The stretch of near-future time a tick hands over to the audio hardware. Half-open, and
each one opens exactly where the last closed, so no hit is scheduled twice or missed.
_Avoid_: lookahead, buffer, batch, chunk

**Playhead**:
The step sounding right now, or nothing at all when stopped — which is what clears every
highlight at once.
_Avoid_: cursor, position, current step, marker

**Slack**:
The fixed sliver of real time between pressing Play and the first sound being scheduled,
so it is handed over as a moment still to come rather than one that has just gone by.
Inaudible, and it does not scale with tempo.
_Avoid_: lead-in, count-in (a count-in is audible, musical, measured in beats, and
deferred), latency, delay, offset

**Grace lead**:
How far ahead of its step a grace hit sounds. Near-constant real time rather than a
subdivision — a flam is a gesture of the hand, not a note value — and tightened only at
tempos fast enough that a drag would otherwise reach back into the step before.
_Avoid_: offset, delay, flam time, swing, slack (slack precedes the whole loop, once)

**Audition**:
Sounding an instrument the instant its cell is written, outside the schedule entirely.
Writing a hit auditions it, in full — a flam auditions as a flam; rubbing one out is
silent.
_Avoid_: preview, tap sound, trigger, monitor
