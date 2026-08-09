# Nothing written outlasts its beat

A note or rest holds until its voice's next stroke, or until the beat it starts on runs
out, whichever comes first. Every length reachable under that rule is exactly spellable
as a sixteenth, eighth, dotted eighth or quarter, so nothing crosses a beat or a barline,
no length has two spellings, and ties are impossible — which is why the notation engine
has no tie logic, no cross-barline handling and no spelling search.

## Consequences

Allowing half notes or dotted halves reopens all three at once. Treat any such request as
a significant change to the notation engine rather than a tweak to a table.
