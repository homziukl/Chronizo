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


## v3.3

- `node --check js/template.js` passes.
- `node --check js/app.js` passes.
- `template.js` has no exported template literal for `AI_PROMPT`; prompt is built from safe string array.
- `index.html` uses `js/app.js?v=3.3`; `app.js` imports `template.js?v=3.3`.


## v3.5

Checked before packaging v3.5:

```bash
for f in js/*.js tests/*.mjs; do node --check "$f"; done
node tests/smoke-list-separators.mjs
node tests/smoke-quickadd-tolerance.mjs
node tests/smoke-quick-update.mjs
node tests/smoke-character-focus.mjs
node tests/smoke-render.mjs
node tests/smoke-sort.mjs
node tests/smoke-dom-ids.mjs
node tests/smoke-app-start.mjs
```

Result: OK.

This test set verifies comma/semicolon list parsing and auto-repair of previously imported semicolon-separated character/tag strings.

## v3.6 checks

- `node --check js/*.js`
- `node --check tests/*.mjs`
- `node tests/smoke-oet-gotham-block.mjs`
- Full smoke suite: app start, DOM IDs, render, sort, quick update, quick add tolerance, list separators, character focus.



## v3.8 additional check

- App module imports are cache-busted for GitHub Pages (`app.js`, `timeline.js`, `sorting.js`, `events.js`, `formula.js`, `storage.js`, `quick_update.js`, `template.js`).
- Release block grouping supports `media` as object or string.


## v3.9 checks

Checked before packaging v3.9:

```bash
for f in js/*.js tests/*.mjs; do node --check "$f"; done
for t in tests/*.mjs; do node "$t"; done
```

Result: OK.

Specific fix verified: `tests/smoke-release-blocks.mjs` now creates one Gotham Pilot release block from child events with `media.type` values `event`, `clue`, and `background`.
