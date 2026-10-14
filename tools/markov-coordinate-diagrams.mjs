// Static, inert coordinate diagrams shared by all Markov workbook editions.
// Only title/desc are translated. Geometry and mathematical labels are fixed.
import assert from 'node:assert/strict';

const escapeXml = value => String(value).replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const templates = [
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 260" role="img" aria-label="TITLE" style="display:block;width:100%;max-width:480px;height:auto;margin:1rem 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
<title>TITLE</title>
<desc>DESC</desc>
<path d="M45 105 L105 45 L225 45 L225 165 L165 225 L45 225 Z M45 105 L165 105 L225 45 M165 105 L165 225" fill="currentColor" fill-opacity="0.04"/>
<path d="M45 105 L105 45 L225 45 L165 105 Z" fill="currentColor" fill-opacity="0.08"/>
<g fill="currentColor" stroke="none" font-family="sans-serif" font-size="22" text-anchor="middle">
<text x="105" y="174">F</text><text x="135" y="80">U</text><text x="199" y="143">R</text>
</g>
<path d="M335 160 H426 M335 160 V71 M335 160 L280 215"/>
<g fill="currentColor" stroke="none">
<polygon points="436,160 423,154 423,166"/><polygon points="335,59 329,73 341,73"/><polygon points="272,223 286,218 277,209"/>
</g>
<g fill="currentColor" stroke="none" font-family="sans-serif" font-size="19">
<text x="443" y="166">+x</text><text x="323" y="45">+y</text><text x="253" y="246">+z</text>
</g>
</svg>`,
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 510" role="img" aria-label="TITLE" style="display:block;width:100%;max-width:360px;height:auto;margin:1rem 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
<title>TITLE</title>
<desc>DESC</desc>
<path d="M35 30 H325 V210 H35 Z" fill="currentColor" fill-opacity="0.04"/>
<path d="M50 452 H237 L310 368 H123 Z" fill="currentColor" fill-opacity="0.08"/>
<path d="M95 170 H267 M95 170 V83 M95 427 H227 M95 427 L132 386 M190 410 V333 M180 235 V284"/>
<g fill="currentColor" stroke="none">
<polygon points="280,170 266,163 266,177"/><polygon points="95,70 88,84 102,84"/>
<polygon points="240,427 226,420 226,434"/><polygon points="141,376 126,382 136,391"/>
<polygon points="190,320 183,334 197,334"/><polygon points="180,297 173,283 187,283"/>
</g>
<circle cx="200" cy="107" r="10"/><circle cx="200" cy="107" r="3" fill="currentColor"/>
<g fill="currentColor" stroke="none" font-family="sans-serif" font-size="20">
<text x="166" y="197">r = +x</text><text x="110" y="78">u = +y</text><text x="218" y="114">n = +z</text>
<text x="157" y="480">r = +x</text><text x="39" y="350">u = -z</text><text x="208" y="340">n = +y</text>
<text x="196" y="242">r = +x</text><text x="25" y="266">+y → -z</text><text x="206" y="282">+z → +y</text>
</g>
<g fill="currentColor" stroke="none" font-family="sans-serif" font-size="24" text-anchor="middle">
<text x="300" y="190">F</text><text x="265" y="416">U</text><text x="180" y="506">r × u = n</text>
</g>
</svg>`,
];

export const diagramAccessibility = [
  { title: 'Fixed global cube axes', desc: 'The cube has front F, top U and right R faces. Global positive x points right, positive y points up, and positive z points toward the front.' },
  { title: 'Paper tilted from front to top', desc: 'A front sheet has right r along positive x, up u along positive y, and outward normal n along positive z, shown by a circle with a central dot pointing toward the outside viewer. In the front-to-top hinge tilt, right stays positive x, up becomes negative z, and the normal becomes positive y. The arrows show r cross u equals n.' },
];

export function coordinateDiagrams(accessibility = diagramAccessibility) {
  assert.equal(accessibility.length, templates.length);
  return templates.map((template, index) => {
    const item = accessibility[index];
    for (const field of ['title', 'desc']) {
      assert.equal(typeof item[field], 'string'); assert(item[field].trim());
      assert(!item[field].includes('\uFFFD'));
    }
    return template.replaceAll('TITLE', escapeXml(item.title)).replace('DESC', escapeXml(item.desc));
  });
}

export function splitCoordinateDiagrams(markdown) {
  const svgs = [...markdown.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(match => match[0]);
  assert.equal(svgs.length, 2, 'Exactly two coordinate SVGs are required');
  let prose = markdown;
  svgs.forEach((svg, index) => { prose = prose.replace(svg, `<!--SCIREPL-COORDINATE-DIAGRAM-${index === 0 ? 'ONE' : 'TWO'}-->`); });
  return { prose, svgs };
}

export function restoreCoordinateDiagrams(prose, accessibility) {
  const diagrams = coordinateDiagrams(accessibility);
  for (let index = 0; index < diagrams.length; index++) {
    const token = `<!--SCIREPL-COORDINATE-DIAGRAM-${index === 0 ? 'ONE' : 'TWO'}-->`;
    assert.equal(prose.split(token).length, 2, 'Diagram placeholder must occur exactly once');
    prose = prose.replace(token, diagrams[index]);
  }
  return prose;
}

// Controller-only, layout-only reembedding after prose review. Title/desc are
// decoded once before the generator escapes them again; all prose stays exact.
export function reembedCoordinateDiagrams(markdown) {
  const { prose, svgs } = splitCoordinateDiagrams(markdown);
  const decode = text => text.replaceAll('&quot;', '"').replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
  const accessibility = svgs.map(svg => ({
    title: decode(svg.match(/<title>([\s\S]*?)<\/title>/)[1]),
    desc: decode(svg.match(/<desc>([\s\S]*?)<\/desc>/)[1]),
  }));
  const result = restoreCoordinateDiagrams(prose, accessibility);
  assert.equal(splitCoordinateDiagrams(result).prose, prose);
  svgs.forEach((svg, index) => {
    for (const tag of ['title', 'desc']) assert.equal(
      result.matchAll(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'g')).toArray()[index][0],
      svg.match(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`))[0]);
  });
  return result;
}

export function assertCoordinateSvgInvariants(markdown) {
  const { svgs } = splitCoordinateDiagrams(markdown), expected = coordinateDiagrams();
  const geometry = svg => svg.replace(/aria-label="[^"]*"/, 'aria-label="TITLE"')
    .replace(/<title>[\s\S]*?<\/title>/, '<title>TITLE</title>')
    .replace(/<desc>[\s\S]*?<\/desc>/, '<desc>DESC</desc>');
  svgs.forEach((svg, index) => {
    assert.equal(geometry(svg), geometry(expected[index]), 'Coordinate SVG geometry or labels changed');
    assert(!/<(?:script|style|image|foreignObject|animate|set|use)\b/i.test(svg));
    assert(!/\son[a-z]+\s*=|(?:href|src|marker-end)\s*=|url\s*\(|data:|https?:\/\//i.test(svg.replace('http://www.w3.org/2000/svg', '')));
    assert.match(svg, /<title>[^<]+<\/title>/); assert.match(svg, /<desc>[^<]+<\/desc>/);
  });
}

// The executable workbook is never regenerated here. The controller changes
// only this Markdown section and retains the original layout/matrix prose.
export function updateCoordinateEnglish(before) {
  const start = before.indexOf('To remove orientation ambiguity,');
  const end = before.indexOf('\n\nA permutation `p`');
  assert(start >= 0 && end > start, 'Expected the original coordinate section');
  const table = before.slice(start, end).match(/\| Face \|[\s\S]+/)[0]
    .replace('| Face | Outward normal | Drawing right | Drawing up |',
      '| Face | Outward normal (`n`) | Right in face view (`r`) | Up in face view (`u`) |');
  const [axes, tilt] = coordinateDiagrams();
  const explanation = [
    '### Global axes and face-view axes',
    'The **global axes stay fixed** for the whole cube: `+x` points right, `+y` points up, and `+z` points toward the front. Thus `(0, 0, -1)` points toward the back.',
    axes,
    'The table uses a separate **local frame** for each face. Imagine a small sheet of paper on that face, viewed from outside the cube: `r` points right along the paper and `u` points up along the paper. These are not necessarily global right and global up. The outward normal `n` points perpendicular to the paper, away from the cube, rather than along it.',
    'Each row satisfies `r × u = n`. By the right-hand rule, curl the fingers of your right hand from the local right direction toward local up; your thumb points along the outward normal. On the front face F, these directions are `r = +x`, `u = +y`, and `n = +z`.',
    table,
    '### Why top-face up points toward the back',
    'Start with the front-facing paper. Tilt it about a line parallel to its right direction, as if on a hinge, then reposition it on top of the cube without another rotation. In this **front-to-top tilt**, `r` stays `+x`, while `u` changes from `+y` to `-z` and `n` changes from `+z` to `+y`. The diagram compares the two frame orientations; it does not depict a sheet folding inward while attached to the actual cube edge.',
    tilt,
    'So on U, up along the paper points toward the back (`-z`), while global up (`+y`) points out of the top face, perpendicular to the paper. This explains the U row without changing the global axes. The tilt illustrates a face-view frame, not a legal cube face move.',
    'The table fixes **one consistent drawing convention**, not a path-independent “no-twist” rule. Different routes between faces can leave a transported sheet with different in-plane rotations. Use the stated table to choose each face view.',
  ].join('\n\n');
  return before.slice(0, start) + explanation + before.slice(end);
}
