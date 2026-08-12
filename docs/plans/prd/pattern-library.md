# Pattern library

## Problem Statement

drumnotes remembers exactly one groove. Whatever is on the grid follows you to the next
visit, and that is the whole of it — there is nowhere to put a second pattern.

So the app punishes the thing it is best at. Sketching a new idea means destroying the last
one, and there is no undo anywhere to get it back. A drummer who works out a bossa on
Monday and wants to try a funk sixteenth feel on Tuesday has to choose between them. The
only way to keep both today is to export a PNG, which preserves a picture of the notation
and nothing that can be played, edited or loaded back.

The result is that grooves worth keeping are not kept, and the sketchpad quietly becomes a
place where work goes to be overwritten.

## Solution

A library: patterns kept by name inside the browser, alongside the one on the grid.

A **Patterns** control in the existing row opens a panel holding a name field, a Save
button, and the patterns kept so far — each showing its name and the tempo it was saved at,
with a delete beside it. Save takes a copy of what is on the grid and keeps it under a name.
Tapping a row loads a copy back onto the grid.

Copies, both ways. The pattern on the grid is never a member of the library, so tweaking a
groove after loading it cannot damage the copy that was kept, and there is no unsaved-changes
state to track, mark or worry about. The app asks before destroying anything: before
replacing a name that is already in use, before loading over work that is not kept anywhere,
and before deleting a row.

Everything stays on the machine. No accounts, no server, no sharing.

## User Stories

1. As a drummer, I want to save the groove currently on the grid under a name, so that I can
   come back to it after working on something else.
2. As a drummer, I want to load a saved pattern back onto the grid, so that I can hear and
   edit a groove I worked out earlier.
3. As a drummer, I want to see every pattern I have kept in one list, so that I can tell at a
   glance what I have to work with.
4. As a drummer, I want each row in the list to show the tempo the pattern was saved at, so
   that I can tell two similar grooves apart without loading them.
5. As a drummer, I want the list sorted by name, so that a pattern is always in the same
   place and I can find it by reading rather than by hunting.
6. As a drummer, I want names containing numbers to sort the way I count, so that Pattern 2
   comes before Pattern 10 instead of after it.
7. As a drummer, I want to delete a pattern I no longer want, so that the list stays short
   enough to scan.
8. As a drummer, I want deleting to ask before it happens, so that a mis-tap on a phone does
   not destroy a groove I cannot get back.
9. As a drummer, I want the delete question to withdraw itself if I ignore it, so that an
   armed control is never left lying around waiting for a stray tap.
10. As a drummer, I want the save field to arrive already carrying an unused name, so that
    keeping a groove costs one press when I have not thought of a name yet.
11. As a drummer, I want that suggested name selected when the field opens, so that typing a
    real name replaces it without my having to clear the field first.
12. As a drummer, I want the suggested name to be one that is not already in use, so that the
    one-press path never runs into a question.
13. As a drummer, I want to type my own name for a pattern, so that the list describes the
    music rather than the order I made it in.
14. As a drummer, I want saving over a name that already exists to ask first, so that I do not
    silently replace a groove I meant to keep.
15. As a drummer, I want to be told which row is the pattern currently on the grid, so that I
    know where I am in my own library.
16. As a drummer, I want that mark to disappear the moment I change a cell, so that I can see
    that what I am playing has diverged from anything I have kept.
17. As a drummer, I want loading to ask before replacing work that is not saved anywhere, so
    that a groove I was in the middle of is not lost to a single tap.
18. As a drummer, I want loading *not* to ask when the grid already matches a kept pattern or
    is empty, so that I am only interrupted when something is genuinely at stake.
19. As a drummer, I want loading a pattern to stop playback, so that I hear the new groove
    from the top when I choose to rather than cut into the middle of it.
20. As a drummer, I want clearing the grid to stop playback too, so that the app behaves the
    same way whenever the whole pattern is replaced.
21. As a drummer, I want editing a cell or changing the tempo to leave playback running, so
    that I can still shape a groove while it loops.
22. As a drummer, I want a loaded pattern to bring its tempo with it, so that the groove plays
    as it was written rather than at whatever number happened to be in the box.
23. As a drummer, I want the panel closed when the app opens, so that the interface looks
    exactly as it does today until I ask for the library.
24. As a drummer, I want the panel to close after I load something, so that I am returned to
    the grid and staff I am about to work on.
25. As a drummer, I want the panel to stay open after I save, so that I can see the new row
    appear and know it worked.
26. As a drummer, I want the Save button to be dead when the grid is silent, so that the
    library does not fill with empty patterns.
27. As a drummer, I want the Save button to be dead when the name field is empty, so that
    nothing is ever kept under no name at all.
28. As a drummer on a phone, I want the panel and its rows to be usable at a narrow width, so
    that the library is not a desktop-only feature.
29. As a drummer using a browser that forbids storage, I want the panel to tell me plainly
    that nothing can be kept here, so that I do not save into a void and lose work.
30. As a drummer using such a browser, I want no name field and no Save button to be shown at
    all, so that I am never invited to press something that cannot work.
31. As a drummer, I want a pattern the app cannot read to be left out of the list, so that
    every row I can see is a row that will actually load.
32. As a drummer, I want a pattern kept by a newer version of the app to be left out rather
    than mangled, so that I am never handed music that is not mine under a name that is.
33. As a drummer, I want the groove on the grid to survive a reload exactly as it does today,
    so that the library adds to what I already rely on rather than replacing it.
34. As a drummer, I want my library to still be there on the next visit, so that keeping a
    pattern means keeping it.
35. As a drummer, I want everything to stay on my own machine, so that using the app costs no
    account and no upload.
36. As a keyboard user, I want the panel, the field, the rows and the delete controls to be
    reachable and operable without a pointer, so that the library is as usable as the grid is.
37. As a screen-reader user, I want each row to announce the pattern's name, its tempo and its
    state, so that the list is legible without seeing the mark.
38. As the developer, I want adding an instrument later to leave the existing library
    readable, so that a tom or a ride does not cost every pattern anyone has kept.
39. As the developer, I want adding dynamics later to be one versioned change to a pattern's
    stored shape, so that the upgrade path is per pattern rather than all or nothing.
40. As the developer, I want the rule about replacing the pattern stopping playback to live in
    one place, so that a later way of replacing it inherits the rule instead of forgetting it.

## Implementation Decisions

### The model

- **The pattern on the grid is not a member of the library.** Save copies out of the grid;
  load copies back in. The two values are never joined afterwards, so editing after a load
  cannot reach what was kept. Recorded as an ADR.
- **No dirty state.** There is no open document, so there is no unsaved-changes marker, no
  save-as and nothing to reconcile.
- **The name is the identity.** Names are unique; there are no generated ids; renaming is not
  offered. Saving under a name already in use replaces that entry, after asking.
- **"Is the grid already kept?" is derived, not remembered.** It is answered by comparing the
  current pattern value against the entries in the library — the same comparison drives both
  the load guard and the marked row. Patterns are already immutable comparable values, so this
  needs no tracking machinery.

### Vocabulary

- **Library** enters the glossary: the patterns kept by name, each a copy taken when it was
  saved. Already written into `CONTEXT.md`.
- No new term for the pattern on the grid. The existing reactive accessor keeps its name, and
  "current pattern" is the prose. A `Sketch` term was considered and rejected as a second word
  for a thing that already has one.

### Storage

- **One key holds the whole store**: the current pattern plus the map of name to pattern. The
  key used by v1 for the single autosaved pattern is abandoned and deleted once at startup;
  there are no users, so nothing is migrated.
- **Versioning is per pattern, not per store.** Every pattern inside the store carries the
  version its payload already carries. The container's shape is fixed and does not carry a
  version of its own, so adding instruments or dynamics later is one bump plus a per-entry
  upgrade or drop — never a wholesale migration, and a mixed-version library stays readable.
- **The current pattern is stored as just another entry**, so it and the library entries
  decode through one code path and cannot drift apart.
- **The storage adapter owns the merge.** It holds the last-written store in memory and merges
  each write into it, so an autosave (which fires on every cell tap) and a library write cannot
  clobber one another, and neither re-parses the whole store on every tap.

### Decoding

Two contracts, deliberately different:

- The **current pattern decodes totally** — never fails, falls back to the default groove on
  anything unreadable, exactly as today, because the grid must show something.
- A **library entry decodes partially** — corrupt, mis-shaped or carrying a version this build
  cannot upgrade yields nothing, and the entry is simply absent from the list. The list
  therefore only ever contains patterns that will actually load. The next write persists the
  pruned map.

### Playback

- **Any wholesale replacement of the pattern stops the transport and clears the playhead** —
  loading and clearing alike. Editing a cell and changing the tempo do not, and continue to
  take effect on the next scheduler tick as they do today.
- This **reverses a v1 decision** that deliberately kept the loop running through a clear so
  hits could be tapped back in over the pulse. Recorded as an ADR, and the code comment stating
  the old rule is rewritten.
- **The rule lives in a coordination seam** in the state layer, above both the transport and
  the pattern, because the transport already depends on the pattern and the reverse would be a
  cycle. Controls call the seam rather than the pattern state directly, so any later replacing
  act inherits the rule.

### Interface

- A **Patterns control in the existing controls row** toggles a disclosure panel beneath it.
  Closed on load. No modal, no overlay — consistent with an app that has none.
- The panel holds, in order: the name field, the Save button, and the rows.
- **Rows** show name, tempo and a delete control. The row matching the current pattern is
  marked as being on the grid.
- **All three confirmations use the existing two-press mechanism** the Clear button
  established — the question lives in the control itself, times out unanswered, and is taken
  back when attention moves elsewhere. They are: Save becoming Replace on a name collision,
  a row asking before loading over unkept work, and delete asking before removing a row.
- **The name field** is prefilled with the first unused name in a `Pattern N` series, selected
  so typing replaces it, capped at 40 characters, and trimmed before use. An empty field
  disables Save.
- **Save is also disabled when the grid is silent**, matching the Clear button, so the library
  cannot fill with empty patterns.
- The panel **closes after a load** and **stays open after a save**.
- An empty library shows a short line in place of the rows.
- **Storage availability is probed once at startup**, since a blocked store never unblocks
  mid-session. When blocked, the panel contains only an explanatory line — no field, no button,
  no list — following the precedent already set by the copy-image control, which decides
  whether it exists rather than whether it is enabled.
- Controls carry data attributes for testing, matching the conventions already in use.

### Module shape

Following the existing layering — pure core, browser adapters, reactive state, components:

- A **new pure library module in the core**: the name-to-pattern map, natural-order sorting,
  lookup, insert, remove, free-name generation, and the equality search that answers whether a
  pattern is already kept. No storage, no runes, no DOM.
- The **codec** gains whole-store serialisation and parsing, keeps its existing total pattern
  parse for the current pattern, and adds the partial entry decode.
- The **storage adapter** is rewritten around the single key, the in-memory merge, the startup
  deletion of the abandoned key, and the availability probe.
- A **new reactive library state**: the map, save and delete, the derived sorted list, and the
  derived match against the current pattern.
- A **new coordination seam** exposing the two wholesale acts, both stopping the transport
  first.
- A **new panel component**, placed in the controls row.
- The **pattern state** keeps its existing accessor and gains a replace path; its comment about
  playback is corrected.

### Testing

- Unit tests for the pure library module — sorting, uniqueness, free-name generation, the
  equality search — and for the codec's two contracts, including a rotted entry, an unknown
  version and a mixed-version store.
- End-to-end tests for saving, loading, each of the three confirmations, the entry dropped on
  rot, the panel's blocked-storage state, the marked row appearing and disappearing, and
  playback stopping on both load and clear.
- No test may depend on a clock: entries carry no timestamps and ordering is a function of the
  name alone.

## Out of Scope

- **Sharing of any kind.** No URL-encoded patterns, no server, no accounts, no export of a
  pattern to a file and no import of one. The library is one browser on one machine.
- **Renaming** a kept pattern. Names are identities; changing one means saving under the new
  name and deleting the old.
- **Duplicate names.** Two patterns cannot share one.
- **Undo**, for any act — saving, loading, clearing or deleting. The confirmations are the
  whole of the protection.
- **Folders, tags, search, favourites or manual reordering.** A flat, alphabetically sorted
  list is the entire organisational model.
- **Any cap on the library's size.** A pattern is a few hundred bytes against a multi-megabyte
  budget; exhausting it from patterns alone is not a real failure mode.
- **Timestamps and history.** No "last saved", no revisions, no recovering a replaced pattern.
- **Migrating v1 data.** The old key is deleted rather than read.
- **The instruments and dynamics themselves.** This work only ensures the stored shape can
  absorb them later; it does not add them.
- **Visual refinement.** The panel uses the same plain scoped CSS and light theme as the rest
  of the app.

## Further Notes

- The decision to compare values rather than track edits is what keeps this feature small. It
  is the reason there is no dirty flag, no "open pattern" concept, no save-as, and no way for
  the interface and the model to disagree about whether something has been kept. It is
  affordable only because a pattern is already an immutable, comparable value, and it would
  have to be revisited if patterns ever became large enough that comparing them was not free.
- The playback reversal is the one place this work overrides a shipped decision rather than
  extending one. The old reasoning — that a clear should leave the pulse running so hits can be
  tapped back in — is genuinely good, and it lost to consistency rather than to being wrong. If
  live-erasing turns out to be missed in practice, that is the ADR to reopen.
- ADR 0004 listed a second saved pattern among the doors v1 deliberately left shut, and warned
  that items on that list have design work in front of them and are anticipated nowhere in the
  code. That warning held: most of the decisions above are about consequences that only appear
  once there is more than one pattern — what a name means, what happens to unkept work, what an
  unreadable entry does, and what the transport should do about any of it.
- Two ADRs record the load-bearing decisions: one on the current pattern not being a member of
  the library, one on replacing the pattern stopping playback. The storage layout and the
  per-pattern versioning were considered for a third and deliberately left to code comments, as
  most of this codebase's reasoning already is.
