#!/usr/bin/env node
// Offline reproducibility gate for the compact review receipts. It reads
// workbook data but never executes it. Browser runs are a separate gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_LOCALES, EXAMPLE_DESCRIPTIONS } from './example-lessons.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), i = args.indexOf('--locale');
const locales = i < 0 ? EXAMPLE_LOCALES : [args[i + 1]];
for (const locale of locales) assert(EXAMPLE_LOCALES.includes(locale));
const read = rel => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
const sha = rel => createHash('sha256').update(readFileSync(path.join(root, rel))).digest('hex');
function keeps(text) {
  const fences = [...text.matchAll(/```[^\n]*\n[\s\S]*?```/g)].map(m => m[0]);
  const prose = text.replace(/```[^\n]*\n[\s\S]*?```/g, '');
  return { fences, inline: [...prose.matchAll(/`([^`\n]+)`/g)].map(m => m[1]).sort(),
    math: [...prose.matchAll(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g)].map(m => m[0]),
    urls: [...prose.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]).sort(),
    numbers: [...text.matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]).sort() };
}
const run = (tool, argv) => execFileSync(process.execPath, [path.join(root, 'tools', tool), ...argv],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
let count = 0;
for (const lesson of Object.keys(EXAMPLE_DESCRIPTIONS)) for (const locale of locales) {
  const review = read(`reviews/examples/${locale}/${lesson}.json`);
  const sourcePath = `workbooks/en/${lesson}.srwb`, targetPath = `workbooks/${locale}/${lesson}.srwb`;
  assert.equal(review.schema, 1); assert.equal(review.locale, locale); assert.equal(review.lesson, lesson);
  assert.deepEqual(review.source, { path: sourcePath, sha256: sha(sourcePath) });
  assert.equal(review.target.path, targetPath); assert.equal(review.target.sha256, sha(targetPath));
  assert.equal(review.target.size, readFileSync(path.join(root, targetPath)).length);
  const en = read(sourcePath), xx = read(targetPath);
  assert.equal(review.target.title, xx.notebook.name); assert(review.target.description.trim());
  assert.deepEqual(Object.keys(xx).sort(), ['format', 'notebook', 'version']);
  assert.equal(xx.format, 'srwb'); assert.equal(xx.version, '1.0');
  assert.deepEqual(Object.keys(xx.notebook).sort(), ['cells', 'name']);
  assert.equal(xx.notebook.cells.length, en.notebook.cells.length);
  const names = new Set();
  for (let index = 0; index < en.notebook.cells.length; index++) {
    const a = en.notebook.cells[index], b = xx.notebook.cells[index];
    assert.deepEqual(Object.keys(b).sort(), ['code', 'language', 'name', 'type']);
    assert(!names.has(b.name)); names.add(b.name);
    for (const key of ['name', 'type', 'language']) assert.equal(a[key], b[key]);
    assert(!b.code.includes('\uFFFD'));
    if (a.type === 'markdown') assert.deepEqual(keeps(a.code), keeps(b.code));
  }
  if (locale !== 'en') {
    assert.equal(review.translation.nativeSpeakerReview, 'pending');
    assert.equal(review.translation.contentAudit.status, 'passed');
    assert.equal(review.translation.contentAudit.sourceSha256, review.source.sha256);
    assert.equal(review.translation.contentAudit.targetSha256, review.target.sha256);
    const manifest = JSON.parse(run('span-derive.mjs', [sourcePath, targetPath, locale]));
    assert.deepEqual(manifest, review.translation.manifest, 'Authoritative span manifest changed');
    const sourceCandidates = JSON.parse(run('span-apply.mjs', ['candidates', sourcePath])).candidates;
    const targetCandidates = new Map(JSON.parse(run('span-apply.mjs', ['candidates', targetPath])).candidates.map(c => [c.id, c]));
    const kept = new Set(review.translation.keeps.ids);
    assert.equal(kept.size, review.translation.keeps.ids.length);
    for (const id of review.translation.policy.protectedIds) assert(kept.has(id));
    for (const candidate of sourceCandidates.filter(c => kept.has(c.id))) {
      assert.equal(targetCandidates.get(candidate.id)?.text, candidate.text, 'Protected/kept candidate changed');
    }
    const lint = [sourcePath, '--lint', targetPath, '--strict'];
    for (const text of review.translation.keeps.texts) lint.push('--allow', text);
    run('span-scan.mjs', lint);
  } else assert.equal(review.translation, null);
  assert.equal(review.browser.status, 'passed'); assert.equal(review.browser.deterministic, true);
  for (const record of [review.browser.first, review.browser.second, ...review.browser.englishBaseline]) {
    assert.match(record.exportSha256, /^[a-f0-9]{64}$/); assert.match(record.reportSha256, /^[a-f0-9]{64}$/);
    assert.equal(record.cells, en.notebook.cells.length); assert.equal(record.blockedRequests, 0); assert.equal(record.pageErrors, 0);
  }
  assert(review.browser.textOracle.first.pass && review.browser.textOracle.second.pass);
  assert.equal(review.browser.plotData.status, 'passed');
  count++; console.log(`[PASS] ${lesson}/${locale}: hashes, names, Markdown invariants, code spans and review receipts`);
}
console.log(`${count} reviewed example editions verified without workbook execution.`);
