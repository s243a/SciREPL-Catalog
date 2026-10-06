#!/usr/bin/env node
// Deterministic, model-free preparation/promotion of the reviewed Free starter.
// --prepare creates immutable private candidate/provenance files.
// --promote copies only the exact prepared bytes to the new English workbook.
// --check (default) checks existing outputs without creating them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CSV_ID = 'csv-basics-seedlings';
export const CSV_TITLE = 'CSV Basics: Seedling Heights';
export const CSV_DESCRIPTION = "Beginner fictional seedling CSV tutorial using Python's standard library: create and read six rows, compare group means, and learn local-file overwrite and export caveats.";
export const CSV_KEEP_TEXTS = Object.freeze(['/shared/data/seedling-heights.csv', 'group', 'height_cm', 'light', 'shade', 'utf-8', ' cm']);
export const CSV_SOURCE_SHA256 = '9d48768fd656f5034b7aac899fc08f8faf3caae651fcab4b6538ad72e7cbc098';
export const CSV_SOURCE_COMMIT = '175d5721016553ee5d4a748805cff70b74b5ae7e';
export const CSV_TUTORIAL_URL = 'https://s243a.github.io/SciREPL/help/files-export/tutorial/';
export const CSV_CODE_HASHES = Object.freeze({
  create_csv: '607b37a787bb9766c12c9c65fcc59ad7fff2eb21f77bb73c9680f729784f69d9',
  read_csv: '69763e0eaade34fd0b1bba35ea2596983ad9e4d3dc40544d10c174bdef4ecbf5',
  compare_groups: '485310ec13a0e148010f2f48ed3e3c77081da35d3602fbd7108fa4c9ee76b574',
});
export const CSV_CELL_NAMES = Object.freeze(['title-goals', 'create_csv', 'read_csv', 'compare_groups', 'try-a-change']);
export const CSV_TUTORIAL_NOTE = '\n\nFor a guided walkthrough, read the [CSV import/export tutorial](' + CSV_TUTORIAL_URL + ').';
export const CSV_RERUN_NOTE = '\n\n**Overwrite and rerun warning:** Running `create_csv` opens `/shared/data/seedling-heights.csv` in write mode and replaces any file already at that path, including your CSV edits. Back up any file you want to keep before running it. After changing the CSV, rerun `read_csv` and `compare_groups` in order; previously displayed output does not update automatically.';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const serializeCsvStarter = book => JSON.stringify(book, null, 2) + '\n';

export function sanitizeCsvStarter(source) {
  assert.equal(source.format, 'srwb'); assert.equal(source.version, '1.0');
  assert.equal(source.notebook.name, CSV_TITLE); assert.equal(source.notebook.cells.length, 5);
  const cells = source.notebook.cells.map((cell, i) => {
    const type = i === 0 || i === 4 ? 'markdown' : 'code';
    assert.equal(cell.type, type); assert.equal(cell.language, type === 'code' ? 'python' : 'markdown');
    assert.equal(typeof cell.code, 'string'); assert(cell.code.trim()); assert(!cell.code.includes('\uFFFD'));
    if (type === 'code') {
      assert.equal(cell.name, CSV_CELL_NAMES[i], 'Original code-cell name changed');
      assert.equal(sha256(cell.code), CSV_CODE_HASHES[cell.name], 'Original reviewed code changed');
    } else assert(cell.name === undefined || cell.name === CSV_CELL_NAMES[i], 'Unexpected Markdown cell name');
    return { type, language: cell.language, name: CSV_CELL_NAMES[i],
      code: cell.code + (i === 0 ? CSV_TUTORIAL_NOTE : i === 4 ? CSV_RERUN_NOTE : '') };
  });
  const result = { format: source.format, version: source.version, notebook: { name: source.notebook.name, cells } };
  const projection = structuredClone(result);
  projection.notebook.cells[0].code = projection.notebook.cells[0].code.slice(0, -CSV_TUTORIAL_NOTE.length);
  projection.notebook.cells[4].code = projection.notebook.cells[4].code.slice(0, -CSV_RERUN_NOTE.length);
  source.notebook.cells.forEach((cell, i) => {
    assert.equal(projection.notebook.cells[i].code, cell.code, 'Transformation changed original cell content');
    if (cell.name !== undefined) assert.equal(projection.notebook.cells[i].name, cell.name);
  });
  return result;
}

export function csvSourceReceipt(candidateBytes) {
  return { schema: 1, lesson: CSV_ID, locale: 'en', status: 'source-prepared/runtime-review-pending',
    source: { repository: 'https://github.com/s243a/SciREPL', commit: CSV_SOURCE_COMMIT,
      path: 'www/workbooks/csv-basics-seedlings.srwb', sha256: CSV_SOURCE_SHA256 },
    target: { path: 'workbooks/en/' + CSV_ID + '.srwb', sha256: sha256(candidateBytes), size: Buffer.byteLength(candidateBytes) },
    transformation: { recipe: 'csv-starter-metadata-and-two-markdown-appendices-v1',
      metadata: 'Whitelist format/version/notebook name and cell type/language/name/code; assign only the two originally missing Markdown names.',
      prose: 'Append tutorial link to cell 0 and explicit overwrite/rerun warning to cell 4; preserve all original prose.',
      executableCodeUnchanged: true, originalCodeCellNamesUnchanged: true, runOrderUnchanged: true,
      codeSha256: CSV_CODE_HASHES },
    tutorialUrl: CSV_TUTORIAL_URL, fictionalData: true, browserReview: 'pending',
    translation: 'not-started', nativeSpeakerApproval: false,
    caveat: 'Preparation and offline checks do not constitute browser verification or native-language approval.' };
}

function identicalOrCreate(file, bytes) {
  if (fs.existsSync(file)) assert.deepEqual(fs.readFileSync(file), Buffer.from(bytes), 'Refuse overwriting different artifact: ' + file);
  else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes, { flag: 'wx' }); }
}

export function runCsvPreparation(args) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const flags = args.filter(x => ['--prepare', '--promote', '--check'].includes(x));
  assert(flags.length <= 1, 'Choose only one operation');
  const sourceIndex = args.indexOf('--source');
  if (sourceIndex >= 0) assert(args[sourceIndex + 1] && !args[sourceIndex + 1].startsWith('--'), 'Missing --source value');
  const remaining = sourceIndex < 0 ? args : args.filter((_, i) => i !== sourceIndex && i !== sourceIndex + 1);
  assert(remaining.every(x => ['--prepare', '--promote', '--check'].includes(x)), 'Unknown option');
  const sourceFile = sourceIndex >= 0 ? path.resolve(args[sourceIndex + 1])
    : path.resolve(root, '../scirepl-free-release140/www/workbooks/' + CSV_ID + '.srwb');
  const originalBytes = fs.readFileSync(sourceFile); assert.equal(sha256(originalBytes), CSV_SOURCE_SHA256, 'Unreviewed source bytes');
  const candidate = serializeCsvStarter(sanitizeCsvStarter(JSON.parse(originalBytes)));
  const receipt = JSON.stringify(csvSourceReceipt(candidate), null, 2) + '\n';
  const base = path.join(root, 'reviews/oil-csv-20261004/en', CSV_ID);
  const candidateFile = path.join(base, 'candidate.srwb'), receiptFile = path.join(base, 'source-provenance.json');
  const canonical = path.join(root, 'workbooks/en', CSV_ID + '.srwb');
  assert.notEqual(path.resolve(sourceFile), canonical, 'Never overwrite the original source');
  if (flags[0] === '--prepare') { identicalOrCreate(candidateFile, candidate); identicalOrCreate(receiptFile, receipt); }
  else if (flags[0] === '--promote') {
    assert.deepEqual(fs.readFileSync(candidateFile), Buffer.from(candidate), 'Prepared candidate changed');
    assert.deepEqual(fs.readFileSync(receiptFile), Buffer.from(receipt), 'Prepared provenance changed');
    identicalOrCreate(canonical, candidate);
    identicalOrCreate(path.join(root, 'reviews/sources', CSV_ID + '.json'), receipt);
  } else {
    for (const [file, bytes] of [[candidateFile, candidate], [receiptFile, receipt], [canonical, candidate],
      [path.join(root, 'reviews/sources', CSV_ID + '.json'), receipt]])
      if (fs.existsSync(file)) assert.deepEqual(fs.readFileSync(file), Buffer.from(bytes), 'Prepared output changed');
  }
  assert.equal(sha256(fs.readFileSync(sourceFile)), CSV_SOURCE_SHA256, 'Original source changed during preparation');
  console.log(JSON.stringify({ lesson: CSV_ID, operation: flags[0] || '--check',
    sourceSha256: CSV_SOURCE_SHA256, candidateSha256: sha256(candidate), cellNames: CSV_CELL_NAMES,
    candidate: path.relative(root, candidateFile), canonical: path.relative(root, canonical),
    browserReview: 'pending', translation: 'not-started' }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCsvPreparation(process.argv.slice(2));
