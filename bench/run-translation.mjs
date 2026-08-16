#!/usr/bin/env node
// run-translation.mjs — generalized Pass 2 pipeline: <workbook-file> <locale>
//   node run-translation.mjs r_statistics.ipynb es
// Stage A (comments/strings) for ANY supported kernel; identifier renames
// remain Python-only and are skipped for non-Python workbooks.
// draft (agy) → review (agy) → span-apply → derive (strict) → lint →
// en baseline (cached) → bench ×2 → envelope → judge → index. Never commits.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [WB, LOCALE] = process.argv.slice(2);
const REPO = '/home/s243a/Projects/SciREPL-Catalog';
const SD = path.dirname(new URL(import.meta.url).pathname);
const BASE = WB.replace(/\.(srwb|ipynb)$/, '');
const WORK = path.join(SD, 'jobs', `${BASE}-${LOCALE}`);
mkdirSync(WORK, { recursive: true });

const LNAMES = { es: 'SPANISH', de: 'GERMAN', fr: 'FRENCH', 'pt-BR': 'BRAZILIAN PORTUGUESE', id: 'INDONESIAN', ja: 'JAPANESE', zh: 'SIMPLIFIED CHINESE', ko: 'KOREAN', hi: 'HINDI', bn: 'BENGALI', ru: 'RUSSIAN', ar: 'ARABIC' };
const LNAME = LNAMES[LOCALE];
if (!LNAME) { console.error('unknown locale'); process.exit(2); }

const enPath = `workbooks/en/${WB}`;
const xxPath = `workbooks/${LOCALE}/${WB}`;
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
const step = (name, fn) => {
  try { const r = fn(); console.log(`[${BASE}/${LOCALE}] ok   ${name}`); return r; }
  catch (e) {
    const detail = String(e.stdout || '') + String(e.stderr || '') || String(e.message);
    console.log(`[${BASE}/${LOCALE}] FAIL ${name}: ${detail.slice(0, 700)}`);
    const err = new Error(name); err.stage = name; err.detail = detail.slice(0, 4000); throw err;
  }
};
const agyCall = (promptText, tag) => {
  const pf = path.join(WORK, `${tag}-prompt.txt`);
  writeFileSync(pf, promptText);
  // broker transport can corrupt multi-byte UTF-8 at chunk boundaries
  // (upstream fix pending with Sol); the corruption is timing-dependent,
  // so retry up to 3x on mojibake rather than accept or fail hard
  for (let attempt = 1; attempt <= 3; attempt++) {
    const out = run('node', [path.join(SD, 'agent-drive.mjs'), '--url', 'ws://127.0.0.1:8088/agent',
      '--token-file', '/home/s243a/scirepl-broker/broker-token', '--agent', 'agy', '--prompt-file', pf, '--timeout-ms', '420000']);
    writeFileSync(path.join(WORK, `${tag}-raw.txt`), out);
    let raw = out.trim();
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) raw = fence[1].trim();
    const st = raw.indexOf('{');
    if (st > 0) raw = raw.slice(st);
    if (raw.includes('�')) {
      console.log(`[${BASE}/${LOCALE}] ${tag}: U+FFFD in worker response (attempt ${attempt}) — retrying`);
      continue;
    }
    return JSON.parse(raw);
  }
  throw new Error('worker response contained U+FFFD mojibake on 3 consecutive attempts');
};

/* 1. preconditions: target code cells byte-identical to en */
step('round-one state check', () => {
  const out = run('node', ['--input-type=module', '-e', `
import { readFileSync } from 'node:fs';
import { cellsOf } from '${REPO}/tools/span-lib.mjs';
const en = cellsOf(JSON.parse(readFileSync('${REPO}/${enPath}','utf8')));
const xx = cellsOf(JSON.parse(readFileSync('${REPO}/${xxPath}','utf8')));
if (en.length !== xx.length) { console.log('CELLCOUNT'); process.exit(1); }
for (let i = 0; i < en.length; i++)
  if (en[i].type !== 'markdown' && en[i].code !== xx[i].code) { console.log('DIFFERS ' + i); process.exit(1); }
console.log('ok');`]);
  if (!/ok/.test(out)) throw new Error('target code differs from en: ' + out);
});

/* 2. en baseline (cached per workbook) */
const BL = path.join(SD, 'baselines', BASE);
mkdirSync(BL, { recursive: true });
const bl1 = path.join(BL, 'en-run-1.srwb'), bl2 = path.join(BL, 'en-run-2.srwb');
let baselineExclusions = [];
if (!existsSync(bl1)) {
  step('en baseline run 1', () => run('node', [path.join(SD, 'mcp-run.mjs'), enPath, bl1]));
  step('en baseline run 2', () => run('node', [path.join(SD, 'mcp-run.mjs'), enPath, bl2]));
}
step('en determinism envelope', () => {
  try { run('node', ['tools/output-oracle.mjs', 'envelope', bl1, bl2]); }
  catch (e) {
    const out = String(e.stdout || '');
    const j = JSON.parse(out);
    baselineExclusions = j.exclusions || [];
    console.log(`[${BASE}/${LOCALE}]      ${baselineExclusions.length} unstable cell(s) -> exclusions`);
  }
});

/* 3. candidates + prompts */
const cands = JSON.parse(run('node', ['tools/span-apply.mjs', 'candidates', enPath])).candidates;
const mdRef = run('node', ['--input-type=module', '-e', `
import { readFileSync } from 'node:fs';
import { cellsOf } from '${REPO}/tools/span-lib.mjs';
console.log(cellsOf(JSON.parse(readFileSync('${REPO}/${xxPath}','utf8')))
  .filter(c => c.type === 'markdown').map(c => c.code).join('\\n---\\n').slice(0, 2200));`]);
const candLines = cands.map(c => {
  const w = c.width != null ? `  [MAX ${c.width} CHARS]` : '';
  const ctx = c.context ? `\n      context: ${c.context}` : '';
  return `${c.id}  (${c.kind}${w})  ${JSON.stringify(c.text)}${ctx}`;
}).join('\n');

const draftPrompt = `You are translating the code-level prose of a SciREPL workbook ("${BASE}") from English to ${LNAME}. Reply with STRICT JSON only — no fences, no commentary, no tool use.

Output shape: {"spans": {"<id>": "<translation>", ...}, "keeps": ["<id>", ...], "suggestions": [{"cell": n, "note": "..."}]}

Rules:
- Translate comments and human-readable strings into natural ${LNAME}. Preserve leading/trailing spaces EXACTLY.
- Format specifiers must survive VERBATIM and in order: %-specs (like %.2f, %s, %d) and ~specs (like ~w, ~n). Never translate them.
- Data/API tokens are NOT prose: dataset column names (like "mpg", "hp", "wt"), function-argument keywords, mode strings — put their ids in "keeps".
- Strings used as INPUT DATA to parsing/processing demonstrations (sample sentences being split/tokenized/pattern-matched, test corpora) are lesson mechanics — put their ids in "keeps"; translating them changes what the code demonstrates.
- Escapes: keep \\n exactly where the original has it. No braces added. No backslashes beyond the original's escapes.
- Every id must appear in "spans" or "keeps".
- "suggestions" is optional: content-improvement ideas for the ENGLISH source only.

${candLines}

== Terminology reference (this workbook's ${LNAME} introduction, already translated) ==
${mdRef}
`;
const draft = step('agy draft', () => agyCall(draftPrompt, 'draft'));
const reviewPrompt = `REVIEW this draft ${LNAME} translation of code-level prose. Reply with the corrected FULL JSON (same shape), STRICT JSON only, no tool use.
Check: natural ${LNAME}; terminology consistent with the reference and within the draft; format specifiers (%… ~…) verbatim and in order; leading/trailing spaces preserved; data/API tokens kept (not translated); every candidate id in "spans" or "keeps". "No changes" = return the draft unchanged.

== Candidates ==
${candLines}

== Draft ==
${JSON.stringify(draft, null, 1)}

== Terminology reference ==
${mdRef}
`;
let activeJson = step('agy review', () => agyCall(reviewPrompt, 'review'));
writeFileSync(path.join(WORK, 'translations.worker.json'), JSON.stringify(activeJson, null, 2));
if (Array.isArray(activeJson.suggestions) && activeJson.suggestions.length) {
  writeFileSync(path.join(WORK, 'suggestions.json'), JSON.stringify(activeJson.suggestions, null, 2));
  console.log(`[${BASE}/${LOCALE}] ${activeJson.suggestions.length} suggestion(s) recorded`);
}

/* 4-6. apply + gates with repair loop */
const manifest = path.join(WORK, 'span-manifest.derived.json');
const out1 = path.join(WORK, 'run-1.srwb'), out2 = path.join(WORK, 'run-2.srwb');
const applied = path.join(WORK, 'translated' + (WB.endsWith('.ipynb') ? '.ipynb' : '.srwb'));

function tryPipeline(json) {
  writeFileSync(path.join(WORK, 'spans.json'), JSON.stringify(json.spans || {}));
  const keepTexts = (json.keeps || []).map(id => cands.find(c => c.id === id)?.text).filter(Boolean);
  // a span whose translation is deliberately IDENTICAL to the source is an
  // implicit keep for the lint (words shared across languages, token names);
  // the changed-spans integrity gate still catches wholesale echoing
  for (const [id, t] of Object.entries(json.spans || {})) {
    const c = cands.find(x => x.id === id);
    if (c && t === c.text) keepTexts.push(c.text);
  }
  const unaccounted = cands.filter(c => (json.spans || {})[c.id] === undefined && !(json.keeps || []).includes(c.id));
  if (unaccounted.length) console.log(`[${BASE}/${LOCALE}] note: ${unaccounted.length} unaccounted candidate(s)`);
  step('span-apply', () => run('node', ['tools/span-apply.mjs', 'apply', xxPath, path.join(WORK, 'spans.json'), applied, '--en', enPath]));
  step('derive (strict)', () => {
    const o = run('node', ['tools/span-derive.mjs', enPath, applied, LOCALE]);
    const m = JSON.parse(o);
    m.exclusions = baselineExclusions;
    writeFileSync(manifest, JSON.stringify(m, null, 2));
    console.log(`[${BASE}/${LOCALE}]      ${m.spans.length} spans`);
    // integrity: a translation job that changes nothing is NOT a pass —
    // catches English-echo spans and keeps-flooding (both observed live)
    const nSpans = Object.keys(json.spans || {}).length;
    if (m.spans.length === 0) throw new Error('derive found 0 changed spans — nothing was actually translated');
    if (m.spans.length < nSpans * 0.5) throw new Error(`only ${m.spans.length} of ${nSpans} proposed spans actually changed text — English echoes suspected`);
  });
  step('lint --strict', () => {
    const args = ['tools/span-scan.mjs', enPath, '--lint', applied, '--strict'];
    for (const t of keepTexts) args.push('--allow', t);
    run('node', args);
  });
  step('stage into repo', () => copyFileSync(applied, path.join(REPO, xxPath)));
  step('bench run 1', () => run('node', [path.join(SD, 'mcp-run.mjs'), xxPath, out1]));
  step('bench run 2', () => run('node', [path.join(SD, 'mcp-run.mjs'), xxPath, out2]));
  step('target envelope', () => {
    try { run('node', ['tools/output-oracle.mjs', 'envelope', out1, out2]); }
    catch (e) {
      // tolerate ONLY the same cells the en baseline already excludes
      const j = JSON.parse(String(e.stdout || ''));
      const allowed = new Set(baselineExclusions.map(x => x.cell_index));
      const extra = (j.exclusions || []).filter(x => !allowed.has(x.cell_index));
      if (extra.length) throw new Error('unstable beyond baseline exclusions: cells ' + extra.map(x => x.cell_index).join(','));
    }
  });
  step('differential oracle', () => run('node', ['tools/output-oracle.mjs', 'judge', bl1, out1, manifest]));
}

let green = false;
for (let round = 0; round <= 2 && !green; round++) {
  try { tryPipeline(activeJson); green = true; }
  catch (e) {
    if (round === 2) { console.log(`[${BASE}/${LOCALE}] giving up after 2 repair rounds`); process.exit(1); }
    console.log(`[${BASE}/${LOCALE}] repair round ${round + 1}`);
    try {
      activeJson = agyCall(`Your ${LNAME} translation JSON FAILED a gate. Fix it; reply with the corrected FULL JSON only, no tool use.\n\nIMPORTANT: the fix is to provide CORRECT ${LNAME} translations for the failing spans. NEVER fix an error by echoing the English text back, deleting translations, or moving translatable prose into "keeps" — an untranslated result is itself a failure.\n\nFAILED STAGE: ${e.stage}\nERROR:\n${e.detail}\n\n== Candidates ==\n${candLines}\n\n== Your JSON ==\n${JSON.stringify(activeJson, null, 1)}\n`, `repair-${round + 1}`);
      writeFileSync(path.join(WORK, 'translations.worker.json'), JSON.stringify(activeJson, null, 2));
    } catch (re) { console.log(`[${BASE}/${LOCALE}] repair call failed; retry counts as a round`); }
  }
}

/* 7. evidence + index */
step('evidence + index', () => {
  const ev = path.join(REPO, '.pilot', `${BASE}-${LOCALE}`);
  mkdirSync(path.join(ev, 'runs'), { recursive: true });
  copyFileSync(path.join(WORK, 'translations.worker.json'), path.join(ev, 'translations.worker.json'));
  copyFileSync(manifest, path.join(ev, 'span-manifest.derived.json'));
  copyFileSync(out1, path.join(ev, 'runs', 'run-1.srwb'));
  copyFileSync(out2, path.join(ev, 'runs', 'run-2.srwb'));
  const sha = run('sha256sum', [xxPath]).split(/\s+/)[0];
  const size = readFileSync(path.join(REPO, xxPath)).length;
  const catP = path.join(REPO, 'scirepl-catalog.json');
  const cat = JSON.parse(readFileSync(catP, 'utf8'));
  const item = cat.items.find(i => i.path === xxPath);
  item.revision = (item.revision || 1) + 1;
  item.sha256 = sha; item.size = size;
  writeFileSync(catP, JSON.stringify(cat, null, 2) + '\n');
});
console.log(`[${BASE}/${LOCALE}] ALL GATES GREEN`);
