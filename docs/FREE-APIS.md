# Free services: what this app uses, what needs a key, what was rejected

Research notes for anyone extending the app or building something similar. Every service listed as "in use" is called directly from the browser with no account and no key.

**How this list was verified.** The URLs, parameters and parsing were written against each provider's published documentation and then exercised with stubbed responses in the test suite (`npm run smoke` checks the EXIF, OCR and report paths; `npm test` checks the maths). Requests could not be issued live from the build environment, because it has outbound access only to npm, PyPI and GitHub — so the app is built for the case where a provider is unreachable or refuses a cross-origin request: each one is wrapped in a timeout, a `NetError` with the provider name, and where possible an automatic fallback to a second provider. Section "If a provider disappears" lists what happens then.

Legend: **Key** — needs an account or token; **CORS** — the browser may call it directly from a page.

---

## 1. In use

### Geocoding and place search

| Service | Endpoint | Key | CORS | Documented limits | Licence |
|---|---|---|---|---|---|
| Nominatim (OpenStreetMap) | `https://nominatim.openstreetmap.org/search?format=jsonv2&q=…` and `/reverse?format=jsonv2&lat=…&lon=…` | none | yes | about 1 request/s, no bulk scraping, identify your app | ODbL data, attribution required |
| Photon (Komoot) | `https://photon.komoot.io/api/?q=…&limit=8&lang=en` | none | yes | fair use, no bulk | ODbL data |

Used in: **Locate** (reverse geocoding), **Investigate** (candidate place search from OCR text), autocomplete-by-search in the Reference panel.
Policy notes the app follows: OCR-derived searches are serialised with 1.2 s spacing, no parallel bursts, and the browser sends its normal referrer.

### Elevation (terrain)

| Service | Endpoint | Key | CORS | Documented limits | Data |
|---|---|---|---|---|---|
| Open-Meteo Elevation | `https://api.open-meteo.com/v1/elevation?latitude=a,b&longitude=c,d` | none | yes | 100 coordinates per call, 10 000 calls/day | Copernicus DEM GLO-90 |
| OpenTopoData | `https://api.opentopodata.org/v1/srtm30m?locations=a,b\|c,d` | none | yes | 100 locations, 1 call/s, 1 000/day | SRTM 30 m |
| Open-Elevation | `https://api.open-elevation.com/api/v1/lookup?locations=…` | none | yes | best effort, no guarantee | SRTM |

Used in: horizon profiles (432 samples in chunks of 90, with 350 ms between calls), the elevation lookup on the Locate tab, and the Coordinate lab horizon tool. Open-Meteo is primary; the other two are fallbacks that keep the feature alive when a provider rate-limits.

### Map tiles

| Layer in the app | Endpoint | Key | Notes |
|---|---|---|---|
| Satellite | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | none | Esri World Imagery; attribution "Esri, Maxar, Earthstar Geographics" is rendered on the map |
| Satellite (unofficial) | `https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}` | none | Sharp in China; undocumented endpoint, so it is offered as an extra layer with a warning, never used by default |
| Streets | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | none | OSM tile usage policy applies |
| Topographic | `https://a.tile.opentopomap.org/{z}/{x}/{y}.png` | none | CC-BY-SA, attribution rendered |
| Dark streets | `https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png` | none | CARTO attribution rendered |
| Sentinel-2 cloudless | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg` | none | EOX, CC BY-NC-SA 4.0 |

### OpenStreetMap feature data

| Service | Endpoint | Key | CORS | Limits |
|---|---|---|---|---|
| Overpass API | `https://overpass-api.de/api/interpreter` (mirrors: `overpass.private.coffee`, `maps.mail.ru/osm/tools/overpass`) | none | yes | fair use; heavy queries time out, which the app reports |

Used in: "named objects within 250 m" evidence on the Photo GPS panel.

### Photographs and time

| Service | Endpoint | Key | CORS | Limits |
|---|---|---|---|---|
| Wikimedia Commons geosearch | `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&…&origin=*` | none | yes | 10 km maximum radius |
| Wikimedia Wikipedia geosearch | `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&…&origin=*` | none | yes | same API family |
| Open-Meteo forecast | `https://api.open-meteo.com/v1/forecast?latitude=…&timezone=auto` | none | yes | 10 000 calls/day |

Used in: geotagged photo evidence, and resolving an EXIF local timestamp into UTC through the IANA zone at the position.

### OCR

| Library | Endpoint | Key | Notes |
|---|---|---|---|
| Tesseract.js 5.1.1 | `https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js` (fallback `unpkg.com`) | none | Loaded only when you press the OCR button; the worker, WASM core and language data come from the same CDN and are cached by the browser |

### What the vendored skill uses on top of these

The command-line method (see `skills/geo-sleuth/references/data-sources.md`) also uses: Baidu panorama endpoints (`mapsv0.bdimg.com`, no key), Google Street View thumbnails, AWS Terrain Tiles (Terrarium, `s3.amazonaws.com/elevation-tiles-prod`), Baidu and Yandex reverse image search through a headless browser, Sogou/Bing China keyword search, 360 Maps suggestions (`restapi.map.so.com/newapi`, GCJ-02 coordinates), and NASA/USGS imagery where relevant. Those need a real browser or a script, not a page, which is why the app hands them off instead of pretending.

---

## 2. Considered and rejected

| Option | Why it was rejected |
|---|---|
| Google Maps JavaScript API, Places, Geocoding | Requires a key and billing; the free tier is a credit, not a right |
| Mapbox, MapTiler, HERE, TomTom | Same: key plus quota |
| what3words | Key, and the word triples are proprietary |
| Mapillary | Free token on request, but it is still an account, and the browser would expose the token |
| Google Lens / Yandex / Bing / Baidu reverse image search APIs | No key-less API; the web endpoints challenge automated uploads. This is why the app prepares the file and opens the site instead of faking a result |
| KartaView | No key and CORS-friendly, but very sparse coverage outside a few countries; noted as an option for a future panel |
| Amap / Tencent map APIs | Key required; their *links* (which need no key) are used instead |
| Reverse geocoding by IP | It is not a position, it is a routing guess. The app labels device fixes honestly instead |
| Local CLIP / DINOv2 / SIFT in the browser | Hundreds of MB of model weights and WebGPU-level requirements; belongs in the skill, not a page |
| Vision APIs (OpenAI, Google Vision) | Key plus cost; and it would break the "nothing is uploaded" property of this app |

## 3. If a provider disappears

| Provider down | Consequence in the app |
|---|---|
| Nominatim | Place search falls back to Photon; reverse geocoding reports which provider failed and suggests trying again |
| Overpass (all mirrors) | "Nearby evidence" shows the mirror errors; the rest of the photo panel still works |
| Elevation (all three) | Horizon profiles and the elevation readout show the last error. This does **not** silently produce a flat horizon |
| Tiles | An empty map background with the attribution line; coordinates, math, EXIF and exports are unaffected |
| Tesseract CDN | The OCR button reports that the engine could not be loaded and suggests running `ocr.py` from the skill locally |
| Everything | All local computation still works: EXIF parsing, datum conversion, sun geometry, board ranking, reports, metadata stripping |

## 4. Attribution you must keep

If you fork this app, keep the attribution the providers require: OpenStreetMap contributors (ODbL) on map data, Esri/Maxar/Earthstar on the satellite layer, OpenTopoMap (CC-BY-SA), CARTO, EOX Sentinel-2 (CC BY-NC-SA), Wikimedia Commons photo titles and licences, and the Wikipedia-derived lookup tables (CC BY-SA 4.0, see `skills/geo-sleuth/data/README.md`). The app renders the map attributions itself and prints the elevation provider with every profile.
