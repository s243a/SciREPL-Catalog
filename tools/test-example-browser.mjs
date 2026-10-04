#!/usr/bin/env node
// Run reviewed catalogue examples through the real app in disposable browser
// profiles. Never attaches to an existing browser or imports into user data.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const dependencyRoot = process.env.SCIREPL_TEST_PACKAGE;
if (!dependencyRoot) throw new Error('Set SCIREPL_TEST_PACKAGE to an app package.json with Playwright installed.');
const { chromium } = createRequire(path.resolve(dependencyRoot))('playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const origin = process.env.SCIREPL_TEST_ORIGIN || 'http://localhost:8110';
const evidence = process.env.SCIREPL_TEST_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
const files = process.argv.slice(2);
const scenario = process.env.SCIREPL_TEST_SCENARIO || '';
if (scenario && !['seed-2024', 'half-sample', 'zero-events'].includes(scenario)) throw new Error('Unknown scenario');
// These two lessons explicitly generate code in a later named cell through
// nb_write. All other sources and every addressing name must survive exactly.
const generatedTargets = {
 'cooling-plume-capture.srwb': new Set(['classification']),
 'breakfast-democracy.srwb': new Set(['pairwise_model']),
};
if (!files.length) throw new Error('Supply reviewed workbook paths, relative to the repository.');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let failed = 0;
try {
 for (const file of files) {
  let source = readFileSync(path.resolve(root, file), 'utf8');
  const workbook = JSON.parse(source);
  if (scenario) {
   if (file !== 'workbooks/en/patients-to-evidence.srwb') throw new Error('Scenarios apply only to the English Patients lesson');
   const cell = workbook.notebook.cells.find(c => c.name === 'one-trial-simulation');
   if (scenario === 'seed-2024') cell.code = cell.code.replace('SEED = 42', 'SEED = 2024');
   if (scenario === 'half-sample') cell.code = cell.code.replace('N = 500', 'N = 250');
   // Keep generating probabilities valid for the later fixed-RR lesson.
   // This scenario probes the zero-observed-events/SE branch, not 0/0 RR.
   if (scenario === 'zero-events') cell.code = cell.code
    .replace('ev_c = int(rng.binomial(N, P_C))', 'ev_c = 0')
    .replace('ev_t = int(rng.binomial(N, P_T))', 'ev_t = 0');
   source = JSON.stringify(workbook);
  }
  if (workbook.format !== 'srwb' || !Array.isArray(workbook.notebook?.cells)) throw new Error('Not a workbook: ' + file);
  if (workbook.notebook.cells.some(c => c.language === 'ai' || c.aiPrompt)) throw new Error('AI execution is not allowed in this bench.');
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'UTC' });
  const page = await context.newPage();
  const errors = [], network = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
   const request = route.request(), url = new URL(request.url());
   if (url.origin === new URL(origin).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
   // Reviewed examples need only public runtime/package downloads and the
   // commit-pinned PrefLib dataset. No provider or arbitrary endpoint allowed.
   const publicRuntime = ['cdn.jsdelivr.net', 'unpkg.com', 'webr.r-wasm.org', 'repo.r-wasm.org', 'pypi.org', 'files.pythonhosted.org'].includes(url.hostname);
   const dataset = url.hostname === 'raw.githubusercontent.com' && /^\/PrefLib\/PrefLib-Data\/6e2e9dcef5ee624383e3e2031f741728dd64d032\//.test(url.pathname);
   network.push({ url: request.url(), method: request.method(), allowed: (publicRuntime || dataset) && request.method() === 'GET' });
   if ((publicRuntime || dataset) && request.method() === 'GET') return route.continue();
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
   await page.waitForFunction(() => window.__SCIREPL_APP_READY === true && window.fileIO && window._appInternals?.reRunCell, null, { timeout: 60000 });
   // User authorized these public dependency downloads. Accept the current
   // revision in this disposable profile only, not in any live installation.
   await page.evaluate(() => {
    const manager = window.kernelManager.constructor;
    localStorage.setItem(manager.PRIVACY_POLICY_REVISION_KEY, manager.PRIVACY_POLICY_REVISION);
    window.__EXAMPLE_PLOTS = [];
    const render = window.renderPlot;
    if (typeof render === 'function') window.renderPlot = function(payload, ...rest) {
     window.__EXAMPLE_PLOTS.push(typeof payload === 'string' ? JSON.parse(payload) : payload);
     return render.call(this, payload, ...rest);
    };
   });
   const receipt = await page.evaluate(text => window.fileIO.importWorkbook(text, { format: 'srwb', mode: 'replace' }), source);
   const cells = [];
   for (let i = 0; i < workbook.notebook.cells.length; i++) {
    console.log('[run]', file, i + 1, workbook.notebook.cells[i].name, await page.evaluate(index => { const c = window._cells[index]; return { id: c.id, type: c.type, language: c.language, name: c.name }; }, i));
    const result = await Promise.race([
     page.evaluate(async index => { const c = window._cells[index]; return await window._appInternals.reRunCell(c.id, c.code); }, i),
     new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Cell timeout (180s)')), 180000); timer.unref(); }),
    ]);
    cells.push({ index: i + 1, name: workbook.notebook.cells[i].name, ...result });
    if (result?.error || (result?.skipped && result.skipped !== 'markdown')) throw new Error(JSON.stringify(cells.at(-1)));
   }
   const exported = await page.evaluate(() => window.fileIO.serializeWorkbook({ format: 'srwb', scope: 'current', kernel: 'auto' }));
   const after = typeof exported.content === 'string' ? JSON.parse(exported.content) : null;
   if (!after || after.notebook.cells.length !== workbook.notebook.cells.length) throw new Error('Export round-trip lost cells');
   for (let i = 0; i < after.notebook.cells.length; i++) {
    const original = workbook.notebook.cells[i], actual = after.notebook.cells[i];
    const generated = generatedTargets[path.basename(file)]?.has(original.name);
    if (actual.name !== original.name || actual.type !== original.type || actual.language !== original.language || (!generated && actual.code !== original.code)) throw new Error('Export round-trip changed source/name at ' + i);
    if (generated && !actual.code) throw new Error('Generated target is empty at ' + i);
   }
   if (path.basename(file) === 'patients-to-evidence.srwb') {
    await page.evaluate(() => window.kernelManager.getKernel('python').getPyodide().runPython(`
assert ci[0] <= ci[1]
assert 0 <= ev_c <= N and 0 <= ev_t <= N
if se > 0:
    assert includes_zero == (ci[0] <= 0 <= ci[1])
    assert above_mcid == (ci[0] > MCID)
    assert 0 < p_two <= 1
`));
    const { PATIENTS_PLOT_INVARIANTS } = await import('./test-example-risk.mjs');
    const payloads = await page.evaluate(() => window.__EXAMPLE_PLOTS);
    await page.evaluate(({ payloads, checks }) => {
     const py = window.kernelManager.getKernel('python').getPyodide();
     py.runPython('import json as _risk_test_json\n_risk_plot_payloads = _risk_test_json.loads(' + JSON.stringify(JSON.stringify(payloads)) + ')\n' + checks);
    }, { payloads, checks: PATIENTS_PLOT_INVARIANTS });
   }
   if (errors.length || network.some(n => !n.allowed)) throw new Error('Page/network failures: ' + JSON.stringify({ errors, network: network.filter(n => !n.allowed) }));
   if (evidence) {
    const stem = file.replaceAll('/', '__').replace(/\.srwb$/, '') + (scenario ? '__' + scenario : '');
    const plots = await page.evaluate(() => window.__EXAMPLE_PLOTS);
    const images = await page.evaluate(async () => {
     const records = [];
     for (const image of document.querySelectorAll('.card-output img')) {
      if (!image.complete) await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Output image failed to decode');
      records.push({ width: image.naturalWidth, height: image.naturalHeight });
     }
     return records;
    });
    writeFileSync(path.join(evidence, stem + '.json'), JSON.stringify({ file,
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      version: await page.evaluate(() => window.KERNEL_CONFIG.app.version), receipt, cells, plots, images, network, errors }, null, 2) + '\n');
    writeFileSync(path.join(evidence, stem + '.srwb'), exported.content);
    if (process.env.SCIREPL_TEST_SCREENSHOTS === '1') {
     await page.setViewportSize({ width: 1100, height: 900 });
     const plots = page.locator('.js-plotly-plot');
     for (let i = 0; i < await plots.count(); i++) {
      await plots.nth(i).screenshot({ path: path.join(evidence, stem + '.plot-' + i + '.png') });
     }
     const images = page.locator('.card-output img');
     for (let i = 0; i < await images.count(); i++) await images.nth(i).screenshot({ path: path.join(evidence, stem + '.image-' + i + '.png') });
    }
   }
   console.log('[PASS]', file, cells.length, 'cells; names exact, only declared generated targets may change');
  } catch (error) { failed++; console.error('[FAIL]', file, error.message); }
  finally { await context.close(); }
 }
} finally { await browser.close(); }
if (failed) process.exitCode = 1;
