# SciREPL Catalog

Community content for [SciREPL](https://github.com/s243a/SciREPL): workbooks,
packages, and bundles beyond the curated set that ships inside the app —
including translated editions of the built-in workbooks.

The machine-readable index is [`scirepl-catalog.json`](scirepl-catalog.json)
at the repository root. SciREPL's Browse dialog reads that index when this
repository is added as a catalog source; the files under `workbooks/` and
`packages/` are the artifacts it installs.

## Adding this catalog to SciREPL

In SciREPL: **Menu → Browse Packages, Bundles & Workbooks → Sources → Add**,
and paste:

```
https://github.com/s243a/SciREPL-Catalog
```

Items from this catalog appear when you search. The curated built-in list is
unaffected.

> Catalog sources require a SciREPL version with the Sources panel.
> The stable channel changes only when a catalog release is published;
> staged additions on a development branch are not yet a stable release.

## Documentation

- [docs/reviewed-examples.md](docs/reviewed-examples.md) — six staged science/data lessons, execution order, limitations and translation gates
- [docs/translation-process.md](docs/translation-process.md) — how every translated edition is produced (both passes)
- [docs/translation-pipeline-modes.md](docs/translation-pipeline-modes.md) — mechanical vs sandboxed-polish modes, worker access levels
- [docs/locale-policy.md](docs/locale-policy.md) — what translates per locale; per-script identifier policy; the Arabic decision
- [docs/field-lessons.md](docs/field-lessons.md) — every bug the campaign found, and the guard that locks it
- [docs/distribution.md](docs/distribution.md) — releases, the Pages channel, integrity model
- [bench/README.md](bench/README.md) — the executable pipeline tooling

## Layout

```
scirepl-catalog.json      the index — every installable item, with sha256
workbooks/<locale>/       notebooks (.srwb / .ipynb), one directory per language
packages/                 package zips
tools/build-index.mjs     recomputes sha256/size for every item from the files
```

- **Cell names stay in English** in translated editions. Names are
  load-bearing identifiers — `nb_read("cell_name", …)` references them from
  code cells, which translations must keep byte-identical — and a translated
  editions must preserve them. Markdown, comments and display text can
  translate under the current two-phase pipeline; code/data tokens stay
  unchanged, and output-bearing translations are re-tested in the app.
- Item `locales` use BCP 47 tags (`en`, `ja`, `pt-BR`). A translated edition
  of a workbook is a **separate item** with its own id (e.g. `compute-pi-ja`),
  not a variant of the English one.
- `id` must be unique within this repository. SciREPL namespaces it as
  `source:id`, so collisions with other catalogs are fine.
- `revision` is a monotonically increasing integer per item. Bump it whenever
  the artifact bytes change — and only then. `tools/build-index.mjs --check`
  fails if bytes changed without a revision bump, or vice versa.
- `sha256` is required here (the format makes it optional; this repository
  does not publish unverified items). Never hand-edit it — run the tool.

## How the translations are made

The six new science/data lessons have 72 machine-translated editions across
12 non-English locales, alongside their English sources. **Native-speaker
review is pending.** AI review, structural gates and browser tests check
source fidelity and numerical behavior; they do not certify natural wording
or specialist terminology. Corrections from readers are welcome.

Every non-English edition comes from a supervised multi-agent pipeline —
machine translation with per-action human-policy review and a mechanical
verification gate. The process, its gates, and its economics are documented
in [docs/translation-process.md](docs/translation-process.md).

## Publishing a change

1. Add or edit the artifact under `workbooks/` or `packages/`.
2. Add or update its entry in `scirepl-catalog.json` (id, name, description,
   type, kernels, locales, path, revision for format 2.0).
3. `node tools/build-index.mjs` — fills in `sha256` and `size` from the files.
4. Commit and push. The app fetches the index via jsDelivr / raw.githubusercontent,
   both of which serve this repository with CORS headers.

Format 2.0 artifact `path`s are repository-relative; the app resolves them
against the pinned catalog source. Legacy format 1.0 uses raw GitHub URLs.
See [distribution.md](docs/distribution.md) for stable releases and commit pins.

## Licence

MIT, matching SciREPL itself. Contributions are accepted under the same
licence.
