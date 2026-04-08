// events.js — Event CRUD + universe management

export function createEvent(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    title: '',
    universe: 'main',
    speculativeUniverse: '',
    date: {
      exact: null,       // "2012-05-04" or null
      approximate: '',   // "~2012" or "Before Age of Ultron"
      season: '',        // "spring" | "summer" | "autumn" | "winter" | ""
      era: ''            // for historical: "15th century", "Bronze Age"
    },
    releaseDate: '',
    source: '',
    reasoning: '',
    tags: [],
    sortOrder: { custom: 0 },
    // Hierarchical location
    location: {
      realm: '',         // "Nine Realms", "Dark Dimension", "Quantum Realm"
      planet: '',        // "Earth", "Asgard", "Vormir", "Knowhere"
      region: '',        // "Europe", "North America", "Wakanda"
      place: ''          // "New York", "Berlin", "Kamar-Taj"
    },
    media: {
      type: '',
      title: '',
      episode: ''
    },
    ...overrides
  };
}

export function createUniverse(name, color, isMain = false, parentUniverse = null) {
  return {
    id: crypto.randomUUID(),
    name,
    color,
    isMain,
    description: '',
    parentUniverse  // id of parent universe (null = branches from main)
  };
}

export function addEvent(project, eventData) {
  // Normalize old string location to new object format
  if (typeof eventData.location === 'string') {
    eventData.location = { realm: '', planet: '', region: '', place: eventData.location };
  }
  const ev = createEvent(eventData);
  project.events.push(ev);
  return ev;
}

export function updateEvent(project, id, updates) {
  if (typeof updates.location === 'string') {
    updates.location = { realm: '', planet: '', region: '', place: updates.location };
  }
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
  // Re-parent children to this universe's parent
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

// Get location string for display
export function getLocationString(ev) {
  if (!ev.location) return '';
  if (typeof ev.location === 'string') return ev.location;
  const parts = [ev.location.realm, ev.location.planet, ev.location.region, ev.location.place]
    .filter(Boolean);
  return parts.join(' › ');
}

// Get a "location key" for grouping events into sub-wires within a universe
export function getLocationKey(ev) {
  if (!ev.location) return '';
  if (typeof ev.location === 'string') return ev.location;
  // Group by planet+region (most useful visual grouping)
  return [ev.location.planet, ev.location.region].filter(Boolean).join('/') || '';
}

// Get numeric sort value from event date
export function getTimeValue(ev) {
  if (ev.date.exact) {
    return new Date(ev.date.exact).getTime();
  }
  const yearMatch = ev.date.approximate?.match(/-?\d{1,4}/);
  if (yearMatch) {
    const year = parseInt(yearMatch[0]);
    const seasonOffset = { spring: 0.25, summer: 0.5, autumn: 0.75, winter: 0.0 };
    return new Date(year, 0).getTime() + (seasonOffset[ev.date.season] || 0) * 365 * 24 * 3600000;
  }
  return 0;
}
