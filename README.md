# ⟁ Chronizo — Builder Chronologii / Omniversal Event Tree UI

Chronizo to przeglądarkowy builder osi czasu do budowania chronologii **dowolnych treści** — seriali, filmów, gier, książek, komiksów czy wydarzeń historycznych. Nadaje się jako UI dla projektu **Omniversal Event Tree**: dodajesz eventy z mediów, które obejrzałeś/przeczytałeś, oznaczasz źródło, datę fabularną, datę wydania, postacie, tagi i poziom pewności.

Projekt to vanilla HTML/CSS/JS, canvas 2D, **zero zależności** i **brak procesu budowania**. Możesz odpalić go lokalnie albo przez GitHub Pages.

## Funkcje

- **Wielouniwersowość** — osobne tory/uniwersa z kolorami i rozgałęzieniami.
- **Elastyczne datowanie** — data dokładna `YYYY-MM-DD`, data przybliżona, zakres, era, sezon albo fallback na datę wydania.
- **Quick Add** — szybkie dodawanie wielu eventów z tekstowej formuły.
- **Quick Update / Batch Update** — szybka korekta istniejących eventów, np. gdy późniejszy odcinek potwierdzi datę wcześniejszych scen.
- **Evidence** — `shown`, `described`, `mentioned`, `implied`, `speculated`.
- **Media source** — typ medium, tytuł, odcinek/issue, źródło i reasoning.
- **Postacie, tagi, lokalizacja** — przydatne do filtrowania i późniejszego poprawiania grup eventów.
- **Segmenty** — flashbacki, callbacki, prologi, epilogi, sceny po napisach i time travel w obrębie eventu.
- **Manual order** — własna kolejność sortowania.
- **CSV import/export** i `.chronizo.json` backup.
- **Dark / Light mode** — przełącznik w górnym menu.

## Szybki start lokalnie

```bash
git clone https://github.com/homziukl/Chronizo.git
cd Chronizo
python -m http.server 8080
```

Otwórz:

```txt
http://localhost:8080
```

Na GitHub Pages działa jako statyczna strona, np.:

```txt
https://homziukl.github.io/Chronizo/
```

## Workflow OET

1. Mówisz AI/asystentowi, co obejrzałeś/przeczytałeś i jakie zauważyłeś ciekawostki.
2. AI dopytuje o brakujące rzeczy: medium, odcinek/issue, postacie, źródło daty, czy data jest pokazana czy wywnioskowana.
3. AI generuje gotowy blok **Quick Add**.
4. Wklejasz go do Chronizo.
5. Gdy późniejsze medium doprecyzuje chronologię, AI generuje **Quick Update**, który poprawia kilka eventów naraz.

## Quick Add — dodawanie eventów

Jeden event to blok `key: value`. Wiele eventów oddzielasz linią `---`.

```txt
title: Action Comics #1 — Superman stops the car
universe: DC Earth-2
media: Action Comics #1
date: 1938
release: 1938-04-18
type: comic
characters: Superman, Lois Lane
evidence: shown
source: Action Comics #1, story A
reasoning: Exact in-story date is not stated; initial OET placement uses physical release date / publication era.
tags: OET, Golden Age, Superman, date-inferred
---
title: Clark Kent joins the Daily Star
universe: DC Earth-2
media: Action Comics #1
date: 1938
release: 1938-04-18
type: comic
characters: Clark Kent, George Taylor
evidence: shown
source: Action Comics #1, story A
reasoning: Same story sequence as the earlier Superman debut event.
tags: OET, Golden Age, Superman, Daily Star, date-inferred
```

### Rozpoznane klucze Quick Add

```txt
title, universe, speculative, media, episode, type/media_type,
date, from, to, season, era, release,
evidence, source, reasoning,
tags, characters,
realm, planet, region, place/location,
sort, icon, background,
seg
```

`date:` w formacie `YYYY-MM-DD` zapisuje się jako data dokładna. Inna wartość, np. `1938`, `~2012`, `Before the war`, zapisuje się jako data przybliżona.

Nierozpoznane klucze są **pomijane z ostrzeżeniem**. Wskazówki typu pogoda, faza księżyca, dialogi i niepewność najlepiej wpisywać w `reasoning:` albo podać asystentowi przed wygenerowaniem formuły.

## Quick Update — poprawianie istniejących eventów

Quick Update służy do sytuacji typu: odcinek 3 potwierdza, że kilka eventów z odcinka 1 działo się konkretnego dnia. Każdy blok update musi mieć:

```txt
mode: update
match: ...
co najmniej jedno pole do zmiany
```

Przykład:

```txt
mode: update
match: tag=TVA-arc
match: media=Loki S01E01
date: 2012-05
evidence: mentioned
add_tags: date-confirmed
remove_tags: date-inferred
append_reasoning: Loki S01E03 confirms this part of the TVA arc happens shortly after the 2012 New York incident.
```

Chronizo przed zapisem pokaże potwierdzenie z listą eventów, które zostaną zmienione.

### Matchery

```txt
match: tag=...
match: media=...
match: title=...
match: source=...
match: universe=...
match: character=...
match: evidence=...
match: id=...
```

Kilka linii `match:` w jednym bloku działa jako **AND**. Czyli event musi spełnić wszystkie warunki.

### Pola, które można zmienić przez Quick Update

```txt
date, from, to, season, era, release,
evidence, source, reasoning, append_reasoning,
universe, speculative,
media, episode, type,
tags, add_tags, remove_tags,
characters, add_characters, remove_characters,
realm, planet, region, place/location,
sort, icon, background
```

## Segmenty

Segment dodajesz przez `seg:`:

```txt
seg: flashback @1448 "Childhood scene"
seg: postcredits "Signal from the tower"
seg: timetravel @1453 new "Jump back to the siege"
```

Typy:

```txt
flashback, callback, postcredits, prologue, epilogue, timetravel
```

## Backup

Najważniejszy nawyk: po większej sesji kliknij **Save** i trzymaj plik `.chronizo.json` w repo albo osobnym folderze backupów.

CSV jest dobre do Excela i szybkiego podglądu, ale głównym formatem roboczym zostaje `.chronizo.json`.

## Testy techniczne

```bash
node --check js/app.js js/events.js js/formula.js js/quick_update.js js/sorting.js js/storage.js js/template.js js/timeline.js
node tests/smoke-render.mjs
node tests/smoke-sort.mjs
node tests/smoke-quick-update.mjs
```

## Licencja

MIT
