#!/usr/bin/env node
// bench-pair.mjs — hold the Pro PWA open in headless Chromium, paired to the
// broker, until killed. The bench's "device".
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/s243a/Projects/scirepl-free-oss-licenses/package.json');
const { chromium } = require('playwright');

const TOKEN = readFileSync('/home/s243a/scirepl-broker/broker-token', 'utf8').trim();
const APP = 'http://localhost:8090/';
const BROKER_WS = 'ws://127.0.0.1:8088/app';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' }); // pinned per proposal
const page = await context.newPage();
page.on('console', m => console.log('[app]', m.type(), m.text().slice(0, 200)));
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('requestfailed', r => console.log('[reqfail]', r.url().slice(0, 140), r.failure()?.errorText));

await page.addInitScript(() => {
  localStorage.setItem('scirepl_privacy_accepted', '1');
  localStorage.setItem('scirepl_onboarding_seen', '1');
  addEventListener('DOMContentLoaded', () => localStorage.setItem(
    'scirepl_whats_new_seen_version', window.KERNEL_CONFIG?.app?.version || ''), { once: true });
  // Workbook transfer permission: user-authorized for this bench session.
  localStorage.setItem('scirepl_ai_workbook_io', 'allow');
  // Remote-bridge privacy disclosure: accepted for this bench profile only,
  // per the owner's explicit authorization of the pilot bench.
  localStorage.setItem('scirepl_remote_data_consent_v1', '1');
  // "open" security level (all tools allowed) per the owner's guidance —
  // sufficient for the bench; 'full' exists but is more permissive than needed.
  localStorage.setItem('scirepl_ai_security', 'open');
  // Non-bundled kernels (lua, prolog, ...) show a CDN download-confirmation
  // dialog before init; headless nobody clicks it — ensureReady awaits
  // forever and wedges ToolCore. Auto-approve downloads for the bench.
  localStorage.setItem('scirepl_auto_download', '1');
});

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__SCIREPL_APP_READY === true || window.mcpClient, null, { timeout: 60000 });

const res = await page.evaluate(async ({ url, token }) => {
  if (!window.mcpClient?.connect) return { ok: false, why: 'mcpClient.connect missing' };
  try {
    await window.mcpClient.connect(url, token);
    return { ok: true };
  } catch (e) { return { ok: false, why: String(e && e.message || e) }; }
}, { url: BROKER_WS, token: TOKEN });

console.log('[bench] pair result:', JSON.stringify(res));
if (!res.ok) { await browser.close(); process.exit(1); }

// report connection state periodically; stay alive. Also surface any visible
// modal/dialog — a headless bench can wedge on a dialog nobody can click.
setInterval(async () => {
  try {
    const s = await page.evaluate(() => {
      const modals = [...document.querySelectorAll('.modal, dialog, [role="dialog"]')]
        .filter(m => !m.classList.contains('hidden') && m.offsetParent !== null)
        .map(m => (m.id || m.className) + ': ' + (m.textContent || '').replace(/\s+/g, ' ').slice(0, 200));
      return {
        connected: !!(window.mcpClient && (window.mcpClient.connected ?? window.mcpClient.ws?.readyState === 1)),
        modals,
        progress: (document.querySelector('#kernel-progress, .kernel-progress, #progress-text')?.textContent || '').slice(0, 120),
        fengari: typeof window.fengari,
        fengariScripts: [...document.querySelectorAll('script')].map(s => s.src).filter(u => /fengari/i.test(u)),
      };
    });
    console.log('[bench] alive, connected=', s.connected, new Date().toISOString());
    if (s.progress) console.log('[bench] progress:', s.progress);
    console.log('[bench] fengari=', s.fengari, 'scripts=', JSON.stringify(s.fengariScripts));
    for (const m of s.modals) console.log('[bench] VISIBLE MODAL:', m);
  } catch (e) { console.log('[bench] probe error', String(e).slice(0, 100)); }
}, 15000);
console.log('[bench] holding the paired session open — kill this process to end the bench');
