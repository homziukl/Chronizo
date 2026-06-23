// template.js — Single source of truth for the Quick Add formula template.
//
// Exports:
//   AI_PROMPT       — a ready-to-copy instruction prompt for ANY AI (ChatGPT,
//                     Claude, Gemini, ...). It tells the AI to take a free-form
//                     description, infer the in-universe date from its clues,
//                     and return a valid Chronizo event block. Copy → paste
//                     into the AI, then paste its output back into Quick Add.
//   EXAMPLE_FORMULA — a short, parseable example inserted by "Show format" so
//                     the user can edit it directly in the Quick Add box.
//
// Keep this in sync with README.md → "Quick Add formula syntax".

// A complete, self-contained example formula: recognized keys + an appearance
// example (icon/background) + segments. Used both inside AI_PROMPT and by the
// "Show format" button. It contains NO clue lines (e.g. `moon: full`): clues
// belong in the free-form description fed to the AI, never in the event block.
export const EXAMPLE_FORMULA = [
  'title: Siege of the Eastern Keep',
  'universe: Borderland Chronicles',
  'media: Borderland Chronicles S02E07',
  'date: 1453-06-12',
  'season: summer',
  'characters: Captain Mara, Scout Iven',
  'evidence: shown',
  'type: series',
  'source: Borderland Chronicles, episode 2x07',
  'reasoning: Date inferred by the AI from a full moon and high summer',
  'tags: battle, siege',
  'place: Eastern Keep',
  'icon: 🏰',
  'background: #2b2f4a',
  'seg: flashback @1448 "Mara\'s childhood in the village"',
  'seg: postcredits "A signal from the northern tower"',
  '---',
  'title: Return through the Rift',
  'universe: Borderland Chronicles',
  'media: Borderland Chronicles: The Rift',
  'date: ~1470',
  'release: 2024-03-15',
  'characters: Captain Mara, Rune Master',
  'reasoning: No exact in-universe date — positioned by release date',
  'icon: 🌀',
  'seg: timetravel @1453 new "Jump back to the siege"',
].join('\n');



// Quick Update changes existing events instead of adding new ones. It is used
// when a later episode/issue confirms a date or other metadata for events that
// were initially placed by release date or speculation.
export const UPDATE_FORMULA = [
  'mode: update',
  'match: tag=OET-test',
  'date: 2012-05',
  'evidence: mentioned',
  'add_tags: date-confirmed',
  'remove_tags: date-inferred',
  'append_reasoning: Later media confirmed the chronology; date corrected from release-based placement.',
  '---',
  'mode: update',
  'match: media=Example Series S01E01',
  'match: tag=opening-scene',
  'date: 1999-07-16',
  'source: Example Series S01E03 dialogue',
  'reasoning: Episode 3 gives the exact day; this updates the earlier approximate placement.'
].join('\n');

// Ready-to-copy instruction prompt for any AI. It explains what Chronizo is,
// the Path A workflow (the AI infers the date from clues in a free-form
// description and returns a ready-to-paste block), the full Quick Add syntax,
// the "unrecognized key = skipped" rule, the segment syntax, and embeds the
// complete EXAMPLE_FORMULA so the AI has a concrete target. Paste this into
// ChatGPT/Claude/Gemini, add your free-form description, then paste the AI's
// output back into the Quick Add box.
// AI prompt assembled without template literals to avoid browser syntax errors from embedded backticks.
const AI_PROMPT_LINES = [
  "You generate a text formula for Chronizo (a browser-based timeline builder).",
  "Follow the syntax rules below EXACTLY and output nothing but the formula.",
  "",
  "WHAT CHRONIZO DOES",
  "- It builds a chronology of any content (TV series, films, games, books,",
  "  comics, historical events). Each event is one point on the timeline,",
  "  assigned to a \"universe\" (a track) that may span several media.",
  "",
  "YOUR JOB (the AI infers the date)",
  "- The user gives you a FREE-FORM description in natural language that contains",
  "  clues, for example: \"watched episode 3; they said it takes place in 985 BCE;",
  "  it was night, a full moon, the sky looked northern-hemisphere; a real solar",
  "  eclipse was mentioned\".",
  "- YOU infer the in-universe date from those clues (moon phase, weather, real",
  "  historical events, dialogue, ...) and write the result into the \\`date:\\` field.",
  "- Chronizo does NOT compute moon phases, weather or anything offline. It only",
  "  parses the structured block you return.",
  "",
  "STRUCTURE",
  "- One event = a block of \\`key: value\\` lines.",
  "- Separate multiple events with a line containing ONLY a separator: \\`---\\` or",
  "  \\`===\\` (at least three characters).",
  "- Every event MUST have a \\`title:\\` key — a block without a title is skipped.",
  "- Trailing comment: space \\`#\\` space, then text (e.g. \\`date: 1267  # note\\`).",
  "  A hash without spaces on both sides is NOT a comment (\\`#127\\`, \\`path#anchor\\`",
  "  survive).",
  "",
  "RECOGNIZED KEYS (these map to event fields)",
  "- title: event title (REQUIRED).",
  "- universe: universe/track name. If omitted but \\`media\\` is given, the name is",
  "  derived automatically from the media title (episode marker and any subtitle",
  "  after a colon are stripped).",
  "- media: media title, e.g. \\`The Witcher S01E05\\`.",
  "- date: in-universe date. ISO \\`YYYY-MM-DD\\` -> stored as an EXACT date; any other",
  "  value (\\`2012\\`, \\`~1267\\`, \\`Before the war\\`) -> stored as an APPROXIMATE date.",
  "- season: spring | summer | autumn (fall) | winter.",
  "- era: era name (free text).",
  "- from / to: a date range.",
  "- release: release/air date (used to position the event when there is no",
  "  in-universe date).",
  "- evidence: shown | described | mentioned | implied | speculated.",
  "- source: where the information comes from.",
  "- reasoning: a trace of your inference — why this date/position.",
  "- tags: comma- or semicolon-separated list.",
  "- characters: comma- or semicolon-separated list of character names.",
  "- realm / planet / region / place: location fields (\\`location\\` is an alias of",
  "  \\`place\\`).",
  "- sort: an integer — manual ordering.",
  "- seg: a segment (sub-scene) of the event — see below.",
  "- icon: an emoji or short symbol shown next to the title (appearance).",
  "- background: a CSS color (e.g. \\`#2b2f4a\\`) for the event block (appearance).",
  "",
  "UNRECOGNIZED KEYS ARE SKIPPED  <- key rule",
  "- Any key that is NOT in the list above (e.g. \\`moon: full\\`, \\`weather: storm\\`)",
  "  is SKIPPED by Chronizo: it creates no field and produces a warning.",
  "- Clues like the moon phase or weather are INPUT for YOU to infer the date.",
  "  Keep them in the free-form description — do NOT emit them as keys in the",
  "  block. Put your conclusion in \\`date:\\` (and optionally in \\`reasoning:\\`).",
  "",
  "SEGMENTS (key \\`seg\\`)",
  "- Value syntax:  <type> [@date] [new|same] \"label\"",
  "- <type> is one of { flashback, callback, postcredits, prologue, epilogue,",
  "  timetravel } (an unknown type falls back to flashback).",
  "- @date — the segment's approximate date (e.g. \\`@1257\\`).",
  "- new|same — only for \\`timetravel\\`: \\`new\\` -> a new universe, otherwise the same.",
  "- \"label\" — the segment description in quotes.",
  "- Multiple segments = multiple \\`seg:\\` lines in the same block.",
  "",
  "QUICK UPDATE / BATCH UPDATE",
  "- Chronizo also supports updating existing events from the same box.",
  "- Use this only when the user wants to correct existing events, not add new ones.",
  "- Every update block must contain one or more match rules and at least one changed field.",
  "- Match examples: \\`match: tag=TVA-arc\\`, \\`match: media=Loki S01E01\\`, \\`match: title=Opening scene\\`, \\`match: source=Action Comics #1\\`, \\`match: universe=DC Earth-2\\`.",
  "- Matching rules inside one block are combined with AND.",
  "- Update examples: \\`date: 1938-04-18\\`, \\`evidence: mentioned\\`, \\`add_tags: date-confirmed\\`, \\`remove_tags: date-inferred\\`, \\`append_reasoning: Later issue confirms the date\\`.",
  "",
  "COMPLETE ADD EXAMPLE FORMULA (two events)",
  ...EXAMPLE_FORMULA,
  "",
  "COMPLETE UPDATE EXAMPLE FORMULA",
  ...UPDATE_FORMULA,
  "",
  "Return ONLY the formula in the format above, with no preamble.",
];
export const AI_PROMPT = AI_PROMPT_LINES.join('\n');
