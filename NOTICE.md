# Third-party notices

drumnotes is licensed under the GPL-3.0-or-later (see `LICENSE`). It redistributes
the works below, each under its own licence. This file records where each one came
from, who wrote it, and the terms it is redistributed under.

## GMRockKit (drum samples)

- **What**: the samples the app plays.
  A subset of the kit — 41 of its 86 files — committed to this repository under
  `src/assets/samples/GMRockKit/` under the kit's own filenames: four dynamics
  (`-Softest`, `-Med`, `-Hard`, `-Hardest`) for each of the closed, open and
  pedal hi-hat, snare, kick, ride, crash, two toms and floor tom, plus
  `HatClosed-Soft.wav`. The instruments the app does not yet play are committed
  alongside the ones it does, so adding a row is a change to one table rather
  than a fresh trip to the source.
  Of those 41, only the files the app actually references are shipped, as
  content-hashed `.wav` assets in the build output; the rest reach no user.
  Nothing is fetched from a third-party URL at runtime.
- **Origin**: <https://github.com/hydrogen-music/hydrogen>, directory
  `data/drumkits/GMRockKit` at tag `1.2.6`.
- **Authors**: Copyright © 2024 Glen MacArthur / Sebastian Moors.
- **Licence**: GNU General Public License, version 3 or later — as declared in the
  kit's `drumkit.xml`.

## Bravura (music font)

- **What**: the SMuFL music font the notation is drawn with. Shipped in the build
  output as a content-hashed `.woff2` asset and self-hosted — nothing is fetched
  from a CDN at runtime.
- **Origin**: <https://github.com/steinbergmedia/bravura> (`redist/` directory).
- **Authors**: Copyright © 2019 Steinberg Media Technologies GmbH
  (<http://www.steinberg.net/>), with Reserved Font Name "Bravura".
- **Licence**: SIL Open Font License, Version 1.1 —
  <http://scripts.sil.org/OFL>. The full text ships with the npm package as
  `LICENSE.txt`.

## VexFlow

- **What**: the music notation renderer. Bundled into the application's
  JavaScript. drumnotes imports its font-free entry point (`vexflow/core`), so
  the font above is the one that is redistributed rather than the copy VexFlow's
  default entry point inlines.
- **Origin**: <https://github.com/vexflow/vexflow>.
- **Authors**: Copyright © 2023–present VexFlow contributors (see `AUTHORS.md`
  in the package); Copyright © 2010–2022 Mohit Muthanna Cheppudira.
- **Licence**: MIT. The full text ships with the npm package as `LICENSE`.
