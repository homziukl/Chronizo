import assert from 'node:assert/strict';
import { TimelineRenderer } from '../js/timeline.js';
import { createProject } from '../js/storage.js';
import { createEvent } from '../js/events.js';

const ctx = new Proxy({}, {
  get: (t, p) => (p === 'measureText' ? ((txt) => ({ width: String(txt).length * 8 })) : (typeof t[p] !== 'undefined' ? t[p] : () => {})),
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

const r = new TimelineRenderer(mkEl());
const p = createProject('release blocks');
p.events.push(createEvent({ title: 'Wayne murders', universe: 'main', releaseDate: '2014-09-22', media: { type: 'series', title: 'Gotham Pilot', episode: 'S01E01' }, date: { exact: '2014-09-11', approximate: '', rangeFrom: '', rangeTo: '', season: '', era: '' }, characters: ['Bruce Wayne', 'Jim Gordon'] }));
p.events.push(createEvent({ title: 'Pepper pursuit', universe: 'main', releaseDate: '2014-09-22', media: { type: 'series', title: 'Gotham Pilot', episode: 'S01E01' }, date: { exact: '2014-09-13', approximate: '', rangeFrom: '', rangeTo: '', season: '', era: '' }, characters: ['Jim Gordon', 'Mario Pepper'] }));
r.setProject(p);
r.setSortMode('release');
assert.equal(r._displayEvents.length, 1);
assert.equal(r._displayEvents[0]._releaseBlock, true);
assert.equal(r._displayEvents[0]._releaseChildren.length, 2);
assert.equal(r._displayEvents[0].title, 'Gotham Pilot S01E01');
assert.deepEqual(r._displayEvents[0].characters.sort(), ['Bruce Wayne', 'Jim Gordon', 'Mario Pepper'].sort());
console.log('smoke-release-blocks OK');
