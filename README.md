# drumnotes

Quickly sketch drum loops and see them in real musical notation.

## The problem I want to solve

I want to sketch drum loops quickly and immediately see them written out as an
actual music notation. The options I've found force a trade-off:

- drum-machine grids that let me build a groove fast but never show
  me proper sheet music (or offer them as an easy way to print)
- music notation software shows me beautiful sheet music but is slow and
  clumsy for just trying out a beat.

When I have a pattern in my head, I want to both _hear_ it and
_see it as an actual music sheet_.

## Running it

Node and pnpm versions are pinned in `.tool-versions` so you can use a runtime manager like [mise](https://mise.jdx.dev/).

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # production build into dist/
pnpm preview      # serve that build — the only place the service worker runs
```

### Tests

```sh
pnpm test:unit    # vitest, node environment — the pure core
pnpm test:e2e     # playwright, chromium — the app in a browser
pnpm test         # both
pnpm verify       # format, lint, typecheck, unit tests — the pre-commit gate
```

`verify` is what a change has to pass. The browser suite is separate because it
needs a browser downloaded and two servers up.

## How it is put together

A client-only SPA. No router, no server, no framework beyond Svelte 5 — one HTML
file mounting one component tree.

The split that matters is **pure core / browser adapters**:

- **`src/core/`** — the whole domain, in plain TypeScript. The pattern document
  and its constants, the codec, the grid → `Score` IR conversion that makes every
  musical decision (durations, rests, beaming), the scheduler arithmetic, the
  export geometry. It imports no Svelte, no DOM, no VexFlow, and it is where
  essentially all of the unit tests live — a music bug is a failing test, not
  something you squint at on a staff.
- **`src/adapters/`** — the thin browser-facing edges: VexFlow, Web Audio, local
  storage, canvas export. Each one is narrow enough to be obvious, and each one
  keeps its library from leaking anywhere else. The notation adapter has one
  drawing routine, which is why the screen and the PNG cannot disagree.
- **`src/state/`** — Svelte runes, exported as singletons. The only reactive
  code in the project. Components read from these; the core never sees them.
- **`src/components/`** — the views. They render state and call adapters.

Unit tests sit beside the module they cover (`src/**/*.test.ts`, node
environment). Browser tests live in `tests/e2e/` and assert on DOM structure and
counts — never on pixels, with one deliberate exception in the export spec,
where the file handed to the user is the claim being made.

`public/sw.js` is a hand-written service worker — no PWA plugin, no dependency.
It precaches only the entry document and caches everything else as it is
requested, so it never has to know a hashed filename and no build step generates
a manifest. It is registered in production builds only, so it never sits between
the dev server and a reload.

## License

drumnotes is licensed under the **GPL-3.0-or-later** (see `LICENSE`).

`NOTICE.md` records the origin, authors, kit version and licence of everything
redistributed here.
