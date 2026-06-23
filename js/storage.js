// storage.js — Save/Load project files + default structure

const DEFAULT_PROJECT = {
  meta: {
    name: 'Untitled Project',
    author: 'user',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    version: '1.1.0'
  },
  universes: [
    { id: 'main', name: 'Main Timeline', color: '#ff6b00', isMain: true, parentUniverse: null, appearance: { icon: '', background: '' } }
  ],
  events: [],
  connections: []
};

const STORAGE_KEY = 'chronizo-autosave';

function uuid() {
  return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clone(obj) {
  return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

// Connection types:
// "branch"    — fiction diverges from real history
// "crossover" — character/object moves between universes
// "merge"     — two timelines converge back
// "reference" — soft link, just a nod/easter egg
export function createConnection(sourceEventId, targetEventId, type, label = '') {
  return {
    id: uuid(),
    sourceEventId,
    targetEventId,
    type,
    label,
    character: '',
    notes: ''
  };
}

export function createProject(name = 'Untitled Project') {
  const project = clone(DEFAULT_PROJECT);
  project.meta = {
    ...DEFAULT_PROJECT.meta,
    name,
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  };
  return project;
}

export function saveToFile(project) {
  const normalized = normalizeLoadedProject(project);
  normalized.meta.modified = new Date().toISOString();
  const json = JSON.stringify(normalized, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(normalized.meta.name || 'chronizo')}.chronizo.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function loadFromFile() {
  return new Promise((resolve, reject) => {
    const input = document.getElementById('file-input');
    input.value = ''; // allow loading the same file again
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || typeof data !== 'object') throw new Error('Invalid Chronizo file format');
          resolve(normalizeLoadedProject(data));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error || new Error('Could not read file'));
      reader.readAsText(file);
    };
    input.click();
  });
}

export function saveToLocalStorage(project) {
  try {
    const normalized = normalizeLoadedProject(project);
    normalized.meta.modified = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch (err) {
    console.warn('Chronizo autosave failed:', err);
    return false;
  }
}

export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeLoadedProject(JSON.parse(raw));
  } catch (err) {
    console.warn('Chronizo autosave load failed:', err);
    return null;
  }
}

function defaultDate(date = {}) {
  return {
    exact: date.exact || null,
    approximate: date.approximate || '',
    season: date.season || '',
    era: date.era || '',
    rangeFrom: date.rangeFrom || '',
    rangeTo: date.rangeTo || ''
  };
}

function defaultLocation(location = {}) {
  if (typeof location === 'string') return { realm: '', planet: '', region: '', place: location };
  return {
    realm: location?.realm || '',
    planet: location?.planet || '',
    region: location?.region || '',
    place: location?.place || ''
  };
}

function defaultMedia(media = {}) {
  return {
    type: media?.type || '',
    title: media?.title || '',
    episode: media?.episode || ''
  };
}

function normalizeSubEvent(seg = {}) {
  return {
    id: seg.id || uuid(),
    label: seg.label || '',
    type: seg.type || 'flashback',
    date: { approximate: seg.date?.approximate || '', season: seg.date?.season || '' },
    location: { place: seg.location?.place || '' },
    note: seg.note || '',
    timeTravelMode: seg.timeTravelMode || ''
  };
}

function normalizeEvent(ev = {}, index = 0) {
  return {
    id: ev.id || uuid(),
    title: ev.title || 'Untitled event',
    universe: ev.universe || 'main',
    speculativeUniverse: ev.speculativeUniverse || '',
    date: defaultDate(ev.date || {}),
    releaseDate: ev.releaseDate || '',
    source: ev.source || '',
    reasoning: ev.reasoning || '',
    evidence: ['shown','described','mentioned','implied','speculated'].includes(ev.evidence) ? ev.evidence : 'shown',
    tags: Array.isArray(ev.tags) ? ev.tags.filter(Boolean) : [],
    sortOrder: { custom: Number(ev.sortOrder?.custom ?? index * 10) || 0 },
    location: defaultLocation(ev.location || {}),
    media: defaultMedia(ev.media || {}),
    subEvents: Array.isArray(ev.subEvents) ? ev.subEvents.map(normalizeSubEvent) : [],
    characters: Array.isArray(ev.characters) ? ev.characters.filter(Boolean) : [],
    appearance: {
      icon: ev.appearance?.icon || '',
      background: ev.appearance?.background || ''
    },
    updateHistory: Array.isArray(ev.updateHistory) ? ev.updateHistory : []
  };
}

function normalizeUniverse(uni = {}, index = 0) {
  const isMain = uni.id === 'main' || uni.isMain || index === 0;
  return {
    id: isMain ? 'main' : (uni.id || uuid()),
    name: uni.name || (isMain ? 'Main Timeline' : 'Unnamed Universe'),
    color: uni.color || (isMain ? '#ff6b00' : randomColor()),
    isMain,
    description: uni.description || '',
    parentUniverse: isMain ? null : (uni.parentUniverse || null),
    appearance: {
      icon: uni.appearance?.icon || '',
      background: uni.appearance?.background || ''
    }
  };
}

function normalizeConnection(conn = {}) {
  return {
    id: conn.id || uuid(),
    sourceEventId: conn.sourceEventId || '',
    targetEventId: conn.targetEventId || '',
    type: conn.type || 'reference',
    label: conn.label || '',
    character: conn.character || '',
    notes: conn.notes || ''
  };
}

export function normalizeLoadedProject(project = {}) {
  const now = new Date().toISOString();
  const normalized = {
    meta: {
      ...DEFAULT_PROJECT.meta,
      ...(project.meta || {}),
      name: project.meta?.name || 'Untitled Project',
      created: project.meta?.created || now,
      modified: project.meta?.modified || now,
      version: project.meta?.version || DEFAULT_PROJECT.meta.version
    },
    universes: [],
    events: [],
    connections: []
  };

  const sourceUniverses = Array.isArray(project.universes) && project.universes.length
    ? project.universes
    : DEFAULT_PROJECT.universes;
  normalized.universes = sourceUniverses.map(normalizeUniverse);
  if (!normalized.universes.some(u => u.id === 'main')) {
    normalized.universes.unshift(normalizeUniverse(DEFAULT_PROJECT.universes[0], 0));
  }
  const validUniverseIds = new Set(normalized.universes.map(u => u.id));

  normalized.events = (Array.isArray(project.events) ? project.events : [])
    .map((ev, i) => normalizeEvent(ev, i));
  normalized.events.forEach((ev, i) => {
    if (!validUniverseIds.has(ev.universe)) ev.universe = 'main';
    if (ev.speculativeUniverse && !validUniverseIds.has(ev.speculativeUniverse)) ev.speculativeUniverse = '';
    if (!Number.isFinite(ev.sortOrder.custom)) ev.sortOrder.custom = i * 10;
  });

  const validEventIds = new Set(normalized.events.map(e => e.id));
  normalized.connections = (Array.isArray(project.connections) ? project.connections : [])
    .map(normalizeConnection)
    .filter(c => validEventIds.has(c.sourceEventId) && validEventIds.has(c.targetEventId));

  return normalized;
}

function eventSignature(ev) {
  const d = ev.date || {};
  const media = ev.media || {};
  return [
    (ev.title || '').trim().toLowerCase(),
    ev.universe || '',
    d.exact || '', d.approximate || '', d.rangeFrom || '', d.rangeTo || '',
    ev.releaseDate || '',
    (media.title || '').trim().toLowerCase(),
    (media.episode || '').trim().toLowerCase(),
    (ev.source || '').trim().toLowerCase()
  ].join('|');
}

// Merge another project INTO the current one.
export function mergeProjects(target, source) {
  normalizeLoadedProject(target);
  source = normalizeLoadedProject(source);

  const uniIdMap = new Map();
  source.universes.forEach(srcUni => {
    const existing = target.universes.find(u => u.name.toLowerCase() === srcUni.name.toLowerCase());
    if (existing) {
      uniIdMap.set(srcUni.id, existing.id);
    } else {
      const newId = srcUni.id === 'main' ? `main-${uuid()}` : uuid();
      uniIdMap.set(srcUni.id, newId);
      target.universes.push({ ...srcUni, id: newId, isMain: false });
    }
  });
  target.universes.forEach(u => {
    if (u.parentUniverse && uniIdMap.has(u.parentUniverse)) u.parentUniverse = uniIdMap.get(u.parentUniverse);
    if (u.id !== 'main' && u.parentUniverse === u.id) u.parentUniverse = 'main';
  });

  const existingSigs = new Map(target.events.map(e => [eventSignature(e), e.id]));
  const evIdMap = new Map();
  source.events.forEach(srcEv => {
    const mapped = normalizeEvent({
      ...srcEv,
      universe: uniIdMap.get(srcEv.universe) || srcEv.universe,
      speculativeUniverse: srcEv.speculativeUniverse ? (uniIdMap.get(srcEv.speculativeUniverse) || '') : ''
    });
    const sig = eventSignature(mapped);
    const dupId = existingSigs.get(sig);
    if (dupId) {
      evIdMap.set(srcEv.id, dupId);
      return;
    }
    mapped.id = uuid();
    evIdMap.set(srcEv.id, mapped.id);
    target.events.push(mapped);
    existingSigs.set(sig, mapped.id);
  });

  (source.connections || []).forEach(srcConn => {
    const newSrc = evIdMap.get(srcConn.sourceEventId);
    const newTgt = evIdMap.get(srcConn.targetEventId);
    if (!newSrc || !newTgt) return;
    const duplicateConn = target.connections.some(c =>
      c.sourceEventId === newSrc && c.targetEventId === newTgt && c.type === srcConn.type && c.label === srcConn.label
    );
    if (duplicateConn) return;
    target.connections.push({ ...srcConn, id: uuid(), sourceEventId: newSrc, targetEventId: newTgt });
  });

  target.meta.modified = new Date().toISOString();
  return target;
}

function slugify(text) {
  return String(text || 'chronizo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'chronizo';
}

// ===== CSV Export =====
export function exportToCSV(project) {
  const headers = [
    'title', 'universe', 'universe_name', 'speculative_universe',
    'date_exact', 'date_approximate', 'date_range_from', 'date_range_to',
    'season', 'era', 'release_date',
    'media_type', 'media_title', 'media_episode',
    'evidence', 'source', 'reasoning',
    'location_realm', 'location_planet', 'location_region', 'location_place',
    'tags', 'characters', 'sub_events', 'custom_sort_order'
  ];

  const rows = project.events.map(ev => {
    const uni = project.universes.find(u => u.id === ev.universe);
    const loc = typeof ev.location === 'string'
      ? { realm: '', planet: '', region: '', place: ev.location }
      : (ev.location || {});
    return [
      ev.title,
      ev.universe,
      uni?.name || '',
      ev.speculativeUniverse || '',
      ev.date?.exact || '',
      ev.date?.approximate || '',
      ev.date?.rangeFrom || '',
      ev.date?.rangeTo || '',
      ev.date?.season || '',
      ev.date?.era || '',
      ev.releaseDate || '',
      ev.media?.type || '',
      ev.media?.title || '',
      ev.media?.episode || '',
      ev.evidence || 'shown',
      ev.source || '',
      ev.reasoning || '',
      loc.realm || '',
      loc.planet || '',
      loc.region || '',
      loc.place || '',
      (ev.tags || []).join('; '),
      (ev.characters || []).join('; '),
      (ev.subEvents && ev.subEvents.length) ? JSON.stringify(ev.subEvents) : '',
      ev.sortOrder?.custom || 0
    ].map(v => `"${String(v).replace(/"/g, '""')}"`);
  });

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(project.meta.name)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== CSV Import =====
export function importFromCSV() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const result = parseCSV(reader.result);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

function parseCSV(text) {
  // Simple CSV parser that handles quoted fields
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV must have header + at least 1 row');

  const headers = parseCSVLine(lines[0]);
  const col = (name) => headers.indexOf(name);

  const project = createProject('Imported CSV');
  const universeMap = new Map(); // name -> id

  // Ensure main universe exists
  universeMap.set('main', 'main');

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 3) continue;

    const get = (name) => vals[col(name)] || '';

    // Resolve universe
    let uniId = get('universe') || 'main';
    const uniName = get('universe_name');
    if (uniName && !universeMap.has(uniName)) {
      const newId = crypto.randomUUID();
      universeMap.set(uniName, newId);
      project.universes.push({
        id: newId, name: uniName, color: randomColor(), isMain: false, parentUniverse: null
      });
      uniId = newId;
    } else if (uniName) {
      uniId = universeMap.get(uniName);
    }

    project.events.push({
      id: crypto.randomUUID(),
      title: get('title'),
      universe: uniId,
      speculativeUniverse: get('speculative_universe'),
      date: {
        exact: get('date_exact') || null,
        approximate: get('date_approximate'),
        rangeFrom: get('date_range_from'),
        rangeTo: get('date_range_to'),
        season: get('season'),
        era: get('era')
      },
      releaseDate: get('release_date'),
      media: {
        type: get('media_type'),
        title: get('media_title'),
        episode: get('media_episode')
      },
      evidence: get('evidence') || 'shown',
      source: get('source'),
      reasoning: get('reasoning'),
      location: {
        realm: get('location_realm'),
        planet: get('location_planet'),
        region: get('location_region'),
        place: get('location_place')
      },
      tags: (get('tags') || '').split(';').map(t => t.trim()).filter(Boolean),
      characters: (get('characters') || '').split(';').map(c => c.trim()).filter(Boolean),
      subEvents: parseSubEventsCell(get('sub_events')),
      sortOrder: { custom: parseInt(get('custom_sort_order')) || 0 }
    });
  }

  return normalizeLoadedProject(project);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 55%)`;
}

// ===== Sub-events =====
// Sub-events are stored in a CSV cell as a JSON array string.
function parseSubEventsCell(cell) {
  if (!cell || !cell.trim()) return [];
  try {
    const parsed = JSON.parse(cell);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
