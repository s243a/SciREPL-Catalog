#!/usr/bin/env node
// Real-app run of the English resistor-analogy draft: import -> Run All -> checks -> export,
// in disposable 320px dark/light profiles with every external request blocked.
//
//   SCIREPL_RESISTOR_APP=<SciREPL checkout with Playwright and bundled runtimes>
//   SCIREPL_RESISTOR_ORIGIN=http://127.0.0.1:8110   (that checkout, served on loopback)
//   SCIREPL_RESISTOR_EVIDENCE=<new directory>       (optional: JSON + screenshots)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert(process.env.SCIREPL_RESISTOR_APP, 'Set SCIREPL_RESISTOR_APP to the local SciREPL checkout to test');
const appRoot = path.resolve(process.env.SCIREPL_RESISTOR_APP);
const origin = process.env.SCIREPL_RESISTOR_ORIGIN || 'http://127.0.0.1:8110';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Use a loopback server');
const { chromium } = createRequire(path.join(appRoot, 'package.json'))('playwright');
const source = readFileSync(path.join(repo, 'drafts/resistor-analogy/en/resistor-analogy.srwb'), 'utf8');
const workbook = JSON.parse(source);
const checksSource = readFileSync(path.join(repo, 'tools/resistor_analogy_checks.py'), 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');
const evidence = process.env.SCIREPL_RESISTOR_EVIDENCE && path.resolve(process.env.SCIREPL_RESISTOR_EVIDENCE);
if (evidence) {
  assert(!existsSync(path.join(evidence, 'rendering.json')), 'Never overwrite recorded evidence');
  mkdirSync(evidence, { recursive: true });
}
const PLOTS = 6;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const runs = [];
try {
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, serviceWorkers: 'block',
      locale: 'en-US', timezoneId: 'UTC' });
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
      addEventListener('DOMContentLoaded', () => localStorage.setItem('scirepl_whats_new_seen_version',
        window.KERNEL_CONFIG?.app?.version || ''), { once: true });
    });
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => window.__SCIREPL_APP_READY && window.fileIO && typeof window.runAllCells === 'function',
        null, { timeout: 60000 });
      await page.evaluate(theme => {
        window.appearance.setTheme(theme);
        const manager = window.kernelManager.constructor;
        localStorage.setItem(manager.PRIVACY_POLICY_REVISION_KEY, manager.PRIVACY_POLICY_REVISION);
        window.__RESISTOR_PLOTS = [];
        const render = window.renderPlot;
        window.renderPlot = function(payload, ...rest) {
          window.__RESISTOR_PLOTS.push(typeof payload === 'string' ? JSON.parse(payload) : payload);
          return render.call(this, payload, ...rest);
        };
      }, theme);
      const receipt = await page.evaluate(text => window.fileIO.importWorkbook(text, { format: 'srwb', mode: 'replace' }), source);
      console.log(`[run] ${theme}: imported ${workbook.notebook.cells.length} cells; Run All`);
      const started = Date.now();
      await page.evaluate(() => window.runAllCells());
      const seconds = (Date.now() - started) / 1000;
      const cells = await page.evaluate(() => window._cells.map(cell => ({ name: cell.name, type: cell.type,
        output: cell.outputCard?.innerText || '' })));
      for (const cell of cells) {
        assert(!/Traceback|Error:|FAIL|DISAGREES|\bnan\b/.test(cell.output), `Execution problem in ${cell.name}: ${cell.output.slice(0, 400)}`);
      }
      assert(cells.find(c => c.name === 'validation_summary').output.includes('17 deterministic checks passed.'));
      await page.waitForFunction(n => document.querySelectorAll('.js-plotly-plot').length === n &&
        Array.from(document.querySelectorAll('.js-plotly-plot')).every(plot => plot._fullLayout), PLOTS);

      // Markdown: KaTeX rendered without errors, no raw display delimiters, the diagram present.
      const markdown = await page.evaluate(() => ({
        katex: document.querySelectorAll('.katex').length,
        katexErrors: document.querySelectorAll('.katex-error').length,
        rawDisplayMath: Array.from(document.querySelectorAll('.card-output, .markdown-output, .card'))
          .some(el => el.innerText.includes('$$')),
        svgs: document.querySelectorAll('svg[aria-label="Series and parallel resistor analogy"]').length,
        // Anything in a Markdown card wider than the card would need sideways scrolling on a phone.
        overflow: Array.from(document.querySelectorAll('.card-output')).flatMap(card => {
          const width = card.getBoundingClientRect().width;
          return Array.from(card.querySelectorAll('.katex-display, table, svg[role=img]'))
            .filter(el => Math.max(el.scrollWidth, el.getBoundingClientRect().width) > width + 1)
            .map(el => el.textContent.replace(/\s+/g, ' ').slice(0, 80));
        }),
        details: Array.from(document.querySelectorAll('details > summary'))
          .filter(summary => /^[1-5]\. /.test(summary.textContent)).length,
      }));
      assert(markdown.katex >= 20, 'Expected rendered formulas: ' + JSON.stringify(markdown));
      assert.equal(markdown.katexErrors, 0, 'KaTeX errors');
      assert.equal(markdown.rawDisplayMath, false, 'Unrendered $$ math');
      assert.deepEqual(markdown.overflow, [], 'Too wide for a 320px screen');
      assert.equal(markdown.svgs, 1, 'Resistor diagram missing');
      assert.equal(markdown.details, 5, 'Check-your-understanding answers missing');

      // The same independent checks as the offline test, inside the app's Python.
      const payloads = await page.evaluate(() => window.__RESISTOR_PLOTS);
      const checks = await page.evaluate(({ checksSource, payloads }) => {
        const py = window.kernelManager.getKernel('python').getPyodide();
        return py.runPython(`
import json as _ra_json
_ra_module = {}
exec(${JSON.stringify(checksSource)}, _ra_module)
_ra_module["validate"](globals(), _ra_json.loads(${JSON.stringify(JSON.stringify(payloads))}))
`);
      }, { checksSource, payloads });
      assert(checks > 150, 'Independent checks did not run');

      const exported = await page.evaluate(async () => {
        let captured;
        const download = window.fileIO.downloadFile;
        window.fileIO.downloadFile = async (name, content) => { captured = content; };
        try { await window.fileIO._exportSrwb('current'); } finally { window.fileIO.downloadFile = download; }
        return JSON.parse(captured);
      });
      assert.deepEqual(exported.notebook.cells.map(({ name, type, language, code }) => ({ name, type, language, code })),
        workbook.notebook.cells, 'Export changed the cells');

      const rendering = await page.evaluate(() => Array.from(document.querySelectorAll('.js-plotly-plot')).map((plot, index) => {
        const box = plot.getBoundingClientRect();
        const labels = Array.from(plot.querySelectorAll('.gtitle,.xtitle,.ytitle,.legendtext')).map(text => {
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
        return { index, width: box.width, height: box.height, clipped, overlaps,
          title: plot.querySelector('.gtitle')?.textContent || '', traces: plot._fullData.length,
          fontColor: plot._fullLayout.font.color, paper: plot._fullLayout.paper_bgcolor };
      }));
      for (const plot of rendering) {
        assert(plot.width > 150 && plot.width <= 320, 'Unexpected phone chart width');
        assert.equal(plot.paper, '#1c2128', 'Light chart text needs the dark panel in both themes');
      }
      // Report every chart's label problems at once, then fail.
      const labelProblems = rendering.filter(plot => plot.clipped.length || plot.overlaps.length)
        .map(plot => ({ chart: plot.index, clipped: plot.clipped.map(label => label.text), overlaps: plot.overlaps }));
      assert.deepEqual(labelProblems, [], 'Chart labels clipped or overlapping at 320px');
      if (evidence) {
        const plots = page.locator('.js-plotly-plot');
        for (let index = 0; index < PLOTS; index++) {
          await plots.nth(index).screenshot({ path: path.join(evidence, `${theme}-plot-${index}.png`) });
        }
        // Markdown cards with formulas, the diagram, tables or answers, one image each.
        const prose = page.locator('.card-output').filter({ has: page.locator('.katex, svg[role=img], table, details') });
        const count = await prose.count();
        for (let index = 0; index < count; index++) {
          await prose.nth(index).screenshot({ path: path.join(evidence, `${theme}-markdown-${index}.png`) });
        }
      }
      assert.deepEqual(errors, [], 'Browser errors');
      assert.deepEqual(blocked, [], 'Workbook initiated external requests');
      runs.push({ theme, receipt, seconds, markdown, independentChecks: checks, plots: rendering, errors,
        externalRequests: blocked });
      console.log(`[PASS] ${theme}: ${cells.length} cells in ${seconds.toFixed(1)} s, ${checks} independent checks, `
        + `${markdown.katex} formulas, ${PLOTS} plots at 320px, export unchanged, no external requests`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
if (evidence) {
  writeFileSync(path.join(evidence, 'rendering.json'), JSON.stringify({ allPassed: true,
    scope: 'English draft: real-app Run All, independent checks in Pyodide, 320px dark/light rendering; not a translation or native review',
    candidateSha256: sha(source),
    appCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot, encoding: 'utf8' }).trim(),
    appFiles: Object.fromEntries(['www/js/prelude.py', 'www/js/bridge.js', 'www/vendor/plotly/plotly-basic.min.js']
      .map(file => [file, sha(readFileSync(path.join(appRoot, file)))])),
    viewport: { width: 320, height: 844 }, runs }, null, 2) + '\n', { flag: 'wx' });
}
