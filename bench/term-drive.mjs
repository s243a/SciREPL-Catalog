#!/usr/bin/env node
// term-drive.mjs — attach to the SciREPL-MCP broker /term PTY, optionally send
// input, capture output for a window, print it ANSI-stripped, keep the session
// alive on exit (the broker holds the PTY across reconnects).
//
//   node term-drive.mjs --url ws://H:8087/term --token-file F [--start agy]
//        [--send 'text']      # text + Enter
//        [--send-raw 'y']     # exact bytes, no Enter
//        [--read-ms 8000] [--dump raw.log] [--stop]

import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/s243a/Projects/SciREPL-MCP/packages/broker/package.json');
const WebSocket = require('ws');

const argIdx = (n) => process.argv.indexOf(`--${n}`);
const arg = (n, d) => { const i = argIdx(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => argIdx(n) !== -1;

const TOKEN = fs.readFileSync(arg('token-file'), 'utf8').trim();
const READ_MS = Number(arg('read-ms', 8000));
const DUMP = arg('dump', null);
const START = arg('start', 'agy');

const ws = new WebSocket(arg('url'));
let raw = '';
const finish = (code) => {
  if (DUMP) fs.appendFileSync(DUMP, raw);
  // Strip ANSI/OSC sequences and control chars for the readable view.
  const clean = raw
    .replace(/\][^]*(|\\)/g, '')
    .replace(/\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/[=>NOc]/g, '')
    .replace(/\r/g, '');
  process.stdout.write(clean);
  try { ws.close(); } catch {}
  process.exit(code);
};

ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', token: TOKEN })));
ws.on('error', (e) => { console.error('[term] ws error: ' + e.message); process.exit(1); });

let readTimer = null;
const armRead = () => { if (readTimer) clearTimeout(readTimer); readTimer = setTimeout(() => finish(0), READ_MS); };

ws.on('message', (buf) => {
  let m; try { m = JSON.parse(buf.toString()); } catch { return; }
  if (m.type !== 'term') return;
  switch (m.kind) {
    case 'welcome':
      console.error(`[term] welcome; cmds=${(m.cmds || []).join(',')}`);
      ws.send(JSON.stringify({ type: 'start', cmd: START, cols: 120, rows: 40 }));
      break;
    case 'started': {
      console.error(`[term] '${m.cmd}' ${m.reattached ? 'reattached' : 'started'}`);
      if (has('stop')) { ws.send(JSON.stringify({ type: 'stop' })); setTimeout(() => finish(0), 500); return; }
      const send = arg('send', null);
      const sendRaw = arg('send-raw', null);
      setTimeout(() => {
        if (send != null) ws.send(JSON.stringify({ type: 'input', data: send + '\r' }));
        if (sendRaw != null) ws.send(JSON.stringify({ type: 'input', data: sendRaw }));
      }, 700);
      armRead();
      break;
    }
    case 'data':
      raw += m.data || '';
      armRead(); // quiet-period read window: reset on every chunk
      break;
    case 'exit':
      console.error(`[term] process exited (${m.code})`);
      finish(0);
      break;
    case 'error':
      console.error('[term] error: ' + m.text);
      finish(1);
  }
});
setTimeout(() => { console.error('[term] hard timeout'); finish(1); }, Math.max(READ_MS * 6, 120000));
