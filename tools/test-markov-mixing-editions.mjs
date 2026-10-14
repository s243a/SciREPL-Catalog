#!/usr/bin/env node
// Whole-current-artifact receipt gate. Old core receipts alone cannot approve
// an appended lesson, and numerical checks do not imply native prose approval.
import assert from 'node:assert/strict';
import path from 'node:path';
import{readFileSync}from'node:fs';
import{MIXING_PREDECESSOR,mixingRepo,mixingPinned,mixingSha,assertMixingPreservation}from'./markov-mixing-addendum.mjs';
import{MIXING_LOCALES,MIXING_ENGLISH_SHA256,loadMixingTranslationSource,gateMixingProposal,mixingTokenBody}from'./markov-mixing-translation.mjs';
import{assertRetainedMarkovHistory,MARKOV_MIXING_RETAINED_FIELDS,pinnedMarkovHistoryBytes}from'./markov-mixing-history.mjs';
const read=rel=>JSON.parse(readFileSync(path.join(mixingRepo,rel)));
const bytes=rel=>readFileSync(path.join(mixingRepo,rel));
const evidence='reviews/markov-mixing-locales-20261013';
const source=loadMixingTranslationSource();
assert.deepEqual(bytes('workbooks/en/markov-groups.srwb'),source.bytes);
const browserEvidence=evidence+'/browser-complete';
const runtime=read(evidence+'/runtime.json'),render=read(browserEvidence+'/rendering.json');
assert.equal(runtime.schema,'markov-mixing-editions-runtime-v1');assert.equal(runtime.allPassed,true);
assert.equal(render.schema,'markov-mixing-editions-browser-v1');assert.equal(render.allPassed,true);
assert.equal(runtime.englishSha256,MIXING_ENGLISH_SHA256);assert.equal(render.englishSha256,MIXING_ENGLISH_SHA256);
assert.equal(runtime.predecessorCommit,MIXING_PREDECESSOR);
assert.equal(render.provenance.runtimeReportSha256,mixingSha(bytes(evidence+'/runtime.json')));
assert.equal(render.provenance.runtimeReportPath,evidence+'/runtime.json');
assert.equal(source.fieldsSha256,runtime.provenance.translationFieldsSha256);
assert.equal(runtime.invariants.reachableOrderedPairs,504);assert.equal(runtime.invariants.maskedSameCubiePairs,72);
assert.equal(runtime.invariants.rowColumnReachableCounts,21);assert.equal(runtime.invariants.rowColumnGaps,3);
assert.equal(runtime.invariants.seed,20261007);assert.deepEqual(runtime.invariants.checkpoints,[100,1000,10000]);
assert.deepEqual(runtime.locales.map(record=>record.locale),['en',...MIXING_LOCALES]);
assert.equal(new Set(runtime.locales.map(record=>record.plots.protectedPayloadSha256)).size,1);
assert.equal(render.runs.length,26);assert.deepEqual(render.viewport,{width:320,height:844});
assert.deepEqual(render.themes,['light','dark']);
assert.equal(render.editions,13);
const priorRendering=read('reviews/markov-mixing-english-20261007/iteration-7/browser/rendering.json');
assert.equal(render.provenance.sourceApp.commit,priorRendering.appCommit);
assert.deepEqual(Object.keys(render.provenance.sourceApp.files).sort(),['www/index.html','www/js/app.js','www/js/file_io.js','www/js/bridge.js',
  'www/js/prelude.py','www/vendor/plotly/plotly-basic.min.js','www/vendor/katex/katex.min.js'].sort());
assert.deepEqual(render.provenance.sourceApp.servedFiles,render.provenance.sourceApp.files);
for(const digest of Object.values(render.provenance.sourceApp.files))assert.match(digest,/^[a-f0-9]{64}$/);
for(const[file,digest]of Object.entries(priorRendering.appFiles))assert.equal(render.provenance.sourceApp.files[file],digest);
const reviewFont=render.provenance.reviewFont;assert(reviewFont);
assert.deepEqual(Object.keys(reviewFont).sort(),['fontConfigSha256','fontFamily','fontSha256','scope'].sort());
assert.equal(reviewFont.fontFamily,'MalgunGothic');assert.equal(reviewFont.scope,'Test environment glyph fallback only; no font asset shipped');
assert.match(reviewFont.fontConfigSha256,/^[a-f0-9]{64}$/);assert.match(reviewFont.fontSha256,/^[a-f0-9]{64}$/);
let editions=0,images=0,requests=0;
for(const locale of ['en',...MIXING_LOCALES]){
  const rel=`workbooks/${locale}/markov-groups.srwb`,data=bytes(rel),book=JSON.parse(data),sha=mixingSha(data);
  assertMixingPreservation(JSON.parse(mixingPinned(locale)),book);
  const record=read(`reviews/examples/${locale}/markov-groups.json`),update=record.mixingUpdate;
  assert(update,'Missing separate full19-cell receipt');
  assertRetainedMarkovHistory(record,locale);
  assert.equal(update.schema,'markov-mixing-update-v1');assert.equal(update.predecessorCommit,MIXING_PREDECESSOR);
  assert.equal(update.sourceSha256,MIXING_ENGLISH_SHA256);assert.equal(update.targetSha256,sha);
  assert.equal(record.target.sha256,sha);assert.equal(record.source.sha256,MIXING_ENGLISH_SHA256);
  assert.equal(update.predecessorTargetSha256,mixingSha(mixingPinned(locale)));
  assert.equal(update.predecessorSourceSha256,mixingSha(mixingPinned('en')));
  assert.equal(update.cells,19);assert.equal(update.preservedCoreCells,13);
  assert.deepEqual(update.appendedCells,['mixing_bridge','mixing_setup','visit_bridge','sticker_visits','joint_bridge','joint_visits']);
  assert.deepEqual(update.historicalEvidence.retainedFields,MARKOV_MIXING_RETAINED_FIELDS);
  assert.equal(update.historicalEvidence.predecessorReceiptSha256,mixingSha(pinnedMarkovHistoryBytes(`reviews/examples/${locale}/markov-groups.json`)));
  for(const report of [update.runtime,update.rendering])assert.equal(mixingSha(bytes(report.path)),report.sha256);
  assert.equal(update.runtime.path,evidence+'/runtime.json');assert.equal(update.rendering.path,browserEvidence+'/rendering.json');
  const numeric=runtime.locales.find(item=>item.locale===locale),runs=render.runs.filter(item=>item.locale===locale);
  assert.equal(numeric.targetSha256,sha);assert.equal(numeric.cells,19);assert.equal(numeric.movesExecuted,10000);
  assert.deepEqual(numeric.plots.histogramBars,[24,24,24]);assert.deepEqual(numeric.plots.heatmapTiles,[504,504,504]);
  assert.deepEqual(numeric.plots.cellEdgeShapes,[50,50,50]);assert.equal(numeric.snapshots.length,3);
  assert.deepEqual(runs.map(run=>run.theme),['light','dark']);
  for(const run of runs){
    assert.equal(run.targetSha256,sha);assert.equal(run.plots.count,6);
    assert.deepEqual(run.viewport,{width:320,height:844});assert.deepEqual(run.importReceipt,{cells:19,size:data.length,sha256:sha});
    assert.equal(run.plots.protectedPayloadSha256,numeric.plots.protectedPayloadSha256);
    assert.equal(run.roundTrip.exactSourceProjection,true);assert.equal(run.roundTrip.cells,19);
    assert.equal(run.core.svgs.length,2);assert.equal(run.core.katex,4);assert.equal(run.core.katexErrors,0);
    for(const svg of run.core.svgs){assert.equal(svg.unsafe,0);assert.equal(svg.external,false);assert(svg.width>0&&svg.width<=svg.bodyWidth+1);assert(svg.title&&svg.description);}
    for(const key of ['pageErrors','consoleErrors','externalRequests','modelRequests','webSockets'])assert.deepEqual(run[key],[]);
    assert.equal(run.plots.rendering.length,6);
    for(const[plotIndex,plot]of run.plots.rendering.entries()){assert.equal(plot.index,plotIndex);assert.deepEqual(plot.clipped,[]);assert.deepEqual(plot.overlaps,[]);
      assert.equal(plot.bars,plot.index<3?24:504);if(plot.index>=3){assert.equal(plot.shapes,50);
        for(const ticks of [plot.xTicks,plot.yTicks])assert.deepEqual(ticks,['1','5','9','13','17','21','24']);}}
    assert.equal(run.screenshots.length,6);
    for(const[imageIndex,image]of run.screenshots.entries()){assert.equal(image.path,`${browserEvidence}/${locale}/${run.theme}/plot-${imageIndex}.png`);
      assert.equal(mixingSha(bytes(image.path)),image.sha256);images++;}
  }
  for(const candidate of source.fields.protectedCandidates)assert.equal(mixingTokenBody(book,candidate.id),candidate.text);
  if(locale!=='en'){
    assert.equal(update.nativeSpeakerReview,'pending');
    const proof=update.translation;assert(proof);assert.equal(mixingSha(bytes(proof.path)),proof.sha256);
    assert.equal(proof.path,`${evidence}/translations/${locale}.json`);
    const prose=read(proof.path);assert.equal(prose.schema,'markov-mixing-prose-review-v1');assert.equal(prose.status,'passed');
    assert.equal(prose.locale,locale);assert.equal(prose.englishSha256,MIXING_ENGLISH_SHA256);assert.equal(prose.targetSha256,sha);
    assert.equal(prose.fieldsSha256,source.fieldsSha256);assert.equal(prose.nativeSpeakerReview,'pending');
    assert.equal(mixingSha(JSON.stringify(prose.proposal,null,2)+'\n'),prose.proposalSha256);
    const normalized=gateMixingProposal({locale,proposal:prose.proposal,source});assert.deepEqual(normalized,prose.proposal);
    for(const entry of normalized.entries){if(entry.field.startsWith('markdown:'))assert.equal(book.notebook.cells[+entry.field.split(':')[1]].code,entry.text);
      else assert.equal(mixingTokenBody(book,entry.field.slice(5)),entry.text);}
    assert(prose.modelProseApproved===true||prose.controllerProseReviewed===true);
    for(const key of ['method','requests','modelProseApproved','controllerProseReviewed'])assert.deepEqual(prose[key],numeric.staticGate.review[key]);
    assert.deepEqual(prose.runtimeReview,numeric.staticGate.review);
    const copyMap=new Map();
    for(const copy of prose.inputCopies){
      assert.equal(copy.path,`${evidence}/inputs/${locale}/${path.posix.basename(copy.sourcePath)}`);
      assert(copy.sourcePath.startsWith(`reviews/translations/markov-mixing-20261013/${locale}/`)&&!copy.sourcePath.includes('/../'));
      assert(!copyMap.has(copy.sourcePath));assert.equal(mixingSha(bytes(copy.path)),copy.sha256);copyMap.set(copy.sourcePath,copy);
    }
    const copiedInput=sourcePath=>{const copy=copyMap.get(sourcePath);assert(copy,'Missing source-bound public input');return {copy,value:read(copy.path)};};
    for(const input of numeric.staticGate.review.evidence){assert.equal(prose.localEvidenceHashes[input.path],input.sha256,'Public review differs from runtime-reviewed input');
      assert.equal(copiedInput(input.path).copy.sha256,input.sha256,'Runtime-reviewed input copy changed');}
    const completed=copiedInput(`reviews/translations/markov-mixing-20261013/${locale}/mixing.completed.json`);
    assert.equal(completed.copy.sha256,numeric.staticGate.completedSha256);
    assert.equal(completed.value.fieldsSha256,source.fieldsSha256);
    assert.equal(completed.value.model,prose.model);
    for(const key of ['method','requests','modelProseApproved'])assert.deepEqual(completed.value[key],prose[key]);
    assert.equal(completed.value.controllerProseReviewed===true,prose.controllerProseReviewed);
    assert.equal(completed.value.controllerCorrections||0,numeric.staticGate.review.controllerCorrections);
    const controllerPath=`reviews/translations/markov-mixing-20261013/${locale}/mixing.controller.proposal.json`;
    const modelReviewPath=`reviews/translations/markov-mixing-20261013/${locale}/mixing.review.proposal.json`;
    const selected=copyMap.has(controllerPath)?copiedInput(controllerPath):copiedInput(modelReviewPath);
    assert.equal(selected.copy.sha256,prose.savedProposalSha256);
    assert.deepEqual(gateMixingProposal({locale,proposal:selected.value,source}),prose.proposal);
    for(const[prop,name]of [['controllerCorrections','mixing.controller-correction.json'],['controllerProvenance','mixing.controller.provenance.json']]){
      if(prose[prop])assert.deepEqual(copiedInput(`reviews/translations/markov-mixing-20261013/${locale}/${name}`).value,prose[prop]);}
    if(prose.controllerCorrections){const changes=prose.controllerCorrections.changes||prose.controllerCorrections.corrections;
      assert.equal(Array.isArray(changes)?changes.length:1,numeric.staticGate.review.controllerCorrections);}
    if(prose.controllerProvenance){const provenance=prose.controllerProvenance;
      assert.equal(provenance.schema,numeric.staticGate.review.controllerReviewSchema);
      const fallback=provenance.schema==='markov-mixing-controller-fallback-v1';
      assert.equal(fallback?provenance.fields:provenance.changedFields.length,numeric.staticGate.review.controllerChangedFields);
      assert.equal(fallback?provenance.fields:provenance.changes.length,numeric.staticGate.review.controllerChanges);}
    if(prose.controllerProvenance?.failurePath){const failure=copiedInput(prose.controllerProvenance.failurePath);
      assert.equal(failure.copy.sha256,prose.localEvidenceHashes[prose.controllerProvenance.failurePath]);}
    if(prose.draftProposalSha256)assert.equal(copiedInput(`reviews/translations/markov-mixing-20261013/${locale}/mixing.draft.proposal.json`).copy.sha256,prose.draftProposalSha256);
    if(prose.modelReviewProposalSha256)assert.equal(copiedInput(modelReviewPath).copy.sha256,prose.modelReviewProposalSha256);
    if(prose.modelProseApproved!==true)assert(prose.controllerCorrections||prose.controllerProvenance,'Controller review needs explicit evidence');
    assert.deepEqual(prose.maximumRequests,{draft:1,freshReview:1,repair:0});
    assert.equal(prose.requests.draft,1);assert([0,1].includes(prose.requests.freshReview));assert.equal(prose.requests.repair,0);
    if(prose.requests.freshReview===0){assert.equal(prose.modelProseApproved,false);assert.equal(prose.controllerProseReviewed,true);}
    requests+=prose.requests.draft+prose.requests.freshReview;
    const audit=record.translation.contentAudit;
    assert.equal(audit.mixingProvenance.path,proof.path);assert.equal(audit.mixingProvenance.sha256,proof.sha256);
    assert.equal(audit.mixingProvenance.modelProseApproved,prose.modelProseApproved);
    assert.equal(audit.mixingProvenance.controllerProseReviewed,prose.controllerProseReviewed);
  }else assert.equal(update.nativeSpeakerReview,'not-applicable');
  editions++;
}
assert.equal(editions,13);assert.equal(images,156);assert.equal(requests,23);
const catalog=read('scirepl-catalog.json'),previousCatalog=JSON.parse(pinnedMarkovHistoryBytes('scirepl-catalog.json'));
const restored=structuredClone(catalog);
for(const locale of ['en',...MIXING_LOCALES]){
  const rel=`workbooks/${locale}/markov-groups.srwb`,item=catalog.items.find(item=>item.path===rel),previous=previousCatalog.items.find(item=>item.path===rel);
  assert(item&&previous);assert.equal(item.id,previous.id);assert.equal(item.revision,7);assert.equal(item.sha256,mixingSha(bytes(rel)));assert.equal(item.size,bytes(rel).length);
  const restoredItem=restored.items.find(candidate=>candidate.id===item.id);
  for(const key of ['revision','sha256','size'])restoredItem[key]=previous[key];
}
assert.deepEqual(restored,previousCatalog,'Unrelated catalog item or global metadata changed');
console.log(`Full19-cell proof: ${editions} editions,26 real-app profiles,${images} source-bound plot captures,${requests} bounded model calls; native review pending.`);
