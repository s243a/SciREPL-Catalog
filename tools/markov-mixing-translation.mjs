#!/usr/bin/env node
// Offline append-only adapter. Importing this module has no I/O side effects.
// The controller owns model dispatch, campaign budgets, review, and promotion.
// applyMixingProposal({locale, proposal, campaignRoot}) accepts a strict flat
// 30-entry proposal and writes ONLY new campaign artifacts, never catalog files.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MIXING_PREDECESSOR, MIXING_PARTS, mixingRepo, mixingPinned, mixingSha,
  assertMixingPreservation } from './markov-mixing-addendum.mjs';
import { assertMarkovMixingBaselineBytes } from './markov-mixing-history.mjs';
import { tokenize, segmentFString } from './span-lib.mjs';

export const MIXING_LOCALES = Object.freeze(['ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'pt-BR', 'ru', 'zh']);
export const MIXING_ENGLISH_SHA256 = '2daf77aa872a7210cc16083535b1c244fb2cfbc288d60f688b85f0736633c430';
const MARKDOWN_INDICES = MIXING_PARTS.map(part => part.index);
const CODE_INDICES = MIXING_PARTS.map(part => part.index + 1);
const DISPLAY_PROSE = new Set(['Corner positions:', 'Reachable ordered pairs:', 'Masked same-cubie pairs:',
  'Observed visits', 'Uniform target', 'One sticker', 'Two stickers', 'steps',
  'Label 1 position', 'Label 1 corner index', 'Label 3 corner index', 'Visit frequency',
  'steps; visit-average distance:', 'exact end-position distance:',
  'steps; joint visit-average distance:', 'Uniform target per reachable ordered pair:']);
const SCRIPT_RULES = { ar: /\p{Script=Arabic}/u, bn: /\p{Script=Bengali}/u,
  hi: /\p{Script=Devanagari}/u, ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  ko: /\p{Script=Hangul}/u, ru: /\p{Script=Cyrillic}/u, zh: /\p{Script=Han}/u };
const TECHNICAL_WORDS = new Set(['python', 'numpy', 'mplot', 'plotly', 'basic', 'scirepl', 'ids', 'id']);
const jsonBytes = value => JSON.stringify(value, null, 2) + '\n';
function localeCheck(locale) { assert(MIXING_LOCALES.includes(locale), 'Unsupported mixing locale'); }
function run(repo, tool, args) {
  try { return execFileSync(process.execPath, [path.join(repo, 'tools', tool), ...args],
    { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }); }
  catch (error) { throw new Error(tool + ': ' + String(error.stderr || error.message)); }
}
function candidates(repo, file) { return JSON.parse(run(repo, 'span-apply.mjs', ['candidates', file])).candidates; }

// Target prose must not be reclassified with the English HAS_PROSE heuristic:
// e.g. Bengali ধাপ has a combining mark between its letters. Stable structural
// token IDs and exact bodies apply equally to every Unicode writing system.
export function mixingTokenBody(workbook, id) {
  const match = /^(14|16|18):(\d+):(\d+)$/.exec(id);
  assert(match, 'Token body check escaped appended code cells');
  const cell = workbook.notebook.cells[Number(match[1])];
  assert.equal(cell.type, 'code'); assert.equal(cell.language, 'python');
  const token = tokenize(cell.code)[Number(match[2])], segment = Number(match[3]);
  assert(token && token.kind !== 'code', 'Unknown prose/protected token');
  if (token.kind === 'comment') {
    assert.equal(segment, 0); assert(token.text.startsWith('#'));
    return token.text.slice(1).replace(/^ /, '');
  }
  assert.equal(token.kind, 'string');
  if (!token.isF) { assert.equal(segment, 0); return token.text; }
  const part = segmentFString(token.text)[segment]; assert(part, 'Unknown f-string segment');
  if (part.type === 'lit') return part.text;
  const header = /^\{\s*'([^']*)'\s*(:[^}]*)?\}$/.exec(part.text);
  assert(header, 'Executable placeholder is not prose authority'); return header[1];
}

export function loadMixingTranslationSource(repo = mixingRepo) {
  const sourcePath = path.join(repo, 'drafts/markov-mixing/en/markov-groups.srwb');
  const bytes = readFileSync(sourcePath), workbook = JSON.parse(bytes);
  assert.equal(mixingSha(bytes), MIXING_ENGLISH_SHA256, 'Frozen English mixing source hash changed');
  const predecessorBytes = mixingPinned('en', repo), predecessor = JSON.parse(predecessorBytes);
  assertMixingPreservation(predecessor, workbook);
  const fieldsPath = path.join(repo, 'drafts/markov-mixing/translation-fields.json');
  const fieldsBytes = readFileSync(fieldsPath), fields = JSON.parse(fieldsBytes);
  assert.equal(fields.schema, 'markov-mixing-fields-v1');
  assert.equal(fields.predecessorCommit, MIXING_PREDECESSOR);
  assert.equal(fields.predecessorEnglishSha256, mixingSha(predecessorBytes));
  assert.equal(fields.candidateEnglishSha256, MIXING_ENGLISH_SHA256);
  assert.equal(fields.coreCells, 13); assert.equal(fields.candidateCells, 19);
  const all = candidates(repo, sourcePath).filter(candidate => Number(candidate.id.split(':')[0]) >= 13);
  const allowed = all.filter(candidate => candidate.kind === 'comment' || DISPLAY_PROSE.has(candidate.text));
  assert.equal(allowed.length, 27, 'Frozen source must have exactly 27 authorized prose spans');
  assert(allowed.every(candidate => CODE_INDICES.includes(Number(candidate.id.split(':')[0]))));
  assert.deepEqual(fields.candidates, allowed, 'Translation fields changed authorized span authority');
  assert.deepEqual(fields.protectedCandidates, all.filter(candidate => !allowed.includes(candidate))
    .map(({ id, text }) => ({ id, text })), 'Protected source candidates changed');
  const entries = [
    ...MIXING_PARTS.map(part => ({ book: 'markov-groups', field: `markdown:${part.index}`,
      kind: 'markdown', text: workbook.notebook.cells[part.index].code })),
    ...allowed.map(candidate => ({ book: 'markov-groups', field: `span:${candidate.id}`,
      kind: candidate.kind, text: candidate.text, context: candidate.context,
      ...(candidate.width ? { width: candidate.width } : {}) })),
  ];
  assert.deepEqual(fields.workerEntries, entries, 'Worker input differs from the frozen source');
  assert.deepEqual(fields.markdown, entries.slice(0, 3).map(({ field, text }) => ({ field, text })));
  return { repo, sourcePath, bytes, workbook, fields, entries, fieldsSha256: mixingSha(fieldsBytes) };
}

// Preserve original numeric/technical tokens, allowing prose grammar to reorder
// references. Table row associations are separately ORDERED, not just multisets.
export function mixingMarkdownKeeps(text) {
  return {
    inlineCode: [...text.matchAll(/`([^`\n]+)`/g)].map(match => match[1]).sort(),
    math: [...text.matchAll(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g)].map(match => match[0]),
    urls: [...text.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]).sort(),
    numbers: (text.match(/\d+(?:\.\d+)?/g) || []).sort(),
    faces: (text.match(/(?<![\p{L}\p{N}_])[UDFBLR](?![\p{L}\p{N}_])/gu) || []).sort(),
    tableRows: text.split('\n').filter(line => /^\|\s*\d+[–-]\d+:/.test(line)).map(line => {
      const columns = line.split('|').slice(1, -1).map(column => column.trim());
      const match = /^(\d+[–-]\d+):\s*([UDFBLR])\s*\([^|]*\)$/.exec(columns[0]);
      assert(match && columns.length === 2, 'Face/index table row structure changed');
      return [match[1], match[2], columns[1]];
    }),
  };
}
function cleanText(value) {
  assert.equal(typeof value, 'string', 'Expected translation string');
  assert(value.trim(), 'Empty translation');
  assert(!/[\u0000-\u0008\u000B-\u001F\u007F\uFFFD\u202A-\u202E\u2066-\u2069]/u.test(value),
    'Control character, bidi override, or U+FFFD transport corruption');
  assert(![...value].some(character => { const point = character.codePointAt(0);
    return point >= 0xD800 && point <= 0xDFFF; }), 'Unpaired Unicode surrogate');
  assert(!value.includes('<') && !value.includes('```'), 'HTML and code fences are not authorized');
  return value.normalize('NFC');
}
function plainWords(text) {
  return (text.replace(/`[^`\n]+`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, ' ')
    .match(/[A-Za-z]+/g) || []).map(word => word.toLowerCase());
}
function residueCheck(source, target, kind) {
  assert.notEqual(target, source.normalize('NFC'), 'Untranslated English prose');
  const sourceWords = plainWords(source), targetWords = ' ' + plainWords(target).join(' ') + ' ';
  // Detect copied English narrative even if whitespace or punctuation changes.
  for (let index = 0; index + 5 <= sourceWords.length; index++) {
    const words = sourceWords.slice(index, index + 5);
    if (words.filter(word => !TECHNICAL_WORDS.has(word)).length >= 3)
      assert(!targetWords.includes(' ' + words.join(' ') + ' '), 'Untranslated English residue');
  }
  if (kind !== 'markdown' && sourceWords.length < 5 && sourceWords.some(word => !TECHNICAL_WORDS.has(word)))
    assert(!targetWords.includes(' ' + sourceWords.join(' ') + ' '), 'Untranslated short English prose');
}
function scriptCheck(locale, text) {
  const prose = text.replace(/`[^`\n]+`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, ' ')
    .replace(/(?<![\p{L}\p{N}_])[UDFBLR](?![\p{L}\p{N}_])/gu, ' ')
    .replace(/[A-Za-z]+/g, word => TECHNICAL_WORDS.has(word.toLowerCase()) ? ' ' : word);
  assert((SCRIPT_RULES[locale] || /\p{Script=Latin}/u).test(prose), 'Missing locale script');
}
export function gateMixingProposal({ locale, proposal, repo = mixingRepo, source = loadMixingTranslationSource(repo) }) {
  localeCheck(locale);
  assert.deepEqual(Object.keys(proposal || {}), ['entries'], 'Proposal permits only entries');
  assert(Array.isArray(proposal.entries)); assert.equal(proposal.entries.length, 30, 'Exactly 30 entries required');
  const expected = new Map(source.entries.map(entry => [entry.field, entry])), values = new Map();
  for (const entry of proposal.entries) {
    assert(entry && typeof entry === 'object' && !Array.isArray(entry));
    assert.deepEqual(Object.keys(entry).sort(), ['book', 'field', 'text'], 'Only book, field, text are authorized');
    assert.equal(entry.book, 'markov-groups');
    assert(expected.has(entry.field) && !values.has(entry.field), 'Unknown or duplicate translation field');
    const original = expected.get(entry.field), text = cleanText(entry.text);
    scriptCheck(locale, text); residueCheck(original.text, text, original.kind);
    if (original.kind === 'markdown') {
      assert.deepEqual(mixingMarkdownKeeps(text), mixingMarkdownKeeps(original.text), 'Markdown KEEP/index/table drift');
      assert.deepEqual((text.match(/^#{1,6}(?=\s)/gm) || []), (original.text.match(/^#{1,6}(?=\s)/gm) || []),
        'Markdown heading structure changed');
    } else {
      assert(!text.includes('\n') && !text.includes('\r'), 'Single-line span gained newline');
      const numeric = value => { const numbers = value.match(/\d+(?:\.\d+)?/g) || [];
        return original.kind === 'comment' ? numbers.sort() : numbers; };
      assert.deepEqual(numeric(text), numeric(original.text), 'Span numeric KEEP drift');
      assert.equal(text.match(/^\s*/)[0], original.text.match(/^\s*/)[0], 'Span leading whitespace changed');
      assert.equal(text.match(/\s*$/)[0], original.text.match(/\s*$/)[0], 'Span trailing whitespace changed');
    }
    values.set(entry.field, text);
  }
  assert.equal(values.size, 30, 'Missing authorized field');
  return { entries: source.entries.map(({ book, field }) => ({ book, field, text: values.get(field) })) };
}

export function buildMixingPrompt(locale, { repo = mixingRepo } = {}) {
  localeCheck(locale); const source = loadMixingTranslationSource(repo);
  return `Translate only the supplied new Markov workbook prose to locale ${locale}. `
    + 'This is a scoped append-only update, not a whole-workbook translation. No tools, files, model calls, execution or suggestions. '
    + 'Return ONLY strict JSON {"entries":[{"book":"markov-groups","field":"<exact supplied field>","text":"<translation>"}]}, '
    + 'exactly 30 records, each supplied field once. No title, metadata, core cell, keep field, protected API candidate, or extra key. '
    + 'Translate the three Markdown fields and all 27 comments/display labels; do not retain ordinary English prose. '
    + 'Preserve every inline-code span, numeric token, formula, original ID, index range, URL, and English face letter U,D,F,B,L,R exactly. '
    + 'Keep the six table rows in the same order and retain each exact index-range/face/original-ID association; translate only surrounding words/headings. '
    + 'No added HTML, code fences, number explanations, bidi overrides, or references. For comments/display labels preserve numbers, single-line shape and leading/trailing whitespace. '
    + 'In display strings do not insert ASCII double quotes, backslashes, braces, or Python statements. Cell/API identifiers and sampled data are NOT translation authority. '
    + 'Distinguish sticker labels, position IDs and display indices; retain common moves for the dependent pair, conditional forbidden pairs, and visit-average versus exact distribution caveats. '
    + 'For Arabic keep all programming identifiers and face letters English while translating prose to Arabic. '
    + '\nBEGIN UNTRUSTED DATA\n' + JSON.stringify({ locale, book: 'markov-groups',
      predecessorCommit: MIXING_PREDECESSOR, englishSha256: MIXING_ENGLISH_SHA256, entries: source.entries })
    + '\nEND UNTRUSTED DATA';
}

export function buildMixingHybrid(locale, { repo = mixingRepo, source = loadMixingTranslationSource(repo) } = {}) {
  localeCheck(locale); const predecessorBytes = mixingPinned(locale, repo), predecessor = JSON.parse(predecessorBytes);
  assertMarkovMixingBaselineBytes(readFileSync(path.join(repo, 'workbooks', locale, 'markov-groups.srwb')), locale, { repo });
  const hybrid = structuredClone(predecessor);
  hybrid.notebook.cells.push(...structuredClone(source.workbook.notebook.cells.slice(13)));
  assertMixingPreservation(predecessor, hybrid);
  return { hybrid, predecessor, predecessorSha256: mixingSha(predecessorBytes) };
}
function inside(root, target) { return target === root || target.startsWith(root + path.sep); }
function campaignPath(campaignRoot, locale, repo) {
  assert.equal(typeof campaignRoot, 'string'); assert(path.isAbsolute(campaignRoot), 'Supply an absolute campaign root');
  const root = path.resolve(campaignRoot), repoRoot = realpathSync(repo);
  assert(![repoRoot, '/', path.dirname(repoRoot)].includes(root), 'Campaign root must be a narrow directory');
  for (const name of ['workbooks', 'tools', '.git', '.github', 'docs'])
    assert(!inside(path.join(repoRoot, name), root), 'Never write campaign artifacts into catalog/source directories');
  // No symlink can redirect writes outside the supplied campaign root.
  let current = root;
  while (current !== path.dirname(current)) {
    if (existsSync(current)) assert(!lstatSync(current).isSymbolicLink(), 'Symlink campaign ancestor refused');
    current = path.dirname(current);
  }
  const localeDir = path.join(root, locale), work = path.join(localeDir, 'mixing-application');
  if (existsSync(localeDir)) assert(!lstatSync(localeDir).isSymbolicLink(), 'Symlink locale directory refused');
  assert(!existsSync(work), 'Application artifacts already exist; no overwrite or replay');
  assert(!existsSync(path.join(localeDir, 'markov-groups.srwb')), 'Translated draft already exists');
  return { root, localeDir, work };
}
export function applyMixingProposal({ locale, proposal, campaignRoot, repo = mixingRepo }) {
  const source = loadMixingTranslationSource(repo), normalized = gateMixingProposal({ locale, proposal, repo, source });
  const { hybrid, predecessor, predecessorSha256 } = buildMixingHybrid(locale, { repo, source });
  const { localeDir, work } = campaignPath(campaignRoot, locale, repo);
  const target = structuredClone(hybrid), values = new Map(normalized.entries.map(entry => [entry.field, entry.text]));
  for (const index of MARKDOWN_INDICES) target.notebook.cells[index].code = values.get(`markdown:${index}`);
  mkdirSync(localeDir, { recursive: true }); mkdirSync(work);
  const save = (name, value) => { const file = path.join(work, name); writeFileSync(file, jsonBytes(value), { flag: 'wx' }); return file; };
  const sourceFile = save('apply-source.srwb', hybrid), markdownFile = save('markdown-applied.srwb', target);
  save('proposal.json', normalized);
  const spanValues = Object.fromEntries(source.fields.candidates.map(candidate => [candidate.id, values.get(`span:${candidate.id}`)]));
  const spansFile = save('spans.json', spanValues), appliedFile = path.join(work, 'translated.srwb');
  run(repo, 'span-apply.mjs', ['apply', markdownFile, spansFile, appliedFile, '--en', sourceFile]);
  const applied = JSON.parse(readFileSync(appliedFile));
  assertMixingPreservation(predecessor, applied);
  const restored = structuredClone(applied);
  for (const index of [...MARKDOWN_INDICES, ...CODE_INDICES])
    restored.notebook.cells[index].code = hybrid.notebook.cells[index].code;
  assert.deepEqual(restored, hybrid, 'Translation changed unauthorized fields or metadata');
  for (const index of MARKDOWN_INDICES) assert.equal(applied.notebook.cells[index].code, values.get(`markdown:${index}`));
  for (const candidate of source.fields.candidates) {
    assert.equal(mixingTokenBody(hybrid, candidate.id), candidate.text, 'Authorized source token identity changed');
    assert.equal(mixingTokenBody(applied, candidate.id), spanValues[candidate.id], 'Authorized span application differs');
  }
  for (const candidate of source.fields.protectedCandidates) {
    assert.equal(mixingTokenBody(hybrid, candidate.id), candidate.text, 'Protected source token identity changed');
    assert.equal(mixingTokenBody(applied, candidate.id), candidate.text, 'Protected API/data span changed');
  }
  const manifest = JSON.parse(run(repo, 'span-derive.mjs', [sourceFile, appliedFile, locale]));
  assert.equal(manifest.spans.length, 27, 'Expected exactly 27 derived prose changes');
  const seen = new Set();
  for (const span of manifest.spans) {
    assert(CODE_INDICES.includes(span.cell_index), 'Derived change escaped the appended code cells');
    const matches = source.fields.candidates.filter(candidate => Number(candidate.id.split(':')[0]) === span.cell_index
      && candidate.kind === span.kind && candidate.text === span.source_span.text);
    assert.equal(matches.length, 1, 'Unknown or ambiguous derived prose span');
    const id = matches[0].id; assert(!seen.has(id), 'Duplicate derived prose span'); seen.add(id);
    assert.equal(span.target_span.text, spanValues[id], 'Derived translation differs from the proposal');
  }
  assert.equal(seen.size, 27); save('derived.json', manifest);
  // Recheck pinned inputs immediately before publishing the CAMPAIGN draft.
  assert.equal(mixingSha(readFileSync(source.sourcePath)), MIXING_ENGLISH_SHA256);
  assert.equal(mixingSha(readFileSync(path.join(repo, 'drafts/markov-mixing/translation-fields.json'))), source.fieldsSha256);
  assertMarkovMixingBaselineBytes(readFileSync(path.join(repo, 'workbooks', locale, 'markov-groups.srwb')), locale, { repo });
  const output = path.join(localeDir, 'markov-groups.srwb'), outputBytes = jsonBytes(applied);
  writeFileSync(output, outputBytes, { flag: 'wx' });
  const verification = { schema: 'markov-mixing-translation-v1', locale,
    predecessorCommit: MIXING_PREDECESSOR, predecessorSha256, englishSha256: MIXING_ENGLISH_SHA256,
    fieldsSha256: source.fieldsSha256, targetSha256: mixingSha(outputBytes), cells: 19, preservedCoreCells: 13,
    markdownFields: MARKDOWN_INDICES.map(index => `markdown:${index}`), derivedSpans: 27,
    status: 'offline-static-gates-passed', promoted: false, requestsMadeByAdapter: 0,
    nativeSpeakerReview: 'pending', runtimeReview: 'pending', renderedReview: 'pending',
    caveat: 'Static structure, KEEP, locale-script and English-residue checks only; no model, native, runtime or rendering approval claimed.' };
  const verificationPath = save('verification.json', verification);
  return { output, verificationPath, manifestPath: path.join(work, 'derived.json'), verification };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, locale, proposalFile, campaignRoot] = process.argv.slice(2);
  if (mode === 'prompt') console.log(buildMixingPrompt(locale));
  else if (mode === 'apply') console.log(JSON.stringify(applyMixingProposal({ locale,
    proposal: JSON.parse(readFileSync(proposalFile, 'utf8')), campaignRoot }), null, 2));
  else throw new Error('Usage: markov-mixing-translation.mjs prompt <locale> | apply <locale> <proposal.json> <absolute-campaign-root>');
}
