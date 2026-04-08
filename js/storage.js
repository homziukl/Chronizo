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

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
