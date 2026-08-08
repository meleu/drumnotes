# Plan: drumnotes v1

> Source PRD: `docs/plans/prd/drumnotes-v1.md`

Eleven vertical slices. Each one cuts through every layer it touches — pure core, adapter,
component, tests — and is demoable on its own. Phases are ordered so the highest-risk logic
(grid → notation) lands early.

## Architectural decisions

Durable decisions that apply across all phases. Later phases assume these without restating
them.

### Shape of the codebase

- **Client-only SPA.** No router, no routes, no SvelteKit, no server. A single HTML entry
  point mounting a single root component.
- **Pure core / browser adapters.** The core imports neither Svelte, nor the DOM, nor
  VexFlow, and is unit-tested in a node environment. Everything browser-facing lives in thin
  adapters: notation rendering, audio, reactive state, components.
- **Runes only in reactive state modules**, exported as singletons. Components read from
  them; the core never sees them.
- **Unit tests live beside the pure module they cover** (`*.test.ts`, node environment,
  already globbed by `vite.config.ts`). Browser tests live under `tests/e2e/` and assert on
  DOM structure and counts — never pixels, no visual baselines — running against the dev
  server.

### Key models

- **`Pattern`** — the document, an immutable value:
  `{ tempo: number; lanes: Record<InstrumentId, boolean[]> }`. Each lane is a flat boolean
  array covering every step in the whole pattern (not per bar). Toggling produces a new
  `Pattern` via non-destructive array update (`Array.prototype.with`), never mutation.
  Tempo defaults to **90 BPM** and is clamped to **40–240** in the core.
- **`InstrumentId`** — `'hihat' | 'snare' | 'kick'`. A single instrument table maps each id
  to its staff pitch, notehead type, sample, display name and row order. Row order is
  top-to-bottom hi-hat, snare, kick, matching staff height.
- **Constants** — `BARS = 2`, `STEPS_PER_BAR = 16`, `STEPS_PER_BEAT = 4`. Total steps and
  bar boundaries are *derived* from these everywhere; no literal `16` or `32` in logic.
- **`Score` IR** — plain data, the unit-test surface for every music decision:
  `Score { measures: Measure[] }`, `Measure { index, voices: [hands, feet] }`,
  `Voice { id: 'hands' | 'feet'; stem: 'up' | 'down'; entries: Entry[]; beamGroups: number[][] }`.
  An `Entry` is a note or a rest carrying `startStep`, a base duration
  (`'quarter' | 'eighth' | 'sixteenth' | 'whole'`), a dot count, and staff position(s) with
  notehead type. Rests carry an explicit staff position. Beam groups are lists of entry
  indices.

### Notation conventions

- Percussive Arts Society positions: closed hi-hat as an X notehead in the space above the
  top line, snare in the third space, bass drum in the first space. The top line stays free
  for a future ride cymbal.
- Percussion clef on every system; 4/4 time signature on the first bar only.
- Hands voice = hi-hat + snare merged, stems up, rests on the fourth line. Feet voice = bass
  drum, stems down, rests in the first space. Each voice fills its own measure with its own
  rests, independently.
- **The beat ceiling**: a note or rest never exceeds a quarter, never crosses a beat, never
  crosses a barline. Consequently ties are impossible and every reachable length maps to
  exactly one note value.

### Rendering

- VexFlow 5 through its **font-free entry point**; the music font is self-hosted from an
  installed font package and imported as a build asset so it is content-hashed. The app
  awaits the font-load promise before rendering the staff.
- **One drawing routine** takes a rendering context plus a `Score`, so display and export
  share a single implementation.
- Screen renders to **SVG**; export re-renders the same IR to an **offscreen canvas** at 2×
  and produces a PNG blob directly.
- The notation library is confined behind a narrow adapter — the core never imports it.

### Audio

- Web Audio directly, no library. Samples decoded once into buffers; each hit gets its own
  buffer source node. AudioContext created with an interactive latency hint, resumed on the
  first user gesture.
- A lookahead scheduler drives playback. "Which steps fall between these two times at this
  tempo, looping" is a **pure function in the core**; only "play this buffer at this time"
  touches the browser.
- The playhead reads the **audio clock**, never wall-clock time.

### Persistence

- Single autosaved pattern in local storage under one key, behind a `version` field.
  Serialisation and parsing are pure functions. Unparseable or outdated data falls back to
  the default pattern rather than failing.

### Layout

- Grid entirely above, staff entirely below — the two views never interleave. Narrow
  viewport: grid stacks its bar blocks, staff wraps to one system per bar. Wide viewport:
  both bars share a single row / single system.
- The grid and the staff choose their breakpoints **independently**, each from its own
  content's minimum legible width. There is no shared breakpoint constant, and the two are
  free to switch at different widths.
- Grid cells are real `<button>`s carrying pressed state as an accessibility attribute.
- Plain scoped CSS, light theme only.

### Licensing

- GPL-3.0-or-later. A notice file records each redistributed asset's origin, authors and
  licence; each phase that adds an asset adds its entry in the same phase.

---

## Phase 1: Scaffold and editable grid

**User stories**: 1, 2, 3, 4, 5, 8, 10, 11, 12, 63, 64

### What to build

Close the scaffold gaps and land the first working slice: a grid you can tap.

The repository is configured but has no application code, and lint is currently broken
because the ESLint config imports a Svelte compiler config that does not exist. Create that,
plus the HTML entry point, the app entry module, the root component, the Playwright config
targeting a single browser, and the GPL licence file.

On top of that, the pattern document as a pure immutable value with its constants and
instrument table, a reactive state singleton holding the current pattern, and a grid
component rendering one row per instrument across sixteenth-note columns. Tapping an empty
cell fills it; tapping a filled cell clears it. Columns are labelled with the `1 e + a`
counting and beat boundaries are visually emphasised. Two bars render as separate blocks,
stacked on narrow viewports and side by side on wide ones.

No sound, no staff, no persistence yet — the grid starts empty on every load.

### Acceptance criteria

- [x] `pnpm run verify` passes from a clean checkout (lint, format, typecheck, unit tests)
- [x] `pnpm dev` serves an app that mounts without console errors
- [x] The pattern module exposes `BARS`, `STEPS_PER_BAR`, `STEPS_PER_BEAT`; bar boundaries
      and total step count are derived, and no logic hardcodes a step count
- [x] Toggling returns a new `Pattern`; the input value is unchanged (unit-tested)
- [x] The grid renders `BARS × STEPS_PER_BAR` cells per instrument row, in hi-hat / snare /
      kick order
- [x] Every cell is a `<button>` exposing its filled state via `aria-pressed`
- [x] Column labels read `1 e + a`, `2 e + a`, `3 e + a`, `4 e + a`; the first column of each
      beat is visually distinguished
- [x] Tapping a filled cell clears it
- [x] Bar blocks stack vertically below the layout breakpoint and sit side by side above it
- [x] Browser test: toggling a cell flips its `aria-pressed` value
- [x] `LICENSE` contains GPL-3.0-or-later; `package.json` declares the licence

---

## Phase 2: Persistence and the default groove

**User stories**: 9, 55, 56, 43 (partial)

### What to build

The pattern survives a reload, and a first-time visitor arrives at a recognisable rock beat
rather than an empty grid.

A pure codec serialises a `Pattern` — tempo included, even though tempo is not yet editable —
to a versioned payload and parses it back, validating shape, lane lengths and instrument ids.
Anything unparseable, mis-shaped or carrying an unknown version resolves to the default
pattern instead of throwing. The reactive state singleton loads through the codec on startup
and writes through it on every change.

The default pattern is a straight eighth-note hi-hat rock beat: hi-hat on every eighth, snare
on beats 2 and 4, kick on beat 1 and the "and" of 3, at 90 BPM.

### Acceptance criteria

- [x] Codec round-trips a pattern to a string and back to an equal value (unit-tested)
- [x] Parsing returns the default pattern for: invalid JSON, a missing or unknown version,
      wrong lane lengths, unknown instrument ids, a non-numeric or out-of-range tempo — each
      case unit-tested, none of them throwing
- [x] The stored payload carries an explicit schema version field
- [x] Every pattern change writes to local storage
- [x] First load with empty storage shows the default rock beat — hi-hat on every eighth,
      snare on 2 and 4, kick on 1 and the "and" of 3 — at 90 BPM
- [x] Browser test: toggle a cell, reload, the change is still there
- [x] Browser test: seed storage with corrupt data, load, the app renders the default pattern

---

## Phase 3: The staff appears

**User stories**: 13, 14, 15, 16, 21, 23, 24, 25, 26, 27, 28, 29, 61, 62

### What to build

The whole pattern → `Score` IR → VexFlow → SVG path, end to end, with deliberately naive
rhythm. Every hit is written as a sixteenth note and every gap as sixteenth rests. The
notation is rhythmically ugly but structurally complete and correct in every other respect —
this phase proves the pipeline, phases 4 and 5 make the rhythm right.

**Start with a pre-flight check**, before writing any of this phase's code: confirm that the
installed VexFlow 5 exposes a font-free entry point and that its companion music-font package
installs and loads cleanly. If it does not, **stop and report back** — do not silently fall
back to the font-carrying entry point or pin a different version. That decision is the user's.

The core converts a `Pattern` into the `Score` IR: two voices per measure, hands (hi-hat +
snare, stems up, simultaneous hits merged into one chord on a single stem) and feet (bass
drum, stems down). Each voice fills its own measure with its own rests, independently. Rests
carry explicit staff positions — hands on the fourth line, feet in the first space.

The notation adapter wraps VexFlow behind a narrow interface: one drawing routine taking a
rendering context and a `Score`. The music font is self-hosted and imported as a build asset;
the staff renders only after the font-load promise resolves. Percussion clef on every system,
time signature on the first bar only. The staff sits entirely below the grid, wrapping to one
bar per system on narrow viewports and both bars on one system on wide ones. Editing a cell
re-renders it.

### Acceptance criteria

- [ ] The VexFlow font-free entry point and its font package are verified to work before any
      other work in this phase begins; if they do not, the phase halts and reports rather than
      substituting an alternative
- [ ] The core module producing the IR imports no Svelte, no DOM and no VexFlow
- [ ] A hi-hat and snare on the same step produce one chord entry with two noteheads, not two
      entries
- [ ] Hands entries are stems-up, feet stems-down; a bass drum hit never affects the hands
      voice's entries and vice versa (unit-tested)
- [ ] Both voices fill exactly one measure's worth of steps, always (unit-tested across
      several patterns)
- [ ] Hand rests carry the fourth-line position, foot rests the first-space position
- [ ] Hi-hat renders as an X notehead above the top line; snare in the third space; kick in
      the first space
- [ ] Percussion clef on each system, 4/4 on the first bar only
- [ ] No staff element exists in the DOM before the font-load promise resolves
- [ ] Below the breakpoint the SVG lays out one measure per system; above it, both measures
      on one
- [ ] The grid is entirely above the staff in document order and on screen
- [ ] Toggling a cell changes the rendered notation
- [ ] Browser test: the staff appears only after fonts resolve, and toggling a cell changes
      the notehead count in the SVG
- [ ] The music font's licence is recorded in the notice file

---

## Phase 4: Real note and rest durations

**User stories**: 17, 18, 19, 20, 59

### What to build

Replace the naive sixteenths with the actual duration rule, entirely inside the core. Nothing
outside the IR-producing module changes.

Each hit's duration is the smaller of the gap to the next hit **in the same voice** and the
steps remaining in the quarter-note beat it starts on. Silence uses the same rule, so a beat
whose first three sixteenths are silent yields one dotted-eighth rest. Dotted values are used
wherever they apply. A voice with no hits at all in a measure yields a single whole rest, at
that voice's rest position rather than VexFlow's default.

This phase's real deliverable is the test table: a table of grid-to-`Score`-IR cases covering
every reachable duration and rest combination, so a notation regression fails a test rather
than reaching the user's eyes.

### Acceptance criteria

- [ ] Every produced length is exactly a sixteenth, eighth, dotted eighth or quarter — no
      other value is reachable (unit-tested exhaustively over single-beat inputs)
- [ ] No note or rest crosses a beat boundary or a barline; no ties are ever produced
- [ ] A lone hit on the downbeat of an otherwise empty beat is a quarter, not four sixteenths
- [ ] Three silent sixteenths before a hit yield one dotted-eighth rest
- [ ] A measure with no hits in a voice yields exactly one whole rest, positioned on that
      voice's rest line/space
- [ ] Duration is capped by the gap **within the same voice** — a kick between two snares does
      not shorten the snare (unit-tested)
- [ ] The case table covers each beat pattern shape and is data-driven, not one test per case
- [ ] Every voice still sums to exactly one measure

---

## Phase 5: Beaming

**User stories**: 22

### What to build

Beam groups computed in the core, one group per beat, listed explicitly in the IR. Groups
with fewer than two beamable notes are omitted entirely; quarter notes are never beamed. The
renderer constructs beams from that list and never decides grouping itself.

### Acceptance criteria

- [ ] Beam groups appear in the IR as lists of entry indices, one group per beat at most
      (unit-tested)
- [ ] A beat with a single eighth or sixteenth produces no group
- [ ] A beat containing a quarter note produces no group containing it
- [ ] Beams never span a beat boundary or a barline
- [ ] Rests are never included in a beam group
- [ ] The rendered SVG shows beams rather than flags for a straight sixteenth hi-hat line
- [ ] The notation adapter contains no grouping logic

---

## Phase 6: Samples and audition on tap

**User stories**: 6, 7, 35, 37, 38, 39, 65, 66

### What to build

The grid becomes an instrument. This phase fetches the hard closed hi-hat, snare and kick
samples from Hydrogen's GMRockKit distribution, commits them to the repository, and imports
them as build assets — no third-party runtime dependency. An audio adapter creates the
AudioContext with an interactive
latency hint, decodes each sample once into a buffer, and resumes the context on the first
user gesture to satisfy mobile autoplay policies.

Enabling a cell fires that instrument's sample immediately, with no scheduling delay.
Clearing a cell is silent. Interactive controls stay disabled until every sample has decoded.

The notice file gains the samples' origin, authors and licence — this is the phase that makes
the project's GPL choice load-bearing.

### Acceptance criteria

- [ ] The three GMRockKit samples are downloaded from Hydrogen's distribution, committed to
      the repository and resolved as build assets — never fetched from a URL at runtime
- [ ] The download source and the exact kit version are recorded, so the samples can be
      re-obtained or updated later
- [ ] Each sample is decoded exactly once; repeated hits reuse the buffer through fresh source
      nodes
- [ ] Enabling a cell plays that instrument; clearing a cell plays nothing
- [ ] Audition fires immediately, without going through a scheduler
- [ ] The AudioContext is resumed on the first user gesture; audio works on a mobile browser
      on the first press
- [ ] Controls that require audio are disabled until decoding completes
- [ ] The notice file records the samples' origin, authors and licence; the README states the
      project is GPL because of them

---

## Phase 7: Playback

**User stories**: 30, 31, 32, 33, 34, 36, 60

### What to build

Play and Stop. Play loops the pattern indefinitely; Stop halts and resets the position to the
first step.

A lookahead scheduler drives it: a coarse repeating timer wakes periodically and schedules
every hit falling inside a short upcoming window against the audio clock. The arithmetic —
which steps fall between two times, at this tempo, looping — is a pure function in the core
with its own unit tests, covering window boundaries, loop wrap-around and windows spanning
multiple steps. Only the "play this buffer at this time" shim touches the browser.

Pattern edits take effect on the next scheduling window, so a change is audible within roughly
one step; already-scheduled hits are never retracted. Auditioning is not suppressed during
playback, so a cell enabled just before the playhead reaches it sounds twice — deliberately.

### Acceptance criteria

- [ ] The step-window function is pure, in the core, and unit-tested for: an empty window, a
      window containing several steps, a window straddling the loop point, and a step landing
      exactly on a window edge (scheduled exactly once, never twice)
- [ ] No step is ever scheduled twice or skipped across consecutive windows (unit-tested over
      a long simulated run)
- [ ] Play loops indefinitely with no audible gap at the loop point
- [ ] Stop halts playback and resets the position to step 0; the next Play starts from there
- [ ] A cell enabled during playback sounds on the next pass, within roughly one step
- [ ] Timing is driven by the audio clock; no `setTimeout` value determines when a hit sounds
- [ ] Browser test: pressing Play changes the transport state and Stop returns it

---

## Phase 8: Tempo

**User stories**: 40, 41, 42, 43

### What to build

A tempo control: a number input showing the current BPM, flanked by decrease and increase
buttons for one-tap adjustment on a phone. Changing it while stopped or while playing both
work — a change applies from the next scheduling window, like a pattern edit. Tempo lives on
the `Pattern`, so it is already covered by the phase 2 codec and is saved and restored with
the groove.

Clamping to 40–240 happens in the core, not in the input's `min`/`max` attributes alone, so a
typed-in out-of-range value is corrected rather than trusted.

### Acceptance criteria

- [ ] The current BPM is displayed as an editable number
- [ ] Decrease and increase buttons step the tempo and are usable repeatedly by tap
- [ ] Both buttons and typed input go through the same core clamp to 40–240; typing 999
      results in 240, not 999
- [ ] The decrease/increase buttons are disabled at the ends of the range
- [ ] Changing the tempo during playback audibly changes the rate without stopping or
      glitching
- [ ] Tempo persists across a reload
- [ ] A stored out-of-range tempo falls back to the default (already covered by the phase 2
      codec tests)
- [ ] Browser test: change the tempo, reload, the value is retained

---

## Phase 9: Playhead

**User stories**: 44, 45, 46, 47

### What to build

While playing, the grid lights the current step's column and the staff subtly shades the
measure containing it.

An animation-frame loop reads the audio clock — never wall-clock time — and converts it to a
step index using the same core arithmetic that drives scheduling, so the visual can never
drift against the sound. Reactive state is written only when the step index actually changes,
not on every frame. Stopping clears the highlight and returns the playhead to the first step.

The highlight is subtle: it guides the eye without obscuring noteheads.

### Acceptance criteria

- [ ] The step index is derived from the audio clock, not from `Date.now`, `performance.now`
      or a frame counter
- [ ] Reactive state updates only on step change (verifiable by instrumenting the setter in a
      test, or by construction)
- [ ] The grid highlights exactly one column at a time, matching the sounding step
- [ ] The staff shades exactly the measure containing the current step
- [ ] Stop clears both highlights and resets to step 0
- [ ] The highlight is a background/shading treatment that leaves noteheads fully legible
- [ ] Browser test: Play advances the highlighted step; Stop resets it

---

## Phase 10: PNG export

**User stories**: 48, 49, 50, 51, 52, 53, 54

### What to build

Export the notation as a PNG, through the same drawing routine used on screen — the same
`Score`, a different rendering context.

Export re-renders to an offscreen canvas at double scale and produces a PNG blob directly, no
SVG serialisation and no font inlining. It ignores the viewport entirely: both bars always on
one system, at a fixed logical width of roughly 1200 points, so an export from a phone is
byte-for-byte comparable to one from a desktop. The playhead and measure highlight are absent
from the export. The image gets a solid light background and a small margin.

Two affordances: copy the blob to the clipboard where the browser supports image clipboard
writes, and download it as a dated file. The copy affordance hides itself when unsupported.

### Acceptance criteria

- [ ] Export and screen rendering call the same drawing routine with different contexts
- [ ] The exported image is roughly 2400px wide regardless of viewport width
- [ ] Both measures are on a single system in the export, even when the screen is wrapping
      them
- [ ] The exported image contains no playhead column and no measure shading
- [ ] The background is opaque light, with a margin around the staff
- [ ] The downloaded filename carries the date
- [ ] The copy control is absent (not merely disabled) when image clipboard writes are
      unsupported
- [ ] Browser test: triggering the download produces a non-empty PNG file

---

## Phase 11: Offline and documentation

**User stories**: 57

### What to build

A minimal, hand-written service worker, plus a web manifest. No PWA plugin and no new
dependency.

**Runtime cache-first, with only the HTML precached** — chosen because it needs no build-time
asset list, so nothing has to be regenerated or kept in sync when the bundle's hashed
filenames change. The worker precaches the entry HTML on install; every other same-origin
request is served from cache when present and otherwise fetched and cached on the way back.
This is sufficient here because the app is a single page that requests all of its assets —
bundle, font, samples — on the first visit, so one online visit populates the cache
completely.

Registration is a no-op in development.

Finish the documentation: rewrite the README to describe the app, how to run it, its licence
and its asset provenance.

### Acceptance criteria

- [ ] A second load with the network offline serves the app, its samples and its font from
      cache
- [ ] The worker contains no hardcoded hashed asset filenames and needs no build-time
      generation step
- [ ] The entry HTML is precached on install and refreshed on activation, so a new deploy is
      picked up rather than pinned forever
- [ ] The cache is versioned and stale caches are dropped on activation, so a new build does
      not serve a mix of old and new hashed assets
- [ ] Service worker registration does not interfere with the dev server or the browser test
      suite
- [ ] The README describes the app, the pure-core/adapter split, how to run dev, unit and
      browser tests, and the licence and sample provenance
- [ ] `pnpm run verify` and the browser suite both pass

---

## Decisions taken while planning

Questions the PRD left open, and how they were settled. Recorded so a later phase does not
reopen them.

1. **Service worker strategy** — runtime cache-first with only the HTML precached, chosen for
   maintainability: no build-time asset manifest to generate or keep in sync. Detailed in
   phase 11.
2. **Layout breakpoints** — the grid and the staff each pick their own, from their own
   content's minimum legible width. No shared constant.
3. **Tempo** — default 90 BPM, clamped to 40–240 in the core.
4. **Tempo control** — a number input with decrease and increase buttons.
5. **Default rock beat** — hi-hat on every eighth, snare on beats 2 and 4, kick on beat 1 and
   the "and" of 3.
6. **VexFlow font-free entry point** — verified as the first action of phase 3. If it does not
   hold, the phase **stops and reports** rather than substituting the font-carrying entry
   point or pinning another version.
7. **Sample sourcing** — phase 6 downloads the GMRockKit samples from Hydrogen's distribution
   and commits them, recording the source and kit version.

## Still open

Nothing blocking. Two things are deliberately left to be settled in the phase that hits them,
because the answer depends on what the code looks like by then:

- The exact breakpoint values (phases 1 and 3) — decided from measured content width, not
  picked in advance.
- The lookahead window and scheduler tick interval (phase 7) — the PRD notes only that
  widening the window degrades edit responsiveness. Start from the conventional ~100ms
  window / ~25ms tick and adjust if timing proves unstable.
