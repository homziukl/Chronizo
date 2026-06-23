import { TimelineRenderer } from '../js/timeline.js';
import { createProject } from '../js/storage.js';
import { createEvent } from '../js/events.js';

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

const canvas = mkEl();
const r = new TimelineRenderer(canvas);
const p = createProject('smoke');
p.events.push(createEvent({ title: 'Alpha', date: { exact: '2012-01-01', approximate: '', rangeFrom: '', rangeTo: '', season: '', era: '' }, characters: ['Hero'] }));
p.events.push(createEvent({ title: 'Beta', releaseDate: '2014-01-01', characters: ['Hero'] }));
r.setProject(p);
r.setTheme('light');
r.setSearchQuery('hero');
console.log('Chronizo smoke-render OK');
