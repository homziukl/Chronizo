// template.js — Single source of truth for the Quick Add formula template.
//
// Exports:
//   AI_PROMPT       — a ready-to-copy instruction prompt for ANY AI (ChatGPT,
//                     Claude, Gemini, ...) describing how Chronizo Quick Add
//                     works and how to produce a valid formula. Copy → paste
//                     into the AI, then paste its output back into Quick Add.
//   EXAMPLE_FORMULA — a short, parseable example inserted by "Show format" so
//                     the user can edit it directly in the Quick Add box.
//
// Keep this in sync with README.md → "Składnia formuły Quick Add".

// A complete, self-contained example formula (recognized keys + unrecognized
// clues + segments). Used both inside AI_PROMPT and by the "Show format" button.
export const EXAMPLE_FORMULA = [
  'title: Bitwa o Twierdzę',
  'universe: Kroniki Pogranicza',
  'media: Kroniki Pogranicza S02E07',
  'date: 1453-06-12',
  'season: summer',
  'characters: Kapitan Mara, Zwiadowca Iven',
  'evidence: shown',
  'source: Kroniki Pogranicza, odcinek 2x07',
  'reasoning: Datę wywnioskowano z pełni Księżyca i letniej pory przez AI',
  'tags: bitwa, oblężenie',
  'place: Twierdza Wschodnia',
  'moon: full',
  'weather: storm',
  'seg: flashback @1448 "Dzieciństwo Mary w wiosce"',
  'seg: postcredits "Sygnał z północnej wieży"',
  '---',
  'title: Powrót przez Wyrwę',
  'universe: Kroniki Pogranicza',
  'media: Kroniki Pogranicza: Wyrwa',
  'date: ~1470',
  'release: 2024-03-15',
  'characters: Kapitan Mara, Mistrz Run',
  'reasoning: Brak dokładnej daty fabularnej — pozycja wg daty wydania',
  'seg: timetravel @1453 new "Skok do bitwy o Twierdzę"',
].join('\n');

// Ready-to-copy instruction prompt for any AI. Explains what Chronizo is, the
// full Quick Add syntax, the "unrecognized key = clue" rule (path A), the
// segment syntax, and embeds the complete EXAMPLE_FORMULA so the AI sees a
// concrete target. Paste this into ChatGPT/Claude/Gemini, describe your
// chronology, then paste the AI's output back into the Quick Add box.
export const AI_PROMPT = `Wygeneruj formułę tekstową dla aplikacji Chronizo (przeglądarkowy builder osi czasu).
Trzymaj się DOKŁADNIE poniższych reguł składni i nie dodawaj nic poza formułą.

CO ROBI CHRONIZO
- Buduje chronologię dowolnych treści (seriale, filmy, gry, książki, komiksy,
  wydarzenia historyczne). Każdy event to jedno wydarzenie na osi czasu,
  przypisane do "uniwersum" (toru), który może obejmować kilka mediów.

STRUKTURA
- Jeden event = blok linii w formacie \`klucz: wartość\`.
- Wiele eventów oddzielaj linią zawierającą WYŁĄCZNIE separator: \`---\` albo \`===\`
  (co najmniej trzy znaki).
- Każdy event MUSI mieć klucz \`title:\` — blok bez tytułu jest pomijany.
- Komentarz na końcu linii: spacja \`#\` spacja, treść (np. \`date: 1267  # uwaga\`).
  Hash bez spacji po obu stronach NIE jest komentarzem (\`#127\`, \`path#anchor\` przetrwają).

ROZPOZNANE KLUCZE (trafiają do pól eventu)
- title: tytuł eventu (WYMAGANY).
- universe: nazwa uniwersum/toru. Pominięty + podany \`media\` -> nazwa wyprowadzona
  automatycznie z tytułu medium (oznaczenie odcinka i podtytuł po dwukropku odcinane).
- media: tytuł medium, np. \`The Witcher S01E05\`.
- episode: jawne oznaczenie odcinka.
- date: data fabularna. ISO \`YYYY-MM-DD\` -> data DOKLADNA; inna wartosc
  (\`2012\`, \`~1267\`, \`Before the war\`) -> data PRZYBLIZONA.
- from / to: zakres dat.
- season: spring/summer/autumn(fall)/winter.
- era: nazwa ery (tekst).
- release: data wydania (fallback pozycjonowania, gdy brak daty fabularnej).
- evidence: shown | described | mentioned | implied | speculated.
- source: zrodlo informacji.
- reasoning: slad wnioskowania — dlaczego ta data/pozycja.
- tags: lista po przecinku.
- characters: lista postaci po przecinku.
- realm / planet / region / place: pola lokalizacji (\`location\` to alias \`place\`).
- sort: liczba calkowita — wlasna kolejnosc.
- seg: segment (podscena) eventu — patrz nizej.

KLUCZE NIEROZPOZNANE = WSKAZOWKI (clues)  <- regula kluczowa
- Kazdy klucz spoza listy powyzej (np. \`moon: full\`, \`weather: storm\`) NIE jest
  bledem — zostaje zapisany jako Wskazowka { klucz, wartosc } w polu attributes.
- Wskazowki to przeslanki do USTALENIA daty. Sciezka A: to TY (AI) wnioskujesz date
  z tych wskazowek i wpisujesz ja w \`date:\`. Chronizo NIE liczy faz Ksiezyca,
  pogody ani niczego offline — tylko przechowuje wskazowki przy evencie.

SEGMENTY (klucz \`seg\`)
- Skladnia wartosci:  <typ> [@data] [new|same] "etykieta"
- <typ> nalezy do { flashback, callback, postcredits, prologue, epilogue, timetravel }
  (nierozpoznany typ -> flashback).
- @data — data przyblizona segmentu (np. \`@1257\`).
- new|same — tylko dla \`timetravel\`: \`new\` -> nowe uniwersum, inaczej to samo.
- "etykieta" — opis segmentu w cudzyslowie.
- Wiele segmentow = wiele linii \`seg:\` w tym samym bloku.

PRZYKLAD KOMPLETNEJ FORMULY (dwa eventy)
${EXAMPLE_FORMULA}

Zwroc WYLACZNIE formule w powyzszym formacie, bez komentarza wstepnego.`;
