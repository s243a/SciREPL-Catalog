/**
 * span-lib.mjs — shared tokenizer and classifier for the Stage A span tools.
 *
 * Tokenizes Python cell source well enough to separate CODE from
 * comments/strings, segment f-strings into literal runs and placeholders,
 * and classify each translatable candidate by kind and output destination.
 * Not a Python parser — a lexer sufficient for this catalog's workbooks,
 * with the pilot task file as its fixture.
 *
 * Positions are 1-based line/col in code points, end-exclusive, matching
 * docs/pilot/span-manifest.schema.json.
 */

/** Token kinds: code | comment | string */
export function tokenize(src) {
  const toks = [];
  const chars = [...src];
  let i = 0, line = 1, col = 1;
  const pos = () => ({ line, col });
  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (chars[i] === '\n') { line++; col = 1; } else col++;
      i++;
    }
  };
  let codeStart = 0, codeStartPos = pos();
  const flushCode = () => {
    if (i > codeStart) {
      toks.push({ kind: 'code', text: chars.slice(codeStart, i).join(''), start: codeStartPos });
    }
  };

  while (i < chars.length) {
    const c = chars[i];
    if (c === '#') {
      flushCode();
      const start = pos();
      let j = i;
      while (j < chars.length && chars[j] !== '\n') j++;
      const text = chars.slice(i, j).join('');
      advance(j - i);
      toks.push({ kind: 'comment', text, start, end: pos() });
      codeStart = i; codeStartPos = pos();
      continue;
    }
    if (c === '"' || c === "'") {
      // string prefix (f, r, b, fr, rf …) belongs to the string token
      let p = i, prefix = '';
      let back = i - 1, pf = [];
      while (back >= 0 && /[A-Za-z]/.test(chars[back])) { pf.unshift(chars[back]); back--; }
      const maybe = pf.join('');
      if (/^(f|r|b|u|fr|rf|br|rb)$/i.test(maybe)) {
        prefix = maybe;
        p = i - maybe.length;
      }
      // adjust: remove prefix chars from pending code
      const savedI = i;
      if (prefix) {
        // rewind bookkeeping: recompute start position of prefix
        // (prefix is same-line as quote, so col arithmetic is safe)
      }
      const quote = c;
      const triple = chars[i + 1] === quote && chars[i + 2] === quote;
      const qlen = triple ? 3 : 1;
      // flush code up to prefix start
      const flushEnd = prefix ? savedI - prefix.length : savedI;
      if (flushEnd > codeStart) {
        toks.push({ kind: 'code', text: chars.slice(codeStart, flushEnd).join(''), start: codeStartPos });
      }
      const startPos = prefix ? { line, col: col - prefix.length } : pos();
      const isRaw = /r/i.test(prefix);
      const isF = /f/i.test(prefix);
      advance(qlen);
      const bodyStart = i;
      const bodyStartPos = pos();
      while (i < chars.length) {
        if (!isRaw && chars[i] === '\\') { advance(2); continue; }
        if (chars[i] === quote && (!triple || (chars[i + 1] === quote && chars[i + 2] === quote))) break;
        advance(1);
      }
      const body = chars.slice(bodyStart, i).join('');
      const bodyEndPos = pos();
      advance(Math.min(qlen, chars.length - i));
      toks.push({
        kind: 'string', prefix, quote, triple, isF,
        text: body, start: startPos, bodyStart: bodyStartPos, bodyEnd: bodyEndPos, end: pos(),
      });
      codeStart = i; codeStartPos = pos();
      continue;
    }
    advance(1);
  }
  flushCode();
  return toks;
}

/**
 * Segment an f-string body into literal runs and placeholders.
 * Returns [{type:'lit', text, offset} | {type:'ph', text, offset, spec}].
 * offset is code-point offset within the body. {{ and }} are literal braces.
 */
export function segmentFString(body) {
  const out = [];
  const chars = [...body];
  let i = 0, litStart = 0;
  const pushLit = (end) => {
    if (end > litStart) out.push({ type: 'lit', text: chars.slice(litStart, end).join(''), offset: litStart });
  };
  while (i < chars.length) {
    if (chars[i] === '{' && chars[i + 1] === '{') { i += 2; continue; }
    if (chars[i] === '}' && chars[i + 1] === '}') { i += 2; continue; }
    if (chars[i] === '{') {
      pushLit(i);
      const phStart = i;
      let depth = 1; i++;
      while (i < chars.length && depth > 0) {
        if (chars[i] === '{') depth++;
        else if (chars[i] === '}') depth--;
        if (depth > 0) i++;
      }
      const ph = chars.slice(phStart, i + 1).join('');
      const specMatch = /:([^}]*)\}$/.exec(ph);
      out.push({ type: 'ph', text: ph, offset: phStart, spec: specMatch ? specMatch[1] : null });
      i++;
      litStart = i;
      continue;
    }
    i++;
  }
  pushLit(chars.length);
  return out;
}

/** Extract a field width from a format spec like ">16", ">9,", ">14.2e". */
export function widthOfSpec(spec) {
  const m = /^[<>=^]?[+\- ]?#?0?(\d+)/.exec(spec || '');
  return m ? Number(m[1]) : null;
}

const PLOT_KEY = /^(name|title)$/;
const PROSEY = /[A-Za-z]{2}.*[ .:]|[ .:].*[A-Za-z]{2}/; // has letters plus space/punct

/**
 * Scan one cell's Python source for translatable candidates.
 * Returns spans: {kind, reaches_output, text, start, end, width?, trap?}.
 */
export function scanCell(src) {
  const toks = tokenize(src);
  const spans = [];
  // context tracking over the code stream
  let lastStrings = [];           // recent plain strings (for key:value detection)
  let printDepth = 0;             // inside print( … )
  let symbolsCall = false;        // immediately inside symbols( … )
  for (let t = 0; t < toks.length; t++) {
    const tok = toks[t];
    if (tok.kind === 'code') {
      // update call contexts crudely, token by token
      const text = tok.text;
      if (/print\s*\($/.test(text) || /print\s*\(\s*$/.test(text)) printDepth++;
      else if (/print\s*\(/.test(text)) printDepth++;
      if (/symbols\s*\($/.test(text) || /symbols\s*\(/.test(text)) symbolsCall = true;
      // closing parens end contexts (approximation: any ')' closes one)
      const closes = (text.match(/\)/g) || []).length;
      for (let k = 0; k < closes; k++) {
        if (symbolsCall) symbolsCall = false;
        else if (printDepth > 0) printDepth--;
      }
      if (/:\s*$/.test(text) && lastStrings.length) {
        // keep lastStrings — "name": "value" pattern pending
      } else if (/[,}\]]\s*$/.test(text)) {
        // value consumed; reset pending key on separators
      }
      continue;
    }
    if (tok.kind === 'comment') {
      const body = tok.text.replace(/^#\s?/, '');
      if (/[A-Za-z]{2}/.test(body)) {
        const markerLen = tok.text.length - body.length;
        spans.push({
          kind: 'comment', reaches_output: 'none', text: body,
          start: { line: tok.start.line, col: tok.start.col + markerLen },
          end: tok.end,
        });
      }
      continue;
    }
    // strings
    if (tok.triple) {
      if (/[A-Za-z]{2}/.test(tok.text)) {
        spans.push({ kind: 'docstring', reaches_output: 'none', text: tok.text, start: tok.bodyStart, end: tok.bodyEnd });
      }
      continue;
    }
    if (symbolsCall) {
      spans.push({ kind: 'trap', trap: 'symbol-name', text: tok.text,
        quoted: tok.quote + tok.text + tok.quote,
        start: tok.bodyStart, end: tok.bodyEnd });
      continue;
    }
    // plot-label detection: previous plain string was name/title and a ':' sits between
    const prev = lastStrings[lastStrings.length - 1];
    const between = toks.slice(0, t).map(x => x.kind === 'code' ? x.text : '').join('');
    if (prev && PLOT_KEY.test(prev.text)) {
      const codeBetween = toks[t - 1] && toks[t - 1].kind === 'code' ? toks[t - 1].text : '';
      if (/^\s*:\s*$/.test(codeBetween)) {
        spans.push({ kind: 'plot_label', reaches_output: 'plot', text: tok.text, start: tok.bodyStart, end: tok.bodyEnd });
        lastStrings.push(tok);
        continue;
      }
    }
    if (tok.isF) {
      const segs = segmentFString(tok.text);
      for (const seg of segs) {
        if (seg.type === 'lit' && /[A-Za-z]{2}/.test(seg.text)) {
          spans.push({
            kind: 'display_string',
            reaches_output: printDepth > 0 ? 'stdout' : 'none',
            text: seg.text, fstringOffset: seg.offset,
            start: tok.bodyStart, end: tok.bodyEnd, // span located via offset within body
            placeholders: segs.filter(s => s.type === 'ph').map(s => s.text),
          });
        }
        if (seg.type === 'ph') {
          // nested plain-string placeholder with width: {'step':>4}
          const nm = /^\{\s*'([^']*)'\s*(?::(.*))?\}$/.exec(seg.text);
          if (nm && /[A-Za-z]/.test(nm[1])) {
            spans.push({
              kind: 'display_string',
              reaches_output: printDepth > 0 ? 'stdout' : 'none',
              text: nm[1], fstringOffset: seg.offset,
              start: tok.bodyStart, end: tok.bodyEnd,
              width: widthOfSpec(nm[2]),
            });
          }
        }
      }
      lastStrings.push(tok);
      continue;
    }
    // plain string: candidate only when prose-like or print-context
    if (/[A-Za-z]{2}/.test(tok.text) && (printDepth > 0 || / /.test(tok.text))) {
      spans.push({
        kind: 'display_string',
        reaches_output: printDepth > 0 ? 'stdout' : 'none',
        text: tok.text, start: tok.bodyStart, end: tok.bodyEnd,
      });
    }
    lastStrings.push(tok);
  }
  return spans;
}

/** Cells of either workbook format, with joined source text. */
export function cellsOf(workbookJson) {
  const isSrwb = workbookJson.format === 'srwb';
  const cells = isSrwb ? workbookJson.notebook.cells : workbookJson.cells;
  return cells.map((c, index) => {
    const type = isSrwb ? c.type : c.cell_type;
    const raw = isSrwb ? c.code : c.source;
    // nbformat keepends: lines already carry their trailing \n — join with ''.
    const code = Array.isArray(raw) ? raw.join('') : String(raw ?? '');
    return { index, type, name: c.name || null, code, cell: c };
  });
}
