#!/usr/bin/env bash
# Install the vendored geo-sleuth Agent Skill into your coding agents.
#
#   ./install.sh                 install for your user (~/.agents/skills + a Claude Code symlink)
#   ./install.sh --target DIR    install project-locally into DIR/.agents/skills
#   ./install.sh --dry-run       print the plan, change nothing
#   ./install.sh --no-link       skip the Claude Code symlink
#   ./install.sh --force         overwrite an existing installation
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_SKILL="$SOURCE_ROOT/skills/geo-sleuth"
TARGET_HOME="${HOME}"
WANT_LINK=1
DRY_RUN=0
FORCE=0

usage() {
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET_HOME="${2:-}"; [ -n "$TARGET_HOME" ] || { echo "--target needs a directory" >&2; exit 2; }; shift 2 ;;
    --target=*) TARGET_HOME="${1#*=}"; shift ;;
    --no-link) WANT_LINK=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "unknown argument: $1" >&2; usage 2 ;;
  esac
done

say()  { printf '%s\n' "$*"; }
step() { printf '  %s\n' "$*"; }
run()  { if [ "$DRY_RUN" = 1 ]; then step "would run: $*"; else "$@"; fi; }

if [ ! -f "$SOURCE_SKILL/SKILL.md" ]; then
  echo "skills/geo-sleuth/SKILL.md is missing: run this script from a full clone of the repository." >&2
  exit 1
fi

AGENTS_DIR="$TARGET_HOME/.agents/skills"
CLAUDE_DIR="$TARGET_HOME/.claude/skills"
DEST="$AGENTS_DIR/geo-sleuth"
LINK="$CLAUDE_DIR/geo-sleuth"

say "Installing geo-sleuth"
step "source:  $SOURCE_SKILL"
step "agents:  $DEST   (Codex, Cursor, Gemini CLI, OpenCode, GitHub Copilot)"
[ "$WANT_LINK" = 1 ] && step "claude:  $LINK"
[ "$DRY_RUN" = 1 ] && say "(dry run: nothing will be written)"

if [ -e "$DEST" ] && [ "$FORCE" != 1 ]; then
  say ""
  say "$DEST already exists. Re-run with --force to replace it, or remove it yourself."
  exit 1
fi

say ""
say "Dependencies"
missing=0
for cmd in python3 uv curl; do
  if command -v "$cmd" >/dev/null 2>&1; then
    step "found $(command -v "$cmd")"
  else
    step "MISSING: $cmd"
    missing=1
  fi
done
for browser in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$browser" >/dev/null 2>&1; then step "found browser $browser"; break; fi
done
if [ "$missing" = 1 ]; then
  say ""
  say "Install the missing commands before using the skill:"
  say "  python3  https://www.python.org/downloads/"
  say "  uv       https://docs.astral.sh/uv/"
  say "  curl     your package manager"
  say "The web app (index.html) needs none of them."
fi

say ""
say "Files"
run mkdir -p "$AGENTS_DIR"
if [ "$FORCE" = 1 ]; then run rm -rf "$DEST"; fi
run cp -R "$SOURCE_SKILL" "$DEST"
if [ "$WANT_LINK" = 1 ]; then
  run mkdir -p "$CLAUDE_DIR"
  if [ -e "$LINK" ] || [ -L "$LINK" ]; then run rm -rf "$LINK"; fi
  if [ "$DRY_RUN" = 1 ]; then step "would run: ln -s $DEST $LINK"; else ln -s "$DEST" "$LINK"; step "linked $LINK -> $DEST"; fi
fi

say ""
say "Next"
step "1. uv run $DEST/scripts/doctor.py --network"
step "2. Ask your agent: \"find where this photo was taken\" with a photo attached"
step "Docs: $SOURCE_ROOT/docs/INSTALL.md and $SOURCE_ROOT/docs/USAGE.md"
step "Web app (no install needed): open $SOURCE_ROOT/index.html"
say ""
say "Done."
