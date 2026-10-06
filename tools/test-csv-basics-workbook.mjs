#!/usr/bin/env node
// Focused offline regression: execute ONLY the three exact hash-reviewed cells
// with an in-memory pathlib.Path substitute. No real CSV writes, downloads,
// package installs, model calls, or arbitrary workbook execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CSV_TITLE, CSV_ID, CSV_CELL_NAMES, CSV_CODE_HASHES, CSV_SOURCE_SHA256, CSV_TUTORIAL_NOTE,
  CSV_RERUN_NOTE, sanitizeCsvStarter, serializeCsvStarter, sha256 } from './prepare-csv-basics-workbook.mjs';

export const EXPECTED_SEEDLING_CSV = 'group,height_cm\r\nlight,12\r\nlight,14\r\nlight,13\r\nshade,7\r\nshade,9\r\nshade,8\r\n';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--workbook'), 'Use only --workbook <path>');
const file = args.length ? path.resolve(args[1]) : path.join(root, 'workbooks/en', CSV_ID + '.srwb');
const bytes = fs.readFileSync(file), book = JSON.parse(bytes);
assert.deepEqual(Object.keys(book).sort(), ['format', 'notebook', 'version']);
assert.equal(book.format, 'srwb'); assert.equal(book.version, '1.0');
assert.deepEqual(Object.keys(book.notebook).sort(), ['cells', 'name']); assert.equal(book.notebook.name, CSV_TITLE);
assert.deepEqual(book.notebook.cells.map(c => c.name), CSV_CELL_NAMES);
for (const [i, cell] of book.notebook.cells.entries()) {
  assert.deepEqual(Object.keys(cell).sort(), ['code', 'language', 'name', 'type']);
  assert.equal(cell.type, i === 0 || i === 4 ? 'markdown' : 'code');
  assert.equal(cell.language, cell.type === 'code' ? 'python' : 'markdown');
  assert(!cell.code.includes('\uFFFD'));
  if (cell.type === 'code') assert.equal(sha256(cell.code), CSV_CODE_HASHES[cell.name], 'Refuse executing changed/unreviewed code');
}
assert(book.notebook.cells[0].code.endsWith(CSV_TUTORIAL_NOTE));
assert(book.notebook.cells[4].code.endsWith(CSV_RERUN_NOTE));
assert.match(book.notebook.cells[0].code, /fictional|made-up/i);
assert.match(book.notebook.cells[0].code, /not evidence.*causes a difference/i);
assert.match(book.notebook.cells[4].code, /Package \(archive\)/);
const originalProjection = structuredClone(book);
originalProjection.notebook.cells[0].code = originalProjection.notebook.cells[0].code.slice(0, -CSV_TUTORIAL_NOTE.length);
originalProjection.notebook.cells[4].code = originalProjection.notebook.cells[4].code.slice(0, -CSV_RERUN_NOTE.length);
delete originalProjection.notebook.cells[0].name; delete originalProjection.notebook.cells[4].name;
assert.equal(sha256(serializeCsvStarter(originalProjection)), CSV_SOURCE_SHA256, 'Original prose or source metadata changed');
const dirty = structuredClone(originalProjection);
dirty.privateConversation = 'Synthetic metadata fixture, never published';
dirty.notebook.deviceId = 'fixture-device'; dirty.notebook.cells[1].savedOutput = 'fixture-output';
assert.equal(serializeCsvStarter(sanitizeCsvStarter(dirty)), bytes.toString('utf8'), 'Sanitizer must discard export/private metadata deterministically');

const program = String.raw`
import csv, io, json, contextlib, pathlib, statistics, sys
from unittest.mock import patch
payload = json.load(sys.stdin)
store = {'csv': 'pre-existing user edits; must be replaced', 'writes': 0, 'reads': 0}
virtual_path = '/shared/data/seedling-heights.csv'
class MemoryWrite(io.StringIO):
    def close(self):
        if not self.closed:
            store['csv'] = self.getvalue()
            store['writes'] += 1
        super().close()
class Parent:
    def mkdir(self, *, parents, exist_ok):
        assert parents is True and exist_ok is True
class MemoryPath:
    def __init__(self, value):
        assert value == virtual_path
    @property
    def parent(self):
        return Parent()
    @property
    def name(self):
        return 'seedling-heights.csv'
    def __str__(self):
        return virtual_path
    def open(self, mode='r', *, newline, encoding):
        assert newline == '' and encoding == 'utf-8'
        assert mode in ('r', 'w')
        if mode == 'w':
            return MemoryWrite(newline=newline)
        store['reads'] += 1
        return io.StringIO(store['csv'], newline=newline)
outputs = []
namespace = {}
with patch('pathlib.Path', MemoryPath):
    for cell in payload['cells']:
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            exec(compile(cell['code'], cell['name'], 'exec'), namespace)
        outputs.append(output.getvalue())
    assert store['csv'] == payload['expectedCsv']
    assert store['writes'] == 1 and store['reads'] == 2
    rows = list(csv.DictReader(io.StringIO(store['csv'], newline='')))
    assert len(rows) == 6
    assert [row['group'] for row in rows] == ['light'] * 3 + ['shade'] * 3
    light = [float(row['height_cm']) for row in rows if row['group'] == 'light']
    shade = [float(row['height_cm']) for row in rows if row['group'] == 'shade']
    assert light == [12.0, 14.0, 13.0] and shade == [7.0, 9.0, 8.0]
    assert statistics.mean(light) == 13.0 and statistics.mean(shade) == 8.0
    assert statistics.mean(light) - statistics.mean(shade) == 5.0
    assert outputs[0] == 'Saved 6 fictional rows to ' + virtual_path + '\n'
    assert outputs[1] == 'Read 6 rows from seedling-heights.csv\nlight: 12 cm\nlight: 14 cm\nlight: 13 cm\nshade: 7 cm\nshade: 9 cm\nshade: 8 cm\n'
    assert outputs[2] == 'Light mean: 13.0 cm\nShade mean: 8.0 cm\nDifference: 5.0 cm\n'
    store['csv'] = 'new user edits'
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(payload['cells'][0]['code'], 'create_csv-rerun', 'exec'), namespace)
    assert store['csv'] == payload['expectedCsv'] and store['writes'] == 2
print('PASS: exact CSV header/6 rows; 13.0 cm, 8.0 cm, 5.0 cm; write-mode overwrite and rerun; no filesystem writes')
`;
const result = execFileSync(process.env.PYTHON || 'python3', ['-I', '-B', '-c', program], {
  input: JSON.stringify({ cells: book.notebook.cells.filter(c => c.type === 'code'), expectedCsv: EXPECTED_SEEDLING_CSV }),
  encoding: 'utf8', timeout: 15000,
});
console.log(result.trim());
console.log('PASS: canonical metadata, exact reviewed code/order/names, fictional-data caveat, tutorial/warnings, metadata sanitizer');
