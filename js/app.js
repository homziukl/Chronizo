// app.js — Main application controller for Chronizo

import { createProject, saveToFile, loadFromFile, saveToLocalStorage, loadFromLocalStorage, mergeProjects, exportToCSV, importFromCSV, normalizeLoadedProject } from './storage.js';
import { addEvent, updateEvent, deleteEvent, addUniverse, deleteUniverse, createSubEvent } from './events.js';
import { createConnection } from './storage.js';
import { TimelineRenderer } from './timeline.js';
import { parseFormula, universeNameFromMedia } from './formula.js';
import { looksLikeQuickUpdate, parseQuickUpdate } from './quick_update.js';
import { EXAMPLE_FORMULA, UPDATE_FORMULA, AI_PROMPT } from './template.js';

// ===== State =====
let project = normalizeLoadedProject(loadFromLocalStorage() || createProject('Omniversal Event Tree'));
let editingEventId = null;
let connectMode = false;
let connectSourceId = null;


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setStatus(message, type = 'info') {
  const el = document.getElementById('project-name');
  if (!el) return;
  el.title = message || '';
  if (type === 'error') console.error(message);
  else if (type === 'warn') console.warn(message);
}

function persistProject() {
  const ok = saveToLocalStorage(project);
  if (!ok) setStatus('Autosave failed — use Save to download a file backup.', 'warn');
  return ok;
}

// ===== Renderer =====
const canvas = document.getElementById('timeline-canvas');
const renderer = new TimelineRenderer(canvas);
renderer.setProject(project);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());
setInterval(() => persistProject(), 30000);

// Persist the manual order right after a drag&drop reorder (Req 12.3). The
// renderer has already mutated sortOrder.custom and repainted; we only save.
renderer.onReorder = () => persistProject();

// ===== Helpers =====
function refreshAll() {
  applyFilters();
  updateProjectLabel();
  populateUniverseSelects();
  populateFilterUniverse();
  persistProject();
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
  // Search no longer hides events — it highlights a path (see the search-box
  // handler → renderer.setSearchQuery). applyFilters now only narrows the
  // visible set by universe/evidence (Req 10 decouples search from filtering).
  const uniFilter = document.getElementById('filter-universe').value;
  const eviFilter = document.getElementById('filter-evidence').value;

  const filtered = project.events.filter(ev => {
    if (uniFilter && ev.universe !== uniFilter) return false;
    if (eviFilter && ev.evidence !== eviFilter) return false;
    return true;
  });

  renderer.setFilteredEvents(filtered);
}

// Search highlights matching characters/events/titles instead of filtering
// (Req 10.1/10.3). Empty query clears the highlight; zero matches flags the box
// and sets a "No matches" title (Req 10.5).
const searchBox = document.getElementById('search-box');
searchBox.addEventListener('input', () => {
  const q = searchBox.value;
  const count = renderer.setSearchQuery(q);
  const noMatch = !!q.trim() && count === 0;
  searchBox.classList.toggle('no-match', noMatch);
  searchBox.title = noMatch ? 'No matches' : '';
});
document.getElementById('filter-universe').addEventListener('change', applyFilters);
document.getElementById('filter-evidence').addEventListener('change', applyFilters);

// ===== Top bar buttons =====
document.getElementById('btn-new').addEventListener('click', () => {
  if (!confirm('Create new project? Unsaved changes will be lost.')) return;
  const name = prompt('Project name:', 'Omniversal Event Tree');
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
    mergeProjects(project, imported);
    refreshAll();
    alert(`CSV imported — merged ${imported.events.length} event(s).`);
  } catch (err) {
    if (err.message !== 'No file selected') alert('CSV import error: ' + err.message);
  }
});

// ===== Quick Add (text formula) =====
const quickaddDialog = document.getElementById('quickadd-dialog');

// Resolve a universe name to an id, creating the universe if it doesn't exist.
function resolveUniverseByName(name) {
  if (!name) return 'main';
  const found = project.universes.find(u => u.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const hue = Math.floor(Math.random() * 360);
  const uni = addUniverse(project, name, `hsl(${hue}, 70%, 55%)`, null);
  return uni.id;
}

function addEventsFromFormula(text) {
  const { events, errors, warnings } = parseFormula(text);
  events.forEach(data => {
    data.universe = resolveUniverseByName(data._universeName);
    data.speculativeUniverse = data.speculativeUniverseName
      ? resolveUniverseByName(data.speculativeUniverseName) : '';
    delete data._universeName;
    delete data.speculativeUniverseName;
    addEvent(project, data);
  });
  return { added: events.length, errors, warnings: warnings || [] };
}


function getUniverseName(id) {
  return project.universes.find(u => u.id === id)?.name || id || '';
}

function lc(value) {
  return String(value ?? '').trim().toLowerCase();
}

function includesText(haystack, needle) {
  const n = lc(needle);
  if (!n) return false;
  return lc(haystack).includes(n);
}

function listHasValue(list, needle) {
  const n = lc(needle);
  return Array.isArray(list) && list.some(v => lc(v) === n);
}

function eventMatchesQuickUpdate(ev, matcher) {
  const value = matcher.value;
  switch (matcher.field) {
    case 'id': return ev.id === value;
    case 'title': return includesText(ev.title, value);
    case 'media': return includesText(ev.media?.title, value);
    case 'episode': return includesText(ev.media?.episode, value);
    case 'source': return includesText(ev.source, value);
    case 'tag': return listHasValue(ev.tags, value);
    case 'character': return listHasValue(ev.characters, value);
    case 'evidence': return lc(ev.evidence) === lc(value);
    case 'universe': return lc(ev.universe) === lc(value) || lc(getUniverseName(ev.universe)) === lc(value);
    default: return false;
  }
}

function findQuickUpdateMatches(op) {
  return project.events.filter(ev => op.matchers.every(m => eventMatchesQuickUpdate(ev, m)));
}

function ensureEventLocation(ev) {
  if (!ev.location || typeof ev.location === 'string') {
    ev.location = { realm: '', planet: '', region: '', place: typeof ev.location === 'string' ? ev.location : '' };
  }
  return ev.location;
}

function uniqueList(list) {
  const out = [];
  const seen = new Set();
  (list || []).forEach(item => {
    const value = String(item || '').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

function removeFromList(list, remove) {
  const banned = new Set((remove || []).map(v => lc(v)));
  return (list || []).filter(v => !banned.has(lc(v)));
}

function summarizeMatchers(matchers) {
  return matchers.map(m => `${m.field}=${m.value}`).join(' AND ');
}

function applyQuickUpdateOperation(op, matches) {
  const now = new Date().toISOString();
  let changed = 0;

  matches.forEach(ev => {
    const before = JSON.stringify(ev);
    const set = op.set || {};

    if (set.universeName !== undefined) ev.universe = resolveUniverseByName(set.universeName);
    if (set.speculativeUniverseName !== undefined) {
      ev.speculativeUniverse = set.speculativeUniverseName ? resolveUniverseByName(set.speculativeUniverseName) : '';
    }

    if (set.date) {
      ev.date = ev.date || {};
      ev.date.exact = set.date.exact;
      ev.date.approximate = set.date.approximate;
    }
    if (set.rangeFrom !== undefined) { ev.date = ev.date || {}; ev.date.rangeFrom = set.rangeFrom; }
    if (set.rangeTo !== undefined) { ev.date = ev.date || {}; ev.date.rangeTo = set.rangeTo; }
    if (set.season !== undefined) { ev.date = ev.date || {}; ev.date.season = set.season; }
    if (set.era !== undefined) { ev.date = ev.date || {}; ev.date.era = set.era; }
    if (set.releaseDate !== undefined) ev.releaseDate = set.releaseDate;
    if (set.evidence !== undefined) ev.evidence = set.evidence;
    if (set.source !== undefined) ev.source = set.source;
    if (set.reasoning !== undefined) ev.reasoning = set.reasoning;
    if (set.appendReasoning) {
      const suffix = set.appendReasoning.trim();
      ev.reasoning = [ev.reasoning || '', suffix].filter(Boolean).join('\n');
    }

    if (set.mediaTitle !== undefined || set.mediaEpisode !== undefined || set.mediaType !== undefined) {
      ev.media = ev.media || { type: '', title: '', episode: '' };
      if (set.mediaTitle !== undefined) ev.media.title = set.mediaTitle;
      if (set.mediaEpisode !== undefined) ev.media.episode = set.mediaEpisode;
      if (set.mediaType !== undefined) ev.media.type = set.mediaType;
    }

    if (set.tags) ev.tags = uniqueList(set.tags);
    if (op.addTags?.length) ev.tags = uniqueList([...(ev.tags || []), ...op.addTags]);
    if (op.removeTags?.length) ev.tags = removeFromList(ev.tags || [], op.removeTags);

    if (set.characters) ev.characters = uniqueList(set.characters);
    if (op.addCharacters?.length) ev.characters = uniqueList([...(ev.characters || []), ...op.addCharacters]);
    if (op.removeCharacters?.length) ev.characters = removeFromList(ev.characters || [], op.removeCharacters);

    if (set.realm !== undefined || set.planet !== undefined || set.region !== undefined || set.place !== undefined) {
      const loc = ensureEventLocation(ev);
      if (set.realm !== undefined) loc.realm = set.realm;
      if (set.planet !== undefined) loc.planet = set.planet;
      if (set.region !== undefined) loc.region = set.region;
      if (set.place !== undefined) loc.place = set.place;
    }

    if (set.sort !== undefined) ev.sortOrder = { ...(ev.sortOrder || {}), custom: set.sort };
    if (set.icon !== undefined || set.background !== undefined) {
      ev.appearance = ev.appearance || { icon: '', background: '' };
      if (set.icon !== undefined) ev.appearance.icon = set.icon;
      if (set.background !== undefined) ev.appearance.background = set.background;
    }

    ev.updateHistory = Array.isArray(ev.updateHistory) ? ev.updateHistory : [];
    ev.updateHistory.push({
      at: now,
      mode: 'quick-update',
      match: summarizeMatchers(op.matchers),
      set: { ...set },
      addTags: [...(op.addTags || [])],
      removeTags: [...(op.removeTags || [])],
      addCharacters: [...(op.addCharacters || [])],
      removeCharacters: [...(op.removeCharacters || [])]
    });

    if (JSON.stringify(ev) !== before) changed++;
  });

  return changed;
}

function runQuickUpdate(text) {
  const parsed = parseQuickUpdate(text);
  const warnings = [...(parsed.warnings || [])];
  const plan = parsed.operations.map(op => ({ op, matches: findQuickUpdateMatches(op) }));
  plan.forEach((item, idx) => {
    if (item.matches.length === 0) warnings.push(`Update block ${idx + 1}: no matching events for ${summarizeMatchers(item.op.matchers)}`);
  });

  const totalMatches = plan.reduce((sum, item) => sum + item.matches.length, 0);
  if (totalMatches === 0) {
    return { updated: 0, errors: parsed.errors, warnings };
  }

  const preview = plan
    .filter(item => item.matches.length)
    .map((item, idx) => {
      const titles = item.matches.slice(0, 5).map(ev => `• ${ev.title}`).join('\n');
      const more = item.matches.length > 5 ? `\n• ...and ${item.matches.length - 5} more` : '';
      return `Block ${idx + 1}: ${summarizeMatchers(item.op.matchers)}\n${titles}${more}`;
    })
    .join('\n\n');

  if (!confirm(`Quick Update will modify ${totalMatches} event(s):\n\n${preview}\n\nApply changes?`)) {
    return { updated: 0, errors: [], warnings: ['Quick Update cancelled'] };
  }

  let updated = 0;
  plan.forEach(item => { updated += applyQuickUpdateOperation(item.op, item.matches); });
  return { updated, errors: parsed.errors, warnings };
}

document.getElementById('btn-quick-add').addEventListener('click', () => {
  document.getElementById('quickadd-feedback').textContent = '';
  quickaddDialog.showModal();
});

document.getElementById('btn-quickadd-cancel').addEventListener('click', () => quickaddDialog.close());

document.getElementById('btn-quickadd-spec').addEventListener('click', () => {
  document.getElementById('quickadd-text').value = EXAMPLE_FORMULA;
});

document.getElementById('btn-quickupdate-spec').addEventListener('click', () => {
  document.getElementById('quickadd-text').value = UPDATE_FORMULA;
});

document.getElementById('btn-quickadd-prompt').addEventListener('click', async () => {
  const feedback = document.getElementById('quickadd-feedback');
  try {
    await navigator.clipboard.writeText(AI_PROMPT);
    feedback.style.color = '#27ae60';
    feedback.textContent = '📋 AI prompt copied — paste it into any AI, then paste the result back here.';
  } catch {
    // Clipboard API unavailable (e.g. file:// without permission) — fall back to
    // showing the prompt in the textarea so the user can copy it manually.
    document.getElementById('quickadd-text').value = AI_PROMPT;
    feedback.style.color = '#f39c12';
    feedback.textContent = 'Clipboard blocked — prompt placed in the box above; copy it manually (Ctrl+A, Ctrl+C).';
  }
});

document.getElementById('btn-quickadd-parse').addEventListener('click', () => {
  const text = document.getElementById('quickadd-text').value;
  const feedback = document.getElementById('quickadd-feedback');

  if (looksLikeQuickUpdate(text)) {
    const { updated, errors, warnings } = runQuickUpdate(text);
    if (updated === 0 && errors.length) {
      feedback.style.color = '#e74c3c';
      feedback.textContent = '⚠ ' + errors.join(' | ');
      return;
    }
    refreshAll();
    const notes = [...errors, ...warnings];
    if (notes.length) {
      feedback.style.color = '#f39c12';
      feedback.textContent = `Updated ${updated} event(s). ${notes.join(' | ')}`;
    } else {
      feedback.style.color = '#27ae60';
      feedback.textContent = `Updated ${updated} event(s).`;
    }
    return;
  }

  const { added, errors, warnings } = addEventsFromFormula(text);
  if (added === 0 && errors.length) {
    feedback.style.color = '#e74c3c';
    feedback.textContent = '⚠ ' + errors.join(' | ');
    return;
  }
  refreshAll();
  // Surface both parse errors (non-fatal once some events were added) and
  // skipped-key warnings (Req 3.4/3.8) so the user sees what was ignored.
  const notes = [...errors, ...warnings];
  if (notes.length) {
    feedback.style.color = '#f39c12';
    feedback.textContent = `Added ${added} event(s). ${notes.join(' | ')}`;
  } else {
    quickaddDialog.close();
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

// A native <input type="color"> always holds a value; treat the default
// sentinel as "no background set" so an untouched picker doesn't persist an
// accidental color (Req 9.6 — empty appearance renders the default look).
const DEFAULT_BG_COLOR = '#000000';

function setBgColor(inputId, background) {
  document.getElementById(inputId).value = background || DEFAULT_BG_COLOR;
}

function readBgColor(inputId) {
  const v = document.getElementById(inputId).value;
  return v && v.toLowerCase() !== DEFAULT_BG_COLOR ? v : '';
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
  document.getElementById('ev-characters').value = (event?.characters || []).join(', ');
  document.getElementById('ev-loc-realm').value = getLocField(event, 'realm');
  document.getElementById('ev-loc-planet').value = getLocField(event, 'planet');
  document.getElementById('ev-loc-region').value = getLocField(event, 'region');
  document.getElementById('ev-loc-place').value = getLocField(event, 'place');
  document.getElementById('ev-sort-order').value = event?.sortOrder?.custom || 0;

  // Appearance — optional icon + background (Req 9.1). Empty background leaves
  // the picker at its default sentinel so it isn't persisted as a set color.
  document.getElementById('ev-icon').value = event?.appearance?.icon || '';
  setBgColor('ev-bg', event?.appearance?.background);

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
    characters: document.getElementById('ev-characters').value.split(',').map(s => s.trim()).filter(Boolean),
    sortOrder: { custom: parseInt(document.getElementById('ev-sort-order').value) || 0 },
    subEvents: collectSubEvents(),
    appearance: {
      icon: document.getElementById('ev-icon').value.trim(),
      background: readBgColor('ev-bg')
    }
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
      <input type="text" class="sub-label" value="${escapeHtml(sub.label || '')}" placeholder="Description...">
      <input type="text" class="sub-date" value="${escapeHtml(sub.date?.approximate || '')}" placeholder="Date/year">
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
        `🔗 Source: <strong>${escapeHtml(event.title)}</strong> — now click TARGET event <button id="btn-cancel-connect">Cancel</button>`;
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

// Default hint for the universe-name input (restored when there's no media
// title to derive a suggestion from).
const DEFAULT_UNI_NAME_PLACEHOLDER = 'Universe name (e.g. Earth-616, The Witcher, World History)';

// When the event form is open and its media title is filled, suggest a universe
// name derived from that title as the input placeholder (Req 2.5). Otherwise
// restore the default hint so a stale suggestion from a previous open is cleared.
function suggestUniverseName() {
  const uniName = document.getElementById('uni-name');
  const panelOpen = !panel.classList.contains('hidden');
  const mediaTitle = document.getElementById('ev-media-title').value.trim();
  uniName.placeholder = (panelOpen && mediaTitle)
    ? universeNameFromMedia(mediaTitle)
    : DEFAULT_UNI_NAME_PLACEHOLDER;
}

document.getElementById('btn-add-universe').addEventListener('click', () => {
  renderUniverseList();
  populateParentSelect();
  suggestUniverseName();
  dialog.showModal();
});

document.getElementById('btn-close-dialog').addEventListener('click', () => dialog.close());

document.getElementById('btn-add-uni').addEventListener('click', () => {
  const name = document.getElementById('uni-name').value.trim();
  const color = document.getElementById('uni-color').value;
  const parentId = document.getElementById('uni-parent').value || null;
  if (!name) return;
  // addUniverse(project, name, color, parentId) doesn't take appearance, so set
  // it on the returned universe (createUniverse already seeds appearance — 1.2).
  const uni = addUniverse(project, name, color, parentId);
  uni.appearance = {
    icon: document.getElementById('uni-icon').value.trim(),
    background: readBgColor('uni-bg')
  };
  document.getElementById('uni-name').value = '';
  document.getElementById('uni-icon').value = '';
  setBgColor('uni-bg', '');
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
      <div class="uni-swatch" style="background:${escapeHtml(uni.color)}"></div>
      <span>${escapeHtml(uni.name)}<em style="color:var(--text-dim);font-size:10px">${escapeHtml(parentLabel)}</em></span>
      ${uni.isMain ? '<em style="color:var(--text-dim);font-size:11px">main</em>' : `<button data-id="${escapeHtml(uni.id)}" class="danger uni-del">✕</button>`}
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

// ===== Theme (dark/light) — Req 13 =====
// The canvas does not read CSS variables, so the renderer is told the theme
// explicitly via setTheme(); the DOM follows via body[data-theme]. Choice is
// persisted in localStorage and restored on startup.
const THEME_KEY = 'chronizo-theme';
function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  document.body.dataset.theme = t;
  document.body.classList.toggle('theme-light', t === 'light');
  document.body.classList.toggle('theme-dark', t === 'dark');
  document.getElementById('theme-toggle').textContent = t === 'light' ? '☀ Light' : '🌙 Dark';
  renderer.setTheme(t);
}
document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

// ===== Init =====
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
updateProjectLabel();
populateUniverseSelects();
populateFilterUniverse();
applyFilters();
