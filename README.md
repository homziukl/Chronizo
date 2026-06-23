# ⟁ Chronizo — Builder Chronologii

Przeglądarkowy builder osi czasu do budowania chronologii **dowolnych treści** —
seriali, filmów, gier, książek, komiksów czy wydarzeń historycznych. Tworzysz
rozgałęzione, wielowątkowe osie czasu, grupujesz wydarzenia w uniwersa i datujesz
je dokładnie, w przybliżeniu albo wg daty wydania.

Chronizo to vanilla HTML/CSS/JS, renderowanie na canvasie 2D, **zero zależności**,
**brak procesu budowania**. Otwierasz `index.html` i działasz.

## Funkcje

- **Wielouniwersowość** — równoległe osie czasu z własnymi kolorami; jedno
  uniwersum może obejmować kilka serii lub mediów.
- **Elastyczne datowanie** — daty dokładne (ISO `YYYY-MM-DD`), przybliżone lata,
  pory roku, ery, zakresy oraz fallback na **datę wydania**, gdy brak daty
  fabularnej (z wyraźnym oznaczeniem niepewności).
- **Quick Add** — wklejasz tekstową formułę (napisaną ręcznie lub wygenerowaną
  przez dowolne AI) i tworzysz z niej jeden lub wiele eventów naraz.
- **Wskazówki (clues)** — nierozpoznane klucze formuły stają się przesłankami do
  wnioskowania o dacie i pozostają zapisane przy evencie.
- **Segmenty** — flashbacki, retrospekcje, sceny po napisach, prologi, epilogi i
  podróże w czasie w obrębie jednego eventu.
- **Postacie i ślad wnioskowania** — przypisujesz postacie do eventów i
  dokumentujesz, dlaczego event stoi tam, gdzie stoi.
- **Pasma tła uniwersum** — każde uniwersum dostaje czytelne, podpisane tło w
  swoim kolorze.
- **Projekty plikowe** — zapis/odczyt plików `.chronizo.json`, eksport/import CSV.
- **Auto-zapis** — kopia w localStorage co 30 sekund.

## Szybki start

```bash
# Sklonuj i uruchom lokalny serwer
git clone https://github.com/homziukl/Chronizo.git
cd Chronizo
python -m http.server 8080
# Otwórz http://localhost:8080
```

## Użycie

1. Kliknij **+ Universe**, aby utworzyć tory (uniwersa) osi czasu.
2. Kliknij **+ Event**, aby dodać event do wybranego toru.
3. Przesuwaj (przeciąganie) i przybliżaj (scroll) płótno.
4. Kliknij kropkę eventu, aby go edytować.
5. **Save** eksportuje plik `.chronizo.json`, **Load** go wczytuje.
6. **Quick Add** otwiera okno formuły tekstowej (sekcja poniżej).

## Składnia formuły Quick Add

Poniższy blok jest **gotowym promptem** — skopiuj go w całości i przekaż dowolnemu
AI (ChatGPT, Claude, Gemini itp.), aby wygenerowało poprawną formułę Chronizo na
podstawie Twojego opisu chronologii. Wynik wklejasz do okna **Quick Add**.

````text
Wygeneruj formułę tekstową dla aplikacji Chronizo (builder osi czasu).
Trzymaj się DOKŁADNIE poniższych reguł składni i nie dodawaj nic poza formułą.

STRUKTURA
- Jeden event = jeden blok linii w formacie `klucz: wartość`.
- Wiele eventów oddzielaj linią zawierającą WYŁĄCZNIE separator: `---` albo `===`
  (co najmniej trzy znaki, np. `---` lub `======`).
- Każdy event MUSI mieć klucz `title:` — blok bez tytułu jest pomijany.
- Komentarz na końcu linii: spacja, `#`, spacja, treść (np. `date: 1267  # mój komentarz`).
  Hash bez spacji po obu stronach NIE jest komentarzem (więc `#127` i `path#anchor` przetrwają).

ROZPOZNANE KLUCZE (trafiają do pól eventu)
- title: tytuł eventu (WYMAGANY).
- universe: nazwa uniwersum/toru. Jeśli pominiesz, a podasz `media`, nazwa zostanie
  wyprowadzona automatycznie z tytułu medium (patrz niżej).
- media: tytuł medium, np. `The Witcher S01E05`. Oznaczenie odcinka (`SxxExx`,
  `#123`, `odc. N`, `ep. N`) jest wykrywane i odcinane od nazwy uniwersum.
- episode: jawne oznaczenie odcinka (jeśli nie chcesz go zapisywać w `media`).
- date: data fabularna. Format ISO `YYYY-MM-DD` (np. `2012-05-04`) → data DOKŁADNA;
  każda inna wartość (np. `2012`, `~1267`, `Before the war`) → data PRZYBLIŻONA.
- from / to: zakres dat (początek / koniec).
- season: pora roku — spring/summer/autumn(fall)/winter (akceptowane też PL:
  wiosna/lato/jesień/zima).
- era: nazwa ery (dowolny tekst).
- release: data wydania (fallback pozycjonowania, gdy brak daty fabularnej).
- evidence: jedno z: shown | described | mentioned | implied | speculated
  (inna wartość → domyślnie `shown`).
- source: źródło informacji (dowolny tekst).
- reasoning: ślad wnioskowania — dlaczego ta data/pozycja.
- tags: lista po przecinku, np. `tags: bitwa, finał`.
- characters: lista postaci po przecinku, np. `characters: Geralt, Ciri`.
- realm / planet / region / place: pola lokalizacji (`location` to alias `place`).
- sort: liczba całkowita — własna kolejność sortowania.
- seg: segment (podscena) eventu — patrz sekcja SEGMENTY.

KLUCZE NIEROZPOZNANE = WSKAZÓWKI (clues)  ← reguła kluczowa
- Każdy klucz spoza listy powyżej (np. `moon: full`, `weather: storm`,
  `event: lądowanie na Księżycu`) NIE jest błędem — zostaje zapisany jako
  Wskazówka `{ klucz, wartość }` w polu `attributes` eventu.
- Wskazówki to przesłanki do USTALENIA daty. Ścieżka A: to TY (zewnętrzne AI)
  wnioskujesz datę na podstawie tych wskazówek i wpisujesz ją w `date:`.
  Chronizo NIE liczy faz Księżyca, pogody ani niczego offline — tylko przechowuje
  wskazówki przy evencie dla identyfikowalności (traceability).

SEGMENTY (klucz `seg`)
- Składnia wartości:  <typ> [@data] [new|same] "etykieta"
- <typ> ∈ { flashback, callback, postcredits, prologue, epilogue, timetravel }
  (akceptowane też PL: retrospekcja→flashback, prolog, epilog, podroz→timetravel;
  nierozpoznany typ → flashback).
- @data — data przybliżona segmentu (np. `@1257`).
- new|same — tylko dla `timetravel`: `new` → podróż do NOWEGO uniwersum
  (new-universe), w innym razie to samo uniwersum (same-universe).
- "etykieta" — opis segmentu (w cudzysłowie; bez cudzysłowu brany jest pozostały tekst).
- Wiele segmentów = wiele linii `seg:` w tym samym bloku.

PRZYKŁAD KOMPLETNEJ FORMUŁY (dwa eventy)
title: Bitwa o Twierdzę
universe: Kroniki Pogranicza
media: Kroniki Pogranicza S02E07
date: 1453-06-12
season: summer
characters: Kapitan Mara, Zwiadowca Iven
evidence: shown
source: Kroniki Pogranicza, odcinek 2x07
reasoning: Datę wywnioskowano z pełni Księżyca i letniej pory przez AI
tags: bitwa, oblężenie
place: Twierdza Wschodnia
moon: full
weather: storm
seg: flashback @1448 "Dzieciństwo Mary w wiosce"
seg: postcredits "Sygnał z północnej wieży"
---
title: Powrót przez Wyrwę
universe: Kroniki Pogranicza
media: Kroniki Pogranicza: Wyrwa
date: ~1470
release: 2024-03-15
characters: Kapitan Mara, Mistrz Run
reasoning: Brak dokładnej daty fabularnej — pozycja wg daty wydania
seg: timetravel @1453 new "Skok do bitwy o Twierdzę"
````

Wynik: pierwszy event ma datę dokładną (ISO → `date.exact`), dwie wskazówki
(`moon`, `weather`) zachowane w `attributes` oraz dwa segmenty; drugi event ma
datę przybliżoną, datę wydania jako fallback pozycjonowania i segment podróży w
czasie do nowego uniwersum. Oznaczenie odcinka `S02E07` zostaje odcięte od nazwy
uniwersum, a wskazówka `moon: full` jest przesłanką, z której zewnętrzne AI
wywnioskowało datę dokładną (ścieżka A) — sama aplikacja niczego nie liczy.

> Ten sam przykład znajdziesz w aplikacji pod przyciskiem **„Show format”** w
> oknie Quick Add.

## Format pliku

Projekty zapisywane są jako `.chronizo.json` — przenośny format JSON:

```json
{
  "meta": { "name": "Moja chronologia", "author": "user" },
  "universes": [{ "id": "main", "name": "Main Timeline", "color": "#ff6b00" }],
  "events": [{ "title": "Bitwa o Twierdzę", "universe": "main", "date": { "approximate": "1453" } }],
  "connections": [{ "type": "crossover", "character": "Kapitan Mara" }]
}
```

Obsługiwany jest też eksport/import **CSV** (m.in. kolumny `characters`,
`attributes`, `sub_events`) z zachowaniem round-tripu danych.

## Opcjonalne dane demo

W repozytorium mogą znajdować się przykładowe zestawy danych (np. chronologia MCU
albo wycinek historii świata) jako **opcjonalne demo** prezentujące możliwości
narzędzia. To tylko przykładowe pliki do wczytania — nie są częścią tożsamości
Chronizo, które pozostaje narzędziem generycznym.

## Stack technologiczny

Vanilla HTML/CSS/JS — zero zależności. Renderowanie na canvasie 2D. Bez procesu
budowania i bez runnera testów (weryfikacja ręczna w przeglądarce).

## Licencja

MIT

## OET v3: Character Focus and Performance Mode

Chronizo now avoids drawing every character thread by default. For larger OET projects, use the **Character Focus** box in the top bar:

```txt
Jim Gordon
```

Chronizo will then draw only that character's route through the visible events and dim unrelated cards. This is intended for workflows like:

```txt
Show me Jim Gordon's path through Gotham S01.
Show me Oswald Cobblepot's path.
Show me Bruce Wayne's path.
```

The **Fast** toggle enables a lightweight performance mode. It hides heavier visual helpers such as connection wires, date bars and sub-event markers, while keeping the focused character thread and event cards visible.

The following settings are saved with the project/autosave:

```json
{
  "settings": {
    "performanceMode": false,
    "characterThreadMode": "focused",
    "focusedCharacter": "Jim Gordon"
  }
}
```


## OET v3.1 hotfix

If the top menu is dead after deploying v3, update to v3.1. The v3 package missed one Quick Update button ID, which stopped `app.js` during startup in browsers.
