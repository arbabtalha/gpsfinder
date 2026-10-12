/**
 * Static checks for the single-file web app.
 *
 *   node tools/check-page.mjs
 *
 * Catches the class of mistake that unit tests cannot: a script that does not
 * parse, an element id the code reaches for that the markup never defines, an
 * SVG icon used but not defined, and the markers the tooling depends on.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const problems = [];
const notes = [];

/* ------------------------------------------------------------ 1. scripts */
const allScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
const jsonLd = allScripts.filter((m) => /application\/ld\+json/.test(m[1]));
const scripts = allScripts.filter((m) => !/application\/ld\+json/.test(m[1])).map((m) => m[2]);
if (scripts.length < 4) problems.push(`expected at least 4 inline scripts, found ${scripts.length}`);
scripts.forEach((src, i) => {
  try {
    // Parses the code without running it.
    new Function(src);
  } catch (err) {
    problems.push(`inline script ${i + 1} does not parse: ${err.message}`);
  }
});
notes.push(`${scripts.length} inline scripts parse`);
for (const block of jsonLd) {
  try { JSON.parse(block[2]); } catch (err) { problems.push(`JSON-LD block is not valid JSON: ${err.message}`); }
}
notes.push(`${jsonLd.length} JSON-LD block validated`);

/* ------------------------------------------------------- 2. element ids */
const definedIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const codeOnly = scripts.join('\n');
const referenced = new Set([
  ...[...codeOnly.matchAll(/\$\$?\('#([A-Za-z][\w-]*)'/g)].map((m) => m[1]),
  ...[...codeOnly.matchAll(/getElementById\('([A-Za-z][\w-]*)'\)/g)].map((m) => m[1]),
  ...[...codeOnly.matchAll(/querySelector\('#([A-Za-z][\w-]*)'\)/g)].map((m) => m[1])
]);
const missingIds = [...referenced].filter((id) => !definedIds.has(id));
if (missingIds.length) problems.push(`scripts reference ids that the markup does not define: ${missingIds.join(', ')}`);
notes.push(`${referenced.size} element ids referenced by the scripts all exist`);

/* ------------------------------------------------------- 3. icon sprite */
const definedSymbols = new Set([...html.matchAll(/<symbol id="i-([\w-]+)"/g)].map((m) => m[1]));
const usedSymbols = new Set([
  ...[...html.matchAll(/href="#i-([\w-]+)"/g)].map((m) => m[1]),
  ...[...codeOnly.matchAll(/icon\('([\w-]+)'/g)].map((m) => m[1])
]);
const missingIcons = [...usedSymbols].filter((name) => !definedSymbols.has(name));
if (missingIcons.length) problems.push(`icons used but not defined in the sprite: ${missingIcons.join(', ')}`);
const unusedIcons = [...definedSymbols].filter((name) => !usedSymbols.has(name));
if (unusedIcons.length) notes.push(`defined but unused icons: ${unusedIcons.join(', ')}`);
notes.push(`${usedSymbols.size} icons used, all defined`);

/* ------------------------------------------------------------ 4. markers */
for (const marker of ['/* ==== PURE-CORE-START ====', '/* ==== PURE-CORE-END ==== */', '/* ==== DATA-TABLES-START ==== */', '/* ==== DATA-TABLES-END ==== */']) {
  if (!html.includes(marker)) problems.push(`marker missing: ${marker}`);
}

/* ----------------------------------------------- 5. page level requirements */
const checks = [
  [/<meta name="description" content="[^"]{40,}"/, 'meta description'],
  [/<html lang="en"/, 'lang attribute'],
  [/<h1[\s>]/, 'one h1'],
  [/class="skip"/, 'skip link'],
  [/aria-live="polite"/, 'aria-live region'],
  [/prefers-reduced-motion/, 'reduced motion'],
  [/data-theme="dark"/, 'dark theme default'],
  [/\[data-theme="light"\]/, 'light theme swap'],
  [/theme-color/, 'theme-color meta']
];
for (const [re, label] of checks) if (!re.test(html)) problems.push(`missing ${label}`);
if ((html.match(/<h1[\s>]/g) || []).length > 1) problems.push('more than one h1 on the page');

/* ---------------------------------------------- 6. no emoji used as icons */
const emoji = html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
if (emoji) problems.push(`emoji found in the markup (icons must be SVG): ${[...new Set(emoji)].join(' ')}`);

/* --------------------------------------------------------------- report */
console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB, ${html.split('\n').length} lines`);
for (const note of notes) console.log(`  ok  ${note}`);
if (problems.length) {
  console.error('\nProblems:');
  for (const p of problems) console.error(`  fail  ${p}`);
  process.exit(1);
}
console.log('\nAll static checks passed.');
