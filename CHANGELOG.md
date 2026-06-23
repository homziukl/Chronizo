# Changelog

## Chronizo OET stable v2

### Added

- Added **Quick Update / Batch Update** inside the existing Quick Add dialog.
- Added update formula example button: **Show update format**.
- Quick Update supports matching existing events by `tag`, `media`, `title`, `source`, `universe`, `character`, `evidence`, or `id`.
- Quick Update supports changing date, date range, evidence, source, reasoning, universe, media, tags, characters, location, sort order and appearance.
- Quick Update shows a browser confirmation with the matched event titles before applying changes.
- Each updated event receives an `updateHistory` entry in the saved JSON.
- Added `js/quick_update.js` and `tests/smoke-quick-update.mjs`.

### Fixed / improved

- Strengthened light mode by setting the theme on both `html` and `body`, adding explicit `theme-light/theme-dark` classes, and updating native `color-scheme`.
- Light mode now also hardens inputs, placeholders, dialogs and minimap/backdrop colors.
- Theme button text now changes between `☀ Light` and `🌙 Dark`.
- README rewritten to match actual parser behavior and OET workflow.

## Chronizo stable OET patch

Initial stabilization pass to make the uploaded Chronizo project ready for real use as an Omniversal Event Tree UI.

- Added visible `CSV↑` import button.
- Added `Custom / manual order` sort option.
- Implemented real Shift+click range selection.
- `Clear selection` now also updates/hides the selection banner.
- Hardened JSON load/autosave with normalization and try/catch.
- Merge now avoids false duplicates by comparing title + universe + date/media/source.
- Imported/legacy projects are normalized so missing `date`, `media`, `location`, `characters`, `subEvents`, `sortOrder`, `appearance`, and `connections` do not crash the renderer.
- Basic escaping for tooltip/universe HTML generated from imported data.
- Quick Add docs/template aligned: unknown keys are skipped with warnings; use `reasoning:` for clues.
- Added `type:` support to Quick Add formulas.
- Removed obsolete temporary verification files and replaced them with small smoke tests in `tests/`.
