#!/usr/bin/env node
// Rendering-only review: replay source-bound offline payloads through the
// real local app bridge.  No Python kernel, workbook import, or user profile.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const reviewRoot = path.join(repoRoot, 'reviews/spectral-mixing-english-20261013/iteration-5');
const options = {
  appRoot: process.env.SCIREPL_SPECTRAL_APP || null,
  origin: 'http://127.0.0.1:8123',
  runtime: path.join(reviewRoot, 'runtime.json'),
  evidence: path.join(reviewRoot, 'rendering'),
};
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  assert(['--app-root', '--origin', '--runtime', '--evidence'].includes(flag), `Unknown option ${flag}`);
  assert(index + 1 < process.argv.length, `Missing value for ${flag}`);
  const key = flag === '--app-root' ? 'appRoot' : flag.slice(2);
  options[key] = process.argv[++index];
}
assert(options.appRoot, 'Set --app-root or SCIREPL_SPECTRAL_APP to the checked local app');
options.appRoot = path.resolve(options.appRoot);
options.runtime = path.resolve(options.runtime);
options.evidence = path.resolve(options.evidence);
const origin = new URL(options.origin);
assert(['127.0.0.1', 'localhost'].includes(origin.hostname), 'Only a loopback review server is allowed');
assert(['http:', 'https:'].includes(origin.protocol), 'Use a local HTTP(S) origin');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function inside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
assert(inside(options.runtime, path.join(repoRoot, 'reviews/spectral-mixing-english-20261013')),
  'Runtime evidence must remain in this English review campaign');
assert(inside(options.evidence, path.join(path.dirname(options.runtime), 'rendering')),
  'Rendering evidence must remain under the selected iteration/rendering');
for (const target of [options.runtime, options.evidence]) {
  let current = target;
  while (inside(current, repoRoot)) {
    if (existsSync(current)) assert(!lstatSync(current).isSymbolicLink(), 'Symlink evidence path refused');
    if (current === repoRoot) break;
    current = path.dirname(current);
  }
}
assert(!existsSync(options.evidence), 'Refusing to reuse or overwrite rendering evidence');
const runtimeBytes = readFileSync(options.runtime);
const runtime = JSON.parse(runtimeBytes);
assert.equal(runtime.allPassed, true, 'A passing offline source-bound runtime record is required');
assert.equal(runtime.plots.length, 17, 'Expected all seventeen recorded plots');
const candidatePath = path.resolve(repoRoot, runtime.candidate);
assert(inside(candidatePath, path.join(repoRoot, 'drafts/markov-spectral-mixing/en')),
  'Unexpected source workbook path');
const candidateBytes = readFileSync(candidatePath);
assert.equal(sha256(candidateBytes), runtime.candidateSha256, 'Runtime belongs to a different source workbook');
const workbook = JSON.parse(candidateBytes);
assert.equal(workbook.notebook.cells.length, 27, 'Unexpected source cell inventory');
assert.deepEqual(runtime.cells.map(cell => cell.name), workbook.notebook.cells.map(cell => cell.name),
  'Runtime cell records do not match the bound workbook');
const { chromium } = createRequire(path.join(options.appRoot, 'package.json'))('playwright');
const appFiles = [
  'www/index.html', 'www/js/bridge.js', 'www/js/prelude.py',
  'www/vendor/plotly/plotly-basic.min.js', 'www/js/md_math.js', 'www/js/app.js',
  'www/vendor/marked/marked.min.js', 'www/vendor/katex/katex.min.js',
  'www/css/style.css', 'www/css/notebooks.css',
];
const screenshotIndices = new Set([3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const viewport = { width: 320, height: 844 };
mkdirSync(options.evidence, { recursive: true });
const report = {
  schema: 'spectral-mixing-rendering-v1',
  allPassed: false,
  scope: 'Rendering only: seventeen recorded NumPy payloads replayed through the real app bridge; Markdown through real MdMath/KaTeX. No Python execution, import/export, native review, translation approval, or publication.',
  candidate: runtime.candidate,
  candidateSha256: runtime.candidateSha256,
  runtime: path.relative(repoRoot, options.runtime),
  runtimeSha256: sha256(runtimeBytes),
  origin: origin.origin,
  nodeVersion: process.version,
  viewport,
  appFiles: {},
  runs: [],
  failures: [],
};

async function verifyServedApp() {
  for (const filename of appFiles) {
    const localBytes = readFileSync(path.join(options.appRoot, filename));
    const url = new URL(filename === 'www/index.html' ? '/' : filename.slice(4), origin.origin + '/');
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const servedBytes = Buffer.from(await response.arrayBuffer());
    const record = { url: url.href, status: response.status, localSha256: sha256(localBytes),
      servedSha256: sha256(servedBytes), servedBytes: servedBytes.length };
    report.appFiles[filename] = record;
    assert.equal(response.status, 200, `App did not serve ${filename}`);
    assert.equal(record.servedSha256, record.localSha256, `Served ${filename} differs from declared appRoot`);
  }
}

function inspectPlots() {
  const selections = [
    ['title', '.gtitle'], ['xaxis-title', '.xtitle'], ['yaxis-title', '.ytitle'],
    ['legend', '.legendtext'], ['colorbar-title', '.cbtitle'],
    ['xaxis-tick', '.xtick text'], ['yaxis-tick', '.ytick text'],
    ['colorbar-tick', '.cbaxis text'], ['annotation', '.annotation-text'],
  ];
  return Array.from(document.querySelectorAll('#repl .js-plotly-plot')).map((plot, index) => {
    const box = plot.getBoundingClientRect();
    const labels = [];
    for (const [kind, selector] of selections) {
      for (const element of plot.querySelectorAll(selector)) {
        const text = element.textContent.trim();
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        // Empty or hidden SVG containers are not evidence of label fitting.
        if (!text || bounds.width <= 0.2 || bounds.height <= 0.2 || style.visibility === 'hidden'
            || style.display === 'none' || Number(style.opacity) === 0) continue;
        labels.push({ kind, text, width: bounds.width, height: bounds.height,
          left: bounds.left - box.left, right: bounds.right - box.left,
          top: bounds.top - box.top, bottom: bounds.bottom - box.top });
      }
    }
    const clipped = labels.filter(label => label.left < -1 || label.top < -1
      || label.right > box.width + 1 || label.bottom > box.height + 1);
    const overlaps = [];
    for (let first = 0; first < labels.length; first++) {
      for (let second = first + 1; second < labels.length; second++) {
        const a = labels[first], b = labels[second];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
            && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
          overlaps.push({ first: { kind: a.kind, text: a.text }, second: { kind: b.kind, text: b.text } });
        }
      }
    }
    return { index, width: box.width, height: box.height,
      title: plot.querySelector('.gtitle')?.textContent || '', labels, clipped, overlaps,
      types: plot._fullData.map(trace => trace.type),
      barCount: plot.querySelectorAll('.barlayer .point path').length,
      background: plot._fullLayout.plot_bgcolor, fontColor: plot._fullLayout.font.color,
      plotArea: { width: plot._fullLayout._size.w, height: plot._fullLayout._size.h } };
  });
}

async function renderTheme(browser, theme) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'UTC' });
  const page = await context.newPage();
  const run = { theme, appReady: false, errors: [], externalRequestsBlocked: [],
    failedLocalResponses: [], plots: [], markdown: [], mathErrors: [], screenshots: [], failures: [] };
  report.runs.push(run);
  page.on('pageerror', error => run.errors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).origin === origin.origin && response.status() >= 400)
      run.failedLocalResponses.push({ status: response.status(), url: response.url() });
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin.origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    run.externalRequestsBlocked.push(url.href);
    return route.abort('blockedbyclient');
  });
  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket('**/*', socket => {
      run.externalRequestsBlocked.push('websocket:' + socket.url());
      socket.close();
    });
  }
  await page.addInitScript(() => {
    localStorage.setItem('scirepl_privacy_accepted', '1');
    localStorage.setItem('scirepl_onboarding_seen', '1');
    localStorage.setItem('scirepl_auto_download', '1');
    localStorage.setItem('scirepl_language', 'en');
    addEventListener('DOMContentLoaded', () => {
      localStorage.setItem('scirepl_whats_new_seen_version', window.KERNEL_CONFIG?.app?.version || '');
    }, { once: true });
  });
  try {
    await page.goto(origin.origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__SCIREPL_APP_READY === true
      && typeof window.renderPlot === 'function' && window.Plotly
      && window.MdMath && window.appearance && window._appInternals?.renderMarkdown,
    null, { timeout: 30000 });
    run.appReady = true;
    await page.evaluate(({ theme, plots, markdownCells, records }) => {
      window.appearance.setTheme(theme);
      const repl = document.querySelector('#repl');
      repl.replaceChildren();
      function card(label, markdown = false) {
        const container = document.createElement('section');
        container.className = 'card card-output' + (markdown ? ' card-markdown-output' : '');
        const heading = document.createElement('div');
        heading.className = 'card-label';
        heading.textContent = label;
        const body = document.createElement('div');
        body.className = 'card-body';
        container.append(heading, body);
        repl.appendChild(container);
        return container;
      }
      for (let index = 0; index < plots.length; index++) {
        const source = records.find(record => index >= record.plotStart && index < record.plotStart + record.plotCount);
        window._currentOutputCard = card(`${source.name} · recorded plot ${index}`);
        window.renderPlot(JSON.stringify(plots[index]));
      }
      window._currentOutputCard = null;
      window.__SPECTRAL_RENDER_MATH = markdownCells.map(cell => {
        const container = card(cell.name, true);
        container.dataset.reviewMarkdown = cell.name;
        const body = container.querySelector('.card-body');
        body.innerHTML = window._appInternals.renderMarkdown(cell.code);
        const segments = window.MdMath.mathSegments(cell.code);
        const errors = [];
        for (const segment of segments) {
          const tex = cell.code.slice(segment.bodyStart, segment.bodyEnd);
          try { window.katex.renderToString(tex, { throwOnError: true, displayMode: segment.display }); }
          catch (error) { errors.push({ tex, message: error.message }); }
        }
        const renderedErrors = Array.from(body.querySelectorAll('.katex-error')).map(node => ({
          tex: node.textContent, message: node.getAttribute('title') || 'KaTeX rendered an error',
        }));
        return { name: cell.name, segments: segments.length, rendered: body.querySelectorAll('.katex').length,
          errors: [...errors, ...renderedErrors] };
      });
    }, { theme, plots: runtime.plots, records: runtime.cells,
      markdownCells: workbook.notebook.cells.filter(cell => cell.type === 'markdown') });
    await page.waitForFunction(() => document.querySelectorAll('#repl .js-plotly-plot').length === 17
      && Array.from(document.querySelectorAll('#repl .js-plotly-plot')).every(plot => plot._fullLayout),
    null, { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    // App cards have a 250ms entrance animation; wait for actual final boxes.
    await page.waitForTimeout(350);
    run.plots = await page.evaluate(inspectPlots);
    run.markdown = await page.evaluate(() => window.__SPECTRAL_RENDER_MATH);
    run.mathErrors = run.markdown.flatMap(cell => cell.errors.map(error => ({ cell: cell.name, ...error })));
    const requireRun = (condition, message) => { if (!condition) run.failures.push(message); };
    requireRun(run.plots.length === 17, 'All seventeen plot DOMs must be rendered');
    for (const plot of run.plots) {
      const payload = runtime.plots[plot.index];
      requireRun(plot.width > 150 && plot.width <= 320, `Plot ${plot.index}: invalid mobile width ${plot.width}`);
      requireRun(plot.height > 200 && plot.height <= 470, `Plot ${plot.index}: invalid mobile height ${plot.height}`);
      requireRun(plot.labels.some(label => label.kind === 'title'), `Plot ${plot.index}: missing meaningful title box`);
      if (payload.xlabel) requireRun(plot.labels.some(label => label.kind === 'xaxis-title'), `Plot ${plot.index}: missing x-axis title`);
      if (payload.ylabel) requireRun(plot.labels.some(label => label.kind === 'yaxis-title'), `Plot ${plot.index}: missing y-axis title`);
      if (payload.traces.some(trace => trace.marker?.showscale))
        requireRun(plot.labels.some(label => label.kind === 'colorbar-title'), `Plot ${plot.index}: missing colorbar title`);
      if ((payload.layout.showlegend ?? (payload.traces.length > 1)))
        requireRun(plot.labels.some(label => label.kind === 'legend'), `Plot ${plot.index}: missing legend text`);
      requireRun(plot.clipped.length === 0, `Plot ${plot.index}: clipped labels ${JSON.stringify(plot.clipped)}`);
      requireRun(plot.overlaps.length === 0, `Plot ${plot.index}: overlapping labels ${JSON.stringify(plot.overlaps)}`);
      if ([4, 5, 10, 11].includes(plot.index)) requireRun(plot.barCount === 132, `Plot ${plot.index}: expected 132 legal heatmap tiles`);
    }
    requireRun(run.markdown.length === 13, 'All thirteen Markdown cells must be parsed through real MdMath');
    requireRun(run.markdown.reduce((sum, cell) => sum + cell.segments, 0) > 0, 'Math check must inspect actual formulas');
    for (const cell of run.markdown)
      requireRun(cell.rendered === cell.segments, `${cell.name}: rendered math count differs from actual MdMath segments`);
    requireRun(run.mathErrors.length === 0, 'Markdown contains KaTeX parse/render errors');
    requireRun(run.errors.length === 0, 'Browser page errors occurred');
    requireRun(run.externalRequestsBlocked.length === 0, 'App attempted nonlocal requests (all blocked)');
    requireRun(run.failedLocalResponses.length === 0, 'App had failed local asset responses');
    const plots = page.locator('#repl .js-plotly-plot');
    for (const index of screenshotIndices) {
      const filename = `${theme}-plot-${String(index).padStart(2, '0')}.png`;
      const target = path.join(options.evidence, filename);
      await plots.nth(index).screenshot({ path: target });
      const bytes = readFileSync(target);
      run.screenshots.push({ plot: index, path: path.relative(repoRoot, target), sha256: sha256(bytes), bytes: bytes.length });
    }
    console.log(`[${run.failures.length ? 'FAIL' : 'PASS'}] ${theme}: ${run.plots.length} plots, `
      + `${run.markdown.reduce((sum, cell) => sum + cell.segments, 0)} math segments, ${run.failures.length} rendering issues`);
  } catch (error) {
    run.failures.push(error.stack || error.message);
    console.error(`[FAIL] ${theme}: ${error.message}`);
  } finally {
    await context.close();
  }
}

let browser;
try {
  await verifyServedApp();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const theme of ['light', 'dark']) await renderTheme(browser, theme);
  assert.equal(sha256(readFileSync(candidatePath)), runtime.candidateSha256, 'Workbook changed during rendering review');
  assert.equal(sha256(readFileSync(options.runtime)), report.runtimeSha256, 'Runtime evidence changed during rendering review');
  for (const [filename, record] of Object.entries(report.appFiles))
    assert.equal(sha256(readFileSync(path.join(options.appRoot, filename))), record.localSha256,
      `App source ${filename} changed during rendering review`);
} catch (error) {
  report.failures.push(error.stack || error.message);
} finally {
  if (browser) await browser.close();
}
report.allPassed = report.failures.length === 0 && report.runs.length === 2
  && report.runs.every(run => run.appReady && run.failures.length === 0);
writeFileSync(path.join(options.evidence, 'rendering.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(`${report.allPassed ? 'PASS' : 'FAIL'} rendering-only evidence: ${path.relative(repoRoot, options.evidence)}`);
if (!report.allPassed) {
  for (const failure of [...report.failures, ...report.runs.flatMap(run => run.failures)]) console.error(failure);
  process.exitCode = 1;
}
