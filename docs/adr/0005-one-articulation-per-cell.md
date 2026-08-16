# One articulation per cell, not two axes

A cell holds a single value — empty, normal, accent, ghost, flam or drag — rather than a
dynamic and an ornament side by side. Engraving keeps those two families apart, and a
drummer combines them freely: an accented flam is bread-and-butter playing, and it is
unwritable here.

The alternative was a cell carrying a dynamic *and* an ornament, which is musically honest
and costs nine renderable combinations, two things to set per cell, and a menu that has to
express a product rather than a list. One value keeps the cell a cell: one tap-sized
decision, one glyph, one radio menu whose entries are the whole truth about what is
written there.

The same "one value" logic decides how an accent is drawn. Hi-hat and snare share a stem
in the hands voice, so a stroke is one note with two heads, and an accent hangs above or
below the whole note — notation has no honest way to point it at one head of a chord.
Accent any head in a voice and the stroke carries one accent. A ghost note escapes this
because parentheses attach to their own notehead, and so does a flam because its grace
note sits at its own instrument's staff position.

## Consequences

The staff is lossy about accents in a way the grid and the audio are not: mark only the
snare and the notation says "this stroke is loud", while the grid still names the snare
and playback still sounds the hi-hat at its plain dynamic. A reader cannot recover the
cell from the page. This is the accepted price of one stroke, one stem — the rule ADR 0001 and the
two-voice model both lean on.

Reversing this later is not a refactor. Cells are stored as their articulation, so a move
to two axes changes the persisted schema, the menu, the grid glyphs and the score
translation together. Anyone asking for accented flams should be told that, not told it is
small because articulations already exist.
