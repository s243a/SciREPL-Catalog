#!/usr/bin/env node
// Fail-closed real-app renderer gate for all 19-cell Markov editions.
// It consumes a green aggregate runtime report, uses disposable contexts, and
// writes only a fresh public evidence directory.  No model/catalog/git writes.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const REVIEWS = path.join(REPO, 'reviews');
const TRANSLATIONS = path.join(REVIEWS, 'translations');
const PREDECESSOR = 'f88d9b9e26364eeb5e7ff1ee9bcce5f27d47c66e';
const ENGLISH_SHA256 = '2daf77aa872a7210cc16083535b1c244fb2cfbc288d60f688b85f0736633c430';
const LOCALES = ['ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'pt-BR', 'ru', 'zh'];
const ALL_EDITIONS = ['en', ...LOCALES];
const THEMES = ['light', 'dark'];
const ENGLISH = path.join(REPO, 'drafts/markov-mixing/en/markov-groups.srwb');
const ITERATION7 = path.join(REPO, 'reviews/markov-mixing-english-20261007/iteration-7/runtime.json');
const DEFAULT_ORIGIN = 'http://127.0.0.1:8123';
const APP_FILES = [
  'www/index.html',
  'www/js/app.js',
  'www/js/file_io.js',
  'www/js/bridge.js',
  'www/js/prelude.py',
  'www/vendor/plotly/plotly-basic.min.js',
  'www/vendor/katex/katex.min.js',
];
const NUMBER = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g;
const HTML_TAG = /<[^>]*>/g;
const MODEL_ROUTE = /(?:^|[/?&_.=-])(openai|anthropic|gemini|model|models|chat|completion|completions|ollama|huggingface|agy)(?:$|[/?&_.=-])/i;

const sha256 = data => createHash('sha256').update(data).digest('hex');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const clone = value => structuredClone(value);
const numbers = text => String(text).match(NUMBER) || [];
const tags = text => String(text).match(HTML_TAG) || [];
const safeLabelMarkup = text => tags(text).every(tag => tag === '<br>')
  && !/[<>]/.test(String(text).replace(HTML_TAG, ''));

function parseArgs(argv) {
  const result = { appRoot: process.env.SCIREPL_MIXING_APP || null,
    origin: process.env.SCIREPL_MIXING_ORIGIN || DEFAULT_ORIGIN, selfTest: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--self-test') result.selfTest = true;
    else if (['--campaign', '--runtime-report', '--evidence', '--app-root', '--origin'].includes(arg)) {
      assert(index + 1 < argv.length, `Missing value for ${arg}`);
      result[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = argv[++index];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.selfTest) {
    assert(result.evidence, '--evidence is required');
    assert(result.appRoot, 'Set --app-root or SCIREPL_MIXING_APP to the local SciREPL checkout to review');
  }
  return result;
}

function inside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function rejectSymlinks(target, stop) {
  let current = path.resolve(target), boundary = path.resolve(stop);
  while (true) {
    if (existsSync(current)) assert(!lstatSync(current).isSymbolicLink(), 'Symlink evidence/campaign path refused');
    if (current === boundary) return;
    assert(current !== path.dirname(current), 'Path escaped its allowed root');
    current = path.dirname(current);
  }
}

function repoRelative(file) {
  assert(inside(file, REPO), 'Recorded path escaped repository');
  return path.relative(REPO, path.resolve(file)).split(path.sep).join('/');
}

function scopedCampaign(value) {
  if (!value) return null;
  const target = path.resolve(REPO, value);
  assert(inside(target, TRANSLATIONS), 'Campaign must be inside reviews/translations');
  assert(existsSync(target) && lstatSync(target).isDirectory(), 'Campaign directory is missing');
  rejectSymlinks(target, TRANSLATIONS);
  return target;
}

function freshEvidence(value) {
  const target = path.resolve(REPO, value);
  assert(inside(target, REVIEWS), 'Evidence must be inside reviews');
  rejectSymlinks(path.dirname(target), REVIEWS);
  assert(!existsSync(target), 'Refusing to reuse or overwrite an evidence directory');
  return target;
}

function exactWrite(file, value) {
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}

async function servedAppHashes(origin, expected) {
  const hashes = {};
  for (const [file, localSha256] of Object.entries(expected)) {
    const route = file === 'www/index.html' ? '/' : file.slice('www'.length);
    const response = await fetch(new URL(route, origin), { cache: 'no-store' });
    assert.equal(response.status, 200, `Source app did not serve ${file}`);
    const digest = sha256(Buffer.from(await response.arrayBuffer()));
    assert.equal(digest, localSha256, `Served ${file} differs from declared source app checkout`);
    hashes[file] = digest;
  }
  return hashes;
}

function reviewFontInputs() {
  const fontValue = process.env.SCIREPL_MIXING_REVIEW_FONT;
  const configValue = process.env.FONTCONFIG_FILE;
  if (!fontValue && !configValue) return null;
  assert(fontValue && configValue,
    'SCIREPL_MIXING_REVIEW_FONT and FONTCONFIG_FILE must be supplied together');
  const font = realpathSync(fontValue), config = realpathSync(configValue);
  assert(statSync(font).isFile() && statSync(config).isFile(), 'Review font inputs must be regular files');
  assert.equal(path.basename(font).toLowerCase(), 'malgun.ttf',
    'The declared Korean review font must be malgun.ttf');
  const fontSha256 = sha256(readFileSync(font)), fontConfigSha256 = sha256(readFileSync(config));
  return {
    font, config, fontSha256, fontConfigSha256,
    record: { fontConfigSha256, fontFamily: 'MalgunGothic', fontSha256,
      scope: 'Test environment glyph fallback only; no font asset shipped' },
  };
}

function guardReviewFont(input) {
  if (!input) return;
  assert.equal(sha256(readFileSync(input.font)), input.fontSha256, 'Review font changed during browser run');
  assert.equal(sha256(readFileSync(input.config)), input.fontConfigSha256,
    'Review font configuration changed during browser run');
}

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function getAt(value, keys) {
  for (const key of keys) value = value[key];
  return value;
}

function setAt(value, keys, replacement) {
  for (const key of keys.slice(0, -1)) value = value[key];
  value[keys.at(-1)] = replacement;
}

function labelLeaves(plot) {
  const leaves = [];
  for (const key of ['title', 'xlabel', 'ylabel']) if (Object.hasOwn(plot, key)) leaves.push([[key], plot[key]]);
  if (plot.layout?.title && Object.hasOwn(plot.layout.title, 'text'))
    leaves.push([['layout', 'title', 'text'], plot.layout.title.text]);
  for (const [index, trace] of (plot.traces || []).entries()) {
    if (Object.hasOwn(trace, 'name')) leaves.push([['traces', index, 'name'], trace.name]);
    if (trace.marker?.colorbar?.title && Object.hasOwn(trace.marker.colorbar.title, 'text'))
      leaves.push([['traces', index, 'marker', 'colorbar', 'title', 'text'], trace.marker.colorbar.title.text]);
  }
  return leaves;
}

function normalizePlots(reference, candidate, sentinel = false) {
  assert.equal(reference.length, 6, 'Golden must contain six plots');
  assert.equal(candidate.length, 6, 'Edition must contain six plots');
  const expected = clone(reference), actual = clone(candidate), labels = [];
  for (let index = 0; index < 6; index++) {
    const a = labelLeaves(expected[index]), b = labelLeaves(actual[index]);
    assert.deepEqual(b.map(([keys]) => keys), a.map(([keys]) => keys), `Plot ${index}: localized label topology changed`);
    for (let leaf = 0; leaf < a.length; leaf++) {
      const [keys, source] = a[leaf], target = b[leaf][1];
      assert.equal(typeof target, 'string', `Plot ${index}: localized label is not a string`);
      assert(target.trim(), `Plot ${index}: blank localized label`);
      assert.deepEqual(numbers(target), numbers(source), `Plot ${index}: localized label numeric text changed`);
      assert(safeLabelMarkup(source) && safeLabelMarkup(target),
        `Plot ${index}: localized label contains markup other than <br>`);
      labels.push({ plot: index, path: '.' + keys.join('.'), text: target });
      const replacement = sentinel ? '<localized-label>' : source;
      setAt(expected[index], keys, replacement); setAt(actual[index], keys, replacement);
    }
    assert.equal(candidate[index].title, candidate[index].layout.title.text,
      `Plot ${index}: top-level and layout titles diverged`);
  }
  assert.equal(labels.length, 33, 'Expected exactly 33 localized plot-label leaves');
  assert.deepEqual(actual, expected, 'Edition plot changed protected numeric/layout/API payload');
  return { normalized: actual, labels };
}

function validatePlotPayloads(plots) {
  assert.deepEqual(plots.map(plot => plot.traces.length), [2, 2, 2, 1, 1, 1], 'Plot trace counts changed');
  for (const [index, plot] of plots.entries()) {
    if (index < 3) {
      assert.equal(plot.traces[0].type, 'bar'); assert.equal(plot.traces[0].x.length, 24);
      assert.equal(plot.traces[0].y.length, 24); assert.equal(plot.traces[1].y.length, 24);
      continue;
    }
    const trace = plot.traces[0], seen = new Set();
    assert.equal(trace.type, 'bar'); assert.equal(trace.x.length, 504);
    assert.equal(trace.y.length, 504); assert.equal(trace.base.length, 504);
    assert.equal(trace.marker.color.length, 504); assert.equal(plot.layout.shapes.length, 50);
    for (let point = 0; point < 504; point++) {
      const row = trace.base[point] + 0.5, column = trace.x[point];
      assert(Number.isInteger(row) && row >= 0 && row < 24 && Number.isInteger(column) && column >= 0 && column < 24);
      seen.add(`${row}:${column}`);
    }
    assert.equal(seen.size, 504, 'Heatmap contains duplicate/missing reachable pairs');
    for (let row = 0; row < 24; row++) {
      assert.equal([...seen].filter(key => key.startsWith(`${row}:`)).length, 21, 'Heatmap row does not have 21 tiles/3 gaps');
      assert.equal([...seen].filter(key => key.endsWith(`:${row}`)).length, 21, 'Heatmap column does not have 21 tiles/3 gaps');
    }
    for (const axis of ['xaxis', 'yaxis']) {
      assert.deepEqual(plot.layout[axis].range, [-0.5, 23.5]);
      assert.deepEqual(plot.layout[axis].tickvals, [0, 4, 8, 12, 16, 20, 23]);
      assert.deepEqual(plot.layout[axis].ticktext, [1, 5, 9, 13, 17, 21, 24]);
      assert.equal(plot.layout[axis].showgrid, false); assert.equal(plot.layout[axis].zeroline, false);
    }
  }
}

function isModelRoute(url) {
  const parsed = new URL(url);
  return parsed.pathname === '/proxy' || parsed.pathname.startsWith('/api/')
    || MODEL_ROUTE.test(parsed.hostname + parsed.pathname + parsed.search);
}

function allowedLocalRequest(url, origin) {
  const parsed = new URL(url), expected = new URL(origin);
  if (['data:', 'blob:'].includes(parsed.protocol)) return true;
  return parsed.origin === expected.origin && !isModelRoute(url);
}

function sourceProjection(workbook) {
  return {
    name: workbook.notebook.name,
    cells: workbook.notebook.cells.map(({ name, type, language, code }) => ({ name, type, language, code })),
  };
}

function validateSourceWorkbook(bytes, expectedSha, locale) {
  assert.equal(sha256(bytes), expectedSha, `${locale}: workbook hash changed`);
  const workbook = JSON.parse(bytes);
  assert.equal(workbook.format, 'srwb'); assert.equal(workbook.version, '1.0');
  assert.equal(workbook.notebook.cells.length, 19, `${locale}: expected 19 cells`);
  assert.deepEqual(workbook.notebook.cells.slice(13).map(cell => cell.name),
    ['mixing_bridge', 'mixing_setup', 'visit_bridge', 'sticker_visits', 'joint_bridge', 'joint_visits']);
  return workbook;
}

function runtimeInputs(args) {
  const campaign = scopedCampaign(args.campaign);
  const evidence = freshEvidence(args.evidence);
  const runtimePath = path.resolve(REPO, args.runtimeReport || path.join(path.dirname(evidence), 'runtime.json'));
  assert(inside(runtimePath, REVIEWS), 'Runtime report must be inside reviews');
  assert(existsSync(runtimePath) && !lstatSync(runtimePath).isSymbolicLink(), 'Green runtime report is missing');
  const runtimeBytes = readFileSync(runtimePath), runtime = JSON.parse(runtimeBytes);
  assert.equal(runtime.schema, 'markov-mixing-editions-runtime-v1'); assert.equal(runtime.allPassed, true);
  assert.equal(runtime.englishSha256, ENGLISH_SHA256); assert.equal(runtime.predecessorCommit, PREDECESSOR);
  assert.equal(runtime.invariants?.moves, 10000); assert.deepEqual(runtime.invariants?.checkpoints, [100, 1000, 10000]);
  assert.deepEqual(runtime.locales.map(item => item.locale), ALL_EDITIONS, 'Runtime report does not cover English plus all 12 locales');
  const editions = runtime.locales.map(record => {
    const expected = record.locale === 'en' ? ENGLISH
      : campaign ? path.join(campaign, record.locale, 'markov-groups.srwb')
        : path.join(REPO, 'workbooks', record.locale, 'markov-groups.srwb');
    assert.equal(path.resolve(REPO, record.path), path.resolve(expected), `${record.locale}: runtime source path differs`);
    assert(inside(expected, REPO) && existsSync(expected) && !lstatSync(expected).isSymbolicLink());
    const bytes = readFileSync(expected), workbook = validateSourceWorkbook(bytes, record.targetSha256, record.locale);
    assert.equal(record.cells, 19); assert.equal(record.preservedCoreCells, 13);
    assert.equal(record.plots?.count, 6); assert.equal(record.movesExecuted, 10000);
    return { locale: record.locale, path: expected, bytes, workbook, record };
  });
  return { campaign, evidence, runtimePath, runtimeBytes, runtime, editions };
}

function initScript(locale) {
  localStorage.setItem('scirepl_privacy_accepted', '1');
  localStorage.setItem('scirepl_onboarding_seen', '1');
  localStorage.setItem('scirepl_auto_download', '1');
  localStorage.setItem('scirepl_language', locale);
  localStorage.setItem('scirepl_i18n_show_drafts', '1');
  addEventListener('DOMContentLoaded', () => {
    localStorage.setItem('scirepl_whats_new_seen_version', window.KERNEL_CONFIG?.app?.version || '');
  }, { once: true });
}

async function runContext({ browser, origin, evidence, edition, theme, golden, expectedNumericHash }) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 }, serviceWorkers: 'block',
    locale: edition.locale === 'en' ? 'en-US' : edition.locale, timezoneId: 'UTC',
    colorScheme: theme,
  });
  const page = await context.newPage();
  const pageErrors = [], consoleErrors = [], externalRequests = [], modelRequests = [], webSockets = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('websocket', socket => webSockets.push(socket.url()));
  await context.route('**/*', route => {
    const url = route.request().url();
    if (isModelRoute(url)) { modelRequests.push(url); return route.abort('blockedbyclient'); }
    if (!allowedLocalRequest(url, origin)) { externalRequests.push(url); return route.abort('blockedbyclient'); }
    return route.continue();
  });
  await page.addInitScript(initScript, edition.locale);
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => window.__SCIREPL_APP_READY && window.fileIO
      && typeof window.runAllCells === 'function' && window.appearance && window.i18n, null, { timeout: 60_000 });
    await page.evaluate(async ({ locale, theme }) => {
      window.i18n.setShowDrafts(true); window.i18n.setPreference(locale);
      await window.i18n.activate(locale);
      window.appearance.setTheme(theme);
      const manager = window.kernelManager.constructor;
      localStorage.setItem(manager.PRIVACY_POLICY_REVISION_KEY, manager.PRIVACY_POLICY_REVISION);
      window.__MIXING_EDITION_PLOTS = [];
      const render = window.renderPlot;
      window.renderPlot = function (payload, ...rest) {
        const parsed = typeof payload === 'string' ? JSON.parse(payload) : structuredClone(payload);
        window.__MIXING_EDITION_PLOTS.push(parsed);
        return render.call(this, payload, ...rest);
      };
    }, { locale: edition.locale, theme });
    const source = edition.bytes.toString('utf8'), size = edition.bytes.length;
    const receipt = await page.evaluate(({ source, size, sha256 }) => window.fileIO.importWorkbook(source,
      { format: 'srwb', mode: 'replace', size, sha256 }), { source, size, sha256: edition.record.targetSha256 });
    assert.deepEqual({ ok: receipt.ok, format: receipt.format, mode: receipt.mode, cells: receipt.cells,
      size: receipt.size, sha256: receipt.sha256 },
    { ok: true, format: 'srwb', mode: 'replace', cells: 19, size, sha256: edition.record.targetSha256 });
    await page.evaluate(() => window.runAllCells());
    await page.waitForFunction(() => document.querySelectorAll('.js-plotly-plot').length === 6
      && [...document.querySelectorAll('.js-plotly-plot')].every(plot => plot._fullLayout), null, { timeout: 120_000 });

    const cells = await page.evaluate(() => window._cells.map(cell => ({
      name: cell.name, type: cell.type, language: cell.language, code: cell.code,
      output: cell.outputCard?.innerText || '', error: !!cell.outputCard?.matches('.card-error')
        || !!cell.outputCard?.querySelector('.error-result'),
      stdout: [...(cell.outputCard?.querySelectorAll('.text-result') || [])]
        .map(node => node.textContent || '').join(''),
    })));
    assert.equal(cells.length, 19); assert(!cells.some(cell => cell.error), 'Workbook rendered a runtime error card');
    assert(!cells.some(cell => /Traceback|(?:^|\n)(?:Error|Exception):|Failed to load/.test(cell.output)),
      'Workbook output contains a runtime failure');
    const numeric = cells.filter(cell => cell.type === 'code').flatMap(cell => numbers(cell.stdout));
    assert.equal(sha256(Buffer.from(stable(numeric))), expectedNumericHash, 'Browser numeric stdout differs from offline runtime');

    const payloads = await page.evaluate(() => window.__MIXING_EDITION_PLOTS);
    validatePlotPayloads(payloads);
    const normalized = normalizePlots(golden, payloads, true);
    const rendering = await page.evaluate(() => [...document.querySelectorAll('.js-plotly-plot')].map((plot, index) => {
      const box = plot.getBoundingClientRect();
      const labels = [...plot.querySelectorAll('.gtitle,.xtitle,.ytitle,.legendtext,.cbtitle')].map(element => {
        const bounds = element.getBoundingClientRect();
        return { text: element.textContent || '', left: bounds.left - box.left, right: bounds.right - box.left,
          top: bounds.top - box.top, bottom: bounds.bottom - box.top };
      });
      const clipped = labels.filter(label => label.left < -1 || label.right > box.width + 1
        || label.top < -1 || label.bottom > box.height + 1);
      const overlaps = [];
      for (let a = 0; a < labels.length; a++) for (let b = a + 1; b < labels.length; b++) {
        const x = labels[a], y = labels[b];
        if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1
          && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1) overlaps.push([x.text, y.text]);
      }
      const tickText = selector => [...plot.querySelectorAll(selector)].map(node => (node.textContent || '').trim());
      return { index, width: box.width, height: box.height, labels, clipped, overlaps,
        types: plot._fullData.map(trace => trace.type), bars: plot.querySelectorAll('.barlayer .point path').length,
        shapes: plot.querySelectorAll('.shapelayer path').length,
        xTicks: tickText('.xtick text'), yTicks: tickText('.ytick text'),
        background: plot._fullLayout.plot_bgcolor, fontColor: plot._fullLayout.font.color };
    }));
    for (const plot of rendering) {
      assert(plot.width > 150 && plot.width <= 320, 'Unexpected phone plot width');
      assert.deepEqual(plot.clipped, [], `Plot ${plot.index} has clipped labels`);
      assert.deepEqual(plot.overlaps, [], `Plot ${plot.index} has overlapping labels`);
      assert.equal(plot.bars, plot.index < 3 ? 24 : 504, `Plot ${plot.index} rendered wrong bar/tile count`);
      if (plot.index >= 3) {
        assert.equal(plot.shapes, 50, `Plot ${plot.index} rendered wrong cell-edge count`);
        for (const ticks of [plot.xTicks, plot.yTicks]) {
          assert(ticks.includes('1') && ticks.includes('24'), `Plot ${plot.index} does not visibly span axes 1-24`);
          assert(ticks.filter(Boolean).every(text => /^\d+$/.test(text) && +text >= 1 && +text <= 24),
            `Plot ${plot.index} rendered a non-1-24 heatmap tick`);
        }
      }
    }

    const core = await page.evaluate(() => {
      const cells = window._cells.slice(0, 13), roots = cells.map(cell => cell.outputCard).filter(Boolean);
      const svgs = roots.flatMap(root => [...root.querySelectorAll('.markdown-body svg')]);
      const svgRecords = svgs.map(svg => {
        const bounds = svg.getBoundingClientRect(), body = svg.closest('.markdown-body')?.getBoundingClientRect();
        const markup = svg.outerHTML;
        const unsafe = svg.querySelectorAll('script,foreignObject,iframe,object,embed').length
          + [...svg.querySelectorAll('*')].filter(node => [...node.attributes].some(attr => /^on/i.test(attr.name))).length;
        const external = [...svg.querySelectorAll('[href],[xlink\\:href]')].some(node => {
          const value = node.getAttribute('href') || node.getAttribute('xlink:href') || '';
          return /^(?:https?:)?\/\//i.test(value);
        });
        return { sha256Input: markup, width: bounds.width, bodyWidth: body?.width || 0, unsafe, external,
          title: svg.querySelector('title')?.textContent || '', description: svg.querySelector('desc')?.textContent || '' };
      });
      const katex = roots.reduce((count, root) => count + root.querySelectorAll('.katex-display').length, 0);
      const katexErrors = roots.reduce((count, root) => count + root.querySelectorAll('.katex-error').length, 0);
      return { svgs: svgRecords, katex, katexErrors };
    });
    assert.equal(core.svgs.length, 2, 'Core coordinate lesson must preserve two SVGs');
    for (const svg of core.svgs) {
      assert.equal(svg.unsafe, 0); assert.equal(svg.external, false); assert(svg.title && svg.description);
      assert(svg.width > 0 && svg.width <= svg.bodyWidth + 1, 'Core SVG exceeds the phone body');
      svg.sha256 = sha256(Buffer.from(svg.sha256Input)); delete svg.sha256Input;
    }
    assert.equal(core.katex, 4, 'Core must render four KaTeX display formulas');
    assert.equal(core.katexErrors, 0, 'Core contains a KaTeX rendering error');

    const runDir = path.join(evidence, edition.locale, theme); mkdirSync(runDir, { recursive: true });
    const screenshots = [], plots = page.locator('.js-plotly-plot');
    for (let index = 0; index < 6; index++) {
      const file = path.join(runDir, `plot-${index}.png`);
      await plots.nth(index).screenshot({ path: file });
      const bytes = readFileSync(file); assert(bytes.length > 100, 'Empty PNG capture');
      screenshots.push({ path: repoRelative(file), sha256: sha256(bytes), bytes: bytes.length });
    }

    const exportedText = await page.evaluate(async () => {
      let captured = null;
      const download = window.fileIO.downloadFile;
      window.fileIO.downloadFile = async (_name, content) => { captured = content; };
      try { await window.fileIO._exportSrwb('current'); } finally { window.fileIO.downloadFile = download; }
      if (typeof captured !== 'string') throw new Error('SRWB export was not captured');
      return captured;
    });
    const exported = JSON.parse(exportedText), projection = sourceProjection(edition.workbook);
    assert.deepEqual(sourceProjection({ notebook: exported.notebook }), projection, 'Export changed exact cell source/name/type/language');
    const exportBytes = Buffer.from(exportedText), exportSha = sha256(exportBytes);
    const reimport = await page.evaluate(({ text, size, sha256 }) => window.fileIO.importWorkbook(text,
      { format: 'srwb', mode: 'replace', size, sha256 }), { text: exportedText, size: exportBytes.length, sha256: exportSha });
    assert.equal(reimport.ok, true); assert.equal(reimport.cells, 19); assert.equal(reimport.sha256, exportSha);
    const reimported = await page.evaluate(() => ({ name: window.notebookManager.getActiveNotebook().name,
      cells: window._cells.map(({ name, type, language, code }) => ({ name, type, language, code })) }));
    assert.deepEqual(reimported, projection, 'Export reimport changed exact source projection');
    const rerendered = await page.evaluate(() => {
      const roots = window._cells.slice(0, 13).map(cell => cell.outputCard).filter(Boolean);
      return { svgs: roots.reduce((n, root) => n + root.querySelectorAll('.markdown-body svg').length, 0),
        katex: roots.reduce((n, root) => n + root.querySelectorAll('.katex-display').length, 0),
        katexErrors: roots.reduce((n, root) => n + root.querySelectorAll('.katex-error').length, 0) };
    });
    assert.deepEqual(rerendered, { svgs: 2, katex: 4, katexErrors: 0 }, 'Reimport did not preserve core rendering');
    assert.deepEqual(pageErrors, [], 'Browser page errors occurred');
    assert.deepEqual(consoleErrors, [], 'Browser console errors occurred');
    assert.deepEqual(externalRequests, [], 'External request attempted');
    assert.deepEqual(modelRequests, [], 'Model/proxy request attempted');
    assert.deepEqual(webSockets, [], 'WebSocket route attempted');
    return {
      locale: edition.locale, theme, targetSha256: edition.record.targetSha256,
      viewport: { width: 320, height: 844 }, direction: await page.evaluate(() => document.documentElement.dir || 'ltr'),
      importReceipt: { cells: receipt.cells, size: receipt.size, sha256: receipt.sha256 },
      plots: { count: 6, protectedPayloadSha256: sha256(Buffer.from(stable(normalized.normalized))),
        localizedLabelsSha256: sha256(Buffer.from(stable(normalized.labels))), rendering },
      core, roundTrip: { exactSourceProjection: true, sourceProjectionSha256: sha256(Buffer.from(stable(projection))),
        exportSha256: exportSha, reimportSha256: reimport.sha256, cells: reimport.cells },
      screenshots, pageErrors: [], consoleErrors: [], externalRequests: [], modelRequests: [], webSockets: [],
    };
  } finally {
    await context.close();
  }
}

function selfTest() {
  const golden = readJson(ITERATION7).plots;
  assert.equal(labelLeaves(golden[0]).length + golden.slice(1).reduce((n, plot) => n + labelLeaves(plot).length, 0), 33);
  validatePlotPayloads(golden); normalizePlots(golden, golden);
  const label = clone(golden); label[0].title = label[0].title.replace('One sticker', 'Localized');
  label[0].layout.title.text = label[0].title; normalizePlots(golden, label);
  const wrapped = clone(golden); wrapped[0].xlabel = wrapped[0].xlabel.replace(' position', '<br>position');
  normalizePlots(golden, wrapped);
  for (const tag of ['b', 'script']) {
    const unsafe = clone(golden); unsafe[0].xlabel = unsafe[0].xlabel.replace('Label', `<${tag}>Label`);
    assert.throws(() => normalizePlots(golden, unsafe));
  }
  const numeric = clone(golden); numeric[0].traces[0].y[0] += 0.1;
  assert.throws(() => normalizePlots(golden, numeric));
  const numberLabel = clone(golden); numberLabel[0].title = numberLabel[0].title.replace('100', '101');
  numberLabel[0].layout.title.text = numberLabel[0].title; assert.throws(() => normalizePlots(golden, numberLabel));
  const extra = clone(golden); extra[3].traces[0].name = 'extra'; assert.throws(() => normalizePlots(golden, extra));
  assert.equal(allowedLocalRequest('http://127.0.0.1:8123/js/app.js', DEFAULT_ORIGIN), true);
  assert.equal(allowedLocalRequest('https://example.com/x', DEFAULT_ORIGIN), false);
  assert.equal(allowedLocalRequest('http://127.0.0.1:8123/api/chat', DEFAULT_ORIGIN), false);
  assert.equal(allowedLocalRequest('http://127.0.0.1:8123/proxy?url=https://example.com', DEFAULT_ORIGIN), false);
  const temporary = mkdtempSync(path.join(tmpdir(), 'markov-mixing-browser-selftest-'));
  try {
    const existing = path.join(temporary, 'report.json'); exactWrite(existing, {});
    assert.throws(() => exactWrite(existing, {}));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  return { schema: 'markov-mixing-editions-browser-selftest-v1', allPassed: true,
    goldenSha256: sha256(readFileSync(ITERATION7)), labelLeaves: 33, negativeOracles: 10 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) { console.log(JSON.stringify(selfTest(), null, 2)); return; }
  const origin = new URL(args.origin);
  assert.equal(origin.protocol, 'http:'); assert(['127.0.0.1', 'localhost'].includes(origin.hostname));
  assert.equal(origin.port, '8123'); assert.equal(origin.pathname, '/'); assert(!origin.username && !origin.password);
  const input = runtimeInputs(args), appRoot = path.resolve(args.appRoot);
  const reviewFont = reviewFontInputs();
  assert(existsSync(path.join(appRoot, 'package.json')), 'Source app root is missing');
  const goldenBytes = readFileSync(ITERATION7), goldenReport = JSON.parse(goldenBytes);
  assert.equal(goldenReport.allPassed, true); assert.equal(goldenReport.checks, 10829);
  assert.equal(goldenReport.candidateSha256, ENGLISH_SHA256); validatePlotPayloads(goldenReport.plots);
  const { chromium } = createRequire(path.join(appRoot, 'package.json'))('playwright');
  const appCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot, encoding: 'utf8' }).trim();
  assert.match(appCommit, /^[a-f0-9]{40}$/);
  const appFiles = Object.fromEntries(APP_FILES.map(file => {
    const absolute = path.join(appRoot, file); assert(existsSync(absolute), `Missing app source file: ${file}`);
    return [file, sha256(readFileSync(absolute))];
  }));
  const servedFiles = await servedAppHashes(origin.origin, appFiles);
  mkdirSync(input.evidence, { recursive: false });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const browserVersion = browser.version();
  const runs = [];
  try {
    for (const edition of input.editions) for (const theme of THEMES) {
      const run = await runContext({ browser, origin: origin.origin, evidence: input.evidence, edition, theme,
        golden: goldenReport.plots, expectedNumericHash: edition.record.numericStdoutSha256 });
      runs.push(run);
      console.error(`PASS ${edition.locale}/${theme} plots=6 screenshots=6`);
    }
  } finally { await browser.close(); }
  for (const edition of input.editions)
    assert.equal(sha256(readFileSync(edition.path)), edition.record.targetSha256, `${edition.locale}: workbook changed during browser run`);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot, encoding: 'utf8' }).trim(), appCommit,
    'Source app commit changed during browser run');
  for (const [file, digest] of Object.entries(appFiles))
    assert.equal(sha256(readFileSync(path.join(appRoot, file))), digest, `Source app file changed during browser run: ${file}`);
  assert.deepEqual(await servedAppHashes(origin.origin, appFiles), servedFiles,
    'Served source-app assets changed during browser run');
  guardReviewFont(reviewFont);
  const report = {
    schema: 'markov-mixing-editions-browser-v1', allPassed: true, englishSha256: ENGLISH_SHA256,
    scope: 'Loopback web-app import, full 19-cell execution, exact source export/reimport, 320px light/dark rendering for English plus all 12 locales; no native, model, promotion, or native-speaker approval',
    platform: { node: process.version, os: process.platform, arch: process.arch, browser: browserVersion },
    provenance: { runtimeReportPath: repoRelative(input.runtimePath), runtimeReportSha256: sha256(input.runtimeBytes),
      iteration7RuntimePath: repoRelative(ITERATION7), iteration7RuntimeSha256: sha256(goldenBytes),
      sourceApp: { commit: appCommit, files: appFiles, servedFiles },
      ...(reviewFont ? { reviewFont: reviewFont.record } : {}) },
    viewport: { width: 320, height: 844 }, editions: ALL_EDITIONS.length, themes: THEMES,
    runs,
  };
  assert.equal(runs.length, ALL_EDITIONS.length * THEMES.length);
  exactWrite(path.join(input.evidence, 'rendering.json'), report);
  console.log(JSON.stringify({ schema: report.schema, allPassed: true, englishSha256: ENGLISH_SHA256,
    runs: runs.map(run => ({ locale: run.locale, theme: run.theme, targetSha256: run.targetSha256,
      screenshots: run.screenshots.map(item => item.sha256) })),
    report: repoRelative(path.join(input.evidence, 'rendering.json')) }, null, 2));
}

try { await main(); }
catch (error) {
  const message = error instanceof assert.AssertionError ? error.message.replaceAll(REPO, '<repo>') : error?.name || 'Error';
  console.error(JSON.stringify({ allPassed: false, error: message })); process.exitCode = 1;
}
