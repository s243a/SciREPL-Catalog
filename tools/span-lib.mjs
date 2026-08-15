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

/* ------------------- Stage B: code micro-tokenization ------------------- */

/**
 * Python keywords — an EN identifier on this list must never be renamed.
 * (Soft keywords match/case/type are omitted: renaming them is caught by
 * the runtime gate if it matters, and they are legal identifiers.)
 */
export const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

const ID_START = /[\p{L}\p{Nl}_]/u;
const ID_CONT = /[\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}]/u;

/** Approximates Python identifier validity (XID via unicode categories). */
export function isValidPyIdentifier(name) {
  const cs = [...name];
  if (!cs.length || !ID_START.test(cs[0])) return false;
  return cs.slice(1).every(c => ID_CONT.test(c));
}

/**
 * Split a CODE token's text into micro-tokens for α-rename comparison:
 *   {kind:'id', text, afterDot, kwargPos} — identifier. afterDot: attribute
 *       position. kwargPos: keyword-argument NAME inside a call — f(x=1) —
 *       which is API surface, never renamed. (Also matches def-default
 *       parameter names: a documented conservative over-approximation.)
 *   {kind:'num', text}           — numeric literal (incl. 1e-10, 0x1f, 2j)
 *   {kind:'op', text}            — everything else, run of non-id/num chars
 * Concatenating texts reproduces the input exactly.
 *
 * `initialStack` threads bracket context across a cell's token stream: a
 * call like mplot("x", layout=v) is split around the string token, so the
 * second code chunk starts inside the parens. Pass the previous chunk's
 * `finalStack` (attached as a property on the returned array).
 */
export function microTokens(code, initialStack = []) {
  const cs = [...code];
  const out = [];
  // open brackets among ( [ { — '(d' marks a def-signature paren, where
  // name=default is a PARAMETER DEFINITION (renameable), not a call kwarg
  const stack = [...initialStack];
  let i = 0;
  let lastNonSpace = '';
  let prevSigText = '', lastSigText = '', lastSigWasId = false;
  let defParenPending = false;
  while (i < cs.length) {
    const c = cs[i];
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(cs[i + 1] || ''))) {
      let j = i;
      while (j < cs.length && /[0-9a-fA-FoOxXbB_.]/.test(cs[j])) {
        // exponent: e/E followed by optional sign — but only inside a
        // decimal literal (hex digits also match e/E, harmless: sign
        // consumption below requires the e to be last-consumed)
        j++;
        if ((cs[j - 1] === 'e' || cs[j - 1] === 'E') && /[+-]/.test(cs[j] || '')
            && /[0-9]/.test(cs[j + 1] || '')) j++;
      }
      if (/[jJ]/.test(cs[j] || '')) j++;
      const text = cs.slice(i, j).join('');
      out.push({ kind: 'num', text });
      prevSigText = lastSigText; lastSigText = text; lastSigWasId = false;
      defParenPending = false;
      lastNonSpace = text[text.length - 1];
      i = j;
      continue;
    }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < cs.length && ID_CONT.test(cs[j])) j++;
      const text = cs.slice(i, j).join('');
      out.push({
        kind: 'id', text,
        afterDot: lastNonSpace === '.',
        parenTop: stack[stack.length - 1],
      });
      defParenPending = lastSigText === 'def' && lastSigWasId;
      prevSigText = lastSigText; lastSigText = text; lastSigWasId = true;
      lastNonSpace = text[text.length - 1];
      i = j;
      continue;
    }
    let j = i;
    while (j < cs.length && !ID_START.test(cs[j]) && !/[0-9]/.test(cs[j])
           && !(cs[j] === '.' && /[0-9]/.test(cs[j + 1] || ''))) j++;
    const text = cs.slice(i, j).join('');
    out.push({ kind: 'op', text });
    for (const ch of text) {
      if (ch === '(') { stack.push(defParenPending ? '(d' : '('); defParenPending = false; }
      else if (ch === '[' || ch === '{') { stack.push(ch); defParenPending = false; }
      else if (ch === ')' || ch === ']' || ch === '}') { stack.pop(); defParenPending = false; }
      else if (!/\s/.test(ch)) defParenPending = false;
    }
    const trimmed = text.replace(/\s+/g, '');
    if (trimmed) lastNonSpace = trimmed[trimmed.length - 1];
    i = j;
  }
  // kwargPos: id directly inside CALL parens whose next token is `=` (not
  // ==). Ids inside def-signature parens ('(d') are parameter definitions.
  for (let k = 0; k < out.length; k++) {
    const t = out[k];
    if (t.kind !== 'id') continue;
    const next = out[k + 1];
    t.kwargPos = !!(t.parenTop === '(' && !t.afterDot && next && next.kind === 'op'
      && /^\s*=(?!=)/.test(next.text));
    delete t.parenTop;
  }
  out.finalStack = stack;
  return out;
}
