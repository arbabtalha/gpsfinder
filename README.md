# GPS Finder

**Find the GPS position of a photo, of a device, or of a loose coordinate — in one HTML file.**

This repository does two things at once:

1. **`index.html`** — a complete, working GPS locator web app. One file, no build step, no keys, no backend. It reads the GPS block out of a JPEG, converts the datum, verifies the time against the sun, samples terrain elevation, pulls named OpenStreetMap objects and geotagged Commons photos around the point, and exports a case file. It also locates your own device, geocodes coordinates, and runs the geometry that photo-geolocation work needs (shadow ratio, latitude bands, FOV, distance from known-size objects, horizon profiles).
2. **`skills/geo-sleuth/` + `vendor/geo-sleuth/`** — the complete [`Oldcircle/geo-sleuth`](https://github.com/Oldcircle/geo-sleuth) Agent Skill, vendored with its docs, examples and lookup data, so anyone can install it from this repository and drive the full command-line method (CLIP satellite ranking, DINOv2/SIFT street-view matching, reverse image search) with Claude Code, Codex, Cursor, Gemini CLI, OpenCode or GitHub Copilot.

Everything here is free to run and free to fork. Nothing is uploaded anywhere: the app talks straight from your browser to public data providers.

| | |
|---|---|
| **Live app** | <https://arbabtalha.github.io/gpsfinder/> (after the Pages workflow runs once) |
| **Run locally** | open `index.html` in a browser, or `make serve` and visit `http://localhost:8000/` |
| **Skill install** | `./install.sh` (macOS/Linux) or `.\install.ps1` (Windows), or `npx skills add Oldcircle/geo-sleuth` |
| **Tests** | `npm install && npm run verify` — 43 unit tests, 28 live DOM checks, plus static and vendor checks |

---

## Table of contents

- [What the web app does](#what-the-web-app-does)
- [Quick start: the web app in 60 seconds](#quick-start-the-web-app-in-60-seconds)
- [Detailed usage: read a photo that has GPS](#detailed-usage-read-a-photo-that-has-gps)
- [Detailed usage: a photo with no GPS](#detailed-usage-a-photo-with-no-gps)
- [Detailed usage: locate your own device](#detailed-usage-locate-your-own-device)
- [The tools in the Coordinate lab](#the-tools-in-the-coordinate-lab)
- [Installing the geo-sleuth skill](#installing-the-geo-sleuth-skill)
- [Requirements](#requirements)
- [Free APIs this app uses](#free-apis-this-app-uses)
- [Repository layout](#repository-layout)
- [Verification: what was actually run](#verification-what-was-actually-run)
- [Honest limits](#honest-limits)
- [Credits and licenses](#credits-and-licenses)

---

## What the web app does

Five panels, one file, everything client side.

| Panel | What it answers | Powered by |
|---|---|---|
| **Locate** | Where am I? What is at these coordinates? | Browser Geolocation API, Nominatim reverse geocoding, Open-Meteo elevation, six map link builders |
| **Photo GPS** | Where was this photo taken, when, with what, and does the metadata hold up? | Hand-written JPEG/EXIF parser, NOAA solar position maths, Open-Meteo elevation rings, Overpass, Commons geosearch, canvas re-encode for metadata stripping |
| **Investigate** | The file has no GPS. Where could it be? | Tesseract.js OCR on demand, script and calling-code detection, OSM place search, sun/shadow geometry, latitude-band solving, reverse image search hand-off, a likelihood-ratio candidate board |
| **Coordinate lab** | How far is that? How big is that? What does the terrain look like? | Haversine/bearing maths, WGS84 ↔ GCJ-02 ↔ BD-09 conversion, camera FOV and range-from-size maths, DEM horizon profiles, sun path charts |
| **Reference** | Which country is this clue from? Which free API does what? | The vendored geo-sleuth lookup tables (293 calling codes, 241 driving-side rows, 60 territories), the tool-choice table, the ten hard rules |

Everything is implemented in vanilla JavaScript inside `index.html`: the slippy map engine included, so there is no Leaflet, no React, no CDN library at runtime (OCR is the one opt-in download, and only when you press its button).

## Quick start: the web app in 60 seconds

```bash
git clone https://github.com/arbabtalha/gpsfinder
cd gpsfinder
python3 -m http.server 8000      # or: make serve
# open http://localhost:8000/
```

Opening `index.html` directly from disk (`file://`) also works, with one exception: the browser blocks geolocation on `file://`, so use the local server for the Locate tab. Everything else, including EXIF parsing and all the maths, runs offline.

Deploy your own copy: push to GitHub and enable Pages (Settings → Pages → Source: GitHub Actions). The included workflow publishes the repository root, so the app lands at `https://<user>.github.io/gpsfinder/`.

## Detailed usage: read a photo that has GPS

1. Open the app and go to **Photo GPS**.
2. Drop a photo onto the panel, press **Choose a photo**, or press **Paste from clipboard**. On a phone, **Take a photo** opens the camera. The file is read locally; nothing is uploaded.
3. Read the result:
   - **Chips** at the top tell you whether a GPS block was found, what the capture time is, and which camera wrote the file.
   - **Coordinates** are shown in decimal, degrees/minutes/seconds, **GCJ-02** and **BD-09**. The China datums matter: the same point differs by several hundred metres between WGS84 and GCJ-02, and using a Chinese map label as if it were GPS is the most common coordinate mistake in this work.
   - **Map links** open the point in OpenStreetMap, Google Maps, Google Earth, Bing, Apple, Yandex, Street View, Amap and Baidu — each builder uses the datum that service expects.
4. Check the **Sun check at the claimed time**. The app computes the sun azimuth and elevation for the EXIF timestamp at the EXIF position, with the NOAA algorithm. It tells you how long the shadow of a 1 m object should be and which way it should point; if the photo's shadows clearly disagree, either the timestamp or the position is wrong. When the file has a local time but no UTC offset, the time zone at that position is used to resolve it, and the app says so.
5. Press **Compute horizon** for a terrain profile built from elevation samples on nine rings out to 12 km, with Earth curvature and refraction. Compare it with the ridgeline in the picture: a mismatch means a wrong pin, even when the metadata looks confident.
6. Press **Load nearby evidence** for named OpenStreetMap objects within 250 m and geotagged Wikimedia Commons photos within 10 km, both with distances.
7. Press **Download GPS-free copy** to get a re-encoded JPEG with every metadata block removed. The app re-parses the exported bytes and tells you whether the strip actually worked.
8. Press **Case file (.json)** or **Report (.md)** to save everything: coordinates, datum copies, the steps that ran, the evidence, the candidate board and a limits section.
9. **Send coordinates to the candidate board** turns the position into a ranked candidate you can argue with in the Investigate tab.

## Detailed usage: a photo with no GPS

No coordinates in the file is the normal case: messengers, screenshots and social platforms strip EXIF. Work in the **Investigate** tab, in order.

1. **Read the whole picture first.** Roads and lane markings, plates, poles, shopfronts, vegetation, architecture, lettering, shadows, plate colours. Add each one to the board as a clue or a candidate; the board is where the reasoning lives.
2. **OCR.** Press **Read text (English + numbers)**, or the CJK button for Chinese, Japanese and Korean. Tesseract runs in a worker; the first run downloads about 12 MB and caches it. You get the lines, their confidence, the scripts present, language hints and any phone numbers matching a country calling code.
3. **Search candidate places.** The app turns OCR lines into search phrases (digits and noise removed, low-confidence lines dropped) and queries OSM place data, one request per second as the usage policy requires. Anything that looks plausible goes onto the board with a link to check it.
4. **Narrow with the sun.** Measure a shadow ratio in the picture (shadow length divided by object height), or convert a known angle with `ratio`. Then, knowing the capture time in UTC, press **Solve latitude band**: the app scans the globe for the latitudes where the sun stood at that elevation at that moment, draws the band on the map and reports latitude limits. Add a shadow bearing and the band narrows. This is exclusion geometry — it removes latitudes, it does not pick a place.
5. **Reverse image search.** No page can upload to those engines for you, so the app does the honest thing: it puts the image on your clipboard where the browser allows it, offers a copy to download, and opens Yandex, Google Lens, Bing Visual Search, Baidu or TinEye. Paste with Ctrl+V, or drag the downloaded file in. Follow the steps listed under the buttons.
6. **Rank the board.** Each candidate takes evidence for and against, with a likelihood ratio per piece of evidence. The clamps are the ones geo-sleuth's `board.py` enforces: read or computed evidence 0.05–20, observed 0.2–5, inferred 0.33–3. **Run board check** tells you what is missing before you conclude: candidates nobody has tested, exclusions without a computed artefact, level ordering mistakes, and a top candidate with no verified evidence.
7. **Export.** The case file is the geo-sleuth output shape: coordinates plus error radius, the level and tier, evidence used, exclusions, unused clues, and a plain statement of what could not be settled.

## Detailed usage: locate your own device

**Locate** tab. Press **Start locating** for a live fix, **Single fix** for one shot. You get latitude and longitude to six decimals, an accuracy radius drawn to scale on the map, altitude, heading and speed where the device provides them, plus elevation and a reverse-geocoded address on demand. Copy any datum, open the point in any of the map services, or send it to the board.

Accuracy is honest about its source: a phone outdoors with GNSS gives 5–20 m; a laptop without GPS uses WiFi and IP positioning and often gives 500–3000 m. The app labels the quality instead of pretending. Geolocation needs HTTPS or `localhost`, and permission in the browser; the app explains that in place when it is blocked.

## The tools in the Coordinate lab

| Tool | What it computes | Example use |
|---|---|---|
| Coordinate converter | WGS84 ↔ GCJ-02 ↔ BD-09, DMS, geo URI, Baidu and Amap links | A coordinate read off a Chinese map app is GCJ-02, not GPS |
| Distance and bearing | Haversine distance, initial bearing, midpoint, metres per pixel at z17/z19 | How far is that ridge, and which way is the camera facing |
| Camera to distance | 35 mm-equivalent focal length → field of view; known real size and pixel size → distance | A lane is 3.5 m wide and 96 px in the frame |
| Evenly spaced structures | Pixel gaps plus a known span → distance, with an evenness verdict | The "pier ruler" from geo-sleuth case 1: even spacing means a row nearly perpendicular to the sight line |
| Terrain horizon | Elevation samples on rings, curvature and refraction applied, drawn as a horizon chart | Compare with a ridgeline in a photo to reject a wrong pin |
| Sun path | Azimuth and elevation across a day, sunrise, sunset, solar noon, golden hour, twilight | Decide whether a shadow direction is possible at that place on that date |

## Installing the geo-sleuth skill

The full method (region scans, CLIP satellite ranking, DINOv2/SIFT street-view matching, headless reverse image search) needs an agent that can run shell commands. That is what the vendored skill is for.

### Option A — one command, from this repository

```bash
git clone https://github.com/arbabtalha/gpsfinder
cd gpsfinder
./install.sh                  # macOS / Linux
.\install.ps1                 # Windows PowerShell
```

The script copies `skills/geo-sleuth` into `~/.agents/skills/` (read by Codex, Cursor, Gemini CLI, OpenCode and GitHub Copilot), links it into `~/.claude/skills/` for Claude Code, checks for `python3`, `uv`, `curl` and a browser, and prints the next two commands. Options: `--target DIR` for a project-local install, `--dry-run` to see the plan, `--no-link` to skip the Claude Code symlink.

### Option B — the upstream installer

```bash
npx skills add Oldcircle/geo-sleuth -g -a claude-code -a codex -a cursor -a gemini-cli -a opencode -a github-copilot -y
```

### Option C — copy it yourself

```bash
mkdir -p ~/.agents/skills ~/.claude/skills
cp -r skills/geo-sleuth ~/.agents/skills/
ln -s ~/.agents/skills/geo-sleuth ~/.claude/skills/geo-sleuth
```

### Then check it, and use it

```bash
uv run ~/.agents/skills/geo-sleuth/scripts/doctor.py --network   # environment + endpoint probes
```

Hand your agent a photo and say **"find where this photo was taken"**. The agent reads `SKILL.md`, runs `intake.py` (EXIF, crops, OCR, reverse image search in one pass), puts candidates on the board with `board.py`, verifies with `terrain.py`, `match.py` and `sat_scan.py`, and produces an evidence image with `evidence.py`. Step-by-step recipes for both halves are in **[docs/USAGE.md](docs/USAGE.md)** and **[docs/INSTALL.md](docs/INSTALL.md)**.

Per-agent skill directories, when you want a project-local install instead:

| Agent | User-wide | Per project |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| Codex | `~/.agents/skills/` | `.agents/skills/` |
| Cursor | `~/.cursor/skills/` or `~/.agents/skills/` | `.cursor/skills/` or `.agents/skills/` |
| Gemini CLI | `~/.gemini/skills/` or `~/.agents/skills/` | `.gemini/skills/` or `.agents/skills/` |
| OpenCode | `~/.config/opencode/skills/` or `~/.agents/skills/` | `.opencode/skills/` or `.agents/skills/` |
| GitHub Copilot | `~/.copilot/skills/` or `~/.agents/skills/` | `.github/skills/` or `.agents/skills/` |

## Requirements

| For | You need |
|---|---|
| The web app | Any current browser. Nothing else. No account, no key, no install. |
| OCR inside the app | One 12 MB download from a CDN on first use (cached by the browser). |
| The skill (basic) | Python 3.10+, [`uv`](https://docs.astral.sh/uv/), `curl`, an agent that runs shell commands. |
| The skill (reverse image search) | Google Chrome or Playwright Chromium (`uvx playwright install chromium`). |
| The skill (ML steps) | Disk space and patience: `match.py` and `sat_scan.py` download torch, transformers and model weights on first use. |
| Running this repository's tests | Node 20+ (dev dependency: jsdom). The app itself does not need Node. |

Full detail, including per-script dependency lists and troubleshooting, is in **[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)**.

## Free APIs this app uses

All key-less, all called directly from your browser. Verified list with limits and attribution: **[docs/FREE-APIS.md](docs/FREE-APIS.md)**.

| Service | Used for | Notes |
|---|---|---|
| Nominatim (OpenStreetMap) | Address → coordinates, coordinates → address | About 1 request/s, identifying user agent policy |
| Photon (Komoot) | Place search fallback on OSM data | Automatic fallback when Nominatim fails |
| Overpass API | Named OSM objects around a point | Three mirrors tried in order |
| Open-Meteo elevation | Terrain height, 90 points per call | Primary; OpenTopoData (SRTM 30 m) and Open-Elevation are automatic fallbacks |
| Open-Meteo forecast | Time zone and UTC offset for a point | Used to resolve EXIF local time |
| Wikimedia Commons | Geotagged photos near a point | Attribution shown with each thumbnail |
| Esri World Imagery, OSM, OpenTopoMap, CARTO, EOX tiles | Base maps | Attribution rendered on the map, as required |
| Tesseract.js (CDN) | OCR in a web worker | Opt-in, cached, nothing uploaded |

## Repository layout

```
index.html                     the entire web app (one file, no build step)
install.sh / install.ps1       install the vendored skill into your agents
Makefile                       serve, verify, data, fixtures, install-skill
package.json                   test tooling only (jsdom); the app needs no Node
docs/
  INSTALL.md                   skill installation, in full
  USAGE.md                     the command-line method, step by step
  WEBAPP.md                    every panel and every formula of the app
  REQUIREMENTS.md              what has to be installed, per feature
  FREE-APIS.md                 the API research: what is free, what needs a key
  INTEGRATION.md               how this repo and the Costume Web App Kit fit together
skills/geo-sleuth/             the geo-sleuth Agent Skill, installable as is
vendor/geo-sleuth/             upstream README, docs (with case figures), examples, MANIFEST.sha256
tests/                         unit tests plus the EXIF fixtures
tools/                         page checks, DOM smoke test, fixture and data builders, vendor verifier
.github/workflows/             verify.yml (checks) and pages.yml (publish the app)
```

The vendored copies are byte-identical to upstream; `tools/verify-vendor.py` checks all 102 files against `vendor/geo-sleuth/MANIFEST.sha256` in CI, so any local edit shows up instead of hiding.

## Verification: what was actually run

```bash
$ npm run check     # static analysis of index.html
index.html: 274 KB, 3819 lines
  ok  5 inline scripts parse
  ok  1 JSON-LD block validated
  ok  144 element ids referenced by the scripts all exist
  ok  27 icons used, all defined
All static checks passed.

$ npm test          # unit tests on the extracted computation core
# tests 43   # pass 43   # fail 0

$ npm run smoke     # the real page in jsdom, driven like a user
smoke: 28 checks passed
DOM smoke test passed.

$ npm run data      # embedded lookup tables match the skill data
lookup tables already current

$ python3 tools/verify-vendor.py
vendored copy intact: 102 files match vendor/geo-sleuth/MANIFEST.sha256
```

The unit tests do not check the code against itself: solar positions are compared with the outputs of geo-sleuth's own `sun.py`, sunrise and sunset with the independent `astral` library, datum conversions with `geo.py`, and the EXIF reader against a real JPEG fixture written by piexif (GPS block, UTC offset, DOP, serial-style fields). Three of the tests found real bugs during the build: a month-index error in the GPS date stamp, an inverted "unused pixels" logic in the latitude-band scan, and a shadowed helper in the sun path chart.

## Honest limits

- **No CLIP, no DINOv2, no SIFT in the browser.** Ranking satellite cells or matching a photo against street view needs models that do not belong in a web page. Use the vendored skill for that; the app says so in every report it produces.
- **No automated reverse image search.** The engines have no key-less API and block automated uploads. The app prepares the file and hands it over with instructions rather than faking results.
- **Elevation is coarse.** Public DEM APIs sample roughly every 30–90 m, so cliffs read soft and narrow spurs disappear. Treat the horizon chart as a filter, not a measurement.
- **Latitude bands exclude, they do not locate.** They are geometry derived from a time, an angle and the subsolar point.
- **Metadata is a hypothesis.** When the picture disagrees with the EXIF, the picture wins. The app labels every claim it makes and keeps a limits section in each export.
- **Public services rate-limit.** Nominatim asks for about one request per second, and Overpass is often busy. The app serialises its Nominatim calls and uses three Overpass mirrors, but heavy use will still hit walls.

## Credits and licenses

- **[geo-sleuth](https://github.com/Oldcircle/geo-sleuth)** by Oldcircle (MIT). The method, the scripts, the lookup data and the case studies all come from it, and it is vendored here unchanged under `skills/` and `vendor/`. Credit the upstream project when you reuse its method or data.
- **Lookup data**: calling codes and driving side derive from Wikipedia (CC BY-SA 4.0); `countries`/`territories` from the Wikipedia list of dependent territories (CC BY-SA 4.0). Sources are recorded in `skills/geo-sleuth/data/README.md`.
- **Map data and imagery**: © OpenStreetMap contributors (ODbL), Esri World Imagery, Maxar, Earthstar Geographics, OpenTopoMap, CARTO, EOX Sentinel-2 cloudless (CC BY-NC-SA 4.0). Attribution is rendered on every map.
- **Photos**: Wikimedia Commons contributors, shown with title, date and licence.
- **This repository's own code and docs** (the app, the tools, the tests): MIT, see [LICENSE](LICENSE).
- **Costume Web App Kit** by [arbabtalha](https://github.com/arbabtalha/Costume-instructions): the UI/UX rules and design-token structure the app follows. Notes on what was applied, and what was deliberately not, are in [docs/INTEGRATION.md](docs/INTEGRATION.md).
