# Plan: Pattern library

> Source PRD: `docs/plans/prd/pattern-library.md`
> ADRs: `docs/adr/0005-the-current-pattern-is-not-in-the-library.md`,
> `docs/adr/0006-replacing-the-pattern-stops-playback.md`

## Architectural decisions

Durable decisions that hold across every phase. Anything not listed here is a phase's own
business and may change as later phases land.

### Storage

- **One key holds the whole store**: `drumnotes:store`. It replaces `drumnotes:pattern`,
  which is deleted once at startup and never read. There are no users; nothing is migrated.
- **Store shape** is fixed and carries no version of its own:

  ```
  { current: StoredPattern, library: { [name: string]: StoredPattern } }
  ```

- **Versioning is per pattern.** Every `StoredPattern` carries the `version` field the v1
  payload already carries. A later instrument or dynamics change is one bump plus a
  per-entry upgrade-or-drop, never a wholesale store migration, and a mixed-version library
  stays readable.
- **A version that is not the current one is dropped, today.** There is nothing to upgrade
  from yet. But the version check is *one named step* in the entry decode, with an explicit
  contract saying where an upgrader slots in and what it must return, so the day an
  instrument or dynamics bumps the version, a single `v(n) → v(n+1)` function keeps the
  existing library readable. The path is guaranteed here; the upgrader is written then.
- **The current pattern is stored as just another entry**, so it and the library entries
  decode through one code path.
- **The adapter owns the merge.** It holds the last-written store in memory and merges each
  write into it, so an autosave (which fires on every cell tap) and a library write cannot
  clobber one another, and neither re-parses the store on every tap.
- **Availability is probed once at startup**; a blocked store never unblocks mid-session.

### Decoding — two deliberately different contracts

- **The current pattern decodes totally.** It never fails; anything unreadable falls back to
  the default groove, exactly as today, because the grid must show something.
- **A library entry decodes partially.** Corrupt, mis-shaped, or carrying a version this
  build cannot upgrade yields nothing, and the entry is simply absent from the list. Every
  row on screen is therefore a row that will load. The next write persists the pruned map.

### Key models

- **`Pattern`** is unchanged: an immutable value carrying a tempo and one lane per
  instrument.
- **`Library`**: a map of name to `Pattern`. The name is the identity — unique, no generated
  ids, no renaming. Saving under a name in use replaces that entry, after asking.
- **Names are case-insensitive identities.** `bossa` and `Bossa` are one pattern, not two:
  lookup, collision and free-name generation all compare case-folded. The name is *stored and
  displayed exactly as typed*, so folding decides identity only, never appearance. Saving
  `bossa` over a kept `Bossa` replaces the entry outright, and the row then reads `bossa` —
  the name travels with the pattern it names.
- **The pattern on the grid is not a member of the library** (ADR 0005). Save copies out;
  load copies back in. The two values are never joined, so editing after a load cannot reach
  what was kept.
- **No dirty state.** "Is the grid already kept?" is *derived* by comparing the current
  pattern against the library entries — the same comparison drives both the load guard and
  the marked row. There is no tracking machinery, no unsaved-changes marker, no save-as.

### Module shape

Following the existing layering — pure core, browser adapters, reactive state, components:

| Layer | Module | Role |
| --- | --- | --- |
| core | `src/core/library.ts` *(new)* | The name-to-pattern map: case-folded identity, natural-order sorting, lookup, insert, remove, free-name generation, and the equality search. No storage, no runes, no DOM. |
| core | `src/core/codec.ts` | Gains whole-store serialisation and parsing, and the partial entry decode. Keeps its existing total pattern parse. |
| adapters | `src/adapters/storage.ts` | Rewritten around the single key, the in-memory merge, the startup deletion of the abandoned key, and the availability probe. |
| state | `src/state/library.svelte.ts` *(new)* | The map, save and delete, the derived sorted list, and the derived match against the current pattern. |
| state | `src/state/session.svelte.ts` *(new)* | The coordination seam: the wholesale acts, each stopping the transport first. |
| state | `src/state/pattern.svelte.ts` | Keeps its accessor and its autosave funnel; gains a replace path. Its playback comment is corrected. |
| components | `src/components/Patterns.svelte` *(new)* | The disclosure panel, placed in the controls row. |

### Playback

- **Any wholesale replacement of the pattern stops the transport and clears the playhead** —
  loading and clearing alike. Editing a cell and retuning do not, and continue to take effect
  on the next scheduler tick.
- **The rule lives in the session seam**, above both the transport and the pattern, because
  the transport already depends on the pattern and the reverse would be a cycle. Controls
  call the seam rather than `patternState` directly, so any later replacing act inherits the
  rule.

### Interface

- A **Patterns control in the existing controls row** toggles a disclosure panel beneath it.
  Closed on load. No modal, no overlay.
- The panel holds, in order: the name field, the Save button, then the rows.
- **Rows** show name, tempo and a delete control. The row matching the current pattern is
  marked as being on the grid.
- **All three confirmations reuse the two-press mechanism `Clear.svelte` established**: the
  question lives in the control itself, reports `data-state`, times out unanswered, and is
  withdrawn on blur.
- The panel **closes after a load** and **stays open after a save**.
- **Storage blocked** is decided at startup and decides what *exists* rather than what is
  enabled, following `Export.svelte`'s precedent.
- **Two distinct lines stand in place of the rows**, never one shared line: an empty library
  says *nothing kept yet* — an invitation, with a working field and Save above it — and a
  blocked store says *this browser will not let anything be kept here*, with no field and no
  Save at all. The blocked line states the fact and no more: the probe cannot tell private
  browsing from a site-data setting from a quota failure, so it does not guess at a cause.
- Controls carry data attributes for testing, matching the conventions already in use.
- Plain scoped CSS, light theme, as everywhere else.

### Testing

- Unit tests for `core/library.ts` and for the codec's two contracts.
- End-to-end tests per phase, in `tests/e2e/`.
- **No test may depend on a clock**: entries carry no timestamps, and ordering is a function
  of the name alone.
- **Accessibility is built as each phase goes** — keyboard-operable controls, labelled
  fields, announced row state. Phase 11 is the audit that proves it, not the phase that adds
  it.

---

## Phase 1: Save a groove under a name and see it listed

**User stories**: 1, 3, 4, 13, 23, 25, 33, 34, 35

### What to build

The tracer bullet. It carries the skeleton every later phase hangs off: the single-key store,
the pure library module, the reactive library state, and the panel.

A **Patterns** control appears in the controls row and toggles a panel beneath it, closed
when the app opens. The panel holds a name field, a Save button, and the rows kept so far.
Typing a name and pressing Save takes a copy of the pattern on the grid and keeps it under
that name; a row appears showing the name and the tempo it was saved at, and the panel stays
open so the drummer can see it happen. Everything survives a reload, and the groove on the
grid survives exactly as it does today.

Underneath, storage moves to one key holding the current pattern and the library map, with
each pattern carrying its own version. The adapter keeps the last-written store in memory and
merges each write into it, so the autosave that fires on every cell tap and a library write
cannot clobber one another. The v1 key is deleted once at startup.

Deliberately not in this phase: sorting (rows may appear in any stable order), the prefilled
name, disabled Save states, any confirmation, loading, and deleting.

### Acceptance criteria

- [x] A `Patterns` control sits in the controls row; the panel is closed when the app opens
      and the interface otherwise looks exactly as it does today
- [x] Pressing the control opens the panel; pressing it again closes it
- [x] The panel holds, in order, a labelled name field, a Save button, and the rows
- [x] Typing a name and pressing Save adds a row showing that name and the current tempo
- [x] The panel stays open after a save and the new row is visible
- [x] An empty library shows a short line in place of the rows
- [ ] Saving does not alter the pattern on the grid, its tempo, or playback
      <!-- grid and tempo covered; playback through a save is not asserted -->
- [x] Both the current pattern and the library survive a reload
- [x] Storage lives under one key, `drumnotes:store`, in the documented shape, with each
      stored pattern carrying its own `version`
- [x] The v1 key `drumnotes:pattern` is deleted at startup and never read
- [x] Two writes in quick succession — a cell tap and a save — both land; neither is lost
- [x] Unit tests cover the pure library module's insert and list, and the codec's whole-store
      round trip
- [x] End-to-end tests cover saving, the row's contents, and survival across a reload
- [x] Existing persistence tests pass against the new key

---

## Phase 2: Load a pattern back onto the grid

**User stories**: 2, 22, 24

### What to build

Tapping a row copies that pattern back onto the grid, tempo and all, and closes the panel so
the drummer is returned to the grid and staff they are about to work on. The loaded value is
a copy: editing afterwards cannot reach the entry that was kept, and the entry does not
change because the grid does.

The load path goes through the pattern state's replace funnel, so the newly loaded pattern
autosaves as the current pattern the same way an edit does.

Deliberately not in this phase: stopping playback (phase 3) and asking before loading over
unkept work (phase 8).

### Acceptance criteria

- [ ] Tapping a row replaces the pattern on the grid with a copy of that entry
- [ ] The staff redraws to match
- [ ] The tempo field shows the tempo the pattern was saved at
- [ ] The panel closes after a load
- [ ] Editing a cell after a load leaves the kept entry untouched — reopening the panel and
      loading it again restores what was saved
- [ ] The loaded pattern is the current pattern after a reload
- [ ] End-to-end tests cover loading, the tempo travelling with it, the panel closing, and
      the entry surviving a post-load edit

---

## Phase 3: Replacing the pattern stops playback

**User stories**: 19, 20, 21, 40

### What to build

The coordination seam, and the rule it exists to hold. `src/state/session.svelte.ts` exposes
the wholesale acts — loading a pattern and clearing the grid — and each stops the transport
and clears the playhead *before* replacing the pattern. The seam sits above both states
because the transport already imports the pattern and the reverse would be a cycle.

Both the Patterns panel and the Clear button are rewired to call the seam rather than
`patternState` directly, so any later replacing act inherits the rule instead of having to
remember it. This reverses the shipped v1 decision that kept the loop running through a
clear; the code comment stating the old rule is rewritten to state the new one.

Editing a cell and retuning stay exactly as they are — they keep taking effect on the next
scheduler tick, without a break.

### Acceptance criteria

- [ ] `src/state/session.svelte.ts` exists and exposes both wholesale acts
- [ ] Loading a pattern while playing stops the transport and clears the playhead
- [ ] Clearing the grid while playing stops the transport and clears the playhead
- [ ] Toggling a cell while playing leaves playback running, and the change is audible on the
      next tick
- [ ] Changing the tempo while playing leaves playback running and retunes as before
- [ ] Clear and the panel both call the seam; neither calls `patternState`'s replace path
      directly
- [ ] The comment in `src/state/pattern.svelte.ts` no longer claims a cleared pattern plays
      as silence
- [ ] ADR 0006 is committed
- [ ] End-to-end tests cover playback stopping on load and on clear, and continuing through a
      cell edit and a tempo change
- [ ] The existing clear tests are updated to the new rule

---

## Phase 4: Delete a row, after asking

**User stories**: 7, 8, 9

### What to build

Each row carries a delete control that asks before it acts, using the same two-press
mechanism the Clear button established: the first press turns the control into a question,
the second answers it, and the question withdraws itself after a timeout or when attention
moves elsewhere. A mis-tap on a phone cannot destroy a groove that cannot be got back.

Deleting removes the entry from the library and writes the pruned map; the pattern on the
grid is untouched, whether or not it came from the row being deleted.

### Acceptance criteria

- [ ] Each row has a delete control carrying a `data-state` of `idle` or `asking`
- [ ] One press arms the question and changes the control's accessible name; the row is not
      removed
- [ ] A second press removes the row
- [ ] An unanswered question withdraws itself after the timeout
- [ ] Moving attention elsewhere withdraws the question, and the next press asks again
- [ ] Arming one row's question does not arm another's
- [ ] Deleting leaves the pattern on the grid and the tempo untouched
- [ ] The deletion survives a reload
- [ ] Unit tests cover removal from the pure library module
- [ ] End-to-end tests cover the ask, the confirm, the timeout, the withdrawal on blur, and
      survival across a reload

---

## Phase 5: Sorted the way I count

**User stories**: 5, 6

### What to build

The list is sorted by name, so a pattern is always in the same place and can be found by
reading rather than hunting. Runs of digits inside a name compare as numbers, so `Pattern 2`
comes before `Pattern 10` instead of after it, and letters compare case-insensitively, so
`bossa` sits with `Bossa` rather than in a separate lower-case district at the end.

Sorting is a pure function of the name alone — no timestamps, nothing a clock can perturb —
and lives in the core library module, with the sorted list derived in the state layer.

### Acceptance criteria

- [ ] Rows appear in natural order by name
- [ ] `Pattern 2` sorts before `Pattern 10`
- [ ] Sorting is case-insensitive: `apple`, `Banana`, `cherry` appear in that order
- [ ] A newly saved row appears in its sorted position rather than at the end
- [ ] The order is identical after a reload
- [ ] Unit tests cover digit runs, mixed case, names with no digits, and names that are
      entirely digits
- [ ] An end-to-end test reads the rendered row order

---

## Phase 6: The name arrives already filled, and Save can be dead

**User stories**: 10, 11, 12, 26, 27

### What to build

Opening the panel costs one press to keep a groove. The name field arrives carrying the
**lowest free** name in a `Pattern N` series — the first gap, not the highest kept number plus
one — and it is unused, so the one-press path never runs into a question. The suggestion is
selected, so typing a real name replaces it without having to clear the field first. Names are
capped at 40 characters and trimmed before use.

"Unused" is judged case-insensitively, like every other name comparison: a kept `pattern 2`
means the series skips to `Pattern 3`.

The Save button goes dead in the two cases where it could only do harm: when the name field
is empty, so nothing is ever kept under no name at all, and when the grid is silent, so the
library cannot fill with empty patterns — matching the Clear button, which is dead for the
same reason.

### Acceptance criteria

- [ ] Opening the panel prefills the name field with the first unused `Pattern N`
- [ ] The suggestion is selected, so typing replaces it outright
- [ ] With `Pattern 1` and `Pattern 3` kept, the suggestion is `Pattern 2`
- [ ] With `Pattern 9` and `Pattern 10` kept, the suggestion is `Pattern 1` — the lowest free
      number, not the highest plus one
- [ ] A kept `pattern 2` is treated as taken; the series offers `Pattern 3`
- [ ] Saving, then reopening the panel, suggests the next unused name
- [ ] The field will not accept more than 40 characters
- [ ] Leading and trailing whitespace is trimmed before the name is used
- [ ] Save is disabled when the field is empty or holds only whitespace
- [ ] Save is disabled when the grid holds no hits, and becomes enabled when one is written
- [ ] Unit tests cover free-name generation against gaps, an empty library, and names that
      collide with the series
- [ ] End-to-end tests cover the prefill, the selection, both disabled states, and trimming

---

## Phase 7: Saving over a name asks first

**User stories**: 14

### What to build

Pressing Save with a name already in the library turns the button into a Replace question
rather than silently overwriting a groove the drummer meant to keep. The same two-press
mechanism as everywhere else: the question lives in the button, withdraws itself on a
timeout, and is taken back when attention moves elsewhere. Answering it replaces that entry;
the row keeps its place in the list and shows the new tempo.

The collision is judged case-insensitively, so typing `bossa` against a kept `Bossa` asks
rather than quietly making a second row. Answering it leaves one row, reading `bossa` — the
name that was typed, since the entry is replaced whole.

Editing the name to one not in use while the question stands puts the button back to Save, so
the question can never be answered against a name other than the one it was asked about.

### Acceptance criteria

- [ ] Saving under an unused name still keeps in one press
- [ ] Saving under a name already in the library arms a Replace question instead of saving
- [ ] A name differing only in case counts as already in the library and arms the question
- [ ] A second press replaces the entry; the list gains no second row with that name
- [ ] After replacing `Bossa` with `bossa`, exactly one row remains, reading `bossa`
- [ ] The replaced row shows the newly saved pattern's tempo
- [ ] An unanswered question withdraws itself after the timeout
- [ ] Moving attention elsewhere withdraws it
- [ ] Changing the name to an unused one while the question stands returns the button to Save
- [ ] End-to-end tests cover the ask, the replace, the withdrawal, and the name change

---

## Phase 8: The row that is on the grid

**User stories**: 15, 16, 17, 18

### What to build

The derived equality search, and the two things it drives.

The row whose pattern equals the one on the grid is marked as being on the grid, so the
drummer knows where they are in their own library. The mark disappears the moment a cell is
changed, because the comparison is recomputed rather than remembered — that divergence is
visible immediately rather than tracked by a flag.

The same comparison gates loading. Tapping a row asks first when the grid holds work that is
not kept anywhere, and does not ask when the grid already matches a kept pattern or holds
nothing at all — so the drummer is only interrupted when something is genuinely at stake. The
question uses the same two-press mechanism as the other two.

### Acceptance criteria

- [ ] The row matching the current pattern is marked, reported as a data attribute and
      announced as part of the row's accessible name
- [ ] Saving marks the row that was just saved
- [ ] Loading marks the row that was just loaded
- [ ] Changing any cell removes the mark immediately
- [ ] Changing the tempo alone removes the mark, since the tempo is part of the pattern
- [ ] Restoring the changed cell restores the mark, without anything having been remembered
- [ ] At most one row is ever marked
- [ ] Tapping a row while the grid holds unkept hits arms a question rather than loading
- [ ] A second press loads
- [ ] Tapping a row loads outright when the grid matches any kept pattern
- [ ] Tapping a row loads outright when the grid is empty
- [ ] The question withdraws itself on timeout and on blur
- [ ] Unit tests cover the equality search: a match, a tempo-only difference, a lane-only
      difference, and an empty library
- [ ] End-to-end tests cover the mark appearing and disappearing, and each of the three load
      cases

---

## Phase 9: Entries the app cannot read are left out

**User stories**: 31, 32, 38, 39

### What to build

The partial decode contract, made real. A library entry that is corrupt, mis-shaped, or
carrying a version this build cannot upgrade yields nothing and is simply absent from the
list — so every row on screen is a row that will actually load, and a pattern kept by a newer
version of the app is left out rather than mangled into music that is not the drummer's under
a name that is. The next write persists the pruned map.

The current pattern's contract stays exactly as it is: it never fails, and falls back to the
default groove, because the grid must show something.

This is also where the per-pattern versioning earns its keep. Today the rule is simply that a
version other than the current one is dropped — there is nothing to upgrade from. What this
phase owes the future is not an upgrader but a *place to put one*: the version check is a
single named step in the entry decode, carrying an explicit contract for what an upgrader
takes and returns. Without that, the day a tom is added, `readLanes`' exact-lane-count check
would fail every kept entry and empty everyone's library — which is the outcome story 38
exists to forbid.

### Acceptance criteria

- [ ] A library entry with rotted JSON is absent from the list; the rest of the library shows
- [ ] An entry with a lane of the wrong length, a missing lane or an unknown instrument id is
      absent
- [ ] An entry with a tempo outside the playable range is absent
- [ ] An entry carrying a version *newer* than this build's is absent rather than loaded
- [ ] An entry carrying an *older* version is absent too, there being no upgrade path yet
- [ ] The version check is one named step with a documented contract for where an upgrader
      slots in and what it must return
- [ ] A store mixing readable and unreadable entries lists exactly the readable ones
- [ ] The next write persists the pruned map; the dropped entries do not return on reload
- [ ] A corrupt *current* pattern still falls back to the default groove, as today
- [ ] A wholly unreadable store yields the default groove and an empty library, not a crash
- [ ] Unit tests cover both codec contracts side by side: a rotted entry, an unknown version,
      and a mixed-version store
- [ ] An end-to-end test seeds a store with a rotted entry and asserts the list

---

## Phase 10: A browser that forbids storage

**User stories**: 29, 30

### What to build

Availability is probed once at startup, since a blocked store never unblocks mid-session.
When it is blocked, the panel contains only a plain line saying that nothing can be kept here
— no name field, no Save button, no list — following the precedent the copy-image control
already set of deciding whether a control *exists* rather than whether it is enabled. The
drummer is never invited to press something that cannot work, and never saves into a void.

The rest of the app carries on: the grid, the staff, playback and export are all unaffected,
and the pattern simply goes unsaved, as it does today.

### Acceptance criteria

- [ ] Availability is probed once at startup, not per operation
- [ ] With storage blocked, the panel shows one explanatory line and nothing else
- [ ] The line states the fact plainly and names no cause it cannot observe
- [ ] No name field and no Save button are rendered at all
- [ ] No rows and no empty-library line are rendered — the two lines are distinct, and the
      blocked one never stands in for the empty one
- [ ] The Patterns control still opens and closes the panel
- [ ] The grid, staff, playback, tempo, clear and export all work as normal
- [ ] Nothing throws, and no error reaches the console during ordinary use
- [ ] An end-to-end test blocks storage and asserts the panel's contents

---

## Phase 11: Narrow width, keyboard and screen reader

**User stories**: 28, 36, 37

### What to build

The audit that proves what the earlier phases built. Every phase writes keyboard-operable,
labelled markup as it goes; this phase verifies it end to end, and fixes whatever the audit
turns up.

The panel and its rows are usable at a narrow width, so the library is not a desktop-only
feature. The panel control, the name field, the rows and the delete controls are all
reachable and operable without a pointer, so the library is as usable as the grid already is.
Each row announces its pattern's name, its tempo and its state, so the list is legible
without seeing the mark.

### Acceptance criteria

- [ ] At a phone width the panel, the field, the button and every row are readable and
      tappable, with no horizontal overflow and no overlapping controls
- [ ] Tap targets meet the size the existing controls already use
- [ ] The Patterns control, the name field, Save, each row and each delete control are
      reachable by keyboard in a sensible order
- [ ] Every one of them is operable by keyboard, including both presses of each confirmation
- [ ] Focus is not lost or stranded when the panel closes after a load, or when a row is
      deleted
- [ ] Each row announces its name, its tempo, and whether it is the pattern on the grid
- [ ] Each armed confirmation announces what the next press will do
- [ ] The panel control announces whether the panel is open
- [ ] End-to-end tests drive a save, a load and a delete entirely from the keyboard
- [ ] An end-to-end test asserts the rows' accessible names at a narrow viewport
- [ ] `CONTEXT.md` and the ADRs match what shipped

---

## Settled

1. **`Pattern N` generation**: the lowest free number. `Pattern 9` and `Pattern 10` kept
   suggests `Pattern 1`.
2. **Names are case-insensitive identities**, stored and shown as typed.
3. **The panel opens between the controls row and the grid**, pushing the grid and staff down.
4. **The mark compares the whole pattern**, tempo included. Retuning unmarks the row and
   re-arms the load question, because a retune is unkept work.
5. **Any version other than the current one is dropped**, newer or older. Phase 9 ships the
   rule and a named seam for a future upgrader, not the upgrader itself.
6. **The empty-library line and the blocked-storage line are two distinct messages.** The
   blocked one states the fact and guesses at no cause.

No unresolved questions remain. The plan is ready to build against.
