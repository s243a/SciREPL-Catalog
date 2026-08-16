#!/usr/bin/env node
// mcp-run.mjs — import a workbook from the catalog root, Run All, export the
// post-run canonical srwb. Usage:
//   node mcp-run.mjs <catalog-relative-path> <out-file>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , relPath, outFile] = process.argv;
const TOKEN = readFileSync('/home/s243a/scirepl-broker/broker-token', 'utf8').trim();
const URL_ = 'http://127.0.0.1:8088/mcp';
let id = 0;

async function rpc(method, params) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const text = await res.text();
  // SSE framing: take the last data: line
  const dataLines = text.split('\n').filter(l => l.startsWith('data: '));
  const payload = dataLines.length ? dataLines[dataLines.length - 1].slice(6) : text;
  const msg = JSON.parse(payload);
  if (msg.error) throw new Error(`${method}: ${JSON.stringify(msg.error)}`);
  return msg.result;
}

const call = async (name, args) => {
  const r = await rpc('tools/call', { name, arguments: args });
  const texts = (r.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (r.isError) throw new Error(`${name} failed: ${texts.slice(0, 500)}`);
  return texts;
};

await rpc('initialize', {
  protocolVersion: '2025-03-26', capabilities: {},
  clientInfo: { name: 'pilot-gate', version: '1.0' },
});

console.error('[1/3] import', relPath);
// inline import (the broker-side file-transfer tools live in unmerged PR #7;
// inline was verified byte-identical to the file path on this bench)
const wbContent = readFileSync('/home/s243a/Projects/SciREPL-Catalog/' + relPath, 'utf8');
const importFormat = relPath.endsWith('.ipynb') ? 'ipynb' : 'srwb';
console.error((await call('import_workbook', {
  format: importFormat, content: wbContent, mode: 'replace',
})).slice(0, 200));

console.error('[2/3] run all cells');
const runRes = await call('run_cells', {});
console.error(runRes.slice(0, 600));

console.error('[3/3] export post-run srwb');
const exp = await call('export_workbook', { format: 'srwb' });
// envelope: JSON with content field, or raw
let content = exp;
try {
  const env = JSON.parse(exp);
  if (typeof env.content === 'string') content = env.content;
} catch {}
writeFileSync(outFile, content);
console.error(`wrote ${outFile} (${content.length} bytes)`);
