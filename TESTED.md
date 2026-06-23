# Tested

Run from the project root:

```bash
node --check js/app.js js/events.js js/formula.js js/quick_update.js js/sorting.js js/storage.js js/template.js js/timeline.js
node tests/smoke-render.mjs
node tests/smoke-sort.mjs
node tests/smoke-quick-update.mjs
```

Current package passed these checks in the ChatGPT sandbox before zipping.

Manual sanity coverage included:

- Quick Add still uses the existing add-event parser.
- Quick Update parser recognizes `mode: update`, `match:` and set fields.
- Light theme now sets theme state on `html`, `body`, body classes and renderer.
