# Catalog distribution channels

Design agreed 2026-08-14 (Sol's review + Fable's implementation). The app
offers four understandable source choices; each maps to one channel below.

## The four channels

| App choice | Channel | Mutability |
|---|---|---|
| **Latest stable** (recommended, default once v0.1.0 exists) | GitHub Pages `stable.json` | updated only by publishing a release |
| **Specific release** | Pages `releases/<tag>/` | immutable |
| **Specific commit** (advanced) | `raw.githubusercontent.com/<repo>/<commit>/<path>` | immutable |
| **Development `main`** (advanced, volatile warning) | raw GitHub on `main` | mutable |

Before v0.1.0 exists the app shows **"Bundled snapshot"** as the default —
not a misleading "Latest stable". The bundled snapshot is also the offline
and network-failure fallback forever: a Pages or GitHub outage must never
remove an already-working catalog. The app caches the last verified release
descriptor + index and requires confirmation if an observed tag→commit
mapping changes.

## Pages site layout

```
stable.json                      # latest stable release descriptor
releases.json                    # all releases, newest first
releases/<tag>/release.json      # per-release descriptor
releases/<tag>/catalog.json      # that release's index, byte-verbatim
releases/<tag>/files/<path>      # workbook artifacts, hash-verified at build
```

The release descriptor carries `tag`, resolved `commit`, `catalog`,
`files_base` (Pages-hosted artifacts), `raw_base` (equivalent immutable
commit-pinned URLs), and the index's own sha256/size. The app may fetch
artifacts from either base; per-item `sha256`/`size` in the index verify
artifact integrity, and the commit pin separately guarantees a coherent
snapshot. (An index cannot contain its own commit SHA — the descriptor
layer exists exactly for that.)

## Index schema (format_version 2.0)

Items carry repository-relative `path` (plus `sha256`, `size`, `revision`)
instead of absolute raw-main URLs. Resolution is `base + path`, where base
comes from the chosen channel. No source loader shipped against 1.0, so
this was a clean break, not a deprecation.

Locale rule: official source items for the selected language are shown even
with an empty search (Spanish-only mode lists all Spanish workbooks).

## Publishing a release

1. Tag `vX.Y.Z` on main and publish a GitHub release for it.
2. The `pages` workflow rebuilds the site from **all** release tags
   (re-verifying every artifact against its index hash — a mismatch fails
   the build) and deploys. History persists because the site is a pure
   function of the tags.

Pre-release tags (any suffix after vX.Y.Z) are ignored by the stable
channel; preview content never appears on the official Pages endpoint.

## Scale guardrails

Pages limits: 1 GB site, ~100 GB/month soft bandwidth. Current corpus is
~1 MB per release — years of headroom. The descriptor's `raw_base` and the
schema's relative paths keep mirrors interchangeable: any static host that
serves the same layout is a valid mirror.
