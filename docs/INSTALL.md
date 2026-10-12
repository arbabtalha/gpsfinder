# Installing the geo-sleuth skill (from this repository)

The skill itself is vendored here unchanged: `skills/geo-sleuth/`. This document installs it into your agents and proves that it works.

- [1. What you are installing](#1-what-you-are-installing)
- [2. The one-command installer](#2-the-one-command-installer)
- [3. Manual installation](#3-manual-installation)
- [4. Where each agent looks for skills](#4-where-each-agent-looks-for-skills)
- [5. Prove it works: doctor](#5-prove-it-works-doctor)
- [6. Optional pieces](#6-optional-pieces)
- [7. Updating and verifying the vendored copy](#7-updating-and-verifying-the-vendored-copy)
- [8. Troubleshooting](#8-troubleshooting)

## 1. What you are installing

An [Agent Skill](https://agentskills.io) is a folder with a `SKILL.md` file that tells the agent how to do one job, plus the scripts and data that job needs. `geo-sleuth` is 102 files:

```
skills/geo-sleuth/
├── SKILL.md              the method: three layers, ten hard rules, the six-step flow
├── scripts/              25 Python scripts, each with its own dependencies declared
├── references/           aerial, corridors, geometry, observe, search, sky, verify, data sources
├── data/                 calling codes, driving side, territories, country names
├── regions/              region packs: ca, cn, jp, lk, mm, mx, us (+ a template)
└── tests/                the skill's own regression tests
```

Copy the whole folder. The scripts import helpers from each other and read `data/`, so a partial copy breaks silently.

## 2. The one-command installer

From a clone of this repository:

```bash
git clone https://github.com/arbabtalha/gpsfinder
cd gpsfinder
./install.sh                 # macOS, Linux, WSL
```

```powershell
git clone https://github.com/arbabtalha/gpsfinder
cd gpsfinder
.\install.ps1                # Windows PowerShell
```

What the script does:

1. Checks `python3`/`python`, `curl` and (for the command-line method) `uv`, and says what is missing.
2. Copies `skills/geo-sleuth` to `~/.agents/skills/geo-sleuth` — the directory Codex, Cursor, Gemini CLI, OpenCode and GitHub Copilot all read.
3. Symlinks it into `~/.claude/skills/geo-sleuth` for Claude Code (skipped with `--no-link`).
4. Prints the doctor command and one example prompt.

Flags:

| Flag | Effect |
|---|---|
| `--target DIR` | Install into `DIR/.agents/skills/` instead of your home directory (project-local) |
| `--dry-run` | Print the plan and change nothing |
| `--no-link` | Skip the Claude Code symlink |
| `--force` | Overwrite an existing installation instead of stopping |

## 3. Manual installation

Three commands, no script:

```bash
git clone https://github.com/arbabtalha/gpsfinder
mkdir -p ~/.agents/skills ~/.claude/skills
cp -r gpsfinder/skills/geo-sleuth ~/.agents/skills/
ln -s ~/.agents/skills/geo-sleuth ~/.claude/skills/geo-sleuth
```

Or use the upstream installer, which pulls the same folder straight from GitHub:

```bash
npx skills add Oldcircle/geo-sleuth -g -a claude-code -a codex -a cursor -a gemini-cli -a opencode -a github-copilot -y
```

Both are equivalent. Use the vendored copy when you want the exact revision this repository was tested with (the manifest in `vendor/geo-sleuth/MANIFEST.sha256` records it).

## 4. Where each agent looks for skills

| Agent | User-wide | Per project |
|---|---|---|
| [Claude Code](https://code.claude.com/docs/en/skills) | `~/.claude/skills/` | `.claude/skills/` |
| [Codex](https://developers.openai.com/codex/skills) | `~/.agents/skills/` | `.agents/skills/` |
| [Cursor](https://cursor.com/docs/skills) | `~/.cursor/skills/` or `~/.agents/skills/` | `.cursor/skills/` or `.agents/skills/` |
| [Gemini CLI](https://geminicli.com/docs/cli/skills/) | `~/.gemini/skills/` or `~/.agents/skills/` | `.gemini/skills/` or `.agents/skills/` |
| [OpenCode](https://opencode.ai/docs/skills/) | `~/.config/opencode/skills/` or `~/.agents/skills/` | `.opencode/skills/` or `.agents/skills/` |
| [GitHub Copilot](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) | `~/.copilot/skills/` or `~/.agents/skills/` | `.github/skills/` or `.agents/skills/` |

Any other agent that reads `SKILL.md` and can run shell commands works the same way: put the folder where it looks for skills, or point it at `skills/geo-sleuth/SKILL.md`.

Some agents substitute `${CLAUDE_SKILL_DIR}` automatically; in the others, export it once per shell:

```bash
export CLAUDE_SKILL_DIR="$HOME/.agents/skills/geo-sleuth"
```

## 5. Prove it works: doctor

```bash
uv run ~/.agents/skills/geo-sleuth/scripts/doctor.py
uv run ~/.agents/skills/geo-sleuth/scripts/doctor.py --network
```

The local pass tests Python, `uv`, `curl`, the bundled lookup tables, a writable working directory and an actual browser launch. `--network` also probes the services without uploading a photo. `--json` gives machine-readable output, and exit code 1 means a failed check, so it can gate CI. Passing an endpoint probe does not guarantee image uploads, model downloads, imagery coverage or freedom from CAPTCHAs.

Then check the local pipeline on your own image, without any online search:

```bash
uv run ~/.agents/skills/geo-sleuth/scripts/intake.py photo.jpg --out-dir intake --no-rev
```

Open `intake/intake.md` and look at the crops and the OCR output. This exercises metadata, image preparation and OCR on your own hardware.

## 6. Optional pieces

| Feature | Needs |
|---|---|
| Reverse image search (`intake.py`, `revimg.py`) | Google Chrome or Playwright Chromium: `uvx playwright install chromium`, or `uvx playwright install --with-deps chromium` on Linux |
| Street-view matching (`match.py`), satellite ranking (`sat_scan.py`) | First run pulls `torch`, `transformers`, `opencv-python-headless` and model weights. Allow disk space and time |
| Local OCR fallback | macOS uses Apple Vision; other systems use RapidOCR, installed on first use |
| HEIC photos | `exif.py` declares `pillow-heif`, installed on first use |
| The web app | a browser only — no Python, no uv, no install |

Per-script dependencies are declared in each script's `# /// script` header and installed by `uv run` on demand. Nothing needs a global `pip install`.

## 7. Updating and verifying the vendored copy

The copy in this repository is byte-identical to upstream as of commit `b541937`. To confirm that it is untouched:

```bash
python3 tools/verify-vendor.py        # checks all 102 files against MANIFEST.sha256
```

To refresh it from upstream:

```bash
git clone --depth 1 https://github.com/Oldcircle/geo-sleuth /tmp/geo-sleuth
rm -rf skills/geo-sleuth && cp -r /tmp/geo-sleuth/skills/geo-sleuth skills/
# refresh the upstream mirror too
mkdir -p vendor/geo-sleuth
cp /tmp/geo-sleuth/README.md /tmp/geo-sleuth/README.zh-CN.md /tmp/geo-sleuth/CONTRIBUTING.md /tmp/geo-sleuth/LICENSE vendor/geo-sleuth/
rm -rf vendor/geo-sleuth/docs vendor/geo-sleuth/examples
cp -r /tmp/geo-sleuth/docs vendor/geo-sleuth/docs
cp -r /tmp/geo-sleuth/examples vendor/geo-sleuth/examples
python3 tools/verify-vendor.py --write      # record the new hashes
python3 tools/build-data-tables.py          # refresh the tables embedded in index.html
npm run verify
```

CI runs the same checks, so a stale manifest or stale embedded tables fail the build instead of drifting quietly.

## 8. Troubleshooting

| Symptom | Next step |
|---|---|
| `uv` or `curl` not found | Install the missing command, reopen the terminal, rerun doctor |
| Browser launch fails | Install Chrome or Playwright Chromium, read the doctor error; meanwhile `intake.py --no-rev` still does the local work |
| HTTP 403/429 or a CAPTCHA | Look at the saved screenshot in the work directory, wait, or use the manual browser workflow the agent describes |
| A service times out | `doctor.py --network`, then check the service status and your connection |
| A model fails to load | Check disk space and the download error; the first run is slow by nature |
| The agent ignores the skill | Confirm the folder is in the right skills directory for your agent (section 4), and that `SKILL.md` is at its root |
| Permission errors on `~/.agents` | Create the directory first, or use `--target` for a project-local install |
| Everything works but the web app's OCR button fails | That is a CDN problem, not the skill: `ocr.py` does the same job locally |
