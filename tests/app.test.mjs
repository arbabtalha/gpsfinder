/**
 * Test suite for the single-file web app in index.html.
 *
 *   node --test tests/
 *
 * The pure computation core is extracted out of index.html and imported, so the
 * tests exercise the exact code the page runs. Reference values come from:
 *   - geo-sleuth's own Python scripts (sun.py, geo.py) run against the same inputs
 *   - astral 3.2 (independent sunrise/sunset library) for the sun-event tests
 *   - piexif/Pillow for the JPEG fixtures the EXIF reader parses
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const START = '/* ==== PURE-CORE-START ====';
const END = '/* ==== PURE-CORE-END ==== */';
assert.ok(html.includes(START) && html.includes(END), 'index.html must keep the PURE-CORE markers');
const coreSource = html.slice(html.indexOf(START), html.indexOf(END) + END.length) + '\nexport default CORE;\n';
const coreFile = join(mkdtempSync(join(tmpdir(), 'gpsfinder-')), 'core.mjs');
writeFileSync(coreFile, coreSource);
const CORE = (await import(pathToFileURL(coreFile).href)).default;
const expected = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'expected.json'), 'utf8'));
const fixture = (name) => new Uint8Array(readFileSync(join(ROOT, 'tests', 'fixtures', name)));
const close = (actual, want, tol, label = '') =>
  assert.ok(Math.abs(actual - want) <= tol, `${label} expected ${want} \u00b1${tol}, got ${actual}`);

/* ------------------------------------------------------------------ EXIF */
test('EXIF: reads GPS, camera and time out of a real JPEG fixture', () => {
  const parsed = CORE.parseExif(fixture('gps-photo.jpg'));
  assert.equal(parsed.ok, true, parsed.error);
  assert.ok(['II', 'MM'].includes(parsed.byteOrder), `byte order ${parsed.byteOrder}`);
  const s = CORE.summarizeExif(parsed);
  assert.equal(s.hasGps, true);
  close(s.lat, expected.lat, 1e-6, 'latitude');
  close(s.lon, expected.lon, 1e-6, 'longitude');
  close(s.altitude, expected.altitude_m, 1e-6, 'altitude');
  assert.equal(s.make, expected.make);
  assert.equal(s.model, expected.model);
  assert.equal(s.lens, expected.lens_model);
  assert.equal(s.software, expected.software);
  assert.equal(s.iso, expected.iso);
  close(s.fNumber, expected.fnumber, 1e-9, 'f-number');
  close(s.exposure, 1 / 500, 1e-6, 'exposure time');
  close(s.focalLength, expected.focal_length_mm, 0.01, 'focal length');
  assert.equal(s.focal35, expected.focal_length_35mm);
  assert.equal(s.orientation, expected.orientation);
  assert.equal(s.pixelW, expected.pixel_width);
  assert.equal(s.pixelH, expected.pixel_height);
  assert.equal(s.imageUniqueId, expected.image_unique_id);
  close(s.gpsDop, expected.gps_dop, 1e-6, 'GPS DOP');
  close(s.gpsHpe, expected.gps_hpe_m, 1e-6, 'GPS positioning error');
  assert.equal(s.gpsDatum, 'WGS-84');
  close(s.imgDirection, 120, 1e-6, 'image direction');
});

test('EXIF: local time plus UTC offset becomes the right instant', () => {
  const s = CORE.summarizeExif(CORE.parseExif(fixture('gps-photo.jpg')));
  assert.equal(s.taken.local, '2026-10-12 11:30:00');
  assert.equal(s.taken.offsetMinutes, 300);
  assert.equal(s.taken.assumedOffset, false);
  assert.equal(s.taken.utcMs, Date.UTC(2026, 9, 12, 6, 30, 0));
  assert.equal(s.gpsUtcMs, Date.UTC(2026, 9, 12, 6, 30, 0));
});

test('EXIF: a stripped JPEG reports no GPS instead of inventing one', () => {
  const parsed = CORE.parseExif(fixture('no-gps-photo.jpg'));
  const s = CORE.summarizeExif(parsed);
  assert.equal(s.hasGps, false);
  assert.equal(s.lat, undefined);
  assert.ok(s.warnings.length >= 0);
});

test('EXIF: non-JPEG input fails cleanly', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parsed = CORE.parseExif(png);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /JPEG/);
});

/* ------------------------------------------------------------------- sun */
// Reference values produced with geo-sleuth's skills/geo-sleuth/scripts/sun.py
// (NOAA/Meeus, with refraction) on the same inputs.
const SUN_REFERENCE = [
  ['Beijing 2023-08-15T08:20Z', 39.9042, 116.4074, Date.UTC(2023, 7, 15, 8, 20), 261.7623, 31.7082],
  ['Vancouver 2025-04-01T18:00Z', 49.2827, -123.1207, Date.UTC(2025, 3, 1, 18, 0), 135.6539, 37.0788],
  ['Sydney 2024-12-21T02:00Z', -33.8688, 151.2093, Date.UTC(2024, 11, 21, 2, 0), 351.5368, 79.4693],
  ['Peshawar 2026-10-12T06:00Z', 34.0151, 71.5249, Date.UTC(2026, 9, 12, 6, 0), 158.0871, 46.1822],
  ['Quito 2020-03-20T15:00Z', -0.1807, -78.4678, Date.UTC(2020, 2, 20, 15, 0), 89.4279, 54.7254]
];
for (const [label, lat, lon, ms, az, elev] of SUN_REFERENCE) {
  test(`sun position matches geo-sleuth sun.py: ${label}`, () => {
    const p = CORE.sunPosition(lat, lon, ms, true);
    close(p.azimuth, az, 0.02, `${label} azimuth`);
    close(p.elevation, elev, 0.02, `${label} elevation`);
  });
}

test('subsolar point matches geo-sleuth for 2023-08-15T08:20Z', () => {
  const s = CORE.subsolarPoint(Date.UTC(2023, 7, 15, 8, 20));
  close(s.lat, 14.0867, 1e-3, 'subsolar latitude');
  close(s.lon, 56.1451, 1e-3, 'subsolar longitude');
});

test('shadow ratio and its inverse round-trip', () => {
  close(CORE.shadowRatio(45), 1, 1e-9, 'shadow of a 1 m object at 45 degrees');
  close(CORE.elevationFromRatio(1.6186), 31.7082, 0.01, 'elevation from the Beijing shadow ratio');
  close(CORE.elevationFromRatio(CORE.shadowRatio(31.7082)), 31.7082, 1e-9, 'round trip');
});

// Reference values from astral 3.2 (independent implementation) for the local
// date given, converted to UTC.
test('sun events match astral: Peshawar 2026-10-12', () => {
  const e = CORE.sunEvents(34.0151, 71.5249, Date.UTC(2026, 9, 12, 12));
  close(e.rise, Date.UTC(2026, 9, 12, 1, 16, 34), 150000, 'sunrise (ms)');
  close(e.set, Date.UTC(2026, 9, 12, 12, 43, 46), 150000, 'sunset (ms)');
  close(e.dayLengthH, 11.4531, 0.05, 'day length (h)');
  close(e.maxElevation, 48.5688, 0.2, 'max elevation');
});

test('sun events match astral: daylight length for three more cities', () => {
  const vancouver = CORE.sunEvents(49.2827, -123.1207, Date.UTC(2025, 3, 1, 12));
  close(vancouver.dayLengthH, 12.9196, 0.05, 'Vancouver day length');
  close(vancouver.maxElevation, 45.6147, 0.2, 'Vancouver max elevation');
  const sydney = CORE.sunEvents(-33.8688, 151.2093, Date.UTC(2024, 11, 21, 12));
  close(sydney.dayLengthH, 14.4052, 0.05, 'Sydney day length');
  const quito = CORE.sunEvents(-0.1807, -78.4678, Date.UTC(2020, 2, 20, 12));
  close(quito.dayLengthH, 12.1026, 0.05, 'Quito day length');
  close(quito.maxElevation, 89.5941, 0.3, 'Quito max elevation');
});

test('sun path covers a whole local day and peaks at local noon', () => {
  const path = CORE.sunPath(34.0151, 71.5249, Date.UTC(2026, 9, 12, 12), 5);
  assert.equal(path.length, 97, '15 minute steps over 24 hours');
  const peak = path.reduce((a, b) => (b.elev > a.elev ? b : a));
  assert.ok(Math.abs(peak.minutesLocal - 12 * 60) <= 45, `peak at ${peak.localClock}`);
  assert.equal(path[0].localClock, '00:00');
});

test('latitude band from a known sun elevation contains the subsolar latitude', () => {
  const ms = Date.UTC(2023, 7, 15, 8, 20);
  const band = CORE.solarElevationBand(ms, 80, 1, { stepDeg: 1 });
  const sub = CORE.subsolarPoint(ms);
  assert.ok(band.samples > 0, 'something matched');
  assert.ok(band.latMin <= sub.lat && band.latMax >= sub.lat, 'band brackets the subsolar point');
  close((band.latMin + band.latMax) / 2, sub.lat, 6, 'band centre');
});

test('latitude band refuses a physically impossible target', () => {
  const band = CORE.solarElevationBand(Date.UTC(2023, 1, 15, 8, 20), 89, 0.5, { stepDeg: 1 });
  assert.ok(band.samples < 200, `expected a tiny or empty band, got ${band.samples} samples`);
});

/* --------------------------------------------------------------- geodesy */
test('haversine distance and bearing match geo-sleuth geo.py', () => {
  close(CORE.haversineDistance(34.0, 71.5, 34.01, 71.52), 2152.9646, 0.01, 'distance');
  close(CORE.bearingBetween(34.0, 71.5, 34.01, 71.52), 58.8984, 1e-3, 'bearing');
  close(CORE.metersPerPixel(17, 34), 0.9901433, 1e-6, 'metres per pixel at z17');
});

test('destination point inverts the bearing', () => {
  const p = CORE.destinationPoint(0, 0, 90, 1000);
  close(CORE.haversineDistance(0, 0, p.lat, p.lon), 1000, 0.5, 'distance out');
  close(CORE.bearingBetween(0, 0, p.lat, p.lon), 90, 0.1, 'bearing out');
  const north = CORE.destinationPoint(34.0151, 71.5249, 0, 5000);
  assert.ok(north.lat > 34.0151 && Math.abs(north.lon - 71.5249) < 1e-9, 'due north changes latitude only');
});

test('web mercator projection round-trips', () => {
  const px = CORE.lngLatToPixel(16, 34.0151, 71.5249);
  const ll = CORE.pixelToLngLat(16, px.x, px.y);
  close(ll.lat, 34.0151, 1e-9, 'latitude');
  close(ll.lon, 71.5249, 1e-9, 'longitude');
});

test('compass naming and angle difference behave at the wrap', () => {
  assert.equal(CORE.compassName(0), 'north');
  assert.equal(CORE.compass8(359), 'N');
  assert.equal(CORE.compass8(46), 'NE');
  close(CORE.angleDiff(350, 10), 20, 1e-9, 'wrap-around difference');
  close(CORE.angleDiff(10, 350), 20, 1e-9, 'wrap-around difference reversed');
});

/* ------------------------------------------------------- China datums */
test('WGS84 to GCJ-02 matches geo-sleuth geo.py', () => {
  const g = CORE.wgs2gcj(39.908692, 116.397477);
  close(g.lat, 39.9100955, 1e-7, 'GCJ latitude');
  close(g.lon, 116.4037206, 1e-7, 'GCJ longitude');
  assert.equal(g.shifted, true);
});

test('GCJ-02 to WGS84 inverts the shift to under a metre', () => {
  const w = CORE.gcj2wgs(39.910097, 116.403692);
  close(w.lat, 39.9086935, 1e-7, 'WGS latitude');
  close(w.lon, 116.3974484, 1e-7, 'WGS longitude');
  const round = CORE.gcj2wgs(CORE.wgs2gcj(31.2304, 121.4737).lat, CORE.wgs2gcj(31.2304, 121.4737).lon);
  close(round.lat, 31.2304, 1e-6, 'Shanghai round trip');
  close(round.lon, 121.4737, 1e-6, 'Shanghai round trip longitude');
});

test('GCJ-02 to BD-09 matches geo-sleuth geo.py', () => {
  const bd = CORE.gcj2bd(39.910097, 116.403692);
  close(bd.lat, 39.9164364, 1e-7, 'BD latitude');
  close(bd.lon, 116.4100650, 1e-7, 'BD longitude');
  const back = CORE.bd2gcj(39.915651, 116.409925);
  close(back.lat, 39.9093105, 1e-7, 'back to GCJ latitude');
  close(back.lon, 116.4035520, 1e-7, 'back to GCJ longitude');
});

test('datum conversion is a no-op outside China', () => {
  const out = CORE.wgs2gcj(49.2827, -123.1207);
  assert.equal(out.shifted, false);
  assert.equal(out.lat, 49.2827);
  assert.equal(out.lon, -123.1207);
});

/* --------------------------------------------------------------- camera */
test('field of view from an equivalent focal length matches geo.py', () => {
  const fov = CORE.fovFromEquivalentFocal(26, [4, 3]);
  close(fov.hfov, 67.2986, 0.001, 'horizontal FOV');
  close(fov.vfov, 53.0595, 0.001, 'vertical FOV');
});

test('range from a known real size matches geo.py range_from_size', () => {
  const hfov = CORE.fovFromEquivalentFocal(26, [4, 3]).hfov;
  close(CORE.rangeFromSize(2.0, 50, 4000, hfov), 120.185, 0.01, 'distance');
  close(CORE.focalPixels(4000, hfov), 4000 / 2 / Math.tan((hfov * Math.PI / 180) / 2), 1e-9, 'focal length in pixels');
});

test('spacing distances and evenness flag a receding row', () => {
  const hfov = CORE.fovFromEquivalentFocal(26, [4, 3]).hfov;
  const even = CORE.spacingDistances(32, [120, 120, 120], 4000, hfov);
  close(even[0], even[2], 1e-9, 'equal gaps give equal distances');
  const stats = CORE.evenness([120, 120, 144]);
  close(stats.mean, 128, 1e-9, 'mean gap');
  assert.ok(stats.worstDeviationPct > 10, 'a 20% outlier is flagged');
  assert.equal(CORE.evenness([]), null);
});

/* --------------------------------------------------------------- terrain */
test('horizon angle includes Earth curvature and refraction', () => {
  const flat = CORE.horizonAngle(100, 100, 10000);
  assert.ok(flat < 0 && flat > -0.06, `flat ground 10 km away reads below zero, got ${flat}`);
  const hill = CORE.horizonAngle(100, 500, 5000);
  assert.ok(hill > 4 && hill < 5, `400 m of relief over 5 km is about 4.5 degrees, got ${hill}`);
  close(CORE.horizonAngle(0, 0, 0), 0, 1e-9, 'zero distance');
});

test('buildHorizon keeps the highest apparent angle per azimuth', () => {
  const samples = [
    { az: 90, dist: 1000, elev: 100 }, { az: 90, dist: 5000, elev: 900 },
    { az: 180, dist: 1000, elev: 120 }, { az: 270, dist: 2000, elev: 100 }
  ];
  const horizon = CORE.buildHorizon(samples, 100, [0, 90, 180, 270]);
  assert.equal(horizon.length, 4);
  const at90 = horizon.find((h) => h.az === 90);
  assert.equal(at90.dist, 5000, 'the far ridge wins when it is higher in the sky');
  const at0 = horizon.find((h) => h.az === 0);
  assert.equal(at0.angle, -90, 'an azimuth with no samples stays at the floor');
});

/* ------------------------------------------------------ coordinate input */
test('coordinate parsing accepts the formats people actually paste', () => {
  const cases = [
    ['34.0151, 71.5249', 34.0151, 71.5249],
    ['34.0151 71.5249', 34.0151, 71.5249],
    ['geo:34.0151,71.5249', 34.0151, 71.5249],
    ['https://www.google.com/maps/@34.0151,71.5249,17z', 34.0151, 71.5249],
    ['https://www.openstreetmap.org/?mlat=34.0151&mlon=71.5249#map=16/34.0151/71.5249', 34.0151, 71.5249],
    ['https://www.bing.com/maps?cp=34.0151~71.5249&lvl=16', 34.0151, 71.5249]
  ];
  for (const [input, lat, lon] of cases) {
    const p = CORE.parseCoordinates(input);
    assert.equal(p.ok, true, `should parse: ${input} (${p.error})`);
    close(p.lat, lat, 1e-6, `${input} latitude`);
    close(p.lon, lon, 1e-6, `${input} longitude`);
  }
});

test('coordinate parsing reads DMS and fixes a swapped pair', () => {
  const dms = CORE.parseCoordinates(`34\u00b00'54.4"N 71\u00b031'29.6"E`);
  assert.equal(dms.ok, true, dms.error);
  close(dms.lat, 34.015111, 1e-4, 'DMS latitude');
  close(dms.lon, 71.524889, 1e-4, 'DMS longitude');
  const swapped = CORE.parseCoordinates('121.4737, 31.2304');
  assert.equal(swapped.ok, true, swapped.error);
  close(swapped.lat, 31.2304, 1e-6, 'corrected latitude');
  close(swapped.lon, 121.4737, 1e-6, 'corrected longitude');
  assert.match(swapped.how, /corrected/);
  // Ambiguous pairs stay in the documented lat,lon order instead of being guessed at.
  const ambiguous = CORE.parseCoordinates('71.5249, 34.0151');
  close(ambiguous.lat, 71.5249, 1e-6, 'first value is latitude');
  close(ambiguous.lon, 34.0151, 1e-6, 'second value is longitude');
});

test('coordinate parsing refuses junk with a reason', () => {
  const bad = CORE.parseCoordinates('hello world');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Could not read/);
  const out = CORE.parseCoordinates('95.0, 200.0');
  assert.equal(out.ok, false, 'out of range must fail');
});

/* ------------------------------------------------------------ text clues */
test('script detection separates Chinese, Japanese and Korean', () => {
  assert.equal(CORE.detectScripts('\u5317\u4eac\u5e02')[0].name, 'CJK ideographs');
  const jp = CORE.detectScripts('\u6771\u4eac\u30bf\u30ef\u30fc');
  assert.equal(jp[0].name, 'Hiragana/Katakana');
  assert.ok(CORE.guessLanguages(jp).includes('Japanese'));
  assert.ok(CORE.guessLanguages(CORE.detectScripts('\uc11c\uc6b8\ud0c0\uc6cc')).includes('Korean'));
  assert.equal(CORE.detectScripts('\u0422\u0432\u0435\u0440\u0441\u043a\u0430\u044f')[0].name, 'Cyrillic');
  assert.equal(CORE.detectScripts('').length, 0);
});

test('calling codes are found in OCR text and mapped to countries', () => {
  const table = [
    { code: '92', country: 'Pakistan', utc: '+05:00' },
    { code: '86', country: 'China', utc: '+08:00' },
    { code: '1', country: 'United States', utc: '-05:00' },
    { code: '1684', country: 'American Samoa', utc: '-11:00' }
  ];
  const hits = CORE.findCallingCodes('Tel +92 300 1234567 or 0092-21-1234567', table);
  assert.equal(hits.length, 1, 'the same prefix twice is reported once');
  assert.equal(hits[0].country, 'Pakistan');
  const us = CORE.findCallingCodes('call +1 555 0100', table);
  assert.equal(us[0].country, 'United States');
  assert.equal(CORE.findCallingCodes('no phone here', table).length, 0);
});

/* ---------------------------------------------------------------- board */
const boardFixture = () => ({
  candidates: [
    {
      id: 'a', name: 'Vancouver', level: 'city', lat: 49.2827, lon: -123.1207,
      evidence: [
        { side: 'for', kind: 'read', lr: 8, note: 'BC plates' },
        { side: 'for', kind: 'observed', lr: 2, note: 'Vancouver Special houses' }
      ]
    },
    {
      id: 'b', name: 'Seattle', level: 'city', lat: 47.6062, lon: -122.3321,
      evidence: [{ side: 'for', kind: 'inferred', lr: 3, note: 'west coast look' }, { side: 'against', kind: 'read', lr: 4, note: 'rules say otherwise' }]
    },
    {
      id: 'c', name: 'W 60th Ave', level: 'road', lat: 49.2264, lon: -123.1021, parent: 'Vancouver',
      evidence: [{ side: 'for', kind: 'computed', lr: 6, note: 'street trees measured' }]
    },
    { id: 'd', name: 'Random Street', level: 'road', lat: 0, lon: 0, excluded: true, evidence: [] }
  ]
});

test('ranking multiplies likelihood ratios and clamps them by kind', () => {
  const ranked = CORE.rankCandidates(boardFixture().candidates);
  assert.equal(ranked[0].name, 'Vancouver');
  assert.equal(ranked[0].score, 16);
  close(ranked[0].log10, Math.log10(16), 1e-9, 'log10 score');
  close(CORE.clampLR(100, 'inferred'), 3, 1e-9, 'inferred evidence is capped');
  close(CORE.clampLR(100, 'computed'), 20, 1e-9, 'computed evidence is capped at 20');
  close(CORE.clampLR(0.0001, 'observed'), 0.2, 1e-9, 'against evidence is floored at 1/5');
});

test('a finer candidate hangs under a coarser one, and levels are ordered', () => {
  const check = CORE.boardCheck(boardFixture());
  assert.equal(check.main.name, 'Vancouver');
  assert.ok(check.errors.length >= 1, 'exclusion without a computed artefact is an error');
  const inverted = CORE.boardCheck({ candidates: [{ id: 'x', name: 'Area X', level: 'area', evidence: [], parent: 'Street Y' }, { id: 'y', name: 'Street Y', level: 'road', evidence: [] }] });
  assert.ok(inverted.errors.some((e) => /finer level must hang under a coarser one/.test(e)), 'inverted parenting is reported');
});

test('board check flags candidates nobody has tested', () => {
  const check = CORE.boardCheck({ candidates: [{ id: 'z', name: 'Unchecked place', level: 'city', lat: 1, lon: 2, evidence: [] }] });
  assert.ok(check.warnings.some((w) => /no evidence at all/.test(w)));
  assert.ok(check.warnings.some((w) => /no verified evidence/.test(w)));
});

test('next step points at the untested candidate first', () => {
  const step = CORE.nextStep(boardFixture());
  assert.match(step, /Random Street|Untested|Random/);
  const empty = CORE.nextStep({ candidates: [] });
  assert.match(empty, /independent constraint|Ranking/);
});

/* --------------------------------------------------------------- reports */
test('case file carries schema, position, board and honest limits', () => {
  const state = { photo: null, board: boardFixture(), outcomes: [ { label: 'OCR', value: '3 lines' } ], clues: [], confidence: { cityTier: 'high' } };
  const cf = CORE.buildCaseFile(state);
  assert.equal(cf.schema, 'gpsfinder.case/1');
  assert.equal(cf.position.name, 'Vancouver');
  close(cf.position.lat, 49.2827, 1e-9, 'position latitude');
  assert.ok(cf.position.gcj02, 'datum copies are included for China');
  assert.equal(cf.board.length, 4);
  assert.equal(cf.verifiedConfidence, 'high', 'the tier key drives the reported confidence');
  const empty = CORE.buildCaseFile({ photo: null, board: { candidates: [] }, outcomes: [], clues: [] });
  assert.equal(empty.verifiedConfidence, 'unverified');
  assert.equal(empty.position, null, 'no candidate means no coordinates, and that is a valid answer');
  assert.ok(cf.limits.some((l) => /CLIP/.test(l)), 'limits name what the browser cannot do');
});

test('markdown report contains the coordinates and the board check', () => {
  const md = CORE.buildMarkdownReport({ photo: null, board: boardFixture(), outcomes: [], clues: [] });
  assert.match(md, /GPS Finder case report/);
  assert.match(md, /49\.282700, -123\.120700/);
  assert.match(md, /## Board check/);
  assert.match(md, /Unverified|unverified/);
});

test('severity is the finest level that reaches medium', () => {
  assert.equal(CORE.severityFromConfidence({ city: ['x (high)'], cityTier: 'high', building: ['y (low)'], buildingTier: 'low' }), 'high');
  assert.equal(CORE.severityFromConfidence({ city: ['x (low)'], cityTier: 'low' }), 'low');
  assert.equal(CORE.severityFromConfidence({}), 'unverified');
});

/* ------------------------------------------------------------ formatting */
test('map links use the right datum for Chinese services', () => {
  const links = CORE.mapsLinks(39.908692, 116.397477);
  const amap = links.find((l) => l.label.startsWith('Amap'));
  const baidu = links.find((l) => l.label.startsWith('Baidu'));
  const gmaps = links.find((l) => l.label === 'Google Maps');
  assert.match(amap.url, /116\.40372/);
  assert.match(baidu.url, /39\.916/);
  assert.match(gmaps.url, /39\.908692/);
  assert.equal(links.length, 11);
});

test('DMS formatting matches what phones write', () => {
  assert.equal(CORE.formatDMS(34.0151, true), `34\u00b000'54.36"N`);
  assert.equal(CORE.formatDMS(-33.8688, true), `33\u00b052'07.68"S`);
  assert.equal(CORE.formatDMS(71.5249, false), `71\u00b031'29.64"E`);
});
