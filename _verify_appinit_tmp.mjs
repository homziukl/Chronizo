// Temp: import app.js under a full DOM mock to catch an init-time exception
// that would abort listener attachment (dead top bar). Deleted after run.
const ctx = new Proxy({}, {
  get: (t, p) => (p === 'measureText' ? (() => ({ width: 50 })) : () => {}),
  set: () => true
});

function mkEl() {
  const base = {
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {}, dataset: {}, files: [],
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
    addEventListener() {}, removeEventListener() {}, appendChild() {},
    showModal() {}, close() {}, click() {}, remove() {}, setAttribute() {}, focus() {},
    querySelectorAll: () => [], querySelector: () => null,
    width: 800, height: 600
  };
  const strProps = new Set(['value', 'textContent', 'innerHTML', 'title', 'placeholder', 'className', 'id']);
  const el = new Proxy(base, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'parentElement') return el;
      if (strProps.has(p)) return '';
      return () => {};
    },
    set() { return true; }
  });
  return el;
}

globalThis.devicePixelRatio = 1;
globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = {
  getElementById: () => mkEl(),
  createElement: () => mkEl(),
  body: mkEl()
};

try {
  await import('./js/app.js');
  console.log('app.js init OK — no exception during module evaluation');
} catch (e) {
  console.error('APP INIT THREW:', e && e.stack ? e.stack : e);
  process.exit(1);
}
