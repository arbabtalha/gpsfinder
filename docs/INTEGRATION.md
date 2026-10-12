# How this repository is put together

Two upstream sources, one deliverable. This document records what was taken from each, how the UI rules were applied, and what was left out on purpose.

## The two sources

| Source | What it contributed | How it lives here |
|---|---|---|
| [Oldcircle/geo-sleuth](https://github.com/Oldcircle/geo-sleuth) (MIT) | The method, the 25 Python scripts, the lookup data, the case studies, the ten hard rules, the confidence tiers, the coordinate-datum discipline | `skills/geo-sleuth/` (installable skill) and `vendor/geo-sleuth/` (README, docs with figures, examples, manifest). Byte-identical copies, verified by `tools/verify-vendor.py` |
| [arbabtalha/Costume-instructions](https://github.com/arbabtalha/Costume-instructions) | The web app build law: tokens before components, four states per async surface, accessibility gates, no emoji icons, honest reporting | Applied throughout `index.html`; the checklist below records each rule |

The geo-sleuth half is data and method, and stays untouched. The Costume half is process, and shows up as structure in the page rather than as text.

## What geo-sleuth contributed besides scripts

- **The three-layer split**: scripts decide and rank, the person (or model) looks only at the top few, judgement stays with the person. The web app copies this literally: the horizon profile, the place search, the board ranking and the board check are all computed, and the UI never asserts a conclusion the user did not enter.
- **The likelihood-ratio clamps**: read and computed 0.05–20, observed 0.2–5, inferred 0.33–3. The app's board uses the same numbers, so a score moved between the CLI and the page means the same thing.
- **The exclusion standard**: `board.py exclude` requires a computable artefact. The web app asks for one in a prompt and refuses the exclusion when the field is empty.
- **The datum rules**: WGS84 for GPS, EXIF, OSM and Google imagery; GCJ-02 for Amap, Tencent and Google's China labels; BD-09 for Baidu. The app converts for display and for map links, and warns about the several-hundred-metre trap.
- **The output shape**: coordinates plus error radius, evidence image, tiered confidence, exclusions, unused clues. The case file export mirrors that structure.
- **The solar maths**: the NOAA/Meeus implementation in `sun.py` and the GCJ-02 polynomials in `geo.py` were ported to JavaScript and tested against the Python originals.

## What the Costume kit contributed

| Rule | How it shows up in `index.html` |
|---|---|
| Tokens before components (primitive → semantic → component) | `:root` defines the three tiers; components consume `--btn-*`, `--card-bg`, `--input-*`, `--chip-bg`, `--map-*` only |
| Fixed scales | Spacing 4/8/12/16/24/32/48/64/96, type 12/14/16/20/24/30/38, one radius base with two variants, three shadow levels, named z-index layers |
| Dark mode as a token swap, not a filter | `[data-theme="light"]` overrides the semantic tier; the toggle rewrites one attribute and the theme-colour meta |
| Two font families maximum | One system sans stack plus one monospace for coordinates; nothing is downloaded, so there is no CLS from fonts |
| Four states for every async surface | Loading uses skeletons shaped like the result, empty states explain the next action, errors name the provider and the next step, success reports what changed |
| 44×44 px targets, visible focus, no hover-only affordances | Buttons and inputs are 44 px minimum, `:focus-visible` rings are defined globally, icon-only buttons carry labels |
| Keyboard operability | Arrow-key tabs, map arrow keys, `/`, `1`–`5`, `Escape`, a skip link |
| No emoji as icons | One inline SVG sprite, 27 symbols; the check script fails the build if an emoji appears |
| Reduced motion respected | `prefers-reduced-motion` disables transitions globally and makes map fly-to jump instead of animate |
| Honest reporting | Every export carries a limits section; the app says what it cannot do (CLIP ranking, street-view matching, automated reverse image search) instead of implying otherwise |
| Performance budget | One 274 KB HTML file, no framework, no external JS; images are lazy below the fold, charts are canvases sized to their container |
| Anti-pattern list | No gradient hero, no three feature cards, no lorem ipsum, no spinner-only loading, no `outline: none`, no client-side secrets |

Deliberately **not** applied, with reasons:

- **A framework or build tool.** The kit's decision tree puts "single deliverable, no build step, must open by double-click" in the hand-written HTML row, which is exactly this case.
- **The UI/UX Pro Max design-system generator.** Its output is a design system document; here the token layer plus the constraint of a single file made a hand-authored token set smaller and easier to audit. The generated-document step is what the kit prescribes for multi-page projects.
- **The 21st.dev component MCP.** No React, so there is nothing to install components into. The primitives are written by hand with full ARIA behaviour instead.
- **i18n.** The method notes are English and the OCR detector handles 16 scripts, but the UI is English-only; the upstream skill ships a Chinese README, which is vendored.

## Build order that was followed

1. Read both sources and the vendored skill's rules (`SKILL.md`, `data-sources.md`, `sun.py`, `geo.py`).
2. Design tokens and page shell.
3. The computation core, DOM-free, with the `PURE-CORE` markers so it can be tested.
4. The map engine and API clients.
5. Panels: Locate, Photo GPS, Investigate, Coordinate lab, Reference.
6. Tests: unit tests against Python reference values, static page checks, and a jsdom smoke test that drives the real page.
7. Documentation, installers, CI.

## Report

```
Built:      index.html (single-file web app, 274 KB, 5 panels, 3 maps),
            tools/ (check-page, dom-smoke, fixture builder, data-table builder, vendor verifier),
            tests/ (43 unit tests, EXIF fixtures), install.sh / install.ps1, Makefile,
            docs/ (INSTALL, USAGE, WEBAPP, REQUIREMENTS, FREE-APIS, INTEGRATION),
            skills/geo-sleuth + vendor/geo-sleuth (upstream, manifest-verified, 102 files)
Ran:        npm run check  -> every static check passed (syntax, 144 ids, 27 icons, markers, a11y basics)
            npm test       -> 43 tests, 43 pass, 0 fail
            npm run smoke  -> 28 DOM checks passed in jsdom
            python3 tools/verify-vendor.py -> 102 files match MANIFEST.sha256
Tokens:     hand-authored primitive/semantic/component token layers in index.html
            (UI/UX Pro Max generator deliberately not used, single-file constraint)
Checked:    responsive layout at 320-1440 by CSS construction (fluid grids, no fixed widths),
            keyboard paths and ARIA in the smoke test, contrast from token pairs,
            reduced motion honoured, no emoji, one h1, meta description present
Not done:   no live end-to-end call to the geocoding, elevation, Overpass, Commons or
            tile providers from the build environment (it has no outbound access to them),
            so those paths are verified structurally and by stubbed tests, not against
            live responses; OCR runs only after a CDN download, untested here;
            no screenshot-based visual regression test
Next:       press Document -> Run npm run smoke after any UI edit; then
            add a Mapillary or KartaView panel for ground-level imagery where a free
            key is available
```
