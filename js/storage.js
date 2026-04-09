// storage.js — Save/Load project files + default structure

const DEFAULT_PROJECT = {
  meta: {
    name: 'Untitled Project',
    author: 'user',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    version: '1.0.0'
  },
  universes: [
    { id: 'main', name: 'Sacred Timeline', color: '#ff6b00', isMain: true }
  ],
  events: [],
  // Cross-universe connections (character jumps, branch points)
  connections: []
};

// Connection types:
// "branch"    — fiction diverges from real history (e.g. Inglourious Basterds from WWII)
// "crossover" — character/object moves between universes (e.g. Spider-Man multiverse)
// "merge"     — two timelines converge back
// "reference" — soft link, just a nod/easter egg

export function createConnection(sourceEventId, targetEventId, type, label = '') {
  return {
    id: crypto.randomUUID(),
    sourceEventId,
    targetEventId,
    type, // "branch" | "crossover" | "merge" | "reference"
    label,
    character: '', // who/what crosses over
    notes: ''
  };
}

export function createProject(name = 'Untitled Project') {
  return {
    ...structuredClone(DEFAULT_PROJECT),
    meta: {
      ...DEFAULT_PROJECT.meta,
      name,
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    }
  };
}

export function saveToFile(project) {
  project.meta.modified = new Date().toISOString();
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(project.meta.name)}.chronizo.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function loadFromFile() {
  return new Promise((resolve, reject) => {
    const input = document.getElementById('file-input');
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return reject(new Error('No file selected'));

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          // Basic validation
          if (!data.meta || !data.universes || !data.events) {
            throw new Error('Invalid Chronizo file format');
          }
          // Ensure connections array exists (backward compat)
          if (!data.connections) data.connections = [];
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

export function saveToLocalStorage(project) {
  project.meta.modified = new Date().toISOString();
  localStorage.setItem('chronizo-autosave', JSON.stringify(project));
}

export function loadFromLocalStorage() {
  const raw = localStorage.getItem('chronizo-autosave');
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data.connections) data.connections = [];
    return data;
  } catch {
    return null;
  }
}

// Merge another project INTO the current one
// - Adds all universes (skips duplicates by name)
// - Adds all events (with remapped universe IDs)
// - Adds all connections (with remapped event IDs)
export function mergeProjects(target, source) {
  const uniIdMap = new Map(); // old source uni id -> new id in target

  // Map universes
  source.universes.forEach(srcUni => {
    // Check if universe with same name already exists
    const existing = target.universes.find(u => u.name === srcUni.name);
    if (existing) {
      uniIdMap.set(srcUni.id, existing.id);
    } else {
      const newId = crypto.randomUUID();
      uniIdMap.set(srcUni.id, newId);
      target.universes.push({
        ...srcUni,
        id: newId,
        isMain: false, // only target keeps its main
        parentUniverse: srcUni.parentUniverse ? uniIdMap.get(srcUni.parentUniverse) || null : null
      });
    }
  });

  // Fix parent references for newly added universes
  target.universes.forEach(u => {
    if (u.parentUniverse && uniIdMap.has(u.parentUniverse)) {
      u.parentUniverse = uniIdMap.get(u.parentUniverse);
    }
  });

  // Map events
  const evIdMap = new Map();
  source.events.forEach(srcEv => {
    // Skip if event with same title + same time already exists
    const dup = target.events.find(e =>
      e.title === srcEv.title && e.universe === uniIdMap.get(srcEv.universe)
    );
    if (dup) {
      evIdMap.set(srcEv.id, dup.id);
      return;
    }
    const newId = crypto.randomUUID();
    evIdMap.set(srcEv.id, newId);
    target.events.push({
      ...structuredClone(srcEv),
      id: newId,
      universe: uniIdMap.get(srcEv.universe) || srcEv.universe,
      speculativeUniverse: srcEv.speculativeUniverse ? (uniIdMap.get(srcEv.speculativeUniverse) || '') : ''
    });
  });

  // Map connections
  (source.connections || []).forEach(srcConn => {
    const newSrc = evIdMap.get(srcConn.sourceEventId);
    const newTgt = evIdMap.get(srcConn.targetEventId);
    if (!newSrc || !newTgt) return;
    target.connections.push({
      ...srcConn,
      id: crypto.randomUUID(),
      sourceEventId: newSrc,
      targetEventId: newTgt
    });
  });

  target.meta.modified = new Date().toISOString();
  return target;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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
    'tags', 'custom_sort_order'
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
      sortOrder: { custom: parseInt(get('custom_sort_order')) || 0 },
      subEvents: []
    });
  }

  return project;
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
