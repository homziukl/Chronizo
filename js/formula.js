// formula.js — "Quick Add" text formula parser
//
// Lets a user (or an AI) describe events in a compact key:value text block and
// paste it straight into Chronizo. Pure module: no DOM, no storage — it only
// turns text into neutral event-data objects. The app layer resolves universe
// names to ids and inserts the events.
//
// Format (one event per block, blocks separated by a line that is just "---"):
//
//   title: Battle of the Forest
//   universe: The Witcher          # optional — derived from `media` if omitted
//   media: The Witcher S01E05
//   date: 1267                     # exact ISO (YYYY-MM-DD) or approximate text
//   season: winter
//   characters: Geralt, Ciri
//   evidence: shown
//   moon: full                     # unknown keys -> attributes (clues)
//   reasoning: Mentioned in dialogue
//   seg: flashback @1257 "Ciri's childhood"
//   seg: timetravel @1300 new "Jump forward"
//   ---
//   title: Next event
//   date: 1268
//
// Path A: the in-universe date is resolved by an AI BEFORE pasting. Clue keys
// (moon, weather, ...) are preserved as attributes for traceability.

const SEASON_MAP = {
  spring: 'spring', wiosna: 'spring',
  summer: 'summer', lato: 'summer',
  autumn: 'autumn', fall: 'autumn', jesien: 'autumn', 'jesień': 'autumn',
  winter: 'winter', zima: 'winter'
};

const EVIDENCE_VALUES = new Set(['shown', 'described', 'mentioned', 'implied', 'speculated']);

const SEG_TYPES = {
  flashback: 'flashback', retrospekcja: 'flashback',
  callback: 'callback',
  postcredits: 'postcredits', 'post-credits': 'postcredits',
  prologue: 'prologue', prolog: 'prologue',
  epilogue: 'epilogue', epilog: 'epilogue',
  timetravel: 'timetravel', 'time-travel': 'timetravel', podroz: 'timetravel'
};

const ISO_DATE = /^-?\d{1,6}-\d{2}-\d{2}$/;
const EPISODE_RE = /(S\d{1,2}E\d{1,3}|#\d+|odc\.?\s*\d+|ep\.?\s*\d+)/i;

// Parse a whole formula string into { events, errors }.
export function parseFormula(text) {
  const errors = [];
  if (!text || !text.trim()) return { events: [], errors: ['Empty formula'] };

  const blocks = splitBlocks(text);
  const events = [];

  blocks.forEach((block, i) => {
    const parsed = parseBlock(block);
    if (!parsed) return; // empty block, skip silently
    if (!parsed.title) {
      errors.push(`Block ${i + 1}: missing "title:" — skipped`);
      return;
    }
    events.push(parsed);
  });

  if (events.length === 0 && errors.length === 0) {
    errors.push('No events found');
  }
  return { events, errors };
}

// Split on lines that contain only a separator: --- or ===
function splitBlocks(text) {
  const blocks = [];
  let current = [];
  text.split(/\r?\n/).forEach(line => {
    if (/^\s*(-{3,}|={3,})\s*$/.test(line)) {
      blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  });
  blocks.push(current);
  return blocks.filter(b => b.some(l => l.trim()));
}

function parseBlock(lines) {
  const data = {
    title: '',
    _universeName: '',          // resolved to id by the app layer
    speculativeUniverseName: '',
    date: { exact: null, approximate: '', rangeFrom: '', rangeTo: '', season: '', era: '' },
    releaseDate: '',
    media: { type: '', title: '', episode: '' },
    evidence: 'shown',
    source: '',
    reasoning: '',
    location: { realm: '', planet: '', region: '', place: '' },
    tags: [],
    characters: [],
    attributes: [],
    subEvents: [],
    sortOrder: { custom: 0 }
  };
  let any = false;

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    any = true;
    applyField(data, key, value);
  }

  if (!any) return null;

  // Derive universe name from media title when not given explicitly.
  if (!data._universeName && data.media.title) {
    data._universeName = universeNameFromMedia(data.media.title);
  }
  return data;
}

// Comments: trailing " # ..." — the hash must have whitespace on BOTH sides,
// so issue numbers ("#127") and URL anchors ("path#anchor") survive.
function stripComment(line) {
  return line.replace(/\s+#\s.*$/, '');
}

function applyField(data, key, value) {
  switch (key) {
    case 'title': data.title = value; break;
    case 'universe': data._universeName = value; break;
    case 'speculative': data.speculativeUniverseName = value; break;
    case 'media': {
      const ep = value.match(EPISODE_RE);
      if (ep) {
        data.media.episode = ep[0];
        data.media.title = value.replace(EPISODE_RE, '').replace(/[–—-]\s*$/, '').trim();
      } else {
        data.media.title = value;
      }
      break;
    }
    case 'episode': data.media.episode = value; break;
    case 'date':
      if (ISO_DATE.test(value)) data.date.exact = value;
      else data.date.approximate = value;
      break;
    case 'from': data.date.rangeFrom = value; break;
    case 'to': data.date.rangeTo = value; break;
    case 'season': data.date.season = SEASON_MAP[value.toLowerCase()] || ''; break;
    case 'era': data.date.era = value; break;
    case 'release': data.releaseDate = value; break;
    case 'evidence': {
      const v = value.toLowerCase();
      data.evidence = EVIDENCE_VALUES.has(v) ? v : 'shown';
      break;
    }
    case 'source': data.source = value; break;
    case 'reasoning': data.reasoning = value; break;
    case 'tags': data.tags = splitList(value); break;
    case 'characters': data.characters = splitList(value); break;
    case 'realm': data.location.realm = value; break;
    case 'planet': data.location.planet = value; break;
    case 'region': data.location.region = value; break;
    case 'place':
    case 'location': data.location.place = value; break;
    case 'sort': data.sortOrder.custom = parseInt(value) || 0; break;
    case 'seg': {
      const seg = parseSegment(value);
      if (seg) data.subEvents.push(seg);
      break;
    }
    default:
      // Unknown key → clue attribute.
      data.attributes.push({ key, value });
  }
}

// seg value: "<type> [@date] [new|same] \"label\"" (label may be unquoted)
function parseSegment(value) {
  if (!value) return null;
  let rest = value.trim();

  const typeMatch = rest.match(/^([\w-]+)/);
  const rawType = typeMatch ? typeMatch[1].toLowerCase() : 'flashback';
  const type = SEG_TYPES[rawType] || 'flashback';
  if (typeMatch) rest = rest.slice(typeMatch[0].length).trim();

  let date = '';
  const dateMatch = rest.match(/@(\S+)/);
  if (dateMatch) { date = dateMatch[1]; rest = rest.replace(dateMatch[0], '').trim(); }

  let mode = '';
  const modeMatch = rest.match(/\b(new|same)\b/i);
  if (modeMatch) {
    mode = modeMatch[1].toLowerCase() === 'new' ? 'new-universe' : 'same-universe';
    rest = rest.replace(modeMatch[0], '').trim();
  }

  let label = '';
  const quoted = rest.match(/"([^"]*)"/);
  if (quoted) label = quoted[1];
  else label = rest.replace(/^["']|["']$/g, '').trim();

  return {
    id: crypto.randomUUID(),
    type,
    label,
    date: { approximate: date, season: '' },
    location: { place: '' },
    note: '',
    timeTravelMode: type === 'timetravel' ? (mode || 'same-universe') : ''
  };
}

function splitList(value) {
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

// "Avengers: Endgame" -> "Avengers"; "The Witcher S01E05" -> "The Witcher"
export function universeNameFromMedia(title) {
  if (!title) return '';
  let name = title.replace(EPISODE_RE, '').trim();
  const colon = name.indexOf(':');
  if (colon > 0) name = name.slice(0, colon).trim();
  return name || title.trim();
}
