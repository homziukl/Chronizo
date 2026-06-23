# Tested — Chronizo OET v3.10

Validated before packaging:

```txt
node --check js/app.js
node --check js/timeline.js
node --check js/storage.js
node --check js/formula.js
node --check js/quick_update.js
node --check js/sorting.js
node --check js/events.js
node --check js/template.js
```

Smoke tests:

```txt
smoke-app-start OK
smoke-character-focus OK
smoke-dom-ids OK
smoke-list-separators OK
smoke-oet-gotham-block OK
smoke-quick-update OK
smoke-quickadd-tolerance OK
smoke-release-blocks OK
smoke-render OK
smoke-sort OK
```

Manual fix intent:

```txt
Deleting old events should not leave the app in a locked state.
+ Event and Delete remain usable after partial deletes.
Release-order blocks are view-only and are not selected as real event IDs.
```
