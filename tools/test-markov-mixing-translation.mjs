#!/usr/bin/env node
// OFFLINE synthetic fixtures exercise safety boundaries, not prose quality.
// No model requests, shipped workbook edits, registration, or publication.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { MIXING_LOCALES, MIXING_ENGLISH_SHA256, loadMixingTranslationSource,
  buildMixingPrompt, gateMixingProposal, buildMixingHybrid, mixingMarkdownKeeps,
  mixingTokenBody, applyMixingProposal } from './markov-mixing-translation.mjs';
import { mixingPinned, mixingSha, assertMixingPreservation } from './markov-mixing-addendum.mjs';
import { assertMarkovMixingBaselineBytes } from './markov-mixing-history.mjs';

export function testMixingTranslation() {
  let checks = 0;
  const check = action => { action(); checks++; };
  const source = loadMixingTranslationSource(), beforeSource = mixingSha(source.bytes);
  const scripts = { ar: 'ترجمة', bn: 'অনুবাদ', hi: 'अनुवाद', ja: '翻訳', ko: '번역', ru: 'перевод', zh: '译文' };
  function fixtureText(text, locale) {
    const kept = [];
    // Opaque code/math plus standalone face symbols are NEVER fixture prose.
    const masked = text.replace(/`[^`\n]+`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|(?<![\p{L}\p{N}_])[UDFBLR](?![\p{L}\p{N}_])/gu,
      value => { kept.push(value); return `\uE000${kept.length - 1}\uE001`; });
    return masked.replace(/[A-Za-z]+/g, () => scripts[locale] || 'Traducción')
      .replace(/\uE000(\d+)\uE001/g, (_, index) => kept[Number(index)]);
  }
  const fixture = locale => ({ entries: source.entries.map(({ book, field, text }) =>
    ({ book, field, text: fixtureText(text, locale) })) });
  check(() => assert.equal(source.entries.length, 30));
  check(() => assert.equal(source.fields.candidates.length, 27));
  check(() => assert.equal(beforeSource, MIXING_ENGLISH_SHA256));
  for (const locale of MIXING_LOCALES) {
    const proposed = fixture(locale), gated = gateMixingProposal({ locale, proposal: proposed, source });
    check(() => assert.equal(gated.entries.length, 30));
    check(() => assert.deepEqual(gateMixingProposal({ locale, proposal: { entries: [...proposed.entries].reverse() }, source }), gated));
    const { hybrid, predecessor } = buildMixingHybrid(locale, { source });
    check(() => assertMixingPreservation(predecessor, hybrid));
    check(() => assert.deepEqual(hybrid.notebook.cells.slice(0, 13), JSON.parse(mixingPinned(locale)).notebook.cells));
    check(() => assert.deepEqual(hybrid.notebook.cells.slice(13), source.workbook.notebook.cells.slice(13)));
    const prompt = buildMixingPrompt(locale), input = JSON.parse(prompt.split('BEGIN UNTRUSTED DATA\n')[1].split('\nEND UNTRUSTED DATA')[0]);
    check(() => assert.deepEqual(input.entries, source.entries));
    check(() => assert.equal(input.englishSha256, MIXING_ENGLISH_SHA256));
  }
  const good = fixture('es');
  const mutateEntry = (proposal, field, change) => {
    const entry = proposal.entries.find(entry => entry.field === field); assert(entry); entry.text = change(entry.text);
  };
  const negatives = [
    proposal => { proposal.entries.pop(); },
    proposal => { proposal.entries.push(proposal.entries[0]); },
    proposal => { proposal.entries[29] = structuredClone(proposal.entries[0]); },
    proposal => { proposal.entries[0].field = 'markdown:0'; },
    proposal => { proposal.entries[0].field = 'code:14'; },
    proposal => { proposal.entries[0].field = `span:${source.fields.protectedCandidates[0].id}`; },
    proposal => { proposal.entries[0].book = 'other'; },
    proposal => { proposal.suggestions = []; },
    proposal => { proposal.entries[0].extra = 'unauthorized'; },
    proposal => { proposal.entries[0].text = { text: 'not a string' }; },
    proposal => { proposal.entries[0].text = ''; },
    proposal => { proposal.entries[0].text += '<script>alert(0)</script>'; },
    proposal => { proposal.entries[0].text += '\n```python\nprint(1)\n```'; },
    proposal => { proposal.entries[0].text += '\uFFFD'; },
    proposal => { proposal.entries[0].text += '\u202E'; },
    proposal => { proposal.entries[0].text += '\u0000'; },
    proposal => { proposal.entries[0].text += '\uD800'; },
    proposal => { proposal.entries[0].text = source.entries[0].text; },
    proposal => { proposal.entries[0].text += '\n' + source.entries[0].text.split('\n')[2]; },
    proposal => mutateEntry(proposal, 'markdown:13', text => text.replace('10000', '20000')),
    proposal => mutateEntry(proposal, 'markdown:17', text => text.replace('`1, 14, 17`', '`1, 10, 17`')),
    proposal => mutateEntry(proposal, 'markdown:17', text => text.replace('`0, 2, 6, 8`', '`8, 6, 2, 0`')),
    // Swap two table associations: the general numeric/code multisets still
    // agree, so the separate ORDERED table gate must catch the corruption.
    proposal => mutateEntry(proposal, 'markdown:17', text => text.replace('1–4: U', '1–4: X')
      .replace('13–16: B', '13–16: U').replace('1–4: X', '1–4: B')),
    proposal => mutateEntry(proposal, 'markdown:15', text => text.replace('corner_T', 'other_T')),
    proposal => mutateEntry(proposal, 'span:18:160:0', text => text.replace('1', '3')),
    proposal => mutateEntry(proposal, 'span:14:8:0', text => text.replace('504', '576')),
    proposal => mutateEntry(proposal, 'span:16:6:0', () => 'steps Traducción'),
    proposal => mutateEntry(proposal, 'span:16:6:0', text => text + '\nprint(1)'),
  ];
  for (const [index, mutate] of negatives.entries()) {
    const broken = structuredClone(good); mutate(broken);
    check(() => assert.throws(() => gateMixingProposal({ locale: 'es', proposal: broken, source }),
      undefined, `Negative fixture ${index} was accepted`));
  }
  check(() => assert.throws(() => gateMixingProposal({ locale: 'ar', proposal: good, source }), /locale script/));
  check(() => assert.throws(() => gateMixingProposal({ locale: 'es', proposal: fixture('ja'), source }), /locale script/));
  check(() => assert.throws(() => gateMixingProposal({ locale: '../es', proposal: good, source }), /locale/));
  const nfd = structuredClone(good);
  mutateEntry(nfd, 'span:16:6:0', () => 'Traduccio\u0301n');
  check(() => assert.equal(gateMixingProposal({ locale: 'es', proposal: nfd, source }).entries
    .find(entry => entry.field === 'span:16:6:0').text, 'Traducción'));
  check(() => assert.deepEqual(mixingMarkdownKeeps(good.entries[2].text), mixingMarkdownKeeps(source.entries[2].text)));
  const temporary = mkdtempSync(path.join(tmpdir(), 'scirepl-mixing-translation-selftest-'));
  try {
    for (const locale of ['es', 'ar', 'bn']) {
      const proposal = fixture(locale);
      if (locale === 'bn') for (const field of ['span:16:6:0', 'span:18:78:0'])
        mutateEntry(proposal, field, () => 'ধাপ');
      const result = applyMixingProposal({ locale, proposal, campaignRoot: temporary });
      const book = JSON.parse(readFileSync(result.output));
      check(() => assertMixingPreservation(JSON.parse(mixingPinned(locale)), book));
      check(() => assert.equal(result.verification.derivedSpans, 27));
      check(() => assert.equal(result.verification.promoted, false));
      check(() => assert.equal(result.verification.requestsMadeByAdapter, 0));
      check(() => assert.equal(result.verification.targetSha256, mixingSha(readFileSync(result.output))));
      check(() => assert.equal(JSON.parse(readFileSync(result.manifestPath)).spans.length, 27));
      check(() => assert.equal(result.verification.runtimeReview, 'pending'));
      if (locale === 'bn') {
        check(() => assert(!/\p{L}\p{L}/u.test('ধাপ'), 'Fixture must exercise the scanner combining-mark gap'));
        for (const id of ['16:6:0', '18:78:0'])
          check(() => assert.equal(mixingTokenBody(book, id), 'ধাপ'));
        const derived = JSON.parse(readFileSync(result.manifestPath));
        check(() => assert.equal(derived.spans.filter(span => span.target_span.text === 'ধাপ').length, 2));
      }
      check(() => assert.throws(() => applyMixingProposal({ locale, proposal: fixture(locale), campaignRoot: temporary }), /already exist/));
    }
    for (const [field, text] of [['span:16:6:0', 'Traducción "x"'], ['span:16:6:0', 'Traducción \\q']]) {
      const broken = fixture('de'); mutateEntry(broken, field, () => text);
      const root = path.join(temporary, text.includes('"') ? 'quote-failure' : 'escape-failure');
      check(() => assert.throws(() => applyMixingProposal({ locale: 'de', proposal: broken, campaignRoot: root }), /span-apply/));
      check(() => assert(!existsSync(path.join(root, 'de/markov-groups.srwb'))));
    }
    check(() => assert.throws(() => applyMixingProposal({ locale: 'es', proposal: good,
      campaignRoot: path.join(source.repo, 'workbooks/forbidden-campaign') }), /catalog\/source/));
    check(() => assert.throws(() => applyMixingProposal({ locale: 'es', proposal: good,
      campaignRoot: source.repo }), /narrow directory/));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  check(() => assert.equal(mixingSha(readFileSync(source.sourcePath)), beforeSource));
  for (const locale of MIXING_LOCALES)
    check(() => assertMarkovMixingBaselineBytes(readFileSync(path.join(source.repo, 'workbooks', locale, 'markov-groups.srwb')), locale));
  const modulePath = path.join(source.repo, 'tools/markov-mixing-translation.mjs');
  check(() => assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(pathToFileURL(modulePath).href)})`], { encoding: 'utf8' }), ''));
  return checks;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(`${testMixingTranslation()} offline mixing adapter/protocol/preservation/negative checks passed; synthetic fixtures only, no model calls or catalog writes.`);
