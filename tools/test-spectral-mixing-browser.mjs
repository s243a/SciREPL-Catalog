#!/usr/bin/env node
// Real import -> Run All -> source export in a disposable app profile.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.env.SCIREPL_SPECTRAL_APP;
assert(app, 'Set SCIREPL_SPECTRAL_APP to a checked local app checkout');
const origin = process.env.SCIREPL_SPECTRAL_ORIGIN || 'http://127.0.0.1:8123';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Use a loopback app server');
const evidence = path.resolve(root, process.env.SCIREPL_SPECTRAL_EVIDENCE || 'reviews/spectral-mixing-english-20261013/iteration-5/browser');
assert(evidence.startsWith(path.join(root, 'reviews') + path.sep), 'Evidence must be scoped to reviews');
const reportPath = path.join(evidence, 'execution.json');
assert(!existsSync(reportPath), 'Do not overwrite completed evidence');
const runtime = JSON.parse(readFileSync(process.env.SCIREPL_SPECTRAL_RUNTIME || path.join(path.dirname(evidence), 'runtime.json')));
const source = readFileSync(path.join(root, 'drafts/markov-spectral-mixing/en/markov-spectral-mixing.srwb'), 'utf8');
const book = JSON.parse(source);
const digest = value => createHash('sha256').update(value).digest('hex');
assert(runtime.allPassed && runtime.candidateSha256 === digest(source), 'Candidate/runtime hash mismatch');
mkdirSync(evidence, { recursive: true });
const appHashes = {};
for (const file of ['www/index.html', 'www/js/app.js', 'www/js/file_io.js', 'www/js/bridge.js', 'www/js/prelude.py', 'www/vendor/plotly/plotly-basic.min.js']) {
  const response = await fetch(new URL(file === 'www/index.html' ? '/' : file.slice(3), origin));
  assert.equal(response.status, 200);
  appHashes[file] = digest(Buffer.from(await response.arrayBuffer()));
  assert.equal(appHashes[file], digest(readFileSync(path.join(app, file))), 'Served app differs: ' + file);
}

function equivalent(actual, expected, location = 'plots') {
  if (typeof expected === 'number') {
    assert(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-8 + Math.abs(expected) * 1e-7,
      location + ': numerical payload mismatch');
  } else if (Array.isArray(expected)) {
    assert(Array.isArray(actual) && actual.length === expected.length, location + ': array shape changed');
    expected.forEach((value, index) => equivalent(actual[index], value, location + '[' + index + ']'));
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), location + ': keys changed');
    for (const [key, value] of Object.entries(expected)) equivalent(actual[key], value, location + '.' + key);
  } else assert.equal(actual, expected, location + ': presentation changed');
}

const { chromium } = createRequire(path.join(app, 'package.json'))('playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'UTC' });
const page = await context.newPage(), errors = [], blocked = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin === new URL(origin).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
  blocked.push(url.origin + url.pathname);
  return route.abort('blockedbyclient');
});
await page.addInitScript(() => {
  localStorage.setItem('scirepl_privacy_accepted', '1');
  localStorage.setItem('scirepl_onboarding_seen', '1');
  localStorage.setItem('scirepl_auto_download', '1');
  addEventListener('DOMContentLoaded', () => localStorage.setItem('scirepl_whats_new_seen_version', window.KERNEL_CONFIG?.app?.version || ''), { once: true });
});
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__SCIREPL_APP_READY && window.fileIO && typeof window.runAllCells === 'function', null, { timeout: 60000 });
  await page.evaluate(() => {
    const manager = window.kernelManager.constructor;
    localStorage.setItem(manager.PRIVACY_POLICY_REVISION_KEY, manager.PRIVACY_POLICY_REVISION);
    window.__SPECTRAL_PLOTS = [];
    const render = window.renderPlot;
    window.renderPlot = function(payload, ...rest) {
      window.__SPECTRAL_PLOTS.push(JSON.parse(payload));
      return render.call(this, payload, ...rest);
    };
  });
  const receipt = await page.evaluate(text => window.fileIO.importWorkbook(text, { format: 'srwb', mode: 'replace' }), source);
  console.log('Imported ' + book.notebook.cells.length + ' cells into a disposable profile; Run All');
  await page.evaluate(() => window.runAllCells());
  const outputs = await page.evaluate(() => window._cells.map(cell => ({ name: cell.name, type: cell.type,
    output: cell.outputCard?.innerText || '' })));
  assert(!outputs.some(cell => /Traceback|NameError|AssertionError|TypeError|Failed to load/.test(cell.output)), 'Workbook execution error');
  await page.waitForFunction(() => document.querySelectorAll('.js-plotly-plot').length === 17
    && [...document.querySelectorAll('.js-plotly-plot')].every(plot => plot._fullLayout));
  const plots = await page.evaluate(() => window.__SPECTRAL_PLOTS);
  equivalent(plots, runtime.plots);
  const exported = await page.evaluate(async () => {
    let content;
    const download = window.fileIO.downloadFile;
    window.fileIO.downloadFile = async (name, text) => { content = text; };
    try { await window.fileIO._exportSrwb('current'); }
    finally { window.fileIO.downloadFile = download; }
    return JSON.parse(content);
  });
  assert.deepEqual(exported.notebook.cells.map(({ name, type, language, code }) => ({ name, type, language, code })), book.notebook.cells);
  assert.equal(errors.length, 0, 'Page errors');
  assert.equal(blocked.length, 0, 'Unexpected nonlocal requests');
  const numpyVersion = await page.evaluate(() => window.kernelManager.getKernel('python').getPyodide().runPython('np.__version__'));
  writeFileSync(reportPath, JSON.stringify({ allPassed: true, candidateSha256: digest(source),
    mode: 'Real app import, ordered execution and source export in disposable profile',
    appVersion: await page.evaluate(() => window.KERNEL_CONFIG.app.version), appHashes,
    numpyVersion, receipt, cells: outputs, plotCount: plots.length, errors, externalRequests: blocked,
    comparisonTolerance: { absolute: 1e-8, relative: 1e-7 } }, null, 2) + '\n', { flag: 'wx' });
  console.log('PASS real SciREPL execution, all 17 plots, exact source round-trip; NumPy ' + numpyVersion);
} finally { await context.close(); await browser.close(); }
