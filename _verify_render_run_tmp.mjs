// Temp: actually RUN the renderer with a canvas/DOM mock to surface any runtime
// error in the constructor / render() path (node --check only catches syntax).
import { TimelineRenderer } from './js/timeline.js';
import { createProject } from './js/storage.js';
import { createEvent } from './js/events.js';

// Canvas 2D context mock: every method is a no-op; measureText returns a width.
const ctx = new Proxy({}, {
  get: (t, p) => (p === 'measureText' ? (() => ({ width: 50 })) : (typeof t[p] !== 'undefined' ? t[p] : () => {})),
  set: () => true
});
const mkEl = () => ({
  getContext: () => ctx,
  addEventListener() {},
  getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
  parentElement: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
  classList: { add() {}, remove() {}, toggle() {} },
  style: {}, width: 800, height: 600, dataset: {}
});
globalThis.devicePixelRatio = 1;
globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
globalThis.document = { getElementById: () => mkEl() };

try {
  const canvas = mkEl();
  const r = new TimelineRenderer(canvas);
  const p = createProject('t');
  p.events.push(createEvent({ title: 'Alpha', date: { exact: '2012-01-01', approximate: '', rangeFrom: '', rangeTo: '', season: '', era: '' }, characters: ['Hero', 'Side'] }));
  p.events.push(createEvent({ title: 'Beta', date: { exact: null, approximate: '', rangeFrom: '', rangeTo: '', season: '', era: '' }, releaseDate: '2014-01-01', characters: ['Hero'] }));
  p.events.push(createEvent({ title: 'Gamma', date: { exact: null, approximate: '', rangeFrom: '', rangeTo: '', season: '', era: '' }, characters: [], subEvents: [{ id: 's1', type: 'flashback', label: 'f', date: { approximate: '2010', season: '' }, location: { place: '' }, note: '', timeTravelMode: '' }] }));
  r.setProject(p);           // render #1
  r.setTheme('light');       // render in light
  r.setTheme('dark');
  r.setSearchQuery('her');   // render with highlight
  console.log('render OK — no runtime error in renderer path');
} catch (e) {
  console.error('RENDER THREW:', e && e.stack ? e.stack : e);
  process.exit(1);
}
