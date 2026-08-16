#!/usr/bin/env node
// agent-drive.mjs — drive the SciREPL-MCP broker's /agent surface from a script.
//
//   node agent-drive.mjs --url ws://HOST:8087/agent --token-file ~/scirepl-broker/broker-token \
//        --agent agy --prompt-file prompt.txt [--timeout-ms 600000]
//
// Speaks the app's own protocol: hello{token} -> start{agent} -> input{text},
// then prints every event and exits when the turn's `result` arrives.

import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/s243a/Projects/SciREPL-MCP/packages/broker/package.json');
const WebSocket = require('ws');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const URL_ = arg('url');
const TOKEN = (arg('token', '') || fs.readFileSync(arg('token-file'), 'utf8')).trim();
const AGENT = arg('agent', 'agy');
const PROMPT = fs.readFileSync(arg('prompt-file'), 'utf8');
const TIMEOUT = Number(arg('timeout-ms', 900000));

const ws = new WebSocket(URL_);
let started = false;
const die = (msg, code = 1) => { console.error('[drive] ' + msg); try { ws.close(); } catch {} process.exit(code); };
const timer = setTimeout(() => die(`timeout after ${TIMEOUT}ms`), TIMEOUT);

ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', token: TOKEN })));
ws.on('error', (e) => die('ws error: ' + e.message));
ws.on('close', (c, r) => { if (!done) die(`ws closed (${c}) ${r || ''}`); });

let done = false;
ws.on('message', (buf) => {
  let m; try { m = JSON.parse(buf.toString()); } catch { return; }
  if (m.type !== 'agent') return;
  switch (m.kind) {
    case 'welcome':
      console.error(`[drive] welcome; agents=${(m.agents || []).join(',')} running=${m.running || 'none'}`);
      if (!(m.agents || []).includes(AGENT)) die(`agent '${AGENT}' not available (workspaceReady? cmd on PATH?)`);
      ws.send(JSON.stringify({ type: 'start', agent: AGENT }));
      break;
    case 'started':
      console.error(`[drive] agent '${m.text}' started${m.experimental ? ' (experimental)' : ''}`);
      if (!started) { started = true; ws.send(JSON.stringify({ type: 'input', text: PROMPT })); }
      break;
    case 'assistant':
      process.stdout.write(m.text || '');
      break;
    case 'stderr':
      console.error('[agent stderr] ' + (m.text || '').trimEnd());
      break;
    case 'tool_use':
      console.error(`[agent tool] ${m.tool || ''}`);
      break;
    case 'error':
      die('agent error: ' + m.text);
      break;
    case 'result':
      done = true;
      clearTimeout(timer);
      console.error('\n[drive] turn complete');
      ws.close();
      process.exit(0);
  }
});
