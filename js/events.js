// events.js — Event CRUD + universe management

export const EVIDENCE_LEVELS = {
  shown:      { label: '👁 Shown',      opacity: 1.0,  dash: [] },
  described:  { label: '📝 Described',  opacity: 0.85, dash: [] },
  mentioned:  { label: '💬 Mentioned',  opacity: 0.65, dash: [] },
  implied:    { label: '🔮 Implied',    opacity: 0.45, dash: [4, 3] },
  speculated: { label: '❓ Speculated', opacity: 0.3,  dash: [2, 4] }
};

export function createEvent(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    title: '',
    universe: 'main',
    speculativeUniverse: '',
    date: {
      exact: null,         // "2012-05-04" or null
      approximate: '',     // "~2012" or "Before Age of Ultron"
      season: '',          // spring | summer | autumn | winter
      era: '',             // "Bronze Age", "15th century"
      rangeFrom: '',       // start of date range: "1940" or "1940-06-01"
      rangeTo: ''          // end of date range: "1945" or "1945-09-02"
    },
    releaseDate: '',
    source: '',
    reasoning: '',
    evidence: 'shown',     // shown | described | mentioned | implied | speculated
    tags: [],
    sortOrder: { custom: 0 },
    location: {
      realm: '',
      planet: '',
      region: '',
      place: ''
    },
    media: {
      type: '',
      title: '',
      episode: ''
    },
    // Sub-events: timeline segments within this event (flashbacks, callbacks)
    subEvents: [],
    // Characters involved in this event
    characters: [],  // ["Steve Rogers", "Tony Stark"] or ["Napoleon Bonaparte"]
    // Each sub-event: { id, label, date: { approximate, season }, location: { place }, note }
    ...overrides
  };
}

export function createSubEvent(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    label: '',
    type: 'flashback',  // flashback | callback | postcredits | prologue | epilogue
    date: { approximate: '', season: '' },
    location: { place: '' },
    note: '',
    ...overrides
  };
}

export function createUniverse(name, color, isMain = false, parentUniverse = null) {
  return {
    id: crypto.randomUUID(),
    name, color, isMain,
    description: '',
    parentUniverse
  };
}

export function addEvent(project, data) {
  normalizeLocation(data);
  const ev = createEvent(data);
  project.events.push(ev);
  return ev;
}

export function updateEvent(project, id, updates) {
  normalizeLocation(updates);
  const idx = project.events.findIndex(e => e.id === id);
  if (idx === -1) return null;
  project.events[idx] = { ...project.events[idx], ...updates };
  return project.events[idx];
}

export function deleteEvent(project, id) {
  project.events = project.events.filter(e => e.id !== id);
  project.connections = project.connections.filter(
    c => c.sourceEventId !== id && c.targetEventId !== id
  );
}

export function addUniverse(project, name, color, parentUniverse = null) {
  const uni = createUniverse(name, color, false, parentUniverse);
  project.universes.push(uni);
  return uni;
}

export function deleteUniverse(project, id) {
  if (id === 'main') return false;
  const dying = project.universes.find(u => u.id === id);
  const newParent = dying?.parentUniverse || 'main';
  project.universes.forEach(u => {
    if (u.parentUniverse === id) u.parentUniverse = newParent;
  });
  project.universes = project.universes.filter(u => u.id !== id);
  project.events.forEach(ev => {
    if (ev.universe === id) ev.universe = newParent;
    if (ev.speculativeUniverse === id) ev.speculativeUniverse = '';
  });
  return true;
}

function normalizeLocation(data) {
  if (typeof data.location === 'string') {
    data.location = { realm: '', planet: '', region: '', place: data.location };
  }
}

export function getLocationString(ev) {
  if (!ev.location) return '';
  if (typeof ev.location === 'string') return ev.location;
  return [ev.location.realm, ev.location.planet, ev.location.region, ev.location.place]
    .filter(Boolean).join(' › ');
}

export function getLocationKey(ev) {
  if (!ev.location) return '';
  if (typeof ev.location === 'string') return ev.location;
  return [ev.location.planet, ev.location.region].filter(Boolean).join('/') || '';
}

// Get numeric time value — uses rangeFrom as start if available
export function getTimeValue(ev) {
  if (ev.date.exact) return parseApproxTime(ev.date.exact, ev.date.season);
  if (ev.date.rangeFrom) return parseApproxTime(ev.date.rangeFrom, ev.date.season);
  return parseApproxTime(ev.date.approximate, ev.date.season);
}

// Get end time for range events
export function getTimeEndValue(ev) {
  if (ev.date.rangeTo) return parseApproxTime(ev.date.rangeTo, '');
  return getTimeValue(ev);
}

export function hasDateRange(ev) {
  return !!(ev.date.rangeFrom && ev.date.rangeTo);
}

const MS_PER_YEAR = 365.25 * 24 * 3600000;

function parseApproxTime(str, season) {
  if (!str) return 0;
  const seasonOffset = { spring: 0.25, summer: 0.5, autumn: 0.75, winter: 0.0 };
  const sOff = (seasonOffset[season] || 0) * MS_PER_YEAR;

  // Pure year (including negative/BCE): "-508", "2012", "-10000"
  if (/^-?\d{1,6}$/.test(str.trim())) {
    return parseInt(str.trim()) * MS_PER_YEAR + sOff;
  }

  // ISO-ish date with possible negative year: "-0044-03-15", "1215-06-15"
  const isoMatch = str.match(/^(-?\d{1,6})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]) - 1; // 0-indexed
    const day = parseInt(isoMatch[3]);
    return year * MS_PER_YEAR + (month / 12 + day / 365) * MS_PER_YEAR;
  }

  // Standard date string (let JS parse)
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.getTime();

  // Extract any year from longer string
  const embedded = str.match(/-?\d{1,6}/);
  if (embedded) return parseInt(embedded[0]) * MS_PER_YEAR + sOff;

  return 0;
}
