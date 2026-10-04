#!/usr/bin/env node
// Reduce controller evidence to a public, prompt-free review receipt.
// --locale es --lesson simpsons-paradox --evidence reviews/translation-pilot2
// --run-a /tmp/xx-first --run-b /tmp/xx-repeat
// --en-a /tmp/en-first --en-b /tmp/en-repeat
// This is an audit record, not a substitute for retaining or reviewing runs.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envelope, judge } from './output-oracle.mjs';
import { plotData, categoryLabels } from './example-plot-data.mjs';
import { EXAMPLE_LOCALES, EXAMPLE_DESCRIPTIONS, GENERATED_TARGETS } from './example-lessons.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf('--' + name); assert(i >= 0 && args[i + 1], 'Missing --' + name); return args[i + 1]; };
const locale = arg('locale'), lesson = arg('lesson');
assert(EXAMPLE_LOCALES.includes(locale)); assert(Object.hasOwn(EXAMPLE_DESCRIPTIONS, lesson));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const sourcePath = `workbooks/en/${lesson}.srwb`, targetPath = `workbooks/${locale}/${lesson}.srwb`;
const sourceBytes = readFileSync(path.join(root, sourcePath)), targetBytes = readFileSync(path.join(root, targetPath));
const source = JSON.parse(sourceBytes), target = JSON.parse(targetBytes);
let translation = null, manifest = { spans: [] }, description = EXAMPLE_DESCRIPTIONS[lesson];
if (locale !== 'en') {
  const base = path.resolve(root, arg('evidence'), locale, lesson);
  const status = json(path.join(base, 'status.json')), metadata = json(path.join(base, 'metadata.json'));
  assert.equal(status.status, 'static-gates-passed');
  assert.equal(status.sourceSha256, sha(sourceBytes)); assert.equal(status.targetSha256, sha(targetBytes));
  assert.equal(metadata.title, target.notebook.name); assert.equal(metadata.locale, locale);
  manifest = json(path.join(base, 'span-manifest.derived.json'));
  manifest.source.path = sourcePath; manifest.target.path = targetPath;
  assert.equal(manifest.source.sha256, sha(sourceBytes)); assert.equal(manifest.target.sha256, sha(targetBytes));
  const contentAudit = json(path.join(base, 'content-audit.json'));
  assert.equal(contentAudit.status, 'passed', 'Known untranslated prose must be resolved before publication');
  assert.equal(contentAudit.sourceSha256, sha(sourceBytes)); assert.equal(contentAudit.targetSha256, sha(targetBytes));
  translation = { model: status.model, contentAudit, policy: json(path.join(base, 'policy.json')),
    keeps: json(path.join(base, 'code.keeps.json')), manifest,
    nativeSpeakerReview: 'pending' };
  description = metadata.description;
}

function run(dir, lang, book) {
  const stem = `workbooks__${lang}__${lesson}`;
  const reportBytes = readFileSync(path.resolve(dir, stem + '.json'));
  const exportBytes = readFileSync(path.resolve(dir, stem + '.srwb'));
  const report = JSON.parse(reportBytes), exported = JSON.parse(exportBytes);
  assert.equal(report.file, `workbooks/${lang}/${lesson}.srwb`);
  assert.equal(report.sourceSha256, sha(readFileSync(path.join(root, report.file))), 'Browser receipt belongs to a different source revision');
  assert.deepEqual(report.errors, []); assert(report.network.every(request => request.allowed));
  assert.equal(report.cells.length, book.notebook.cells.length);
  assert.equal(exported.notebook.cells.length, book.notebook.cells.length);
  for (let i = 0; i < book.notebook.cells.length; i++) {
    const original = book.notebook.cells[i], actual = exported.notebook.cells[i], execution = report.cells[i];
    assert.equal(execution.name, original.name); assert(!execution.error);
    assert(!execution.skipped || execution.skipped === 'markdown');
    for (const key of ['name', 'type', 'language']) assert.equal(actual[key], original[key]);
    if (GENERATED_TARGETS[lesson]?.includes(original.name)) assert(actual.code.trim(), 'Empty generated target');
    else assert.equal(actual.code, original.code, 'Run does not match reviewed workbook source');
  }
  return { report, exported, receipt: { exportSha256: sha(exportBytes), reportSha256: sha(reportBytes), appVersion: report.version,
    cells: report.cells.length, blockedRequests: 0, pageErrors: 0 } };
}

// Plot values/axis configuration are compared exactly, independently of
// translated presentation text. A separate human rendering check is still
// needed for clipping, glyphs and bidirectional layout.
const enA = run(arg('en-a'), 'en', source), enB = run(arg('en-b'), 'en', source);
const a = run(arg('run-a'), locale, target), b = run(arg('run-b'), locale, target);
assert.deepEqual(envelope(enA.exported, enB.exported), { stable: true, exclusions: [] });
assert.deepEqual(envelope(a.exported, b.exported), { stable: true, exclusions: [] });
const first = judge(enA.exported, a.exported, manifest), second = judge(enB.exported, b.exported, manifest);
assert(first.pass, first.failures.join('\n')); assert(second.pass, second.failures.join('\n'));
// Older reports did not collect plots. Refuse claiming plot-data verification
// for lessons that have chart cells unless all four captures are present.
const hasPlots = ['patients-to-evidence', 'cooling-plume-capture'].includes(lesson);
if (hasPlots) for (const record of [enA, enB, a, b]) assert(record.report.plots?.length, 'Re-run with plot capture enabled');
const rasterChart = ['simpsons-paradox', 'breakfast-democracy'].includes(lesson);
if (rasterChart) for (const record of [enA, enB, a, b]) assert(record.report.images?.length, 'Re-run with R image decode check enabled');
const categories = categoryLabels(lesson, manifest);
assert.deepEqual((a.report.plots || []).map(plot => plotData(plot, categories)), (enA.report.plots || []).map(plot => plotData(plot)), 'Translated plot data/config changed');
assert.deepEqual((b.report.plots || []).map(plot => plotData(plot, categories)), (enB.report.plots || []).map(plot => plotData(plot)), 'Repeated plot data/config changed');
const publicReceipt = { schema: 1, lesson, locale, source: { path: sourcePath, sha256: sha(sourceBytes) },
  target: { path: targetPath, sha256: sha(targetBytes), size: targetBytes.length, title: target.notebook.name, description },
  translation, browser: { status: 'passed', first: a.receipt, second: b.receipt,
    englishBaseline: [enA.receipt, enB.receipt], deterministic: true, textOracle: { first, second },
    plotData: { status: 'passed', count: (a.report.plots || []).length },
    rasterCharts: rasterChart ? { decoded: true, count: a.report.images.length,
      caveat: 'R raster rendering checked separately; numerical checks use unchanged executable tokens and the lesson’s independent count/vote checks.' } : null,
    renderedReview: hasPlots || rasterChart ? 'separate-controller-review-required' : 'not-applicable' },
  caveat: locale === 'en' ? 'Reviewed educational examples; stated limitations still apply.'
    : 'Machine translated and independently re-reviewed by the same Gemini model. Native-speaker review is pending; structural and numerical checks do not certify prose quality.' };
const output = path.join(root, 'reviews/examples', locale); mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, lesson + '.json'), JSON.stringify(publicReceipt, null, 2) + '\n');
console.log(`[PASS] ${lesson}/${locale}: two browser runs, text oracle and plot data; public receipt recorded.`);
