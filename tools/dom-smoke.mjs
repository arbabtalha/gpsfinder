/**
 * Headless DOM smoke test for index.html.
 *
 *   npm install          # once, for jsdom
 *   node tools/dom-smoke.mjs
 *
 * Loads the real page in jsdom, stubs the two browser APIs jsdom lacks (canvas
 * 2d and ResizeObserver), then drives the UI the way a person would: switch
 * tabs, load a photo fixture, run the sun tools, add a board candidate, read the
 * reference tables. Any uncaught error fails the run.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const fixture = new Uint8Array(readFileSync(join(ROOT, 'tests', 'fixtures', 'gps-photo.jpg')));

const failures = [];
const passes = [];
const check = async (label, fn) => {
  try {
    const out = await fn();
    if (out === false) throw new Error('returned false');
    passes.push(label);
  } catch (err) {
    failures.push(`${label}: ${err.message}`);
  }
};

const virtualConsole = new VirtualConsole();
const pageErrors = [];
virtualConsole.on('jsdomError', (err) => pageErrors.push(err.message));
virtualConsole.on('error', (...args) => pageErrors.push(args.join(' ')));

const dom = new JSDOM(html, {
  url: 'https://example.test/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    const ctxStub = new Proxy({}, {
      get: (target, prop) => {
        if (prop === 'canvas') return null;
        return () => ctxStub;
      },
      set: () => true
    });
    window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
    window.HTMLCanvasElement.prototype.toBlob = (cb) => cb(new window.Blob(['x'], { type: 'image/jpeg' }));
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    if (typeof window.matchMedia !== 'function') {
      window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    }
    window.URL.createObjectURL = () => 'blob:smoke';
    window.URL.revokeObjectURL = () => {};
    window.scrollTo = () => {};
  }
});

const { window } = dom;
const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];
const evalIn = (code) => window.eval(code);
const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));

await tick(200);

await check('page scripts ran and left no uncaught errors', () => {
  if (pageErrors.length) throw new Error(pageErrors.join(' | '));
  return true;
});
await check('CORE booted with its function surface', () => {
  const count = evalIn('Object.keys(CORE).length');
  if (count < 50) throw new Error(`only ${count} core exports`);
  return true;
});
await check('three maps were created and wired to their panels', () => {
  const keys = evalIn('Object.keys(APP.maps)');
  if (keys.length !== 3) throw new Error(`maps: ${keys.join(', ')}`);
  return true;
});
await check('lookup tables were embedded with the expected row counts', () => {
  const [cc, ds, ter] = evalIn('[DATA_CALLING_CODES.length, DATA_DRIVING_SIDE.length, DATA_TERRITORIES.length]');
  if (cc < 280 || ds < 200 || ter < 50) throw new Error(`${cc}/${ds}/${ter}`);
  return true;
});
await check('reference tables and rules rendered', () => {
  if ($$('#toolTable tr').length < 10) throw new Error('tool table empty');
  if ($$('#apiTable tr').length < 8) throw new Error('api table empty');
  if ($$('#rulesList li').length !== 10) throw new Error('rules list wrong length');
  return true;
});
await check('calling-code search finds Pakistan for +92', () => {
  const input = $('#ccQuery');
  input.value = '92';
  input.dispatchEvent(new window.Event('input'));
  if (!/Pakistan/.test($('#ccOut2').textContent)) throw new Error($('#ccOut2').textContent.slice(0, 120));
  return true;
});
await check('driving-side search explains Japan drives on the left', () => {
  const input = $('#dsQuery');
  input.value = 'japan';
  input.dispatchEvent(new window.Event('input'));
  const text = $('#dsOut2').textContent;
  if (!/Japan/.test(text) || !/left/.test(text)) throw new Error(text.slice(0, 120));
  return true;
});
await check('tabs switch panels and keep aria state in sync', () => {
  $('#tab-investigate').click();
  if ($('#panel-investigate').hidden) throw new Error('panel stayed hidden');
  if ($('#tab-investigate').getAttribute('aria-selected') !== 'true') throw new Error('aria-selected not set');
  if (!$('#panel-locate').hidden) throw new Error('old panel still visible');
  $('#tab-locate').click();
  return true;
});
await check('theme toggle swaps the token set', () => {
  const before = window.document.documentElement.dataset.theme;
  $('#themeBtn').click();
  const after = window.document.documentElement.dataset.theme;
  if (before === after) throw new Error(`stayed ${before}`);
  $('#themeBtn').click();
  return true;
});
await check('the coordinate form parses input and drops a marker', async () => {
  $('#coordInput').value = '34.0151, 71.5249';
  $('#coordForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const text = $('#geoResult').textContent;
  if (!/34\.015100, 71\.524900/.test(text)) throw new Error(text.slice(0, 160));
  return true;
});
await check('the coordinate form reports a useful error for junk', () => {
  $('#coordInput').value = 'not coordinates';
  $('#coordForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const err = $('#coordError');
  if (err.hidden || !/Could not read/.test(err.textContent)) throw new Error(err.textContent);
  return true;
});
await check('sun position tool computes and fills the readout', () => {
  $('#sunLat').value = '34.0151';
  $('#sunLon').value = '71.5249';
  $('#sunTime').value = '2026-10-12T11:30';
  $('#sunTz').value = '5';
  $('#sunPosBtn').click();
  const text = $('#sunPosOut').textContent;
  if (!/azimuth/i.test(text) || !/elevation/i.test(text)) throw new Error(text.slice(0, 160));
  if (!/1[0-9]{2}\.\d\d\u00b0/.test(text)) throw new Error('no azimuth value found: ' + text.slice(0, 160));
  return true;
});
await check('shadow ratio converts to an elevation angle', () => {
  $('#shadowRatio').value = '1.2';
  $('#shadowDir').value = '300';
  $('#ratioBtn').click();
  const text = $('#bandOut').textContent;
  if (!/39\.\d\d\u00b0/.test(text)) throw new Error(text.slice(0, 160));
  return true;
});
await check('camera geometry returns a distance', () => {
  $('#camFocal').value = '26';
  $('#camImgW').value = '4000';
  $('#camObjM').value = '2';
  $('#camObjPx').value = '50';
  $('#camBtn').click();
  const text = $('#camOut').textContent;
  if (!/120\.\d/.test(text)) throw new Error(text.slice(0, 200));
  return true;
});
await check('pier ruler runs and gives a verdict', () => {
  $('#pierSpan').value = '32';
  $('#pierCount').value = '17';
  $('#pierPx').value = '120';
  $('#pierBtn').click();
  const text = $('#pierOut').textContent;
  if (!/Camera distance/.test(text)) throw new Error(text.slice(0, 200));
  return true;
});
await check('coordinate converter shifts WGS84 to GCJ-02 inside China', () => {
  $('#ccLat').value = '39.908692';
  $('#ccLon').value = '116.397477';
  $('#ccFrom').value = 'wgs';
  $('#ccBtn').click();
  const text = $('#ccOut').textContent;
  if (!/39\.910096|39\.910095/.test(text)) throw new Error(text.slice(0, 200));
  return true;
});
await check('distance and bearing tool measures the pair', () => {
  $('#abLat1').value = '34.0'; $('#abLon1').value = '71.5';
  $('#abLat2').value = '34.01'; $('#abLon2').value = '71.52';
  $('#abBtn').click();
  const text = $('#abOut').textContent;
  if (!/2\.15[23] km/.test(text)) throw new Error(text.slice(0, 200));
  if (!/58\.90\u00b0/.test(text)) throw new Error('bearing missing: ' + text.slice(0, 200));
  return true;
});
await check('board form adds a candidate and ranks it', () => {
  $('#candName').value = 'W 60th Ave 100 block';
  $('#candLat').value = '49.2264';
  $('#candLon').value = '-123.1021';
  $('#candLevel').value = 'road';
  $('#candNote').value = 'street trees';
  $('#boardForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const text = $('#boardOut').textContent;
  if (!/W 60th Ave/.test(text)) throw new Error(text.slice(0, 200));
  return true;
});
await check('board check reports the missing parent level', () => {
  $('#boardCheck').click();
  const text = $('#boardCheckOut').textContent;
  if (!/Main answer right now/.test(text)) throw new Error(text.slice(0, 200));
  return true;
});
await check('evidence can be recorded on a candidate', () => {
  const before = evalIn('APP.state.board.candidates[0].evidence.length');
  const details = $('#boardOut details');
  const lr = details.querySelector('[data-ev="lr"]');
  lr.value = '5';
  details.querySelector('[data-ev="note"]').value = 'street tree data matches';
  details.querySelector('[data-board="evidence"]').click();
  const after = evalIn('APP.state.board.candidates[0].evidence.length');
  if (after !== before + 1) throw new Error(`evidence count ${before} -> ${after}`);
  return true;
});
await check('excluding without an artefact is refused', () => {
  window.prompt = () => '';
  const btn = $('#boardOut [data-board="exclude"]');
  btn.click();
  const state = evalIn('APP.state.board.candidates[0].excluded');
  if (state === true) throw new Error('candidate was excluded without a computed artefact');
  return true;
});
await check('photo intake reads the EXIF fixture end to end', async () => {
  const file = {
    name: 'gps-photo.jpg', size: fixture.length, type: 'image/jpeg', lastModified: Date.now(),
    arrayBuffer: async () => fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength)
  };
  await window.handleFile(file);
  const summary = evalIn('APP.state.photo.summary');
  if (!summary.hasGps) throw new Error('no GPS read');
  if (Math.abs(summary.lat - 34.0151) > 1e-6) throw new Error(`lat ${summary.lat}`);
  if ($('#photoResults').hidden) throw new Error('results block stayed hidden');
  if ($$('#metaTable tr').length < 20) throw new Error(`only ${$$('#metaTable tr').length} metadata rows`);
  if (!/FixtureCam/.test($('#metaTable').textContent)) throw new Error('camera model missing');
  if ($$('#privacyList li').length < 4) throw new Error('privacy report empty');
  if (!$('#sunCheck').textContent.match(/azimuth/i)) throw new Error('sun check not rendered');
  if (!/WGS84/.test($('#photoPosition').textContent)) throw new Error('position card missing');
  return true;
});
await check('map links for the photo point at the right coordinates', () => {
  const links = evalIn('CORE.mapsLinks(34.0151, 71.5249)');
  const osm = links.find((l) => l.label === 'OpenStreetMap');
  if (!osm.url.includes('34.0151')) throw new Error(osm.url);
  return true;
});
// Tesseract itself needs a CDN, which jsdom will not fetch, so the loader is
// exercised in the browser. The parsing of its output is plain logic and is
// tested here with payloads shaped like the two API versions in use.
await check('OCR line extraction handles both Tesseract payload shapes', () => {
  const fromLines = window.ocrLinesFromData({ lines: [{ text: 'W 60th Ave', confidence: 91 }, { text: '  ', confidence: 50 }] });
  if (fromLines.length !== 1 || fromLines[0].text !== 'W 60th Ave') throw new Error(JSON.stringify(fromLines));
  const fromBlocks = window.ocrLinesFromData({ blocks: [{ paragraphs: [{ lines: [{ text: 'Vancouver', confidence: 88 }] }] }] });
  if (fromBlocks[0].text !== 'Vancouver') throw new Error(JSON.stringify(fromBlocks));
  const fromText = window.ocrLinesFromData({ text: 'line one\nline two' });
  if (fromText.length !== 2 || fromText[1].text !== 'line two') throw new Error(JSON.stringify(fromText));
  return true;
});
await check('OCR queries drop noise, digits and low-confidence lines', () => {
  const queries = window.ocrQueriesFromLines([
    { text: 'GPSTEST 1284', confidence: 92 },
    { text: '34 00 54 N', confidence: 90 },
    { text: 'blur', confidence: 20 },
    { text: 'Vancouver Public Library', confidence: 85 }
  ]);
  const joined = queries.map((q) => q.query).join(' | ');
  if (!/Vancouver Public Library/.test(joined)) throw new Error(joined);
  if (/\d{3,}/.test(joined)) throw new Error(`digits survived: ${joined}`);
  if (/blur/.test(joined)) throw new Error('low confidence line kept');
  return true;
});
await check('calling codes are detected inside a realistic OCR result', () => {
  const ocr = { text: 'Tel +92 300 1234567', lines: [{ text: 'Tel +92 300 1234567', confidence: 90 }], scripts: [], languages: [], codes: [] };
  evalIn('APP.state.ocr = ' + JSON.stringify(ocr));
  const codes = evalIn('CORE.findCallingCodes(APP.state.ocr.text, DATA_CALLING_CODES.map((r) => ({ code: r[0], prefix: r[1], country: r[2], utc: r[3] })))');
  if (!codes.length || codes[0].country !== 'Pakistan') throw new Error(JSON.stringify(codes));
  return true;
});
await check('export path builds a case file with the photo position', () => {
  const cf = JSON.parse(window.eval('JSON.stringify(CORE.buildCaseFile(APP.state))'));
  if (cf.schema !== 'gpsfinder.case/1') throw new Error(cf.schema);
  if (!cf.photo || !cf.photo.exif.hasGps) throw new Error('photo missing from the case file');
  const md = window.eval('CORE.buildMarkdownReport(APP.state)');
  if (!/GPS Finder case report/.test(md)) throw new Error('markdown report missing');
  return true;
});
await check('the app left no uncaught errors behind', () => {
  if (pageErrors.length) throw new Error(pageErrors.join(' | '));
  return true;
});

window.close();
console.log(`smoke: ${passes.length} checks passed`);
for (const p of passes) console.log(`  ok  ${p}`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  fail  ${f}`);
  process.exit(1);
}
console.log('\nDOM smoke test passed.');
