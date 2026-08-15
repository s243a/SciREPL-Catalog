# Escalated improvement suggestions (workers → supervisor → controller → owner)

## From the fr Mode B polish session (agy, 2026-08-15)

**Pedagogy — perimeter vs area framing (compute-pi, all locales).**
Cells 1-4 develop Archimedes' method via inscribed/circumscribed polygon
half-perimeters (n × half-chord → π), but cell 5 (symbolic_limit)
symbolically verifies the inscribed AREA formula ((n/2)·sin(2π/n) → π).
Both converge to π, yet the switch is unexplained. Suggestion: either a
sentence explaining that the symbolic check concerns area, or use the
perimeter form n·sin(π/n) for continuity. Change would land in the ENGLISH
source and re-translate to all locales.

*Status: awaiting owner decision.*

## From the controller (mojibake incident, 2026-08-15)

**Upstream (SciREPL-MCP, for Sol): agent-output streaming corrupts
multi-byte UTF-8 at chunk boundaries.** 24 U+FFFD corruptions across 10
locale workbooks traced to worker JSON transported over the broker's agent
streaming path — the classic split-multibyte-char-then-decode-per-chunk
bug. Suspect `child.stdout.on('data', b => b.toString())`-style decoding
in the broker; fix is an incremental decoder (`new TextDecoder('utf-8')`
with `{stream: true}`, or Node's `string_decoder`). Catalog-side guards now
reject U+FFFD at four layers (span-apply, apply-renames, span-derive,
build-pages), but the transport should stop corrupting regardless.

*Status: catalog repaired + guarded; broker fix proposed to Sol.*
