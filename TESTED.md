# Tested

Checked before packaging v3:

```bash
node --check js/app.js
node --check js/timeline.js
node --check js/storage.js
node --check js/quick_update.js
node tests/smoke-render.mjs
node tests/smoke-sort.mjs
node tests/smoke-quick-update.mjs
node tests/smoke-character-focus.mjs
```

Result: OK.

Manual browser checklist after publishing to GitHub Pages:

1. Hard refresh with `Ctrl + F5`.
2. Add 2–3 events with the same character, for example `Jim Gordon`.
3. Type/select `Jim Gordon` in Character Focus.
4. Confirm only Jim's line appears.
5. Toggle `Fast` and confirm the focused line stays visible.
6. Save JSON and reload page; focus/settings should persist.

- `node tests/smoke-dom-ids.mjs` — verifies literal `getElementById(...)` references exist in `index.html`.


Checked before packaging v3.2:

```bash
for f in js/*.js tests/*.mjs; do node --check "$f"; done
node tests/smoke-render.mjs
node tests/smoke-sort.mjs
node tests/smoke-quick-update.mjs
node tests/smoke-character-focus.mjs
node tests/smoke-dom-ids.mjs
node tests/smoke-app-start.mjs
node -e "import('./js/template.js').then(() => console.log('template import ok'))"
```

Result: OK.

The v3.2 smoke-app-start test specifically catches the class of bug where `app.js` dies during module import and the top menu becomes clickable-looking but inert.
