# ⟁ Chronizo — Omniversal Timeline Builder

Chronizo to lokalny, przeglądarkowy builder osi czasu dla projektu typu **Omniverse / Omniversal Event Tree**: komiksy, filmy, seriale, gry, książki i historia w jednym UI.

Aplikacja jest napisana w vanilla HTML/CSS/JS, bez build stepów i bez zależności. Otwierasz `index.html` albo uruchamiasz lokalny serwer i pracujesz.

## Start

Najprościej:

```txt
index.html
```

Lepiej, zwłaszcza na GitHub/local dev:

```bash
python -m http.server 8080
```

i otwórz:

```txt
http://localhost:8080
```

## Co zostało ustabilizowane w tej wersji

- bezpieczniejszy import `.chronizo.json`, także starszych/ręcznie edytowanych plików,
- normalizacja eventów, uniwersów, lokalizacji, media i połączeń,
- `Custom / manual order` w dropdownie sortowania,
- faktyczny Shift+click range select,
- `Clear selection` ukrywa banner zaznaczenia,
- CSV import widoczny w UI,
- lepszy merge projektów: duplikat = tytuł + uniwersum + data/media/source, nie sam tytuł,
- try/catch przy autosave do localStorage,
- podstawowe zabezpieczenie tooltipów i UI przed HTML injection z importowanych danych,
- README i Quick Add są zsynchronizowane: nieznane klucze są pomijane z ostrzeżeniem, nie zapisywane jako `attributes`.

## Podstawowy workflow dla OET

1. Utwórz uniwersa/linie, np. `DC Earth-2`, `Marvel Earth-616`, `Star Wars Legends`.
2. Dodawaj eventy ręcznie przez `+ Event` albo hurtowo przez `Quick Add`.
3. Dla każdego eventu zapisuj:
   - medium,
   - issue/episode,
   - datę wydania,
   - datę fabularną, jeśli znana,
   - evidence,
   - source,
   - reasoning.
4. Regularnie klikaj `Save`, żeby pobrać `.chronizo.json` do repo/backupu.

## Quick Add — składnia

Jeden event to blok `key: value`. Kilka eventów oddzielasz linią:

```txt
---
```

Przykład:

```txt
title: Action Comics #1 — Superman stops the car
universe: DC Earth-2
media: Action Comics #1
type: comic
date: 1938
release: 1938-04-18
characters: Superman, Lois Lane
evidence: shown
source: Action Comics #1, story A
reasoning: Publication-based placement for OET; exact in-story date is not stated.
tags: OET, Golden Age, Superman
```

Rozpoznane klucze:

```txt
title
universe
speculative
media
type
episode
date
from
to
season
era
release
evidence
source
reasoning
tags
characters
realm
planet
region
place / location
sort
seg
icon
background
```

Nieznane klucze, np. `moon:` albo `weather:`, są pomijane z ostrzeżeniem. Wskazówki do datowania wpisuj w `reasoning:` albo w opisie, który dajesz AI przed wygenerowaniem formuły.

## Segmenty / flashbacki

Format:

```txt
seg: flashback @1935 "Earlier investigation"
seg: timetravel @1453 new "Jump to an alternate branch"
```

Typy:

```txt
flashback
callback
postcredits
prologue
epilogue
timetravel
```

## Sortowanie

Dostępne tryby:

- `In-Universe Chronology`,
- `Release Order`,
- `Mixed`,
- `Custom / manual order`.

Przeciąganie eventów na osi zapisuje `sortOrder.custom`. Żeby ręczna kolejność była głównym porządkiem, wybierz `Custom / manual order`.

## Import/export

- `Save` — zapisuje `.chronizo.json`.
- `Load` — wczytuje `.chronizo.json`.
- `Merge` — scala inny projekt z aktualnym.
- `CSV↓` — eksport CSV.
- `CSV↑` — import CSV i merge do aktualnego projektu.

## Pliki demo

W folderze `data/` są przykładowe projekty:

```txt
data/example-mcu.chronizo.json
data/world-history.chronizo.json
```

To są tylko dane demo, nie część właściwego OET.

## Status

Ta paczka jest wersją stabilizacyjną: można zacząć używać jej jako UI do Omniversal Event Tree, a kolejne funkcje dodawać iteracyjnie.
