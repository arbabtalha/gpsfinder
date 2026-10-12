# Upstream copy

Everything in this folder except `MANIFEST.sha256` and this file is copied unchanged from
[Oldcircle/geo-sleuth](https://github.com/Oldcircle/geo-sleuth), MIT licensed.

| | |
|---|---|
| Source repository | https://github.com/Oldcircle/geo-sleuth |
| Revision copied | `b541937` (main, 2026-10-12) |
| Files | 102, including `skills/geo-sleuth/`, `docs/` with the case figures, and `examples/` |
| Licence | MIT (see `../LICENSE`, which is the upstream licence file) |
| Integrity | `python3 tools/verify-vendor.py` checks every file against `MANIFEST.sha256`; CI fails on any difference |

The same skill files also live under `skills/geo-sleuth/` at the repository root, which is the
copy `install.sh`, `install.ps1` and `npx skills add` install. Both trees are covered by the
manifest, so they cannot drift apart silently.

Data files derived from Wikipedia (calling codes, driving side, territories) are CC BY-SA 4.0;
their sources and fetch dates are recorded in `../skills/geo-sleuth/data/README.md`.
