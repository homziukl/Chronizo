# Chronizo OET — Changelog

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
