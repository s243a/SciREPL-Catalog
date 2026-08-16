#!/usr/bin/env node
// reverify-locale.mjs — full gate chain for an ALREADY-STAGED locale file
// (post-repair): derive, lint (stored keeps), bench ×2, envelope, judge,
// plot, index sha update. No worker calls. Never commits.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const LOCALE = process.argv[2];
const REPO = '/home/s243a/Projects/SciREPL-Catalog';
const SD = path.dirname(new URL(import.meta.url).pathname);
const WORK = path.join(SD, 'locales', LOCALE);
mkdirSync(WORK, { recursive: true });
const wbPath = `workbooks/${LOCALE}/compute-pi-workbook.srwb`;

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
const step = (name, fn) => {
  try { const r = fn(); console.log(`[${LOCALE}] ok   ${name}`); return r; }
  catch (e) {
    console.log(`[${LOCALE}] FAIL ${name}: ${String(e.stdout || e.stderr || e.message).slice(0, 600)}`);
    process.exit(1);
  }
};

const manifest = path.join(WORK, 'span-manifest.derived.json');
step('derive --allow-renames', () => {
  const out = run('node', ['tools/span-derive.mjs', 'workbooks/en/compute-pi-workbook.srwb', wbPath, LOCALE, '--allow-renames']);
  writeFileSync(manifest, out);
});
step('lint --strict', () => {
  const cands = JSON.parse(run('node', ['tools/span-apply.mjs', 'candidates', 'workbooks/en/compute-pi-workbook.srwb'])).candidates;
  const byId = new Map(cands.map(c => [c.id, c.text]));
  let keeps = [];
  try {
    const w = JSON.parse(readFileSync(path.join(WORK, 'translations.worker.json'), 'utf8'));
    keeps = (w.keeps || []).map(id => byId.get(id)).filter(Boolean);
  } catch { keeps = [' < pi < ', 'd', 'mode', 'lines', 'name', 'title', 'xaxis', 'yaxis', 'scaleanchor', 'lines+markers']; }
  const args = ['tools/span-scan.mjs', 'workbooks/en/compute-pi-workbook.srwb', '--lint', wbPath, '--strict'];
  for (const t of keeps) args.push('--allow', t);
  run('node', args);
});
const run1 = path.join(WORK, 'reverify-run-1.srwb'), run2 = path.join(WORK, 'reverify-run-2.srwb');
step('bench run 1', () => run('node', [path.join(SD, 'mcp-run.mjs'), wbPath, run1]));
step('bench run 2', () => run('node', [path.join(SD, 'mcp-run.mjs'), wbPath, run2]));
step('envelope', () => run('node', ['tools/output-oracle.mjs', 'envelope', run1, run2]));
step('oracle', () => run('node', ['tools/output-oracle.mjs', 'judge', '.pilot/compute-pi-es/runs/en-run-1.srwb', run1, manifest]));
step('plot check', () => {
  const out = run('node', ['--input-type=module', '-e', `
import { readFileSync } from 'node:fs';
const html = JSON.parse(readFileSync('${run1}','utf8')).notebook.cells[1].lastOutputHtml || '';
const m = JSON.parse(readFileSync('${manifest}','utf8'));
const labels = m.spans.filter(s => s.cell_index === 1 && s.kind === 'display_string').map(s => s.target_span.text);
const missing = labels.filter(l => !html.includes(l));
if (missing.length) { console.log('missing: ' + JSON.stringify(missing)); process.exit(1); }
console.log('labels ok: ' + labels.length);`]);
  console.log(`[${LOCALE}]      ${out.trim()}`);
});
step('evidence + index', () => {
  const ev = path.join(REPO, '.pilot', `compute-pi-${LOCALE}`);
  mkdirSync(path.join(ev, 'runs'), { recursive: true });
  copyFileSync(manifest, path.join(ev, 'span-manifest.derived.json'));
  copyFileSync(run1, path.join(ev, 'runs', 'run-1.srwb'));
  copyFileSync(run2, path.join(ev, 'runs', 'run-2.srwb'));
  const sha = run('sha256sum', [wbPath]).split(/\s+/)[0];
  const size = readFileSync(path.join(REPO, wbPath)).length;
  const catPath = path.join(REPO, 'scirepl-catalog.json');
  const cat = JSON.parse(readFileSync(catPath, 'utf8'));
  const item = cat.items.find(i => i.path === wbPath);
  item.sha256 = sha; item.size = size;
  writeFileSync(catPath, JSON.stringify(cat, null, 2) + '\n');
});
console.log(`[${LOCALE}] REVERIFIED GREEN`);
