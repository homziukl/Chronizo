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
    releaseDate: '',     // real-world release date
    source: '',          // for historical events: book, document, URL
    reasoning: '',       // why this event is placed here
    tags: [],
    sortOrder: { custom: 0 },
    media: {
      type: '',          // "film" | "series" | "comic" | "game" | "historical" | "book" | ""
      title: '',         // "Avengers: Endgame" or "WWII Documentary"
      episode: ''        // "S01E05" if series
    },
    ...overrides
  };
}

export function createUniverse(name, color, isMain = false) {
  return {
    id: crypto.randomUUID(),
    name,
    color,
    isMain,
    description: '',
    parentUniverse: null  // if this branches from another
  };
}

export function addEvent(project, eventData) {
  const ev = createEvent(eventData);
  project.events.push(ev);
  return ev;
}

export function updateEvent(project, id, updates) {
  const idx = project.events.findIndex(e => e.id === id);
  if (idx === -1) return null;
  project.events[idx] = { ...project.events[idx], ...updates };
  return project.events[idx];
}

export function deleteEvent(project, id) {
  project.events = project.events.filter(e => e.id !== id);
  // Also remove connections referencing this event
  project.connections = project.connections.filter(
    c => c.sourceEventId !== id && c.targetEventId !== id
  );
}

export function addUniverse(project, name, color) {
  const uni = createUniverse(name, color);
  project.universes.push(uni);
  return uni;
}

export function deleteUniverse(project, id) {
  if (id === 'main') return false; // can't delete Sacred Timeline
  project.universes = project.universes.filter(u => u.id !== id);
  // Move orphaned events to main
  project.events.forEach(ev => {
    if (ev.universe === id) ev.universe = 'main';
    if (ev.speculativeUniverse === id) ev.speculativeUniverse = '';
  });
  return true;
}

// Get numeric sort value from event date (for positioning on timeline)
export function getTimeValue(ev) {
  if (ev.date.exact) {
    return new Date(ev.date.exact).getTime();
  }
  // Try to parse approximate as year
  const yearMatch = ev.date.approximate?.match(/-?\d{1,4}/);
  if (yearMatch) {
    const year = parseInt(yearMatch[0]);
    // Offset by season within year
    const seasonOffset = { spring: 0.25, summer: 0.5, autumn: 0.75, winter: 0.0 };
    return new Date(year, 0).getTime() + (seasonOffset[ev.date.season] || 0) * 365 * 24 * 3600000;
  }
  return 0; // unknown — will be placed by custom order
}
