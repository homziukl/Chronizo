// TEMP verification harness for task 11.1 — deleted after run.
import { EXAMPLE_FORMULA } from './js/template.js';
import { parseFormula } from './js/formula.js';

const { events, errors } = parseFormula(EXAMPLE_FORMULA);
const e1 = events[0];
const e2 = events[1];

const moon = e1?.attributes?.find(a => a.key === 'moon');
const weather = e1?.attributes?.find(a => a.key === 'weather');
const seg1Types = (e1?.subEvents || []).map(s => s.type);
const ttSeg = (e2?.subEvents || []).find(s => s.type === 'timetravel');

const checks = {
  'events parsed == 2': events.length === 2,
  'no errors': errors.length === 0,
  'event1 title': e1?.title === 'Bitwa o Twierdzę',
  'event1 ISO exact date': e1?.date?.exact === '1453-06-12',
  'event1 has clue moon:full': moon?.value === 'full',
  'event1 has clue weather:storm': weather?.value === 'storm',
  'event1 has >=1 segment': (e1?.subEvents || []).length >= 1,
  'event1 segment types': JSON.stringify(seg1Types) === JSON.stringify(['flashback', 'postcredits']),
  'event1 universe derived/explicit': e1?._universeName === 'Kroniki Pogranicza',
  'event2 approximate date ~1470': e2?.date?.approximate === '~1470',
  'event2 releaseDate': e2?.releaseDate === '2024-03-15',
  'event2 timetravel seg new-universe': ttSeg?.timeTravelMode === 'new-universe',
};

let ok = true;
for (const [k, v] of Object.entries(checks)) {
  if (!v) ok = false;
  console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
}
console.log('\nRESULT: ' + (ok ? 'ALL PASS' : 'FAILURES PRESENT'));
process.exit(ok ? 0 : 1);
