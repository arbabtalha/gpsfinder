#!/usr/bin/env python3
"""Record (or verify) the SHA-256 of every vendored geo-sleuth file.

The skill under `skills/geo-sleuth/` and the upstream mirror under
`vendor/geo-sleuth/` are copies, so they must stay byte-identical to what
Oldcircle/geo-sleuth published. This script writes a manifest and CI re-checks it,
which makes accidental local edits visible instead of silent.

    python3 tools/verify-vendor.py --write     # refresh vendor/geo-sleuth/MANIFEST.sha256
    python3 tools/verify-vendor.py            # verify (exit 1 on any change)
    python3 tools/verify-vendor.py --report    # print counts, exit 0
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "vendor" / "geo-sleuth" / "MANIFEST.sha256"
SKIP_DIRS = {".git", "__pycache__", "node_modules", ".venv"}
# Files this repository adds on purpose: they are not upstream and are exempt.
EXEMPT = {"MANIFEST.sha256", "UPSTREAM.md"}


def tracked_files() -> list[Path]:
    files: list[Path] = []
    for base in (ROOT / "skills" / "geo-sleuth", ROOT / "vendor" / "geo-sleuth"):
        for path in sorted(base.rglob("*")):
            if not path.is_file():
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            if path.name in EXEMPT:
                continue
            files.append(path.relative_to(ROOT))
    return files


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="write the manifest")
    parser.add_argument("--report", action="store_true", help="summarise without failing")
    args = parser.parse_args()

    files = tracked_files()
    current = {str(p): digest(ROOT / p) for p in files}

    if args.report:
        total = sum((ROOT / p).stat().st_size for p in files)
        print(f"{len(files)} vendored files, {total / 1024 / 1024:.1f} MB")
        return 0

    if args.write:
        lines = [f"{h}  {p}" for p, h in sorted(current.items(), key=lambda kv: kv[0])]
        MANIFEST.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"wrote {MANIFEST.relative_to(ROOT)} with {len(lines)} entries")
        return 0

    if not MANIFEST.exists():
        print(f"missing {MANIFEST.relative_to(ROOT)}; run with --write", file=sys.stderr)
        return 2
    recorded: dict[str, str] = {}
    for line in MANIFEST.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        sha, _, path = line.partition("  ")
        recorded[path] = sha

    changed = [p for p in current if p in recorded and recorded[p] != current[p]]
    added = [p for p in current if p not in recorded]
    removed = [p for p in recorded if p not in current]
    for path in changed:
        print(f"modified: {path}", file=sys.stderr)
    for path in added:
        print(f"added to the tree but not the manifest: {path}", file=sys.stderr)
    for path in removed:
        print(f"in the manifest but missing: {path}", file=sys.stderr)
    if changed or added or removed:
        print("\nvendored files differ from the recorded upstream copy", file=sys.stderr)
        return 1
    print(f"vendored copy intact: {len(current)} files match {MANIFEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
