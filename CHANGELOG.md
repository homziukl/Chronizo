# Changelog

## Chronizo stable OET patch

Stabilization pass to make the uploaded Chronizo project ready for real use as an Omniversal Event Tree UI.

### Fixed / improved

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

### Usage

Open `index.html` or run:

```bash
python -m http.server 8080
```

Then use Save/Load for `.chronizo.json` backups.
