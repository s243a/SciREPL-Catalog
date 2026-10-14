#!/usr/bin/env node
// Full local app import -> ordered execution -> export in disposable profiles.
// No external requests, providers, user's browser, or existing receipts.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { mixingRepo, mixingSha } from './markov-mixing-addendum.mjs';

assert(process.env.SCIREPL_MIXING_APP,
  'Set SCIREPL_MIXING_APP to the local SciREPL checkout to review');
const appRoot = path.resolve(process.env.SCIREPL_MIXING_APP);
const origin = process.env.SCIREPL_MIXING_ORIGIN || 'http://127.0.0.1:8123';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Use a loopback review server');
const { chromium } = createRequire(path.join(appRoot, 'package.json'))('playwright');
const draftPath = path.join(mixingRepo, 'drafts/markov-mixing/en/markov-groups.srwb');
const source = readFileSync(draftPath, 'utf8'), workbook = JSON.parse(source);
const evidenceRoot = process.env.SCIREPL_MIXING_EVIDENCE
  ? path.resolve(process.env.SCIREPL_MIXING_EVIDENCE)
  : path.join(mixingRepo, 'reviews/markov-mixing-english-20261007/iteration-7');
assert(evidenceRoot.startsWith(path.join(mixingRepo, 'reviews/markov-mixing-english-20261007') + path.sep),
  'Use a fresh scoped evidence directory');
const runtime = JSON.parse(readFileSync(path.join(evidenceRoot, 'runtime.json')));
assert.equal(mixingSha(source), runtime.candidateSha256);
const evidence = path.join(evidenceRoot, 'browser');
assert(!existsSync(path.join(evidence, 'rendering.json')), 'Never overwrite completed rendering evidence');
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const runs = [];
try {
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'UTC' });
    const page = await context.newPage(), errors = [], blocked = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(origin).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
      blocked.push(url.origin + url.pathname); return route.abort('blockedbyclient');
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
      await page.evaluate(theme => {
        window.appearance.setTheme(theme);
        const manager = window.kernelManager.constructor;
        localStorage.setItem(manager.PRIVACY_POLICY_REVISION_KEY, manager.PRIVACY_POLICY_REVISION);
        window.__MIXING_PLOTS = [];
        const render = window.renderPlot;
        window.renderPlot = function(payload, ...rest) {
          window.__MIXING_PLOTS.push(typeof payload === 'string' ? JSON.parse(payload) : payload);
          return render.call(this, payload, ...rest);
        };
      }, theme);
      const receipt = await page.evaluate(text => window.fileIO.importWorkbook(text, { format: 'srwb', mode: 'replace' }), source);
      console.log(`[run] ${theme}: imported ${workbook.notebook.cells.length} cells; Run All`);
      await page.evaluate(() => window.runAllCells());
      const cells = await page.evaluate(() => window._cells.map(cell => ({ name: cell.name,
        type: cell.type, output: cell.outputCard?.innerText || '' })));
      assert(!cells.some(cell => /Traceback|NameError|AssertionError|TypeError|Failed to load/.test(cell.output)), 'Workbook execution error');
      await page.waitForFunction(() => document.querySelectorAll('.js-plotly-plot').length === 6 &&
        Array.from(document.querySelectorAll('.js-plotly-plot')).every(plot => plot._fullLayout));
      const payloads = await page.evaluate(() => window.__MIXING_PLOTS);
      // Pyodide NumPy 2.0.2 vs offline NumPy 2.2.6; all numeric chart payloads
      // are exact because they are seeded integer counts / sample lengths.
      assert.deepEqual(payloads, runtime.plots, 'Browser plotted different sample data/configuration');
      const exported = await page.evaluate(async () => {
        let captured;
        const download = window.fileIO.downloadFile;
        window.fileIO.downloadFile = async (name, content) => { captured = content; };
        try { await window.fileIO._exportSrwb('current'); }
        finally { window.fileIO.downloadFile = download; }
        return JSON.parse(captured);
      });
      assert.deepEqual(exported.notebook.cells.map(({ name, type, language, code }) => ({ name, type, language, code })), workbook.notebook.cells);
      const rendering = await page.evaluate(() => Array.from(document.querySelectorAll('.js-plotly-plot')).map((plot, index) => {
        const box = plot.getBoundingClientRect();
        const labels = Array.from(plot.querySelectorAll('.gtitle,.xtitle,.ytitle,.legendtext,.cbtitle')).map(text => {
          const b = text.getBoundingClientRect();
          return { text: text.textContent, left: b.left - box.left, right: b.right - box.left,
            top: b.top - box.top, bottom: b.bottom - box.top };
        });
        const clipped = labels.filter(b => b.left < -1 || b.right > box.width + 1 || b.top < -1 || b.bottom > box.height + 1);
        const overlaps = [];
        for (let a = 0; a < labels.length; a++) for (let b = a + 1; b < labels.length; b++) {
          const x = labels[a], y = labels[b];
          if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 &&
              Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1) overlaps.push([x.text, y.text]);
        }
        return { index, width: box.width, height: box.height, clipped, overlaps, labels,
          title: plot.querySelector('.gtitle')?.textContent || '',
          types: plot._fullData.map(trace => trace.type),
          bars: plot.querySelectorAll('.barlayer .point path').length,
          background: plot._fullLayout.plot_bgcolor, fontColor: plot._fullLayout.font.color };
      }));
      for (const plot of rendering) {
        assert(plot.width > 150 && plot.width <= 320, 'Unexpected phone chart width');
        assert.deepEqual(plot.clipped, [], 'Chart label clipped: ' + JSON.stringify(plot.clipped));
        assert.deepEqual(plot.overlaps, [], 'Chart label overlap: ' + JSON.stringify(plot.overlaps));
        assert(plot.title.includes(String([100, 1000, 10000][plot.index % 3])), 'Snapshot title is missing');
        assert.equal(plot.fontColor, '#e6edf3');
        assert.equal(plot.bars, plot.index < 3 ? 24 : 504, 'Grid/histogram omitted or added cells');
      }
      const plots = page.locator('.js-plotly-plot');
      for (let index = 0; index < 6; index++) await plots.nth(index).screenshot({ path: path.join(evidence, `${theme}-plot-${index}.png`) });
      assert.deepEqual(errors, [], 'Browser errors'); assert.deepEqual(blocked, [], 'Workbook initiated external requests');
      runs.push({ theme, receipt, cells, plots: rendering, errors, externalRequests: blocked });
      console.log(`[PASS] ${theme}: 19 source-preserved cells, six exact-data plots, 320px, no external requests`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
writeFileSync(path.join(evidence, 'rendering.json'), JSON.stringify({ allPassed: true,
  scope: 'English real app execution and 320px dark/light chart checks; not native review or translation approval',
  candidateSha256: mixingSha(source), appCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot, encoding: 'utf8' }).trim(),
  appFiles: Object.fromEntries(['www/js/prelude.py', 'www/js/bridge.js', 'www/vendor/plotly/plotly-basic.min.js']
    .map(file => [file, mixingSha(readFileSync(path.join(appRoot, file)))])),
  viewport: { width: 320, height: 844 }, runs }, null, 2) + '\n', { flag: 'wx' });
