// TEMP sync check for task 11.1 — deleted after run.
import { readFileSync } from 'node:fs';
import { EXAMPLE_FORMULA } from './js/template.js';

const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
const norm = s => s.replace(/\r\n/g, '\n');
const r = norm(readme);
const ex = norm(EXAMPLE_FORMULA);
const lines = ex.split('\n');
const first = lines[0];
const last = lines[lines.length - 1];

const start = r.indexOf(first);
const end = r.indexOf(last, start);
const extracted = r.slice(start, end + last.length);

const rawHasCRLF = /\r\n/.test(readme);
const match = extracted === ex;
console.log('README uses CRLF line endings:', rawHasCRLF);
console.log('Block found in README:', start !== -1 && end !== -1);
console.log('Content identical (LF-normalized):', match);
process.exit(match ? 0 : 1);
