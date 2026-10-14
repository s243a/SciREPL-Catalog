#!/usr/bin/env node
// Controller-only promotion, after final-byte runtime and browser gates.
// No model dispatch or git operations. Historical proof objects stay intact.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {mixingRepo,mixingPinned,mixingSha,MIXING_PREDECESSOR,assertMixingPreservation} from './markov-mixing-addendum.mjs';
import {MIXING_LOCALES,MIXING_ENGLISH_SHA256,loadMixingTranslationSource,gateMixingProposal,mixingTokenBody} from './markov-mixing-translation.mjs';
import {MARKOV_MIXING_RETAINED_FIELDS,pinnedMarkovHistoryBytes} from './markov-mixing-history.mjs';
assert.deepEqual(process.argv.slice(2),['--apply'],'Explicit --apply required; this is not a translation worker');
const campaign='reviews/translations/markov-mixing-20261013';
const evidence='reviews/markov-mixing-locales-20261013';
const read=rel=>JSON.parse(readFileSync(path.join(mixingRepo,rel)));
const bytes=rel=>readFileSync(path.join(mixingRepo,rel));
const save=(rel,value,exclusive=false)=>{const file=path.join(mixingRepo,rel);mkdirSync(path.dirname(file),{recursive:true});
  writeFileSync(file,JSON.stringify(value,null,2)+'\n',exclusive?{flag:'wx'}:{});};
const browserEvidence=evidence+'/browser-complete';
const source=loadMixingTranslationSource(),runtime=read(evidence+'/runtime.json'),render=read(browserEvidence+'/rendering.json');
assert.equal(runtime.schema,'markov-mixing-editions-runtime-v1');assert.equal(runtime.predecessorCommit,MIXING_PREDECESSOR);
assert.equal(render.schema,'markov-mixing-editions-browser-v1');
assert.equal(runtime.allPassed,true);assert.equal(render.allPassed,true);
assert.equal(runtime.englishSha256,MIXING_ENGLISH_SHA256);assert.equal(render.englishSha256,MIXING_ENGLISH_SHA256);
assert.deepEqual(runtime.locales.map(record=>record.locale),['en',...MIXING_LOCALES]);
assert.equal(render.runs.length,26);assert.deepEqual(render.viewport,{width:320,height:844});
assert.deepEqual(render.themes,['light','dark']);assert.equal(render.editions,13);
assert.equal(render.provenance.runtimeReportSha256,mixingSha(bytes(evidence+'/runtime.json')));
assert.equal(render.provenance.runtimeReportPath,evidence+'/runtime.json');
assert.equal(source.fieldsSha256,runtime.provenance.translationFieldsSha256);
const priorRendering=read('reviews/markov-mixing-english-20261007/iteration-7/browser/rendering.json');
assert.equal(render.provenance.sourceApp.commit,priorRendering.appCommit);
const appFiles=render.provenance.sourceApp.files;
assert.deepEqual(Object.keys(appFiles).sort(),['www/index.html','www/js/app.js','www/js/file_io.js','www/js/bridge.js','www/js/prelude.py',
  'www/vendor/plotly/plotly-basic.min.js','www/vendor/katex/katex.min.js'].sort());
assert.deepEqual(render.provenance.sourceApp.servedFiles,appFiles);
for(const digest of Object.values(appFiles))assert.match(digest,/^[a-f0-9]{64}$/);
for(const[file,digest]of Object.entries(priorRendering.appFiles))assert.equal(appFiles[file],digest);
const reviewFont=render.provenance.reviewFont;assert(reviewFont,'Missing readable Korean-glyph test environment proof');
assert.deepEqual(Object.keys(reviewFont).sort(),['fontConfigSha256','fontFamily','fontSha256','scope'].sort());
assert.equal(reviewFont.fontFamily,'MalgunGothic');assert.equal(reviewFont.scope,'Test environment glyph fallback only; no font asset shipped');
assert.match(reviewFont.fontConfigSha256,/^[a-f0-9]{64}$/);assert.match(reviewFont.fontSha256,/^[a-f0-9]{64}$/);
const items=read('scirepl-catalog.json');
assert.deepEqual(bytes('scirepl-catalog.json'),pinnedMarkovHistoryBytes('scirepl-catalog.json'),'Current index changed; refuse all writes');
const originals=structuredClone(items),updates=[],translationRecords=[],inputRecords=[];
for(const locale of ['en',...MIXING_LOCALES]){
  const targetPath=`workbooks/${locale}/markov-groups.srwb`;
  assert.deepEqual(bytes(targetPath),mixingPinned(locale),'Only exact reviewed predecessors may be promoted');
  const targetBytes=locale==='en'?source.bytes:bytes(`${campaign}/${locale}/markov-groups.srwb`),book=JSON.parse(targetBytes),targetSha=mixingSha(targetBytes);
  assertMixingPreservation(JSON.parse(mixingPinned(locale)),book);
  const numeric=runtime.locales.find(record=>record.locale===locale),runs=render.runs.filter(record=>record.locale===locale);
  assert.equal(numeric.targetSha256,targetSha);assert.equal(numeric.cells,19);assert.equal(numeric.plots.count,6);
  assert.deepEqual(runs.map(record=>record.theme),['light','dark']);
  for(const run of runs){assert.equal(run.targetSha256,targetSha);assert.equal(run.roundTrip.exactSourceProjection,true);
    assert.equal(run.roundTrip.cells,19);assert.deepEqual(run.viewport,{width:320,height:844});
    assert.deepEqual(run.importReceipt,{cells:19,size:targetBytes.length,sha256:targetSha});
    for(const key of ['pageErrors','consoleErrors','externalRequests','modelRequests','webSockets'])assert.deepEqual(run[key],[]);
    assert.equal(run.plots.count,6);assert.equal(run.plots.protectedPayloadSha256,numeric.plots.protectedPayloadSha256);
    assert.equal(run.plots.rendering.length,6);assert.equal(run.screenshots.length,6);
    assert.equal(run.core.svgs.length,2);assert.equal(run.core.katex,4);assert.equal(run.core.katexErrors,0);
    for(const svg of run.core.svgs){assert.equal(svg.unsafe,0);assert.equal(svg.external,false);assert(svg.width>0&&svg.width<=svg.bodyWidth+1);assert(svg.title&&svg.description);}
    for(const[plotIndex,plot]of run.plots.rendering.entries()){
      assert.equal(plot.index,plotIndex);assert.equal(plot.bars,plotIndex<3?24:504);
      assert.deepEqual(plot.clipped,[]);assert.deepEqual(plot.overlaps,[]);
      if(plotIndex>=3){assert.equal(plot.shapes,50);for(const ticks of [plot.xTicks,plot.yTicks])assert.deepEqual(ticks,['1','5','9','13','17','21','24']);}
    }
    for(const[imageIndex,image]of run.screenshots.entries()){
      assert.equal(image.path,`${browserEvidence}/${locale}/${run.theme}/plot-${imageIndex}.png`);
      assert.equal(mixingSha(bytes(image.path)),image.sha256);}}
  const review=JSON.parse(pinnedMarkovHistoryBytes(`reviews/examples/${locale}/markov-groups.json`));
  assert.deepEqual(bytes(`reviews/examples/${locale}/markov-groups.json`),pinnedMarkovHistoryBytes(`reviews/examples/${locale}/markov-groups.json`),
    'Current review receipt changed; do not overwrite unrelated edits');
  const previousReview=structuredClone(review);
  review.source.sha256=MIXING_ENGLISH_SHA256;review.target.sha256=targetSha;review.target.size=targetBytes.length;
  let translationPath=null,translationSha=null;
  if(locale!=='en'){
    const directory=`${campaign}/${locale}`;
    const completed=read(directory+'/mixing.completed.json');assert.equal(completed.status,'static-gates-passed');
    assert.equal(completed.fieldsSha256,source.fieldsSha256);
    assert.equal(mixingSha(bytes(directory+'/mixing.completed.json')),numeric.staticGate.completedSha256);
    const verificationPath=completed.applicationVerificationPath||directory+'/mixing-application/verification.json';
    const applicationDirectory=path.posix.dirname(verificationPath);
    assert.equal(mixingSha(bytes(verificationPath)),numeric.staticGate.verificationSha256);
    assert.equal(mixingSha(bytes(applicationDirectory+'/derived.json')),numeric.staticGate.derivedSha256);
    for(const input of numeric.staticGate.review.evidence)assert.equal(mixingSha(bytes(input.path)),input.sha256,'Review input changed after runtime');
    for(const key of ['method','requests','modelProseApproved'])assert.deepEqual(completed[key],numeric.staticGate.review[key]);
    assert.equal(completed.controllerProseReviewed===true,numeric.staticGate.review.controllerProseReviewed);
    assert.equal(completed.controllerCorrections||0,numeric.staticGate.review.controllerCorrections);
    assert.equal(completed.targetSha256,targetSha);assert.equal(completed.nativeSpeakerReview,'pending');
    const proposalPath=existsSync(path.join(mixingRepo,directory+'/mixing.controller.proposal.json'))
      ? directory+'/mixing.controller.proposal.json':directory+'/mixing.review.proposal.json';
    const proposal=gateMixingProposal({locale,proposal:read(proposalPath),source});
    for(const entry of proposal.entries){if(entry.field.startsWith('markdown:'))
      assert.equal(book.notebook.cells[Number(entry.field.split(':')[1])].code,entry.text);
      else assert.equal(mixingTokenBody(book,entry.field.slice(5)),entry.text);}
    const draftPath=directory+'/mixing.draft.proposal.json',modelReviewPath=directory+'/mixing.review.proposal.json';
    const correctionPath=directory+'/mixing.controller-correction.json',provenancePath=directory+'/mixing.controller.provenance.json';
    if(existsSync(path.join(mixingRepo,correctionPath))){const correction=read(correctionPath);
      const changes=correction.changes||correction.corrections;
      assert.equal(Array.isArray(changes)?changes.length:1,numeric.staticGate.review.controllerCorrections);}
    if(existsSync(path.join(mixingRepo,provenancePath))){const provenance=read(provenancePath);
      assert.equal(provenance.schema,numeric.staticGate.review.controllerReviewSchema);
      const fallback=provenance.schema==='markov-mixing-controller-fallback-v1';
      assert.equal(fallback?provenance.fields:provenance.changedFields.length,numeric.staticGate.review.controllerChangedFields);
      assert.equal(fallback?provenance.fields:provenance.changes.length,numeric.staticGate.review.controllerChanges);}
    const evidenceFiles=Object.fromEntries(['mixing.started.json','mixing.draft.dispatched.json','mixing.review.dispatched.json',
      'mixing.draft.transport.json','mixing.review.transport.json','mixing.failed.json'].map(name=>directory+'/'+name)
      .filter(rel=>existsSync(path.join(mixingRepo,rel))).map(rel=>[rel,mixingSha(bytes(rel))]));
    for(const input of numeric.staticGate.review.evidence)evidenceFiles[input.path]=input.sha256;
    const safeInputs=new Set([directory+'/mixing.started.json',directory+'/mixing.completed.json',proposalPath,
      ...numeric.staticGate.review.evidence.map(input=>input.path),
      ...[draftPath,modelReviewPath,directory+'/mixing.failed.json'].filter(rel=>existsSync(path.join(mixingRepo,rel)))]);
    const inputCopies=[];
    for(const sourcePath of safeInputs){
      assert(sourcePath.startsWith(directory+'/'));assert(!sourcePath.includes('/../'));
      const inputBytes=bytes(sourcePath);JSON.parse(inputBytes);
      assert(!inputBytes.toString('utf8').includes('/home/')&&!inputBytes.toString('utf8').includes('/mnt/c/'),'Private host path in public JSON proof');
      const inputPath=`${evidence}/inputs/${locale}/${path.posix.basename(sourcePath)}`;
      assert(!inputCopies.some(input=>input.path===inputPath));
      inputCopies.push({sourcePath,path:inputPath,sha256:mixingSha(inputBytes)});
      inputRecords.push({path:inputPath,bytes:inputBytes});
    }
    const compact={schema:'markov-mixing-prose-review-v1',locale,englishSha256:MIXING_ENGLISH_SHA256,targetSha256:targetSha,
      fieldsSha256:source.fieldsSha256,predecessorCommit:MIXING_PREDECESSOR,status:'passed',
      method:completed.method,model:completed.model,modelProseApproved:completed.modelProseApproved,
      controllerProseReviewed:completed.controllerProseReviewed===true,requests:completed.requests,maximumRequests:completed.maximumRequests,
      nativeSpeakerReview:'pending',caveat:'Machine-translated or controller-authored fallback; native-speaker review pending. Structural/numerical/render checks are not language certification.',
      proposal,proposalSha256:mixingSha(JSON.stringify(proposal,null,2)+'\n'),savedProposalSha256:mixingSha(bytes(proposalPath)),
      ...(existsSync(path.join(mixingRepo,draftPath))?{draftProposalSha256:mixingSha(bytes(draftPath))}:{}),
      ...(existsSync(path.join(mixingRepo,modelReviewPath))?{modelReviewProposalSha256:mixingSha(bytes(modelReviewPath))}:{}),
      ...(existsSync(path.join(mixingRepo,correctionPath))?{controllerCorrections:read(correctionPath)}:{}),
      ...(existsSync(path.join(mixingRepo,provenancePath))?{controllerProvenance:read(provenancePath)}:{}),
      localEvidenceHashes:evidenceFiles,inputCopies,runtimeReview:structuredClone(numeric.staticGate.review)};
    assert(compact.modelProseApproved===true||compact.controllerProseReviewed,'No prose review declared');
    translationPath=`${evidence}/translations/${locale}.json`;translationRecords.push({path:translationPath,value:compact});
    translationSha=mixingSha(JSON.stringify(compact,null,2)+'\n');
    // Regenerate the WHOLE current manifest, not only the newly appended spans.
    const temporaryTarget=path.join(mixingRepo,campaign,locale,'markov-groups.srwb');
    const manifest=JSON.parse(execFileSync(process.execPath,[path.join(mixingRepo,'tools/span-derive.mjs'),source.sourcePath,temporaryTarget,locale],
      {cwd:mixingRepo,encoding:'utf8',maxBuffer:16*1024*1024}));
    manifest.source.path='workbooks/en/markov-groups.srwb';manifest.target.path=targetPath;
    review.translation.manifest=manifest;
    const kept=new Map(review.translation.keeps.ids.map((id,index)=>[id,review.translation.keeps.texts[index]]));
    for(const candidate of source.fields.protectedCandidates)kept.set(candidate.id,candidate.text);
    review.translation.keeps={ids:[...kept.keys()],texts:[...kept.values()]};
    review.translation.policy.protectedIds=[...new Set([...review.translation.policy.protectedIds,...source.fields.protectedCandidates.map(c=>c.id)])];
    review.translation.policy.protectedTexts=[...new Set([...review.translation.policy.protectedTexts,...source.fields.protectedCandidates.map(c=>c.text)])];
    review.translation.nativeSpeakerReview='pending';
    const audit=review.translation.contentAudit;
    audit.sourceSha256=MIXING_ENGLISH_SHA256;audit.targetSha256=targetSha;
    audit.reviewMethod='Historical 13-cell audit retained; only new three Markdown fields and27 prose spans received the separately recorded bounded review/controller corrections.';
    audit.mixingProvenance={path:translationPath,sha256:translationSha,method:compact.method,
      modelProseApproved:compact.modelProseApproved,controllerProseReviewed:compact.controllerProseReviewed,nativeSpeakerReview:'pending'};
  }
  review.mixingUpdate={schema:'markov-mixing-update-v1',predecessorCommit:MIXING_PREDECESSOR,
    predecessorSourceSha256:mixingSha(mixingPinned('en')),predecessorTargetSha256:mixingSha(mixingPinned(locale)),
    sourceSha256:MIXING_ENGLISH_SHA256,targetSha256:targetSha,cells:19,preservedCoreCells:13,
    appendedCells:book.notebook.cells.slice(13).map(cell=>cell.name),
    historicalEvidence:{retainedFields:MARKOV_MIXING_RETAINED_FIELDS,predecessorReceiptSha256:mixingSha(pinnedMarkovHistoryBytes(`reviews/examples/${locale}/markov-groups.json`))},
    runtime:{path:evidence+'/runtime.json',sha256:mixingSha(bytes(evidence+'/runtime.json'))},
    rendering:{path:browserEvidence+'/rendering.json',sha256:mixingSha(bytes(browserEvidence+'/rendering.json'))},
    ...(translationPath?{translation:{path:translationPath,sha256:translationSha}}:{}),nativeSpeakerReview:locale==='en'?'not-applicable':'pending'};
  for(const field of MARKOV_MIXING_RETAINED_FIELDS)assert.deepEqual(review[field],previousReview[field]);
  const item=items.items.find(item=>item.path===targetPath);assert(item);assert.equal(item.revision,6);item.revision=7;item.sha256=targetSha;item.size=targetBytes.length;
  updates.push({targetPath,targetBytes,reviewPath:`reviews/examples/${locale}/markov-groups.json`,review});
}
assert.equal(updates.length,13);assert.equal(translationRecords.length,12);
for(const item of originals.items.filter(item=>!updates.some(update=>update.targetPath===item.path)))
  assert.deepEqual(items.items.find(next=>next.id===item.id),item,'Unrelated catalog item changed');
// No writes until every locale, source pin, receipt and image has validated.
for(const record of translationRecords)assert(!existsSync(path.join(mixingRepo,record.path)),'Exclusive proof destination already exists; refuse all writes');
for(const record of inputRecords)assert(!existsSync(path.join(mixingRepo,record.path)),'Exclusive input copy already exists; refuse all writes');
for(const record of inputRecords){const destination=path.join(mixingRepo,record.path);mkdirSync(path.dirname(destination),{recursive:true});writeFileSync(destination,record.bytes,{flag:'wx'});}
for(const record of translationRecords)save(record.path,record.value,true);
for(const update of updates){writeFileSync(path.join(mixingRepo,update.targetPath),update.targetBytes);save(update.reviewPath,update.review);}
save('scirepl-catalog.json',items);
console.log('Promoted13 final-byte19-cell editions with exact historicalcores; revisions6→7; no tags/appchanges.');
