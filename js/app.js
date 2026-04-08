// app.js — Main application controller for Chronizo

import { createProject, saveToFile, loadFromFile, saveToLocalStorage, loadFromLocalStorage } from './storage.js';
import { addEvent, updateEvent, deleteEvent, addUniverse, deleteUniverse } from './events.js';
import { TimelineRenderer } from './timeline.js';

// ===== State =====
let project = loadFromLocalStorage() || createProject('My Timeline');
let editingEventId = null;

// ===== Init renderer =====
const canvas = document.getElementById('timeline-canvas');
const renderer = new TimelineRenderer(canvas);
renderer.setProject(project);
renderer.resize();

window.addEventListener('resize', () => renderer.resize());
setInterval(() => saveToLocalStorage(project), 30000);

// ===== UI helpers =====
function refreshAll() {
  renderer.setProject(project);
  updateProjectLabel();
  populateUniverseSelects();
  saveToLocalStorage(project);
}

function updateProjectLabel() {
  document.getElementById('project-name').textContent = project.meta.name;
}

function populateUniverseSelects() {
  const ids = ['ev-universe', 'ev-speculative'];
  ids.forEach((id, idx) => {
    const sel = document.getElementById(id);
    const val = sel.value;
    sel.innerHTML = idx === 1 ? '<option value="">— none —</option>' : '';
    project.universes.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      // Show parent info for non-main
      const parent = u.parentUniverse ? project.universes.find(p => p.id === u.parentUniverse) : null;
      opt.textContent = parent ? `${u.name} (← ${parent.name})` : u.name;
      sel.appendChild(opt);
    });
    sel.value = val;
  });
}

// ===== Top bar =====
document.getElementById('btn-new').addEventListener('click', () => {
  const name = prompt('Project name:', 'My Timeline');
  if (!name) return;
  project = createProject(name);
  editingEventId = null;
  refreshAll();
});

document.getElementById('btn-save').addEventListener('click', () => saveToFile(project));

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

document.getElementById('sort-mode').addEventListener('change', (e) => {
  renderer.setSortMode(e.target.value);
});

document.getElementById('project-name').addEventListener('click', () => {
  const name = prompt('Project name:', project.meta.name);
  if (name) { project.meta.name = name; refreshAll(); }
});

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
  document.getElementById('ev-season').value = event?.date?.season || '';
  document.getElementById('ev-release').value = event?.releaseDate || '';
  document.getElementById('ev-reasoning').value = event?.reasoning || '';
  document.getElementById('ev-tags').value = (event?.tags || []).join(', ');
  document.getElementById('ev-sort-order').value = event?.sortOrder?.custom || 0;

  // Location fields
  document.getElementById('ev-loc-realm').value = getLocField(event, 'realm');
  document.getElementById('ev-loc-planet').value = getLocField(event, 'planet');
  document.getElementById('ev-loc-region').value = getLocField(event, 'region');
  document.getElementById('ev-loc-place').value = getLocField(event, 'place');

  // Set universe selects AFTER populate
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
      season: document.getElementById('ev-season').value,
      era: ''
    },
    releaseDate: document.getElementById('ev-release').value,
    reasoning: document.getElementById('ev-reasoning').value,
    location: {
      realm: document.getElementById('ev-loc-realm').value.trim(),
      planet: document.getElementById('ev-loc-planet').value.trim(),
      region: document.getElementById('ev-loc-region').value.trim(),
      place: document.getElementById('ev-loc-place').value.trim()
    },
    tags: document.getElementById('ev-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    sortOrder: { custom: parseInt(document.getElementById('ev-sort-order').value) || 0 }
  };

  if (!data.title) return;

  if (editingEventId) {
    updateEvent(project, editingEventId, data);
  } else {
    addEvent(project, data);
  }

  panel.classList.add('hidden');
  editingEventId = null;
  refreshAll();
});

document.getElementById('btn-delete-event').addEventListener('click', () => {
  if (!editingEventId) return;
  if (!confirm('Delete this event?')) return;
  deleteEvent(project, editingEventId);
  panel.classList.add('hidden');
  editingEventId = null;
  refreshAll();
});

renderer.onEventClick = (event) => openEventPanel(event);

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
    const parentLabel = parent ? ` ← ${parent.name}` : uni.isMain ? '' : ' ← main axis';
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

// ===== Init =====
updateProjectLabel();
populateUniverseSelects();
