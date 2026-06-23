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
  getBoundingClientRect: () => ({ width: 900, height: 600, left: 0, top: 0 }),
  parentElement: { getBoundingClientRect: () => ({ width: 900, height: 600 }) },
  classList: { add() {}, remove() {}, toggle() {} },
  style: {}, width: 900, height: 600, dataset: {}
});
globalThis.devicePixelRatio = 1;
globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
globalThis.document = { getElementById: () => mkEl() };

const canvas = mkEl();
const r = new TimelineRenderer(canvas);
const p = createProject('focus-smoke');
p.events.push(createEvent({ title: 'Case opens', date: { exact: '2014-09-22', approximate: '', rangeFrom: '', rangeTo: '', season: '', era: '' }, characters: ['Jim Gordon', 'Harvey Bullock'] }));
p.events.push(createEvent({ title: 'Case deepens', date: { exact: '2014-09-23', approximate: '', rangeFrom: '', rangeTo: '', season: '', era: '' }, characters: ['Jim Gordon'] }));
p.events.push(createEvent({ title: 'Other thread', date: { exact: '2014-09-24', approximate: '', rangeFrom: '', rangeTo: '', season: '', era: '' }, characters: ['Oswald Cobblepot'] }));
r.setProject(p);
r.setCharacterThreadMode('focused');
r.setFocusedCharacter('Jim Gordon');
if (!r._focusedIds || r._focusedIds.size !== 2) throw new Error('Character focus did not collect Jim Gordon events');
r.setPerformanceMode(true);
r.render();
console.log('Chronizo smoke-character-focus OK');
