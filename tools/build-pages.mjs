#!/usr/bin/env node
/**
 * build-pages.mjs — build the GitHub Pages distribution site from release
 * tags. Run by the release-triggered Pages workflow (and locally for
 * inspection). The site is rebuilt from ALL v* tags on every run, so the
 * release history is immutable and self-healing:
 *
 *   site/stable.json                      → latest stable release descriptor
 *   site/releases.json                    → all releases, newest first
 *   site/releases/<tag>/catalog.json      → that release's index, verbatim
 *   site/releases/<tag>/files/<path>      → that release's workbook artifacts
 *
 * Every artifact is re-verified against its index sha256/size at build
 * time — a hash mismatch fails the build rather than publishing a lie.
 *
 * Channel layout (docs/distribution.md): Pages serves the stable channel
 * and release history; raw.githubusercontent.com/<repo>/<commit>/<path>
 * serves commit pins and the development main branch; the app's bundled
 * snapshot is the offline fallback.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || 'site';
const REPO = 'https://github.com/s243a/SciREPL-Catalog';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const gitBuf = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });

const semver = (t) => {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(t);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
// stable = exact vX.Y.Z tags only; anything with a suffix is a pre-release
const tags = git('tag', '--list', 'v*').split('\n').filter(Boolean)
  .filter(t => semver(t))
  .sort((a, b) => {
    const x = semver(a), y = semver(b);
    return (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);
  });

if (!tags.length) {
  console.error('no vX.Y.Z tags found — nothing to publish');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const releases = [];
for (const tag of tags) {
  const commit = git('rev-list', '-n', '1', tag);
  const date = git('log', '-1', '--format=%cI', commit);
  const indexRaw = gitBuf('show', `${commit}:scirepl-catalog.json`);
  const index = JSON.parse(indexRaw.toString('utf8'));

  const relDir = path.join(OUT, 'releases', tag);
  mkdirSync(path.join(relDir, 'files'), { recursive: true });
  writeFileSync(path.join(relDir, 'catalog.json'), indexRaw);

  let verified = 0;
  for (const item of index.items) {
    // format 2.0 uses repo-relative path; 1.x used a raw main URL
    const rel = item.path
      || (item.url || '').replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//, '');
    if (!rel) throw new Error(`${tag}: item ${item.id} has neither path nor url`);
    const data = gitBuf('show', `${commit}:${rel}`);
    const sha = createHash('sha256').update(data).digest('hex');
    if (sha !== item.sha256) throw new Error(`${tag}: sha256 mismatch for ${rel} (index ${item.sha256.slice(0, 12)}, actual ${sha.slice(0, 12)})`);
    if (data.length !== item.size) throw new Error(`${tag}: size mismatch for ${rel}`);
    const dest = path.join(relDir, 'files', rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, data);
    verified++;
  }
  const descriptor = {
    schema: 1,
    tag,
    commit,
    date,
    catalog: `releases/${tag}/catalog.json`,
    files_base: `releases/${tag}/files/`,
    raw_base: `https://raw.githubusercontent.com/s243a/SciREPL-Catalog/${commit}/`,
    index: {
      sha256: createHash('sha256').update(indexRaw).digest('hex'),
      size: indexRaw.length,
      format_version: index.format_version,
      items: index.items.length,
    },
  };
  writeFileSync(path.join(relDir, 'release.json'), JSON.stringify(descriptor, null, 2) + '\n');
  releases.push(descriptor);
  console.error(`${tag} (${commit.slice(0, 12)}): ${verified} artifacts verified`);
}

releases.reverse(); // newest first
writeFileSync(path.join(OUT, 'releases.json'),
  JSON.stringify({ schema: 1, source: REPO, releases }, null, 2) + '\n');
writeFileSync(path.join(OUT, 'stable.json'),
  JSON.stringify(releases[0], null, 2) + '\n');
writeFileSync(path.join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>SciREPL Catalog</title>
<h1>SciREPL Catalog — distribution channel</h1>
<p>Stable: <a href="stable.json">stable.json</a> (${releases[0].tag}) ·
All releases: <a href="releases.json">releases.json</a> ·
Source: <a href="${REPO}">${REPO}</a></p>\n`);
console.error(`site built: ${releases.length} release(s), stable = ${releases[0].tag}`);
