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

> Catalog sources require a SciREPL version with the Sources panel (in
> development). Until then this repository is content staging.

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
  workbook is only exempt from runtime re-testing because its executable
  surface is provably unchanged. Translate markdown; leave names alone.
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

## Publishing a change

1. Add or edit the artifact under `workbooks/` or `packages/`.
2. Add or update its entry in `scirepl-catalog.json` (id, name, description,
   type, kernels, locales, url, revision).
3. `node tools/build-index.mjs` — fills in `sha256` and `size` from the files.
4. Commit and push. The app fetches the index via jsDelivr / raw.githubusercontent,
   both of which serve this repository with CORS headers.

Artifact `url`s must point at `raw.githubusercontent.com/s243a/SciREPL-Catalog/main/...`
(CORS-open, canonical). GitHub Release URLs do not work from the PWA.

## Licence

MIT, matching SciREPL itself. Contributions are accepted under the same
licence.
