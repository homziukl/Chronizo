
## v3.3 — hard cache/syntax hotfix

- Rebuilt `js/template.js` without a JavaScript template literal so embedded documentation backticks cannot break browser parsing.
- Added cache-busting query strings for GitHub Pages: `index.html` now loads `js/app.js?v=3.3`, and `app.js` imports `template.js?v=3.3`.
- Target fix: `Uncaught SyntaxError: unexpected token: identifier template.js:148:20`.

# Chronizo OET — Changelog

## OET v3.2 — App startup hotfix

- Fixed the real cause of the dead top menu in v3/v3.1: `js/template.js` contained unescaped backticks inside the Quick Add AI prompt template string.
- Because `app.js` imports `template.js`, that syntax error stopped the whole application before any button listeners were attached.
- Escaped the backticks in the AI prompt.
- Added `tests/smoke-app-start.mjs`, which imports the full app in a minimal DOM and verifies that **+ Event** and **Theme** listeners attach and can be clicked.
- Re-ran all smoke tests.


## v3 — Foundation & Character Focus

This release prepares Chronizo for larger Omniversal Event Tree projects without over-optimizing too early.

### Added

- Character Focus control in the top bar.
  - Type/select a character, for example `Jim Gordon`.
  - Chronizo draws only that character's timeline thread.
  - Related event cards stay emphasized; unrelated cards are dimmed.
- Character datalist generated from the current project.
- Focus banner with active character and matching event count.
- Clear focus button in the top bar and banner.
- Performance Mode (`Fast`) toggle.
  - Hides heavier visual helpers such as connection wires, date bars and sub-event markers.
  - Keeps event cards and the focused character path readable.
- Project settings persisted in the JSON/autosave:
  - `performanceMode`
  - `characterThreadMode`
  - `focusedCharacter`
- Schema metadata updated to `schemaVersion: 3`.
- Smoke test for character focus.

### Changed

- Character lines are no longer drawn for every character by default.
- Default character thread mode is now `focused`: no character line is drawn until a character is selected.
- Refresh now reapplies project settings to the renderer after load/new/merge.

### Kept intentionally simple

- Storage is still localStorage for now.
- Renderer is not fully virtualized yet.
- The goal of v3 is to make the app usable and scalable enough for early OET work, not to rewrite the engine prematurely.
## OET v3.1 — Top menu hotfix

- Fixed a startup-breaking missing `btn-quickupdate-spec` button in the Quick Add dialog.
- Added the missing **Show Update format** button.
- Made the Quick Update format listener defensive so the whole app will not die if that optional button is missing in a cached HTML version.
- Added a DOM ID smoke test to catch this class of bug before packaging.

