# The current pattern is not in the library

Save takes a copy of the pattern on the grid and keeps it under a name; load takes a copy
back out. The two are never the same value afterwards, so editing after a load cannot reach
what was kept, and nothing on the grid has a name of its own. The obvious alternative — the
library as the only storage, one entry open and autosaved the way a text editor holds a
file — was rejected because it leaves no way to try something on top of a kept groove and
back out of it, in an app with no undo anywhere. ADR 0004 listed "no second saved pattern"
among the doors v1 left deliberately shut; this is that door, opened this way.

A name is the identity of a kept pattern, so two can never share one and saving over a name
replaces what was there, after asking.

## Consequences

There is no dirty state, no unsaved-changes marker and no save-as, because there is no open
document to be dirty. Whether the grid holds something already kept is answered by comparing
it against the library, not by remembering where it came from — which is why loading asks
before replacing unkept work, and why the row matching the grid can be marked without
storing anything to say so. The price is that a groove edited after a load is nameless until
saved again, and saving it back means answering the replace question.
