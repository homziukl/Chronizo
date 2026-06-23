// quick_update.js — Quick Update / Batch Update parser for Chronizo
//
// Lets the user paste a small key:value formula that changes existing events
// matched by tag, media, title, source, universe, id, character or evidence.
// This is intentionally conservative: every update block must contain at least
// one matcher and at least one change, and the app layer confirms before writing.

const ISO_DATE = /^-?\d{1,6}-\d{2}-\d{2}$/;
const EVIDENCE_VALUES = new Set(['shown', 'described', 'mentioned', 'implied', 'speculated']);
const MATCH_FIELDS = new Set(['id', 'title', 'media', 'media_title', 'episode', 'media_episode', 'source', 'tag', 'tags', 'universe', 'character', 'characters', 'evidence']);
const SET_FIELDS = new Set([
  'date', 'from', 'to', 'season', 'era', 'release', 'release_date',
  'evidence', 'source', 'reasoning', 'append_reasoning',
  'universe', 'speculative', 'media', 'media_title', 'episode', 'media_episode', 'type', 'media_type',
  'tags', 'add_tags', 'remove_tags', 'characters', 'add_characters', 'remove_characters',
  'realm', 'planet', 'region', 'place', 'location', 'sort', 'icon', 'background'
]);

const SEASON_MAP = {
  spring: 'spring', wiosna: 'spring',
  summer: 'summer', lato: 'summer',
  autumn: 'autumn', fall: 'autumn', jesien: 'autumn', 'jesień': 'autumn',
  winter: 'winter', zima: 'winter'
};

export function looksLikeQuickUpdate(text) {
  if (!text || !text.trim()) return false;
  return splitBlocks(text).some(block => block.some(raw => {
    const line = stripComment(raw).trim().toLowerCase();
    return /^mode\s*:\s*update\b/.test(line) ||
      /^update\s*:/.test(line) ||
      /^match(?:[ _-][\w-]+)?\s*:/.test(line) ||
      /^set\s+[\w-]+\s*:/.test(line) ||
      /^set_[\w-]+\s*:/.test(line);
  }));
}

export function parseQuickUpdate(text) {
  const errors = [];
  const warnings = [];
  const operations = [];
  if (!text || !text.trim()) return { operations, errors: ['Empty update formula'], warnings };

  splitBlocks(text).forEach((block, index) => {
    const op = parseUpdateBlock(block, index + 1, warnings);
    if (!op) return;
    if (op.matchers.length === 0) {
      errors.push(`Update block ${index + 1}: missing match rule — skipped`);
      return;
    }
    if (!hasAnyChange(op)) {
      errors.push(`Update block ${index + 1}: missing changed field — skipped`);
      return;
    }
    operations.push(op);
  });

  if (operations.length === 0 && errors.length === 0) errors.push('No update operations found');
  return { operations, errors, warnings };
}

function parseUpdateBlock(lines, blockNumber, warnings) {
  const op = {
    blockNumber,
    matchers: [],
    set: {},
    addTags: [],
    removeTags: [],
    addCharacters: [],
    removeCharacters: []
  };
  let any = false;

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;

    let key = normalizeKey(line.slice(0, idx).trim());
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    any = true;

    if (key === 'mode' || key === 'update') continue;

    if (key === 'match') {
      const matcher = parseMatcher(value, blockNumber, warnings);
      if (matcher) op.matchers.push(matcher);
      continue;
    }

    if (key.startsWith('match_')) {
      const field = key.slice('match_'.length);
      addMatcher(op, field, value, blockNumber, warnings);
      continue;
    }

    if (key.startsWith('set_')) key = key.slice('set_'.length);
    if (key.startsWith('set ')) key = key.slice(4).trim();

    applyUpdateField(op, key, value, blockNumber, warnings);
  }

  return any ? op : null;
}

function normalizeKey(key) {
  return String(key || '').trim().toLowerCase().replace(/[ -]+/g, '_');
}

function addMatcher(op, field, value, blockNumber, warnings) {
  field = normalizeKey(field);
  if (!MATCH_FIELDS.has(field)) {
    warnings.push(`Update block ${blockNumber}: unknown matcher "${field}" — skipped`);
    return;
  }
  op.matchers.push({ field: normalizeMatchField(field), value });
}

function parseMatcher(value, blockNumber, warnings) {
  if (!value) return null;
  const eq = value.indexOf('=');
  if (eq === -1) return { field: 'tag', value: value.trim() };
  const rawField = normalizeKey(value.slice(0, eq));
  const rawValue = value.slice(eq + 1).trim();
  if (!MATCH_FIELDS.has(rawField)) {
    warnings.push(`Update block ${blockNumber}: unknown matcher "${rawField}" — skipped`);
    return null;
  }
  return { field: normalizeMatchField(rawField), value: rawValue };
}

function normalizeMatchField(field) {
  if (field === 'tags') return 'tag';
  if (field === 'characters') return 'character';
  if (field === 'media_title') return 'media';
  if (field === 'media_episode') return 'episode';
  return field;
}

function applyUpdateField(op, key, value, blockNumber, warnings) {
  if (!SET_FIELDS.has(key)) {
    warnings.push(`Update block ${blockNumber}: unknown update key "${key}" — skipped`);
    return;
  }

  switch (key) {
    case 'date': op.set.date = parseDate(value); break;
    case 'from': op.set.rangeFrom = value; break;
    case 'to': op.set.rangeTo = value; break;
    case 'season': op.set.season = SEASON_MAP[value.toLowerCase()] || ''; break;
    case 'era': op.set.era = value; break;
    case 'release':
    case 'release_date': op.set.releaseDate = value; break;
    case 'evidence': {
      const v = value.toLowerCase();
      op.set.evidence = EVIDENCE_VALUES.has(v) ? v : 'shown';
      break;
    }
    case 'source': op.set.source = value; break;
    case 'reasoning': op.set.reasoning = value; break;
    case 'append_reasoning': op.set.appendReasoning = value; break;
    case 'universe': op.set.universeName = value; break;
    case 'speculative': op.set.speculativeUniverseName = value; break;
    case 'media':
    case 'media_title': op.set.mediaTitle = value; break;
    case 'episode':
    case 'media_episode': op.set.mediaEpisode = value; break;
    case 'type':
    case 'media_type': op.set.mediaType = value.toLowerCase(); break;
    case 'tags': op.set.tags = splitList(value); break;
    case 'add_tags': op.addTags.push(...splitList(value)); break;
    case 'remove_tags': op.removeTags.push(...splitList(value)); break;
    case 'characters': op.set.characters = splitList(value); break;
    case 'add_characters': op.addCharacters.push(...splitList(value)); break;
    case 'remove_characters': op.removeCharacters.push(...splitList(value)); break;
    case 'realm': op.set.realm = value; break;
    case 'planet': op.set.planet = value; break;
    case 'region': op.set.region = value; break;
    case 'place':
    case 'location': op.set.place = value; break;
    case 'sort': op.set.sort = parseInt(value, 10) || 0; break;
    case 'icon': op.set.icon = value; break;
    case 'background': op.set.background = value; break;
  }
}

function parseDate(value) {
  if (ISO_DATE.test(value)) return { exact: value, approximate: '' };
  return { exact: null, approximate: value };
}

function hasAnyChange(op) {
  return Object.keys(op.set).length > 0 ||
    op.addTags.length > 0 || op.removeTags.length > 0 ||
    op.addCharacters.length > 0 || op.removeCharacters.length > 0;
}

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

function stripComment(line) {
  return String(line || '').replace(/\s+#\s.*$/, '');
}

function splitList(value) {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}
