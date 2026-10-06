#!/usr/bin/env node
/** Register only the controller-owned reviewed inventory, preserving every unrelated item.
 * node tools/register-example-workbooks.mjs [--check] [--locale en]
 * Default: require all 13 locales. Translation metadata comes from the
 * controller's gated receipts, not inferred from file names or AI claims.
 * Run build-index.mjs afterwards for the repository-wide revision check.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EXAMPLE_LOCALES, EXAMPLE_DESCRIPTIONS } from './example-lessons.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const indexPath = path.join(root, 'scirepl-catalog.json');
const locales = EXAMPLE_LOCALES;
const args = process.argv.slice(2), check = args.includes('--check');
const localeAt = args.indexOf('--locale');
const selected = localeAt >= 0 ? [args[localeAt + 1]] : locales;
for (const locale of selected) assert(locales.includes(locale), 'Unsupported locale: ' + locale);
const seeds = EXAMPLE_DESCRIPTIONS;
const load = rel => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const index = load('scirepl-catalog.json');
assert.equal(index.format_version, '2.0');
const original = structuredClone(index);
for (const [lesson, englishDescription] of Object.entries(seeds)) {
  const source = readFileSync(path.join(root, 'workbooks/en', lesson + '.srwb'));
  for (const locale of selected) {
    const rel = `workbooks/${locale}/${lesson}.srwb`;
    const bytes = readFileSync(path.join(root, rel)), book = JSON.parse(bytes);
    assert.equal(book.format, 'srwb');
    assert.equal(book.version, '1.0');
    assert.deepEqual(Object.keys(book.notebook).sort(), ['cells', 'name']);
    const names = new Set();
    for (const cell of book.notebook.cells) {
      assert.deepEqual(Object.keys(cell).sort(), ['code', 'language', 'name', 'type']);
      assert(['code', 'markdown'].includes(cell.type));
      assert(!names.has(cell.name), 'Duplicate cell name in ' + rel); names.add(cell.name);
    }
    const receipt = load(`reviews/examples/${locale}/${lesson}.json`);
    assert.equal(receipt.source.sha256, sha(source), 'English source changed since review');
    assert.equal(receipt.target.sha256, sha(bytes), 'Artifact changed since review');
    assert.equal(receipt.target.title, book.notebook.name);
    assert.equal(receipt.locale, locale); assert.equal(receipt.lesson, lesson);
    assert.equal(receipt.browser.status, 'passed');
    const description = locale === 'en' ? englishDescription : receipt.target.description;
    const item = { id: lesson + '-' + locale, name: book.notebook.name, description,
      type: 'workbook', kernels: [...new Set(book.notebook.cells.filter(c => c.type === 'code').map(c => c.language))],
      locales: [locale], format: 'srwb', path: rel, revision: 1, sha256: sha(bytes), size: bytes.length };
    const previous = index.items.find(i => i.id === item.id);
    if (previous) {
      // Never overwrite a published revision silently, or an unrelated id.
      assert.equal(previous.path, rel, 'ID belongs to another artifact');
      assert.equal(previous.sha256, item.sha256, 'Existing lesson bytes changed: review and bump revision manually');
      item.revision = previous.revision;
      Object.assign(previous, item);
    } else index.items.push(item);
  }
}
if (check) assert.deepEqual(index, original, 'Reviewed lesson metadata is missing/stale; run registration first');
else writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
console.log(`${Object.keys(seeds).length * selected.length} reviewed editions ${check ? 'verified' : 'registered'}.`);
