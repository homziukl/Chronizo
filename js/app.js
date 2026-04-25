// app.js — Main application controller for Chronizo

import { createProject, saveToFile, loadFromFile, saveToLocalStorage, loadFromLocalStorage, mergeProjects, exportToCSV, importFromCSV } from './storage.js';
import { addEvent, updateEvent, deleteEvent, addUniverse, deleteUniverse, createSubEvent } from './events.js';
import { createConnection } from './storage.js';
import { TimelineRenderer } from './timeline.js';

// ===== State =====
let project = loadFromLocalStorage() || createProject('My Timeline');
let editingEventId = null;
let connectMode = false;
let connectSourceId = null;

// ===== Renderer =====
const canvas = document.getElementById('timeline-canvas');
const renderer = new TimelineRenderer(canvas);
renderer.setProject(project);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());
setInterval(() => saveToLocalStorage(project), 30000);

// ===== Helpers =====
function refreshAll() {
  applyFilters();
  updateProjectLabel();
  populateUniverseSelects();
  populateFilterUniverse();
  saveToLocalStorage(project);
}

function updateProjectLabel() {
  document.getElementById('project-name').textContent = project.meta.name;
}

function populateUniverseSelects() {
  ['ev-universe', 'ev-speculative'].forEach((id, idx) => {
    const sel = document.getElementById(id);
    const val = sel.value;
    sel.innerHTML = idx === 1 ? '<option value="">— none —</option>' : '';
    project.universes.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      const parent = u.parentUniverse ? project.universes.find(p => p.id === u.parentUniverse) : null;
      opt.textContent = parent ? `${u.name} (← ${parent.name})` : u.name;
      sel.appendChild(opt);
    });
    sel.value = val;
  });
}

function populateFilterUniverse() {
  const sel = document.getElementById('filter-universe');
  const val = sel.value;
  sel.innerHTML = '<option value="">All Universes</option>';
  project.universes.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    sel.appendChild(opt);
  });
  sel.value = val;
}

// ===== Filtering =====
function applyFilters() {
  const search = document.getElementById('search-box').value.toLowerCase().trim();
  const uniFilter = document.getElementById('filter-universe').value;
  const eviFilter = document.getElementById('filter-evidence').value;

  const filtered = project.events.filter(ev => {
    if (search && !ev.title.toLowerCase().includes(search) &&
        !(ev.tags || []).some(t => t.toLowerCase().includes(search))) return false;
    if (uniFilter && ev.universe !== uniFilter) return false;
    if (eviFilter && ev.evidence !== eviFilter) return false;
    return true;
  });

  renderer.setFilteredEvents(filtered);
}

document.getElementById('search-box').addEventListener('input', applyFilters);
document.getElementById('filter-universe').addEventListener('change', applyFilters);
document.getElementById('filter-evidence').addEventListener('change', applyFilters);

// ===== Top bar buttons =====
document.getElementById('btn-new').addEventListener('click', () => {
  if (!confirm('Create new project? Unsaved changes will be lost.')) return;
  const name = prompt('Project name:', 'My Timeline');
  if (!name) return;
  project = createProject(name);
  editingEventId = null;
  refreshAll();
});

document.getElementById('btn-save').addEventListener('click', () => saveToFile(project));

// CSV
document.getElementById('btn-csv-export').addEventListener('click', () => exportToCSV(project));
document.getElementById('btn-csv-import').addEventListener('click', async () => {
  try {
    const imported = await importFromCSV();
    if (confirm(`Import ${imported.events.length} events as new project, or merge into current?\n\nOK = Replace current\nCancel = Merge into current`)) {
      project = imported;
    } else {
      mergeProjects(project, imported);
    }
    editingEventId = null;
    refreshAll();
  } catch (err) {
    if (err.message !== 'No file selected') alert('Error: ' + err.message);
  }
});

document.getElementById('btn-load').addEventListener('click', async () => {
  try {
    project = await loadFromFile();
    editingEventId = null;
    refreshAll();
  } catch (err) {
    if (err.message !== 'No file selected') alert('Error: ' + err.message);
  }
});

document.getElementById('btn-add-event').addEventListener('click', () => openEventPanel(null));

// ===== Merge =====
document.getElementById('btn-merge').addEventListener('click', async () => {
  try {
    const source = await loadFromFile();
    mergeProjects(project, source);
    refreshAll();
    alert(`Merged "${source.meta.name}" — added ${source.events.length} events, ${source.universes.length} universes.`);
  } catch (err) {
    if (err.message !== 'No file selected') alert('Error: ' + err.message);
  }
});

document.getElementById('sort-mode').addEventListener('change', (e) => {
  renderer.setSortMode(e.target.value);
  applyFilters();
});

document.getElementById('project-name').addEventListener('click', () => {
  const name = prompt('Project name:', project.meta.name);
  if (name) { project.meta.name = name; refreshAll(); }
});

// ===== Example loaders =====
document.getElementById('btn-example').addEventListener('click', () => loadExample('data/example-mcu.chronizo.json', 'MCU'));
document.getElementById('btn-example-history').addEventListener('click', () => loadExample('data/world-history.chronizo.json', 'World History'));

async function loadExample(path, name) {
  if (!confirm(`Load ${name} example? Current project will be replaced.`)) return;
  try {
    const resp = await fetch(path);
    project = await resp.json();
    if (!project.connections) project.connections = [];
    editingEventId = null;
    refreshAll();
  } catch (err) {
    alert('Could not load example: ' + err.message);
  }
}

// ===== Connection mode =====
document.getElementById('btn-connect').addEventListener('click', () => {
  connectMode = true;
  connectSourceId = null;
  document.getElementById('connect-banner').classList.remove('hidden');
  renderer.setConnectMode(true);
});

document.getElementById('btn-cancel-connect').addEventListener('click', cancelConnect);

function cancelConnect() {
  connectMode = false;
  connectSourceId = null;
  document.getElementById('connect-banner').classList.add('hidden');
  renderer.setConnectMode(false);
}

// ===== Side Panel — Event Form =====
const panel = document.getElementById('side-panel');
const form = document.getElementById('event-form');

function getLocField(ev, field) {
  if (!ev?.location) return '';
  if (typeof ev.location === 'string') return field === 'place' ? ev.location : '';
  return ev.location[field] || '';
}

function openEventPanel(event) {
  editingEventId = event?.id || null;
  panel.classList.remove('hidden');
  document.getElementById('panel-title').textContent = event ? 'Edit Event' : 'New Event';
  document.getElementById('btn-delete-event').classList.toggle('hidden', !event);

  populateUniverseSelects();

  document.getElementById('ev-title').value = event?.title || '';
  document.getElementById('ev-date-exact').value = event?.date?.exact || '';
  document.getElementById('ev-date-approx').value = event?.date?.approximate || '';
  document.getElementById('ev-date-from').value = event?.date?.rangeFrom || '';
  document.getElementById('ev-date-to').value = event?.date?.rangeTo || '';
  document.getElementById('ev-season').value = event?.date?.season || '';
  document.getElementById('ev-date-era').value = event?.date?.era || '';
  document.getElementById('ev-release').value = event?.releaseDate || '';
  document.getElementById('ev-media-type').value = event?.media?.type || '';
  document.getElementById('ev-media-title').value = event?.media?.title || '';
  document.getElementById('ev-media-episode').value = event?.media?.episode || '';
  document.getElementById('ev-evidence').value = event?.evidence || 'shown';
  document.getElementById('ev-source').value = event?.source || '';
  document.getElementById('ev-reasoning').value = event?.reasoning || '';
  document.getElementById('ev-tags').value = (event?.tags || []).join(', ');
  document.getElementById('ev-loc-realm').value = getLocField(event, 'realm');
  document.getElementById('ev-loc-planet').value = getLocField(event, 'planet');
  document.getElementById('ev-loc-region').value = getLocField(event, 'region');
  document.getElementById('ev-loc-place').value = getLocField(event, 'place');
  document.getElementById('ev-sort-order').value = event?.sortOrder?.custom || 0;

  // Sub-events
  renderSubEvents(event?.subEvents || []);

  requestAnimationFrame(() => {
    document.getElementById('ev-universe').value = event?.universe || 'main';
    document.getElementById('ev-speculative').value = event?.speculativeUniverse || '';
  });
}

document.getElementById('btn-close-panel').addEventListener('click', () => {
  panel.classList.add('hidden');
  editingEventId = null;
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    title: document.getElementById('ev-title').value.trim(),
    universe: document.getElementById('ev-universe').value,
    speculativeUniverse: document.getElementById('ev-speculative').value,
    date: {
      exact: document.getElementById('ev-date-exact').value || null,
      approximate: document.getElementById('ev-date-approx').value,
      rangeFrom: document.getElementById('ev-date-from').value,
      rangeTo: document.getElementById('ev-date-to').value,
      season: document.getElementById('ev-season').value,
      era: document.getElementById('ev-date-era').value
    },
    releaseDate: document.getElementById('ev-release').value,
    media: {
      type: document.getElementById('ev-media-type').value,
      title: document.getElementById('ev-media-title').value,
      episode: document.getElementById('ev-media-episode').value
    },
    evidence: document.getElementById('ev-evidence').value,
    source: document.getElementById('ev-source').value,
    reasoning: document.getElementById('ev-reasoning').value,
    location: {
      realm: document.getElementById('ev-loc-realm').value.trim(),
      planet: document.getElementById('ev-loc-planet').value.trim(),
      region: document.getElementById('ev-loc-region').value.trim(),
      place: document.getElementById('ev-loc-place').value.trim()
    },
    tags: document.getElementById('ev-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    sortOrder: { custom: parseInt(document.getElementById('ev-sort-order').value) || 0 },
    subEvents: collectSubEvents()
  };

  if (!data.title) return;
  if (editingEventId) updateEvent(project, editingEventId, data);
  else addEvent(project, data);

  panel.classList.add('hidden');
  editingEventId = null;
  refreshAll();
});

document.getElementById('btn-delete-event').addEventListener('click', () => {
  if (!editingEventId || !confirm('Delete this event?')) return;
  deleteEvent(project, editingEventId);
  panel.classList.add('hidden');
  editingEventId = null;
  refreshAll();
});

// ===== Sub-events =====
function renderSubEvents(subs) {
  const list = document.getElementById('sub-events-list');
  list.innerHTML = '';
  (subs || []).forEach((sub, i) => {
    const row = document.createElement('div');
    row.className = 'sub-event-row';
    const isTT = sub.type === 'timetravel';
    row.innerHTML = `
      <select data-idx="${i}" class="sub-type">
        <option value="flashback" ${sub.type === 'flashback' ? 'selected' : ''}>⏪ Flashback</option>
        <option value="callback" ${sub.type === 'callback' ? 'selected' : ''}>🔗 Callback</option>
        <option value="postcredits" ${sub.type === 'postcredits' ? 'selected' : ''}>🎬 Post-credits</option>
        <option value="prologue" ${sub.type === 'prologue' ? 'selected' : ''}>📖 Prologue</option>
        <option value="epilogue" ${sub.type === 'epilogue' ? 'selected' : ''}>📕 Epilogue</option>
        <option value="timetravel" ${sub.type === 'timetravel' ? 'selected' : ''}>⏳ Time Travel</option>
      </select>
      <input type="text" class="sub-label" value="${sub.label || ''}" placeholder="Description...">
      <input type="text" class="sub-date" value="${sub.date?.approximate || ''}" placeholder="Date/year">
      <select class="sub-tt-mode" ${isTT ? '' : 'style="display:none"'}>
        <option value="same-universe" ${sub.timeTravelMode === 'same-universe' ? 'selected' : ''}>🔄 Same Universe</option>
        <option value="new-universe" ${sub.timeTravelMode === 'new-universe' ? 'selected' : ''}>🌀 New Universe</option>
      </select>
      <button type="button" class="sub-del" data-idx="${i}">✕</button>
    `;
    list.appendChild(row);

    // Show/hide time travel mode when type changes
    row.querySelector('.sub-type').addEventListener('change', (e) => {
      row.querySelector('.sub-tt-mode').style.display = e.target.value === 'timetravel' ? '' : 'none';
    });
  });

  list.querySelectorAll('.sub-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const rows = [...list.querySelectorAll('.sub-event-row')];
      rows[btn.dataset.idx]?.remove();
    });
  });
}

document.getElementById('btn-add-sub-event').addEventListener('click', () => {
  const list = document.getElementById('sub-events-list');
  const idx = list.children.length;
  const row = document.createElement('div');
  row.className = 'sub-event-row';
  row.innerHTML = `
    <select class="sub-type">
      <option value="flashback">⏪ Flashback</option>
      <option value="callback">🔗 Callback</option>
      <option value="postcredits">🎬 Post-credits</option>
      <option value="prologue">📖 Prologue</option>
      <option value="epilogue">📕 Epilogue</option>
      <option value="timetravel">⏳ Time Travel</option>
    </select>
    <input type="text" class="sub-label" placeholder="Description...">
    <input type="text" class="sub-date" placeholder="Date/year">
    <select class="sub-tt-mode" style="display:none">
      <option value="same-universe">🔄 Same Universe</option>
      <option value="new-universe">🌀 New Universe</option>
    </select>
    <button type="button" class="sub-del">✕</button>
  `;
  list.appendChild(row);
  row.querySelector('.sub-type').addEventListener('change', (e) => {
    row.querySelector('.sub-tt-mode').style.display = e.target.value === 'timetravel' ? '' : 'none';
  });
  row.querySelector('.sub-del').addEventListener('click', () => row.remove());
});

function collectSubEvents() {
  const rows = document.querySelectorAll('#sub-events-list .sub-event-row');
  return [...rows].map(row => ({
    id: crypto.randomUUID(),
    type: row.querySelector('.sub-type').value,
    label: row.querySelector('.sub-label').value,
    date: { approximate: row.querySelector('.sub-date').value, season: '' },
    location: { place: '' },
    note: '',
    timeTravelMode: row.querySelector('.sub-tt-mode')?.value || ''
  })).filter(s => s.label || s.date.approximate);
}

// ===== Canvas event callbacks =====
renderer.onEventClick = (event) => {
  if (connectMode) {
    if (!connectSourceId) {
      connectSourceId = event.id;
      document.getElementById('connect-banner').innerHTML =
        `🔗 Source: <strong>${event.title}</strong> — now click TARGET event <button id="btn-cancel-connect">Cancel</button>`;
      document.getElementById('btn-cancel-connect').addEventListener('click', cancelConnect);
    } else if (connectSourceId !== event.id) {
      // Open connection dialog
      openConnectionDialog(connectSourceId, event.id);
    }
  } else {
    openEventPanel(event);
  }
};

// ===== Connection Dialog =====
const connDialog = document.getElementById('connection-dialog');

function openConnectionDialog(srcId, tgtId) {
  const src = project.events.find(e => e.id === srcId);
  const tgt = project.events.find(e => e.id === tgtId);
  document.getElementById('conn-info').textContent = `${src?.title} → ${tgt?.title}`;
  document.getElementById('conn-type').value = 'crossover';
  document.getElementById('conn-character').value = '';
  document.getElementById('conn-label').value = '';
  document.getElementById('conn-notes').value = '';
  connDialog.showModal();

  document.getElementById('btn-save-conn').onclick = () => {
    const conn = createConnection(srcId, tgtId, document.getElementById('conn-type').value);
    conn.character = document.getElementById('conn-character').value;
    conn.label = document.getElementById('conn-label').value;
    conn.notes = document.getElementById('conn-notes').value;
    project.connections.push(conn);
    connDialog.close();
    cancelConnect();
    refreshAll();
  };

  document.getElementById('btn-cancel-conn').onclick = () => {
    connDialog.close();
    cancelConnect();
  };
}

// ===== Universe Dialog =====
const dialog = document.getElementById('universe-dialog');

function populateParentSelect() {
  const sel = document.getElementById('uni-parent');
  sel.innerHTML = '<option value="">— branches from main axis —</option>';
  project.universes.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    sel.appendChild(opt);
  });
}

document.getElementById('btn-add-universe').addEventListener('click', () => {
  renderUniverseList();
  populateParentSelect();
  dialog.showModal();
});

document.getElementById('btn-close-dialog').addEventListener('click', () => dialog.close());

document.getElementById('btn-add-uni').addEventListener('click', () => {
  const name = document.getElementById('uni-name').value.trim();
  const color = document.getElementById('uni-color').value;
  const parentId = document.getElementById('uni-parent').value || null;
  if (!name) return;
  addUniverse(project, name, color, parentId);
  document.getElementById('uni-name').value = '';
  renderUniverseList();
  populateParentSelect();
  refreshAll();
});

function renderUniverseList() {
  const list = document.getElementById('universe-list');
  list.innerHTML = '';
  project.universes.forEach(uni => {
    const parent = uni.parentUniverse ? project.universes.find(p => p.id === uni.parentUniverse) : null;
    const parentLabel = parent ? ` ← ${parent.name}` : uni.isMain ? '' : ' ← main';
    const div = document.createElement('div');
    div.className = 'uni-item';
    div.innerHTML = `
      <div class="uni-swatch" style="background:${uni.color}"></div>
      <span>${uni.name}<em style="color:#8a8778;font-size:10px">${parentLabel}</em></span>
      ${uni.isMain ? '<em style="color:#8a8778;font-size:11px">main</em>' : `<button data-id="${uni.id}" class="danger uni-del">✕</button>`}
    `;
    list.appendChild(div);
  });
  list.querySelectorAll('.uni-del').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteUniverse(project, btn.dataset.id);
      renderUniverseList();
      populateParentSelect();
      refreshAll();
    });
  });
}

// ===== Multi-select + Bulk Edit =====
renderer.onSelectionChange = (ids) => {
  const banner = document.getElementById('selection-banner');
  if (ids.length > 0) {
    banner.classList.remove('hidden');
    document.getElementById('sel-count').textContent = ids.length;
  } else {
    banner.classList.add('hidden');
  }
};

document.getElementById('btn-clear-selection').addEventListener('click', () => {
  renderer.clearSelection();
});

document.getElementById('btn-bulk-edit').addEventListener('click', () => {
  const ids = renderer.getSelectedIds();
  if (ids.length === 0) return;
  const bulkDialog = document.getElementById('bulk-edit-dialog');
  document.getElementById('bulk-count').textContent = ids.length;

  // Populate universe select
  const sel = document.getElementById('bulk-universe');
  sel.innerHTML = '<option value="">— don\'t change —</option>';
  project.universes.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id; opt.textContent = u.name;
    sel.appendChild(opt);
  });

  document.getElementById('bulk-evidence').value = '';
  document.getElementById('bulk-tags').value = '';
  document.getElementById('bulk-planet').value = '';
  document.getElementById('bulk-region').value = '';
  bulkDialog.showModal();
});

document.getElementById('btn-bulk-apply').addEventListener('click', () => {
  const ids = renderer.getSelectedIds();
  const uni = document.getElementById('bulk-universe').value;
  const evi = document.getElementById('bulk-evidence').value;
  const tags = document.getElementById('bulk-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const planet = document.getElementById('bulk-planet').value.trim();
  const region = document.getElementById('bulk-region').value.trim();

  ids.forEach(id => {
    const ev = project.events.find(e => e.id === id);
    if (!ev) return;
    if (uni) ev.universe = uni;
    if (evi) ev.evidence = evi;
    if (tags.length > 0) ev.tags = [...new Set([...(ev.tags || []), ...tags])];
    if (planet) {
      if (typeof ev.location === 'string') ev.location = { realm: '', planet, region: '', place: ev.location };
      else ev.location.planet = planet;
    }
    if (region) {
      if (typeof ev.location === 'string') ev.location = { realm: '', planet: '', region, place: ev.location };
      else ev.location.region = region;
    }
  });

  document.getElementById('bulk-edit-dialog').close();
  renderer.clearSelection();
  refreshAll();
});

document.getElementById('btn-bulk-delete').addEventListener('click', () => {
  const ids = renderer.getSelectedIds();
  if (!confirm(`Delete ${ids.length} events? This cannot be undone.`)) return;
  ids.forEach(id => deleteEvent(project, id));
  document.getElementById('bulk-edit-dialog').close();
  renderer.clearSelection();
  refreshAll();
});

document.getElementById('btn-bulk-cancel').addEventListener('click', () => {
  document.getElementById('bulk-edit-dialog').close();
});

// ===== Init =====
updateProjectLabel();
populateUniverseSelects();
populateFilterUniverse();
applyFilters();
