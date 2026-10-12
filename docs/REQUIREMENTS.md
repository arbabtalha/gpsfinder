# Requirements, in full

What each part of this repository needs, what it downloads, and what it does not need.

---

## 1. The web app (`index.html`)

| Requirement | Detail |
|---|---|
| Browser | Any current Chrome, Edge, Firefox or Safari. Tested markup and APIs are standard (ES2020+, `fetch`, `AbortController`, `Intl`, CSS custom properties, `color-mix()`) |
| Node, Python, uv | **Not needed.** The app is one static file |
| Account or key | **None.** Every service it calls is key-less |
| Server | Not required: `file://` works for everything except device geolocation, which browsers restrict to secure contexts |
| Secure context | Needed only for the **Locate** tab (Geolocation API) and clipboard image writes |
| Network | Needed for map tiles, geocoding, elevation, Overpass, Commons and (opt-in) OCR. All local computation — EXIF, maths, reports, metadata stripping — works offline |
| Storage | `localStorage` for the case state (board, clues, confidence, last position). About a few KB |
| OCR | ~12 MB download from jsdelivr or unpkg on first use, cached by the browser afterwards |

Minimum useful environment: a phone browser with a camera and location permission gives you the full Locate panel and photo intake straight from the camera.

## 2. The skill (`skills/geo-sleuth/`)

| Requirement | Detail |
|---|---|
| Python | 3.10 or newer |
| [`uv`](https://docs.astral.sh/uv/) | Runs each script with its declared dependencies, no global installs |
| `curl` | Used by some scripts for downloads |
| An agent that runs shell commands | Claude Code, Codex, Cursor, Gemini CLI, OpenCode, GitHub Copilot, or any equivalent |
| Chrome or Playwright Chromium | Required for reverse image search (`intake.py`, `revimg.py`) and useful for the panorama scripts. `uvx playwright install chromium`; on Linux also `uvx playwright install --with-deps chromium` |
| Disk space | Baseline a few hundred MB. `match.py` and `sat_scan.py` pull torch, transformers and model weights on first use; allow a few GB if you plan to use them |
| Network | Needed for Overpass, geocoding, imagery, elevation and model downloads. `--no-rev` keeps intake local |

Per-script dependency declarations (from each script's `# /// script` header):

| Script | Dependencies installed by `uv run` |
|---|---|
| `board.py`, `clues.py`, `gazetteer.py`, `osm.py`, `poi.py`, `refresh.py`, `regions.py` | none beyond the standard library |
| `baidu_pano.py`, `evidence.py`, `gsv.py`, `intake.py`, `sun.py`, `tiles.py` | `pillow` |
| `exif.py` | `pillow`, `pillow-heif` |
| `geo.py`, `imgprep.py`, `pose.py`, `terrain.py` | `numpy`, `pillow` |
| `doctor.py`, `revimg.py` | `playwright` (`revimg.py` also `pillow`) |
| `ocr.py` | `pillow`, `rapidocr-onnxruntime` (plus Apple Vision bindings on macOS) |
| `match.py`, `sat_scan.py` | `pillow`, `numpy`, `torch`, `transformers`, `opencv-python-headless`, `socksio`, `pysocks`, `requests` |

## 3. Running this repository's checks

| Requirement | Detail |
|---|---|
| Node 20+ | Only for the test tooling: `npm install` pulls `jsdom` for the DOM smoke test |
| `python3` | For the fixture builder, the data-table generator and the vendor verifier |
| `pillow`, `piexif` (Python) | Only to regenerate `tests/fixtures/*.jpg`; the fixtures are committed, so this is optional |

```bash
npm install
npm run verify        # check + unit tests + DOM smoke test
```

Optional Python tooling, isolated in a virtual environment:

```bash
python3 -m venv .venv
.venv/bin/pip install pillow piexif
.venv/bin/python tools/make-test-fixtures.py
```

The reference sunrise/sunset values in the test suite were produced with [`astral`](https://pypi.org/project/astral/) 3.2, an independent implementation; it is not needed to run the tests, only to regenerate those references.

## 4. GitHub Actions

`.github/workflows/verify.yml` runs on every push and pull request: static checks on the page, unit tests, the DOM smoke test, a Python compile and JSON validation pass over the vendored skill, the embedded-table staleness check and the vendor manifest check. `.github/workflows/pages.yml` publishes the app to GitHub Pages. Both use only the runners' pre-installed Node and Python; no secrets are required.

## 5. What is deliberately not required

- No API keys anywhere in the app, because a key in client-side code is a public key.
- No build step, bundler, or framework, because a single HTML file is easier to audit, fork and host.
- No analytics, telemetry, cookies or accounts.
- No server, so nothing can log your photos or coordinates.
