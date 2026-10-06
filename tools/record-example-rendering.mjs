#!/usr/bin/env node
// Record an explicit controller visual-review attestation. This tool verifies
// capture provenance; it does NOT judge pixels or certify native wording.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_LOCALES, EXAMPLE_DESCRIPTIONS } from './example-lessons.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
assert(args.includes('--visually-reviewed'), 'Requires an actual visual review before recording it');
const arg = name => {
  const i = args.indexOf('--' + name);
  assert(i >= 0 && args[i + 1] && !args[i + 1].startsWith('--'), 'Missing --' + name);
  return args[i + 1];
};
const locale = arg('locale'), lesson = arg('lesson');
assert(EXAMPLE_LOCALES.includes(locale) && Object.hasOwn(EXAMPLE_DESCRIPTIONS, lesson));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const receiptPath = path.join(root, 'reviews/examples', locale, lesson + '.json');
const receipt = JSON.parse(readFileSync(receiptPath));
assert.equal(receipt.browser.status, 'passed');
const sourcePath = `workbooks/${locale}/${lesson}.srwb`;
assert.equal(receipt.target.sha256, digest(readFileSync(path.join(root, sourcePath))));
const stem = sourcePath.replaceAll('/', '__').replace(/\.srwb$/, '');
const captures = [];
for (const [option, expected] of [['run-a', receipt.browser.first], ['run-b', receipt.browser.second]]) {
  const directory = path.resolve(root, arg(option));
  const reportBytes = readFileSync(path.join(directory, stem + '.json'));
  assert.equal(digest(reportBytes), expected.reportSha256, 'Review report changed');
  const report = JSON.parse(reportBytes);
  assert.equal(report.sourceSha256, receipt.target.sha256);
  assert.equal(report.plots.length, receipt.browser.plotData.count);
  assert(report.plots.length > 0, 'Use this attestation only for captured Plotly charts');
  const pngs = report.plots.map((_, index) => {
    const bytes = readFileSync(path.join(directory, stem + '.plot-' + index + '.png'));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Not a PNG');
    return { index, sha256: digest(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  });
  captures.push({ reportSha256: expected.reportSha256, pngs });
}
receipt.browser.renderedReview = 'controller-AI-reviewed';
receipt.browser.rendering = {
  status: 'passed',
  scope: 'Titles, axes, legends and glyphs visually checked in captured app renders; not native-language approval.',
  nativeSpeakerReview: 'pending', captures,
};
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(`[PASS] ${lesson}/${locale}: explicit visual-review attestation recorded against both capture hashes.`);
