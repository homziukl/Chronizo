import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const idsInHtml = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const idsInApp = new Set([
  ...[...app.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]),
  ...[...app.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1])
]);
const missing = [...idsInApp].filter(id => !idsInHtml.has(id)).sort();
if (missing.length) {
  console.error('Missing DOM ids used by app.js:', missing.join(', '));
  process.exit(1);
}
console.log('Chronizo smoke-dom-ids OK');
