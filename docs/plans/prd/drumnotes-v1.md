# drumnotes v1

## Problem Statement

When a drummer has a groove in their head, they want to do three things quickly: sketch
it, hear it, and see it as real music notation. Today that forces a trade-off between two
kinds of tools:

- **Drum-machine grids** make it fast to build a groove and hear it immediately, but they
  never show proper sheet music. The pattern stays trapped as coloured squares.
- **Music notation software** produces beautiful sheet music, but entering a groove is slow
  and clumsy — wrong tool for the moment when an idea is still fresh.

So an idea either gets captured fast and stays unreadable, or gets written properly at a
pace that kills the momentum. There is no tool where tapping out a beat and reading it as
notation are the same act.

## Solution

A mobile-first web app where a step grid and a music staff are two views of the same
document, updating together.

The user taps cells on a familiar drum-machine grid — hi-hat, snare, bass drum across two
bars of sixteenth notes. Every tap does three things at once: it fills the cell, it fires
that drum's sample so the change is audible immediately, and it re-renders the staff below
into correct drum notation with proper stem directions, beams, dotted values and rests.

Pressing Play loops the two bars while a playhead tracks the current step on the grid and
subtly highlights the bar being played on the staff. Tempo is adjustable while playing.
When the groove is right, the notation exports as a PNG — copied to the clipboard or saved
as a file — so it can be pasted into a message, printed, or filed away.

The work survives a reload. Nothing is hidden behind a login, a project file, or a
note-entry mode.

## User Stories

### Sketching a pattern

1. As a drummer with a groove in my head, I want to tap cells on a step grid, so that I can
   capture the idea before I lose it.
2. As a drummer, I want the grid laid out as instrument rows across sixteenth-note columns,
   so that it matches the drum machines I already know and needs no learning.
3. As a drummer, I want the columns labelled with the counting I actually use (1 e + a),
   so that I can place a note without counting squares.
4. As a drummer, I want beat boundaries visually emphasised on the grid, so that I can see
   at a glance where beats 1, 2, 3 and 4 fall.
5. As a drummer, I want to tap a filled cell to clear it, so that correcting a mistake is
   the same gesture as making the note.
6. As a drummer, I want to hear the drum the instant I enable a cell, so that I get tactile
   confirmation without starting playback.
7. As a drummer, I want clearing a cell to be silent, so that erasing doesn't create noise
   I have to listen through.
8. As a drummer, I want the hi-hat, snare and bass drum rows in a consistent top-to-bottom
   order matching their vertical position on the staff, so that the two views feel like one
   instrument.
9. As a drummer opening the app for the first time, I want a recognisable groove already on
   the grid, so that I can hear and see what the app does before I've entered anything.
10. As a drummer, I want the app to work on my phone, so that I can sketch an idea wherever
    I happen to think of it.
11. As a phone user, I want the two bars stacked as separate grid blocks, so that the whole
    pattern is visible at once without swiping.
12. As a desktop user, I want the two bars side by side, so that I use the width I have.

### Reading the notation

13. As a drummer, I want the pattern rendered as real drum notation on a staff, so that I
    can read it the way I read any other chart.
14. As a drummer, I want hand parts written with stems up and foot parts with stems down,
    so that the notation follows the convention I already read.
15. As a drummer, I want the hands and feet to carry independent rhythms and independent
    rests, so that a bass drum note never fragments the snare line into unreadable pieces.
16. As a drummer, I want a hi-hat and snare struck together written as one chord on a single
    stem, so that it reads as a single stroke, which is what it is.
17. As a drummer, I want each hit written as the longest note value that fits before the next
    stroke in that part without spilling past its own beat, so that the four beats of the
    bar stay visible on the page.
18. As a drummer, I want the remaining silence written as rests, so that every bar is
    rhythmically complete and countable.
19. As a drummer, I want dotted note and rest values used where they apply, so that the
    notation is idiomatic rather than padded with extra symbols.
20. As a drummer, I want an empty bar in a part written as a single whole rest, so that the
    staff isn't cluttered with four quarter rests saying nothing.
21. As a drummer, I want hand rests and foot rests placed in their own halves of the staff,
    so that the two voices' rests never collide and each rest obviously belongs to the part
    it silences.
22. As a drummer, I want notes beamed in groups of one beat, so that a sixteenth-note groove
    is readable at a glance instead of a thicket of flags.
23. As a drummer, I want the standard percussion staff positions and X noteheads for
    cymbals, so that the chart is legible to any other drummer I show it to.
24. As a drummer, I want a percussion clef and a 4/4 time signature on the first bar, so
    that the staff is a complete, well-formed piece of notation.
25. As a drummer, I want the staff to appear only once the music font has actually loaded,
    so that I never see a broken staff of missing glyphs or boxes.
26. As a phone user, I want the staff to wrap to one bar per system, so that sixteenth notes
    stay legible instead of being crushed together.
27. As a desktop user, I want both bars on a single system, so that the groove reads as one
    continuous phrase.
28. As a drummer, I want the grid entirely above and the staff entirely below, so that the
    two views never interleave and I always know where to look.
29. As a drummer, I want the notation to update as I edit, so that I learn how a groove I
    can play is actually written.

### Hearing it

30. As a drummer, I want to press Play and hear the pattern, so that I can judge whether the
    groove works.
31. As a drummer, I want the pattern to loop continuously, so that I can listen and adjust
    without repeatedly reaching for a button.
32. As a drummer, I want to press Stop and have the playhead return to the start, so that
    the next Play begins where I expect.
33. As a drummer, I want edits I make during playback to be audible almost immediately, so
    that experimenting feels like playing rather than compiling.
34. As a drummer, I want the timing to be rock solid, so that I'm judging my groove and not
    the app's jitter.
35. As a drummer, I want the audition tap to sound with no perceptible delay, so that the
    grid feels like an instrument.
36. As a drummer, I want a cell I enable during playback to sound immediately as well as on
    the beat, so that editing stays responsive even mid-loop.
37. As a drummer, I want realistic acoustic drum samples, so that the groove sounds like a
    kit rather than a beep test.
38. As a drummer, I want Play to be unavailable until the sounds are ready, so that I never
    press it and get silence.
39. As a mobile user, I want audio to start correctly on my phone despite browser autoplay
    restrictions, so that Play just works the first time I press it.

### Tempo

40. As a drummer, I want to change the tempo, so that I can hear the groove where it
    actually lives.
41. As a drummer, I want tempo changes to apply while playing, so that I can find the right
    feel by ear instead of by numbers.
42. As a drummer, I want to see the current BPM as a number, so that I can reproduce the
    tempo later or tell someone else.
43. As a drummer, I want the tempo saved with the pattern, so that the groove and its feel
    stay together.

### Following along

44. As a drummer, I want a playhead showing the current step on the grid while playing, so
    that I can connect what I hear to what I see.
45. As a drummer, I want the bar currently being played subtly highlighted on the staff, so
    that I can follow the notation as it sounds.
46. As a drummer, I want the highlight to stay locked to the audio, so that the visual never
    drifts against what I'm hearing.
47. As a drummer, I want the highlight subtle rather than loud, so that it guides my eye
    without obscuring the notation.

### Keeping and sharing

48. As a drummer, I want to export the notation as a PNG, so that I can keep or share the
    chart.
49. As a drummer, I want to copy the PNG to my clipboard, so that I can paste it straight
    into a message without touching the filesystem.
50. As a drummer, I want to download the PNG as a file, so that I can print it or file it
    away.
51. As a drummer, I want the exported image to show the notation alone, without the playhead
    or highlight, so that it looks like a chart and not a screenshot of an app.
52. As a drummer, I want the exported image to have a solid background, so that it stays
    readable when pasted into a dark-themed app.
53. As a drummer, I want the exported image sharp, so that it holds up when printed or
    zoomed.
54. As a drummer, I want the export to look the same regardless of my screen size, so that
    exporting from a phone doesn't produce a cramped chart.
55. As a drummer, I want my pattern still there after a reload, so that a stray refresh
    doesn't cost me a groove.
56. As a drummer, I want a corrupt or outdated saved pattern to fall back to a working
    default, so that the app never boots into a broken state.
57. As a drummer, I want the app to work offline, so that it's available on a phone with no
    signal.

### Developer-facing

58. As a developer, I want the music logic to be pure and free of browser dependencies, so
    that it can be exhaustively unit-tested without a DOM.
59. As a developer, I want the grid-to-notation conversion covered by a table of cases, so
    that a notation regression fails a test rather than reaching my eyes.
60. As a developer, I want the audio scheduling arithmetic to be a pure function, so that
    timing correctness is testable without listening to it.
61. As a developer, I want the notation renderer confined behind a narrow adapter, so that
    the notation library can be upgraded or replaced without touching the music logic.
62. As a developer, I want browser-level tests asserting on DOM structure rather than pixels,
    so that the suite stays fast and doesn't fail on font-rendering differences.
63. As a developer, I want the bar count and steps-per-bar to be real constants respected
    throughout, so that adding bars later is a data change rather than a rewrite.
64. As a developer, I want the pattern to be an immutable value, so that state changes are
    traceable and rendering can react to identity.
65. As a developer, I want the sample and font assets bundled with the app, so that there is
    no third-party runtime dependency to break.
66. As a developer, I want the licence and sample provenance recorded, so that redistribution
    obligations are unambiguous.

## Implementation Decisions

### Stack and boundaries

- Vite, Svelte 5 and TypeScript. Client-only SPA, no router, no SvelteKit.
- The codebase splits into a **pure core** and thin **browser adapters**. The core imports
  neither Svelte, nor the DOM, nor the notation library, and is unit-tested in a node
  environment. Adapter modules cover notation rendering, audio, reactive state, and
  components.
- Svelte runes appear only in dedicated reactive state modules, exported as singletons.
  Components read from them; the core never sees them.

### The pattern document

- The pattern is an immutable value holding the tempo and one lane per instrument, each
  lane a flat array of booleans covering every step in the pattern.
- A cell is a plain boolean. Articulations (accents, ghost notes, flams, drags) are deferred,
  and widening the cell type later is a mechanical, type-checked refactor.
- Bar count and steps-per-bar are named constants the core respects everywhere; bar
  boundaries are derived, never hardcoded.
- Toggling produces a new pattern via non-destructive array update rather than mutation.
- Instruments are identified by stable ids; a single table maps each id to its staff pitch,
  notehead type and sample.

### Grid to notation

- The core converts a pattern into a plain-data **Score IR**: measures containing voices,
  each voice a list of notes and rests with duration, dot count and staff pitches, plus
  explicit beam groups. The IR is the unit-test surface for all music decisions.
- Two voices per measure. The **hands** voice merges hi-hat and snare with stems up;
  simultaneous hits become a single chord. The **feet** voice carries the bass drum with
  stems down. Each voice fills its own measure with its own rests independently.
- Each hit's duration is the smaller of the gap to the next hit **in the same voice** and
  the steps remaining in the quarter-note beat it starts on. The beat is a hard ceiling: no
  note exceeds a quarter, no note crosses a beat or a barline, and no ties are ever needed.
  Every resulting length is exactly expressible as a sixteenth, eighth, dotted eighth or
  quarter.
- Silence is written as rests using the same rule, dotted values included, so a beat whose
  first three sixteenths are silent yields one dotted-eighth rest. A voice with no hits at
  all in a measure yields a single whole rest.
- Rests carry an explicit staff position in the IR, because two voices sharing a staff will
  otherwise stack their rests on top of each other at the notation library's default
  position. Following normal two-voice drum engraving, the hands voice keeps its rests on
  the fourth line — which is also where a whole rest conventionally hangs, so upper-voice
  rests look entirely ordinary — and the feet voice drops its rests to the first space, the
  bass drum's own position, so a foot rest visibly belongs to the foot part. The whole rest
  for an empty measure follows the same two positions rather than its default line.
- Beam groups are computed in the core, one group per beat, omitting groups with fewer than
  two beamable notes. The renderer constructs beams from that list rather than deciding
  grouping itself.
- Notation follows the Percussive Arts Society convention: percussion clef, closed hi-hat as
  an X notehead in the space above the top line, snare in the third space, bass drum in the
  first space. This leaves the top line free for the ride cymbal in a later iteration.
- The time signature appears on the first bar only.

### Rendering and export

- The notation library is loaded through its font-free entry point, and the music font is
  self-hosted from an installed font package and imported as a build asset so it is
  content-hashed and independently cacheable. The app awaits the font-load promise and
  renders the staff only after it resolves.
- One drawing routine takes a rendering context and a Score IR, so display and export share
  a single implementation.
- On screen the score renders to SVG: crisp at any zoom, styleable for the measure
  highlight, and assertable as DOM in browser tests.
- Export re-renders the same IR to an offscreen canvas at double scale and produces a PNG
  blob directly, avoiding SVG serialisation and font-inlining entirely. The export path
  ignores the viewport, always laying both bars on one system, and omits the playhead and
  measure highlight. The image has a solid light background and a small margin. Because the
  export has no container to measure, it uses a fixed logical width of roughly 1200 points
  at double scale — an image around 2400 pixels wide, which prints cleanly and reads well
  pasted into a conversation — so an export made from a phone is identical to one made from
  a desktop.
- Two export affordances: copy the blob to the clipboard where the browser supports image
  clipboard writes, and download it as a dated file. The copy affordance hides itself when
  unsupported.
- Layout places the grid entirely above the staff. On narrow viewports the grid stacks its
  bar blocks and the staff wraps to one system per bar; on wide viewports both share a
  single row.
- Grid cells are real buttons carrying their pressed state as an accessibility attribute
  rather than styled non-interactive elements, which gives keyboard and screen-reader users
  a working grid and gives the browser tests stable, meaningful selectors.

### Audio

- Web Audio directly, with no audio library. Samples are decoded once into buffers; each hit
  plays through its own buffer source node.
- A lookahead scheduler drives playback: a coarse repeating timer wakes periodically and
  schedules every hit falling inside a short upcoming window against the audio clock. The
  question "which steps fall between these two times at this tempo, looping" is a pure
  function in the core and is unit-tested there; only the "play this buffer at this time"
  shim touches the browser.
- The audio context is created with an interactive latency hint and is resumed on the first
  user gesture to satisfy mobile autoplay policies. Playback controls stay disabled until
  the samples have decoded.
- Auditioning a cell fires its sample immediately with no scheduling delay — the reason for
  hand-rolling the scheduler rather than adopting a transport library. Auditioning is not
  suppressed during playback: a cell enabled just before the playhead reaches it will sound
  twice, once from the tap and once on the beat. This is accepted deliberately, since
  silencing the grid mid-loop would make editing feel dead exactly when the user is most
  engaged.
- Playback loops indefinitely. Stop halts and resets the position to the first step. Pattern
  edits and tempo changes take effect on the next scheduling window, so a change is audible
  within roughly one step; already-scheduled hits are never retracted.
- Samples come from Hydrogen's GMRockKit: the hard variants of closed hi-hat, snare and
  kick, committed to the repository and imported as build assets. The softest snare and
  hardest rimshot samples are added when ghost notes and accents are implemented.

### Playhead

- An animation-frame loop reads the audio clock — never wall-clock time — and converts it to
  a step index, so the visual can never drift against the sound.
- Reactive state is written only when the step index changes, not every frame.
- The grid lights the current step's column; the staff shades the measure containing it.

### Persistence

- The pattern and tempo are serialised to local storage on every change and restored on
  load, behind a schema version field. Unparseable or outdated data falls back to the
  default pattern rather than failing. Serialisation and parsing are pure functions in the
  core and are unit-tested.
- First-run state is a recognisable rock beat rather than an empty grid.

### Testing

- Unit tests live beside the pure modules they cover and run in a node environment: a table
  of grid-to-Score-IR cases, the scheduling arithmetic, and the persistence codec.
- Browser tests assert on DOM structure and counts, not pixels: the staff appears only after
  the font resolves, toggling a cell changes the rendered notation, Play advances the
  highlighted step and Stop resets it, and export produces a non-empty file. No visual
  regression baselines. The browser suite runs against the dev server rather than a
  production build, so a failure points at source rather than at bundled output.
- Existing local git hooks are the quality gate: lint, format, typecheck and unit tests
  before commit; browser tests before push. No CI service and no hosting for now.

### Licensing

- The project is licensed GPL-3.0-or-later, matching the GPL drum samples it redistributes.
  A notice file records the samples' origin, authors and licence, and the music font's
  separate open font licence.

### Scaffold gaps to close

The repository is configured but has no application code. The build tooling, TypeScript
settings, linting, formatting and git hooks are already in place and are not to be
relitigated. Missing pieces are the Svelte compiler config (already imported by the lint
config, so linting is currently broken), the HTML entry point, the app entry module, the
root component, the browser-test config targeting a single browser, the licence, and the
provenance notice. The README is rewritten to describe the app.

## Out of Scope

Deferred to later iterations, and explicitly not to be designed around beyond keeping the
door open:

- **Articulations**: flams, drags, accents and ghost notes. The cell type stays boolean.
- **Additional voices**: open hi-hat, ride, ride bell, crash, toms, cowbell. The notation key
  reserves their staff positions but nothing else anticipates them.
- **More than two bars**, though bar count is a constant rather than a hardcoded assumption.
- **Other time signatures** and **triplet subdivisions**.
- **Frontend polish**: styling is plain scoped CSS, no framework, light theme only. Visual
  refinement is a later pass.
- **Drag-to-paint** on the grid, and any gesture beyond tap-to-toggle.
- **Undo/redo**, **metronome**, **count-in**, **swing**, **per-hit velocity**.
- **Sharing**: no URL-encoded patterns, no server, no accounts, no multiple saved patterns.
  Persistence is a single autosaved pattern in local storage.
- **Other export formats**: no MusicXML, MIDI, PDF or audio export.
- **CI and deployment**: no hosted URL, no continuous integration.
- **Round-robin or velocity-layered samples**: one sample per instrument.

## Further Notes

- The beat ceiling is the single rule that keeps the notation engine simple. Because a note
  can never outlast its beat, ties are impossible, cross-barline notes are impossible, and
  every reachable duration maps to exactly one note value. Any future request to allow half
  notes or dotted halves reopens all three of those, and should be treated as a significant
  change rather than a tweak.
- Choosing SVG for display and canvas for export sidesteps a real trap: rasterising an
  on-screen SVG loses the music font unless the font is base64-inlined into the markup,
  producing a staff with no noteheads. Re-rendering to canvas from the IR avoids the problem
  rather than working around it.
- The lookahead window bounds how quickly an edit becomes audible. At moderate tempos a
  sixteenth note is longer than the window, so edits land within one step. If the window is
  ever widened for performance, that responsiveness degrades.
- The pure core is a plausible future standalone library — a grid-to-drum-notation engine is
  useful independently of this app. Keeping it free of Svelte, DOM and notation-library
  imports preserves that option without any present cost.
- The samples are GPL-licensed, which is why the project is GPL rather than the more
  permissive LGPL originally considered. LGPL's additional freedom only matters for code
  linked as a library by proprietary software, which does not apply to a distributed
  application.
