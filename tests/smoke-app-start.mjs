// smoke-app-start.mjs — verifies that app.js can start in a minimal DOM.
// This catches module parse/import errors and missing top-bar listener crashes.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);

class ClassList {
  constructor() { this.s = new Set(); }
  add(c) { this.s.add(c); }
  remove(c) { this.s.delete(c); }
  toggle(c, on) { (on === undefined ? !this.s.has(c) : on) ? this.s.add(c) : this.s.delete(c); }
  contains(c) { return this.s.has(c); }
}

const ctx = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'measureText') return (t) => ({ width: String(t).length * 8 });
    return () => {};
  },
  set() { return true; }
});

class El {
  constructor(id) {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.title = '';
    this.style = {};
    this.dataset = {};
    this.classList = new ClassList();
    this.listeners = {};
    this.children = [];
    this.parentElement = { getBoundingClientRect: () => ({ width: 1200, height: 800 }) };
    this.files = [];
  }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  appendChild(x) { this.children.push(x); return x; }
  remove() {}
  querySelector() { return new El('query-result'); }
  querySelectorAll() { return []; }
  getContext() { return ctx; }
  setAttribute() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  click() { (this.listeners.click || []).forEach(cb => cb({ target: this, preventDefault() {} })); }
  reset() {}
}

const elements = new Map(ids.map(id => [id, new El(id)]));
elements.get('timeline-canvas').parentElement = { getBoundingClientRect: () => ({ width: 1200, height: 800 }) };

globalThis.document = {
  documentElement: new El('html'),
  body: new El('body'),
  activeElement: null,
  getElementById(id) { return elements.get(id) || null; },
  createElement(tag) { return new El(tag); },
  querySelector(sel) { return sel.startsWith('#') ? elements.get(sel.slice(1)) || null : null; },
  querySelectorAll() { return []; }
};
globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = (cb) => { cb(); return 1; };
globalThis.setInterval = () => 0;
globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = v; } };
globalThis.confirm = () => true;
globalThis.prompt = () => 'Smoke Project';
globalThis.alert = () => {};
globalThis.Blob = class Blob { constructor() {} };
globalThis.URL = { createObjectURL() { return 'blob:smoke'; }, revokeObjectURL() {} };

await import(path.join(root, 'js/app.js'));

if (!elements.get('btn-add-event').listeners.click?.length) throw new Error('btn-add-event listener was not attached');
if (!elements.get('theme-toggle').listeners.click?.length) throw new Error('theme-toggle listener was not attached');

// The two clicks that failed for the user when app.js died during startup.
elements.get('theme-toggle').click();
elements.get('btn-add-event').click();

console.log('Chronizo smoke-app-start OK');
