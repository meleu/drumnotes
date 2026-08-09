# A hand-rolled lookahead scheduler rather than a transport library

Playback is a coarse timer whose every firing hands the audio hardware each hit falling in
a short upcoming window, with the window arithmetic kept as a pure function in the core so
timing is unit-tested rather than listened to. A transport library would interpose its own
scheduling between tapping a cell and hearing it, and auditioning has to be instant for
the grid to feel like an instrument — that requirement, not the scheduling itself, is what
ruled the library out.

## Consequences

Auditioning is not suppressed during playback, so a cell written just before the playhead
reaches it sounds twice: once from the tap, once on the beat. This is deliberate, not a
defect — silencing the grid mid-loop would make editing feel dead exactly when the user is
most engaged. Edits and tempo changes take effect on the next firing and already-scheduled
hits are never retracted, so the window size bounds how quickly an edit becomes audible.
