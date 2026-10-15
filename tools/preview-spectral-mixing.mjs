#!/usr/bin/env node
// Read-only recorded-output preview; libraries come from a declared app checkout.
import http from 'node:http';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.resolve(process.env.SCIREPL_SPECTRAL_APP || '');
if (!process.env.SCIREPL_SPECTRAL_APP || !existsSync(path.join(app, 'www/js/bridge.js'))) throw Error('Set SCIREPL_SPECTRAL_APP');
const port = Number(process.env.SCIREPL_SPECTRAL_PREVIEW_PORT || '8132');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid preview port');
const source = readFileSync(path.join(root, 'drafts/markov-spectral-mixing/en/markov-spectral-mixing.srwb'));
const workbook = JSON.parse(source);
const sha256 = createHash('sha256').update(source).digest('hex');
const runtime = JSON.parse(readFileSync(path.resolve(root, process.env.SCIREPL_SPECTRAL_RUNTIME || 'reviews/spectral-mixing-english-20261013/iteration-5/runtime.json')));
const execution = JSON.parse(readFileSync(path.resolve(root, process.env.SCIREPL_SPECTRAL_EXECUTION || 'reviews/spectral-mixing-english-20261013/iteration-5/browser/execution.json')));
if (!runtime.allPassed || !execution.allPassed || runtime.candidateSha256 !== sha256 || execution.candidateSha256 !== sha256) throw Error('Preview requires matching green numerical and real-app execution records');
const preview = { workbook, cells: runtime.cells, plots: runtime.plots, sha256 };
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Markov Graphs — two-truck spectral mixing draft</title>
<link rel="stylesheet" href="/vendor/katex/katex.min.css"><link rel="stylesheet" href="/vendor/hljs/atom-one-dark.min.css">
<style>
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:var(--preview-header-height,100px)}body{margin:0;background:#10151b;color:#e6edf3;font:16px/1.65 system-ui,sans-serif}
header{position:sticky;top:0;z-index:10;background:#10151bf5;border-bottom:1px solid #39434d;padding:10px max(16px,calc((100vw - 960px)/2));display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:13px}a{color:#91caff}header a{min-height:36px;display:inline-flex;align-items:center}.badge{color:#ffd47a}main{max-width:960px;margin:24px auto;padding:0 16px 70px}
.notice{padding:16px;border:1px solid #725e33;background:#29251c;border-radius:10px;margin:0 0 24px}.cell{border:1px solid #39434d;border-radius:12px;margin:24px 0;padding:18px;background:#171e26;min-width:0;scroll-margin-top:12px}.cell-head{color:#a6b6c5;font:14px ui-monospace,monospace;margin-bottom:12px}.cell-head a{float:right}.markdown>:first-child{margin-top:0}.markdown img,.markdown svg{max-width:100%;height:auto}
table{border-collapse:collapse;display:block;overflow-x:auto}td,th{padding:7px 12px;border:1px solid #52606d;text-align:left}pre{overflow-x:auto;padding:12px;background:#10151b;font:13px/1.6 ui-monospace,monospace;border-radius:6px;tab-size:4;white-space:pre;font-variant-ligatures:none}code{font-variant-ligatures:none}.output{border-top:1px solid #39434d;margin-top:16px;padding-top:8px}.plot-container{min-width:0;width:100%;overflow:hidden}.katex-display{overflow-x:auto;overflow-y:hidden;padding:8px 0}details summary{cursor:pointer;padding:7px 0;color:#b7d4f2}.error{color:#ffabab}.end{color:#a6b6c5}
@media(max-width:480px){header{gap:6px;font-size:12px}main{padding:0 8px 40px}.cell{padding:10px}.cell-head{font-size:12px}pre{font-size:12px}}
</style></head><body><header><span class="badge">English draft</span><a href="#intro">Overview</a><a href="#joint_bridge">Routing rules</a><a href="#entropy_bridge">Entropy</a><a href="#clustering_bridge">Clustering</a><a href="#occupation_bridge">Visits</a><a href="#noise_bridge">Noise</a><a href="/markov-spectral-mixing.srwb" download>Download .srwb</a></header>
<main><aside class="notice"><strong>Markov Graphs: Spectral Mixing and Convergence.</strong> A read-only preview of the checked English draft: one truck, two trucks and a bottleneck. The ${runtime.plots.length} charts are recorded outputs from the exact source tested in SciREPL; this page does not run Python or make model requests. Translation and catalogue publication are pending. The existing Markov Groups lesson is unchanged.</aside><div id="cells">Loading checked workbook…</div><p class="end">Download the source workbook and import it separately in SciREPL to edit or run the experiments.</p></main>
<script src="/vendor/marked/marked.min.js"></script><script src="/vendor/katex/katex.min.js"></script><script src="/js/md_math.js"></script><script src="/vendor/hljs/highlight.min.js"></script><script src="/vendor/plotly/plotly-basic.min.js"></script><script src="/js/bridge.js"></script>
<script>
(async()=>{
 const data=await(await fetch('/preview-data.json')).json();
 const measureHeader=()=>document.documentElement.style.setProperty('--preview-header-height',(document.querySelector('header').getBoundingClientRect().height+12)+'px');
 measureHeader();new ResizeObserver(measureHeader).observe(document.querySelector('header'));
 window.__SPECTRAL_PREVIEW={sha256:data.sha256,pythonExecuted:false,recordedOutputs:true,ready:false};
 marked.use({extensions:MdMath.markedExtensions((tex,display)=>katex.renderToString(tex,{throwOnError:false,displayMode:display,trust:false}))});
 const root=document.getElementById('cells');root.replaceChildren();
 for(const[index,cell]of data.workbook.notebook.cells.entries()){
  const section=document.createElement('section');section.className='cell';section.id=cell.name;
  const heading=document.createElement('div');heading.className='cell-head';heading.textContent='Cell '+(index+1)+' · '+cell.name;
  const anchor=document.createElement('a');anchor.href='#'+cell.name;anchor.textContent='¶';heading.append(anchor);section.append(heading);
  if(cell.type==='markdown'){
   const markdown=document.createElement('div');markdown.className='markdown';const tokens=marked.lexer(cell.code);MdMath.transformTokens(tokens);markdown.innerHTML=marked.parser(tokens);
   markdown.querySelectorAll('script,iframe,object,embed,form').forEach(node=>node.remove());
   for(const node of markdown.querySelectorAll('*'))for(const attribute of[...node.attributes])if(attribute.name.toLowerCase().startsWith('on'))node.removeAttribute(attribute.name);
   section.append(markdown);
  }else{
   const details=document.createElement('details');details.open=cell.code.split('\\n').length<75;
   const summary=document.createElement('summary');summary.textContent='Python source'+(details.open?'':' · expand helper definitions');details.append(summary);
   const pre=document.createElement('pre'),code=document.createElement('code');code.className='language-python';code.textContent=cell.code;pre.append(code);details.append(pre);section.append(details);
   const record=data.cells[index],output=document.createElement('div'),body=document.createElement('div');output.className='output';body.className='card-body';output.append(body);
   if(record.output){const text=document.createElement('pre');text.textContent=record.output;body.append(text);}
   window._currentOutputCard=output;
   for(const plot of data.plots.slice(record.plotStart,record.plotStart+record.plotCount))renderPlot(JSON.stringify(plot));
   if(record.output||record.plotCount)section.append(output);
  }root.append(section);
 }
 for(const code of root.querySelectorAll('pre code'))hljs.highlightElement(code);
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 for(const plot of root.querySelectorAll('.js-plotly-plot'))Plotly.Plots.resize(plot);
 window.__SPECTRAL_PREVIEW.ready=true;
 if(location.hash)document.getElementById(location.hash.slice(1))?.scrollIntoView({block:'start'});
})().catch(error=>{document.getElementById('cells').textContent='Preview failed: '+error.message;console.error(error);});
</script></body></html>`;

const mime = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const server = http.createServer((request, response) => {
 const url = new URL(request.url, 'http://127.0.0.1:' + port);
 response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
 if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
 const finish = (type, data) => { response.writeHead(200, { 'Content-Type': type }); response.end(request.method === 'HEAD' ? '' : data); };
 if (url.pathname === '/') return finish('text/html; charset=utf-8', html);
 if (url.pathname === '/preview-data.json') return finish('application/json', JSON.stringify(preview));
 if (url.pathname === '/markov-spectral-mixing.srwb') {
  response.setHeader('Content-Disposition', 'attachment; filename="markov-spectral-mixing.srwb"'); return finish('application/json', source);
 }
 if (url.pathname.startsWith('/vendor/') || ['/js/bridge.js', '/js/md_math.js'].includes(url.pathname)) {
  const www = path.join(app, 'www'), target = path.resolve(www, '.' + decodeURIComponent(url.pathname));
  if (target.startsWith(www + path.sep) && existsSync(target)) return finish(mime[path.extname(target)] || 'application/octet-stream', readFileSync(target));
 }
 response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Not found');
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ url: 'http://localhost:' + port + '/#joint_bridge', sha256, cells: workbook.notebook.cells.length, plots: runtime.plots.length, mode: 'Read-only recorded-output preview' })));
