#!/usr/bin/env node
/**
 * build-index.mjs — keep scirepl-catalog.json honest about its artifacts.
 *
 *   node tools/build-index.mjs           # write: fill sha256 + size from files
 *   node tools/build-index.mjs --check   # verify without writing (CI)
 *
 * Every item's `url` must resolve to a file in this repository
 * (raw.githubusercontent.com/<owner>/<repo>/<ref>/<path> → <path>). The tool
 * hashes the real bytes, so an index entry can never disagree with the file
 * it points at — a mismatch is exactly what a stale edit or a botched upload
 * looks like, and SciREPL treats it as a hard install failure.
 *
 * Revision discipline: if the artifact bytes differ from what HEAD recorded
 * and the item's `revision` did not increase, both modes fail. Bumping
 * `revision` without changing bytes fails too (the app treats that as an
 * index error). New files (absent from HEAD) are exempt.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const INDEX = path.join(ROOT, 'scirepl-catalog.json');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error('[catalog] ' + msg); process.exit(1); };

const index = JSON.parse(readFileSync(INDEX, 'utf8'));
if (index.format_version !== '1.0') fail('unsupported format_version: ' + index.format_version);

const RAW = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/;

function repoPath(url) {
  const m = RAW.exec(String(url || ''));
  return m ? m[1] : null;
}

function headBytes(rel) {
  try {
    return execFileSync('git', ['show', `HEAD:${rel}`],
      { cwd: ROOT, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}

function headRevision(id) {
  try {
    const old = JSON.parse(execFileSync('git', ['show', 'HEAD:scirepl-catalog.json'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    const item = (old.items || []).find((it) => it.id === id);
    return item ? item.revision : null;
  } catch { return null; }
}

const ids = new Set();
let dirty = false;

for (const item of index.items || []) {
  if (!item.id) fail('an item is missing id');
  if (ids.has(item.id)) fail(`duplicate id: ${item.id}`);
  ids.add(item.id);
  for (const field of ['name', 'type', 'url']) {
    if (!item[field]) fail(`${item.id}: missing ${field}`);
  }
  if (!['package', 'bundle', 'workbook'].includes(item.type)) {
    fail(`${item.id}: unknown type ${item.type}`);
  }
  if (!Number.isInteger(item.revision) || item.revision < 1) {
    fail(`${item.id}: revision must be a positive integer`);
  }

  const rel = repoPath(item.url);
  if (!rel) fail(`${item.id}: url must be a raw.githubusercontent.com URL into this repository`);
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) fail(`${item.id}: ${rel} does not exist`);

  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const size = bytes.length;

  const committed = headBytes(rel);
  const prevRevision = headRevision(item.id);
  if (committed && prevRevision != null) {
    const changed = createHash('sha256').update(committed).digest('hex') !== sha256;
    if (changed && item.revision <= prevRevision) {
      fail(`${item.id}: bytes changed but revision is still ${item.revision} — bump it`);
    }
    if (!changed && item.revision > prevRevision) {
      fail(`${item.id}: revision bumped to ${item.revision} but the bytes are unchanged`);
    }
  }

  if (item.sha256 !== sha256 || item.size !== size) {
    if (CHECK) fail(`${item.id}: recorded sha256/size do not match ${rel} — run: node tools/build-index.mjs`);
    item.sha256 = sha256;
    item.size = size;
    dirty = true;
    console.log(`[catalog] updated ${item.id}: ${sha256.slice(0, 12)}… (${size} bytes)`);
  }
}

if (!CHECK && dirty) writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n');
console.log(`[catalog] ${ids.size} item(s) ${CHECK ? 'verified' : dirty ? 'updated' : 'already current'}.`);
