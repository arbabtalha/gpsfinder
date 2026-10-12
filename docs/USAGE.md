# Using geo-sleuth, step by step

This is the command-line method that the vendored skill performs, written so you can follow along, check the agent's work, or run it yourself. It condenses `skills/geo-sleuth/SKILL.md` and its references; the authoritative version is that file, plus `references/` for the deep material.

`$SKILL` below means the skill folder. Set it once:

```bash
export SKILL="$HOME/.agents/skills/geo-sleuth"     # or the path you installed to
```

- [How the method is built](#how-the-method-is-built)
- [The one-sentence interface](#the-one-sentence-interface)
- [Step 1: intake](#step-1-intake)
- [Step 2: candidates on the board](#step-2-candidates-on-the-board)
- [Step 3: narrow with region scans](#step-3-narrow-with-region-scans)
- [Step 4: find the spot in satellite imagery](#step-4-find-the-spot-in-satellite-imagery)
- [Step 5: confirm on the ground](#step-5-confirm-on-the-ground)
- [Step 6: fix the camera and report](#step-6-fix-the-camera-and-report)
- [Choosing the right tool](#choosing-the-right-tool)
- [The ten hard rules](#the-ten-hard-rules)
- [Confidence tiers](#confidence-tiers)
- [Clue lookup tables](#clue-lookup-tables)
- [Region packs](#region-packs)
- [Doing it without the skill](#doing-it-without-the-skill)

## How the method is built

Three layers, and the split matters:

| Layer | Who does it | Tools |
|---|---|---|
| **Decision** — which candidates exist, how evidence scores, whether a candidate can be excluded, what to scan next | Script | `board.py` |
| **Perception** — reading text, table lookups, finding targets in imagery, matching street view | Scripts compute and rank first, the model looks only at the top few | `intake.py`, `ocr.py`, `clues.py`, `sat_scan.py`, `match.py`, `geo.py bearings` |
| **Judgement** — pulling clues out of the picture, proposing hypotheses, deciding among the machine's top few | You, or the model | — |

The lesson from version 1 of the skill: rules written as prose do not get executed. So every rule that could be written as code lives in `board.py`, and the rest are numbered hard rules.

## The one-sentence interface

```bash
npx skills add Oldcircle/geo-sleuth        # once
```

Then hand your agent a photo and say:

> find where this photo was taken

You get back: the camera position, the direction it faced, an error radius, an evidence image, and a tiered confidence table. Everything below is what happens inside that answer, and how to check it.

## Step 1: intake

```bash
uv run "$SKILL/scripts/intake.py" photo.jpg --out-dir intake/
uv run "$SKILL/scripts/board.py" init --photo photo.jpg
```

`intake.py` does steps 0–3 in one pass: EXIF, edge crops, image-search variants, OCR and reverse image search in parallel, writing `intake/intake.md` with metadata, OCR text (marked when it was only readable after upscaling), and a tiered vote count of possible place names.

It usually takes 1–2 minutes and longer on the first run, because it installs its dependencies. Interrupted? The reverse-search subprocesses may still be writing into `rev/`, but `intake.md` will not be finished — do not treat it as done.

To skip the network entirely:

```bash
uv run "$SKILL/scripts/intake.py" photo.jpg --out-dir intake --no-rev
```

## Step 2: candidates on the board

Everything the run turns up goes on the board, as a candidate with a level, or as a clue.

```bash
uv run "$SKILL/scripts/board.py" add --name "Vancouver" --level city --lat 49.2827 --lon -123.1207
uv run "$SKILL/scripts/board.py" evidence --for "Vancouver" --kind read --lr 8 --note "BC plates, white and blue"
uv run "$SKILL/scripts/board.py" evidence --against "Seattle" --kind read --lr 4 --note "plate design"
uv run "$SKILL/scripts/board.py" children "British Columbia"          # list the whole category before inferring
uv run "$SKILL/scripts/board.py" next                                  # what to scan next, by share divided by pages
```

Likelihood ratios are clamped by kind: read or computed 0.05–20, observed 0.2–5, inferred 0.33–3. Exclusions are held to a stricter standard than confirmations: `board.py exclude` accepts only read or computed clues plus a computable artefact (the output of `geo.py frame`, `terrain.py`, and so on), and it rejects an excluded extent larger than the evidence extent.

## Step 3: narrow with region scans

When the photo has no text and no landmark, geometry carries the search. The desert case in the vendored README did exactly this:

```bash
# every power line in four provinces
uv run "$SKILL/scripts/osm.py" geom --query 'way["power"="line"](34,110,42,122)' --out lines.geojson
# keep the places where mountains fill the view
uv run "$SKILL/scripts/terrain.py" scan --lines lines.geojson --out hits.json --clusters-out clusters.json
# trace the ridge in the photo, then score every site against it
uv run "$SKILL/scripts/terrain.py" ridge photo.jpg --x0 0 --x1 2048 --out ridge.json
uv run "$SKILL/scripts/terrain.py" fit --hits hits.json --ridge ridge.json --sheet top.jpg --photo photo.jpg
```

That last command also solves a camera roll, which is what turned a 9th-place site into first place in the published case: a phone held 1° off level shifts a ridge by about 10 px across the frame, the same size as the gap between the top sites.

Other scanners, for other clue types:

```bash
uv run "$SKILL/scripts/osm.py" near --report          # co-occurring features in one frame
uv run "$SKILL/scripts/osm.py" street-scan            # street-layout templates
uv run "$SKILL/scripts/clues.py" lookup calling-codes +92
uv run "$SKILL/scripts/regions.py" show cn            # what a region pack provides
```

## Step 4: find the spot in satellite imagery

The rule here is "the machine ranks first; you look at the top few".

```bash
uv run "$SKILL/scripts/sat_scan.py" grid --bbox 120,30,122,32 --zoom 17 --preset track --multi-scale --top 30 --out sat.json --sheet sat_top.jpg
uv run "$SKILL/scripts/poi.py" "Qingyuan 中学" --city Qingyuan --region cn --out schools.json
uv run "$SKILL/scripts/sat_scan.py" points --points big.json --preset factory --out r.json --sheet r.jpg
```

Presets cover running tracks, stadiums, factories, silos, dams, bridges, quarries, solar farms, greenhouses and ports. In the skill's tests, more than half of the OSM-mapped running tracks in an urban area made the top 30; in a Chinese old town where OSM is blank, a school sports field still ranked first. It ranks, it does not decide — look at the thumbnails, then check the bearing and shape against the photo.

## Step 5: confirm on the ground

```bash
uv run "$SKILL/scripts/gsv.py" near --at 49.2264,-123.1021 --radius 200
uv run "$SKILL/scripts/match.py" rank --query photo.jpg --panos panos.json --toward 49.2,-123.1 --spread 15 --refine sift --top 10 --out m.json --sheet m.jpg
uv run "$SKILL/scripts/baidu_pano.py" scan 39.90,116.40 --radius 300 --out panos.json     # in China
```

`match.py` coarse-ranks by DINOv2 similarity and re-ranks by SIFT inliers; in testing, ground-truth street views from different years all landed in the top four. Compare **invariant** features — building outlines, window positions, poles, curbs, ridgelines — not cars, signs or foliage. Few inliers does not automatically mean "wrong": a seasonal change, an old capture, or a photo taken from the sidewalk while the street-view car drove down the middle can drop the ground truth to five or zero inliers.

When there is no street view at all, compare skylines with `terrain.py view --photo`, and look for news, encyclopaedia or official-site photos of a named facility.

## Step 6: fix the camera and report

```bash
uv run "$SKILL/scripts/board.py" check                       # before concluding
uv run "$SKILL/scripts/board.py" report --merge result.json   # main answer, alternatives, exclusions, unused clues
uv run "$SKILL/scripts/evidence.py" spec.json --out evidence.jpg
```

A camera position needs two independent constraints — a sight-line intersection (`geo.py intersect`), an alignment line (`geo.py line`), a multi-point solve (`pose.py`), a camera height check, or reverse street view. With only one, building-level confidence is capped at medium.

Show `evidence.jpg` with the answer, unasked. A road-level claim from satellite imagery needs a z18 crop, not a z17 glance.

## Choosing the right tool

| Clue in the photo | Reach for |
|---|---|
| Text, plates, signs, shopfronts | `ocr.py`, `clues.py lookup`, `poi.py` |
| A phone number, a country code | `clues.py lookup calling-codes` |
| A plate design or area code | `clues.py lookup plates/area-codes --country <cc>` (region pack) |
| Time of day, hemisphere, rough latitude | `sun.py pos`, `sun.py ratio`, `sun.py locate`, `sun.py when` |
| Which way the camera faced, from lit faces | `sun.py facing`, `sun.py compass` |
| Distances from known-size objects | `geo.py range`, `geo.py spacing` |
| Evenly spaced structures (piers, poles) | `imgprep.py piers` then `geo.py spacing` |
| A ridgeline and no landmark | `terrain.py ridge`, `terrain.py scan`, `terrain.py fit` |
| Infrastructure corridors (rails, power lines, canals) | `osm.py geom`, `osm.py intersect`, `terrain.py scan` |
| A recognizable facility type | `osm.py buildings`, `sat_scan.py points` |
| A chain's sub-brand | press releases for the address, then `osm.py along` and street view |
| Window or drone views with known points | `pose.py solve`, `pose.py check`, `geo.py frame` |
| No duplicates, no text, only scene elements | `sat_scan.py grid` with a scene query |

Full decision table with cross-references: `skills/geo-sleuth/SKILL.md` and `references/`.

## The ten hard rules

1. **Do not fabricate verification.** "Measured on the map", "matched street view" and "±10 m" must correspond to commands actually run and files actually produced; otherwise write "unverified".
2. **Precision needs a source.** An error radius of 100 m or less requires two independent constraints, or a ground-level match on three or more invariant features. Reconcile the pitch and the height difference with `pose.py project` and `terrain.py elev` before reporting a camera position.
3. **Close the loop once you have a unique anchor.** Do not drift back to generic features and pick the most famous place of that kind.
4. **Compute bearings before identifying structures.** Which block in the imagery is the tower is itself an interpretation.
5. **List the whole category before inferring.** Add every subordinate candidate with `board.py children`, then rank.
6. **Metadata and hints are hypotheses.** When EXIF, IP location or a hint conflicts with the picture, the picture wins. Do not invent a story to reconcile them.
7. **Self-consistency.** Redo each key judgement with a different crop or keyword set; tens of kilometres of disagreement means a lower tier.
8. **If you cannot pin a point, give a range and name the missing information.** Do not take the midpoint of discrete candidates.
9. **Exclusion and confirmation use the same standard.** Exclusions need a computed artefact and an extent no larger than the evidence.
10. **Population and fame are not evidence.** Scan the small places first.

## Confidence tiers

Report the finest level that reaches medium or above; a weak building guess does not drag down a solid area call.

| Level | High | Medium | Low |
|---|---|---|---|
| City | Text, plates, area codes or a confirmed anchor | Several independent weak clues agree | A single weak clue, or only the hint |
| Area | A unique facility matching 3+ top-down features, whole area checked, no second match | The most similar spot with candidates still unchecked | Inferred |
| Road | Ground-level match on 2+ unique features | Layout consistent, 1 unique feature; with no ground-level imagery: area-level high plus a passed bearing self-check | Satellite layout only |
| Building | Two independent constraints plus a ground-level match on 3+ features | One of the two | Inferred |
| Floor | Two kinds of reference agree | A single reference | Do not give |

## Clue lookup tables

```bash
uv run "$SKILL/scripts/clues.py" lookup calling-codes +92
uv run "$SKILL/scripts/clues.py" lookup driving-side Japan
uv run "$SKILL/scripts/clues.py" lookup territories France --continent "South America"
uv run "$SKILL/scripts/clues.py" lookup plates --country cn          # region pack tables
```

The same three global tables are embedded in the web app's Reference panel.

## Region packs

Region packs add country-specific tables and services: `regions/<cc>/` with `region.json`, `clues.md`, and data for plates, area codes, admin divisions and search sources. Shipped packs: `ca`, `cn`, `jp`, `lk`, `mm`, `mx`, `us`, plus `_template` for new ones.

```bash
uv run "$SKILL/scripts/regions.py" list
uv run "$SKILL/scripts/regions.py" show cn
uv run "$SKILL/scripts/regions.py" lint cn
```

## Doing it without the skill

You do not need an agent to use the scripts; they are ordinary Python programs with `--help`:

```bash
uv run "$SKILL/scripts/sun.py" pos --at 39.9042,116.4074 --time 2023-08-15T16:20 --tz Asia/Shanghai
uv run "$SKILL/scripts/sun.py" ratio --shadow 1.2
uv run "$SKILL/scripts/geo.py" convert --from wgs --to gcj 39.908692 116.397477
uv run "$SKILL/scripts/terrain.py" elev --at 34.0151,71.5249
```

For the parts that run comfortably in a browser — EXIF, datum conversion, sun geometry, panorama bands, camera geometry, candidate ranking, reports — the [web app in this repository](../index.html) is the same method with a UI.
