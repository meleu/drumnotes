# Third-party notices

drumnotes is licensed under the GPL-3.0-or-later (see `LICENSE`). It redistributes
the works below, each under its own licence. This file records where each one came
from, who wrote it, and the terms it is redistributed under.

## Bravura (music font)

- **What**: the SMuFL music font the notation is drawn with. Shipped in the build
  output as a content-hashed `.woff2` asset and self-hosted — nothing is fetched
  from a CDN at runtime.
- **Version**: Bravura 1.392, via the npm package `@vexflow-fonts/bravura` 1.0.2.
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
- **Version**: 5.0.0.
- **Origin**: <https://github.com/vexflow/vexflow>.
- **Authors**: Copyright © 2023–present VexFlow contributors (see `AUTHORS.md`
  in the package); Copyright © 2010–2022 Mohit Muthanna Cheppudira.
- **Licence**: MIT. The full text ships with the npm package as `LICENSE`.
