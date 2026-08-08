# Third-party notices

drumnotes is licensed under the GPL-3.0-or-later (see `LICENSE`). It redistributes
the works below, each under its own licence. This file records where each one came
from, who wrote it, and the terms it is redistributed under.

## GMRockKit (drum samples)

- **What**: the three samples the app plays — closed hi-hat, snare and bass drum.
  Committed to this repository under `src/assets/samples/` and shipped in the build
  output as content-hashed `.wav` assets. Nothing is fetched from a third-party URL
  at runtime.
- **Kit**: GMRockKit, a sampled 5-piece Pearl DX series kit, `formatVersion` 2,
  `userVersion` 0, as distributed with **Hydrogen 1.2.6**.
- **Origin**: <https://github.com/hydrogen-music/hydrogen>, directory
  `data/drumkits/GMRockKit` at tag `1.2.6`.
- **Authors**: Copyright © 2024 Glen MacArthur / Sebastian Moors.
- **Licence**: GNU General Public License, version 3 or later — as declared in the
  kit's `drumkit.xml`. **This is why drumnotes is GPL**: the samples are
  redistributed with the app, so the app takes their terms.

The hardest-struck variant of each instrument was taken, renamed, and left otherwise
untouched. To re-obtain or update them, from the repository root:

```sh
tag=1.2.6
base="https://raw.githubusercontent.com/hydrogen-music/hydrogen/$tag/data/drumkits/GMRockKit"
curl -fL "$base/HatClosed-Hard.wav" -o src/assets/samples/hihat.wav
curl -fL "$base/Snare-Hard.wav"     -o src/assets/samples/snare.wav
curl -fL "$base/Kick-Hard.wav"      -o src/assets/samples/kick.wav
```

The files committed here are, as SHA-256:

```
af1b3c3297c1ef863812358308c7684a4646a6e9994773826592caf6235e6aed  hihat.wav
d661ff2b52a3d737766c1bbbca406e8c552606c7ccf8a7123a7f8ca55e905ad4  snare.wav
d68e69dd1b54de3193c811cbeff47e3bdabf25b4b7c14428745dd24bf02db807  kick.wav
```

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
