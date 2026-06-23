// timeline.js — Canvas renderer for Chronizo
// Full feature set: branches, sub-wires, evidence opacity, date ranges,
// sub-events, minimap, connect mode, filtering

import { sortEvents, characterThreads, matchQuery } from './sorting.js?v=3.10';
import { getTimeValue, getTimeEndValue, hasDateRange, getLocationKey,
         getLocationString, EVIDENCE_LEVELS, isPositionedByRelease, isUntimed,
         getAppearance } from './events.js?v=3.10';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class TimelineRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.project = null;
    this.filteredEvents = null; // null = show all
    this.sortMode = 'in-universe';
    this.connectMode = false;
    // Label glow (Req 7.5, optional feature). Default OFF so existing rendering
    // is unchanged; toggled on via setLabelGlow(true). When on, event labels get
    // a soft glow behind them in their universe color.
    this.labelGlow = false;

    // Theme (Req 13) — 'dark' (default) or 'light'. The canvas does not read CSS
    // variables, so the renderer keeps its own theme and is told explicitly via
    // setTheme(); _palette() maps it to concrete colors.
    this.theme = 'dark';
    // Search highlight (Req 10) — when non-empty, matching blocks/threads are
    // highlighted and the rest dimmed. Empty string = no highlight.
    this.searchQuery = '';
    this._matched = null;        // Set<eventId> of current matches (or null)
    this._lastMatchCount = 0;    // returned by setSearchQuery for the UI
    this._lastSelectedId = null;

    // OET v3 performance/focus mode: character threads default to a focused
    // path instead of drawing every character line at once. This keeps large
    // projects readable and lets the user ask for e.g. "Jim Gordon" only.
    this.performanceMode = false;
    this.characterThreadMode = 'focused'; // off | focused | all
    this.focusedCharacter = '';
    this._focusedIds = null;

    this.offsetX = 100;
    this.offsetY = 0;
    this.zoom = 1;

    this.hoveredEvent = null;
    this.eventPositions = [];

    this.EVENT_RADIUS = 6;
    this.PADDING_LEFT = 60;
    this.MAIN_Y = 300;
    this.MIN_GAP = 120;
    this.MAX_GAP = 400;
    this.WIRE_SPREAD = 16;
    this.BRANCH_CURVE = 60;
    // Vertical step used to fan out events that collide at the same (x, y)
    // within a universe (same time slot + same location wire), so overlapping
    // events stay individually readable. Sized for event CARDS (~26px tall),
    // not the legacy dots, so stacked cards keep a visible gap.
    this.STACK_GAP = 36;
    // "Bez źródła czasu" (no time source) zone — untimed events (Req 5.3) are
    // laid out here, after the last real time slot, instead of colliding with
    // dated events at the axis start. Spacing is fixed so positions are a
    // deterministic function of the event data (Property 10).
    this.UNTIMED_ZONE_GAP = 160; // gap from the last time slot to the zone
    this.UNTIMED_SLOT_GAP = 120; // gap between consecutive untimed events

    this._setupInteraction();
  }

  setProject(p) { this.project = p; this.render(); }
  setSortMode(m) { this.sortMode = m; this.render(); }
  setFilteredEvents(evts) { this.filteredEvents = evts; this.render(); }
  setConnectMode(on) { this.connectMode = on; this.render(); }
  // Optional label glow toggle (Req 7.5). Mirrors the other setters: updates the
  // flag and re-renders. Default state is OFF (set in the constructor).
  setLabelGlow(on) { this.labelGlow = on; this.render(); }
  // Theme switch (Req 13.6) — set the renderer theme and repaint immediately.
  setTheme(t) { this.theme = (t === 'light' ? 'light' : 'dark'); this.render(); }
  // Search highlight (Req 10) — set the query, repaint, and return how many
  // events matched so the app can show a "No matches" message (Req 10.5).
  setSearchQuery(q) { this.searchQuery = q || ''; this.render(); return this._lastMatchCount; }
  setPerformanceMode(on) { this.performanceMode = !!on; this.render(); }
  setCharacterThreadMode(mode) {
    this.characterThreadMode = ['off', 'focused', 'all'].includes(mode) ? mode : 'focused';
    this.render();
  }
  setFocusedCharacter(name) {
    this.focusedCharacter = String(name || '').trim();
    if (this.focusedCharacter && this.characterThreadMode === 'off') this.characterThreadMode = 'focused';
    this.render();
    return this._focusedIds ? this._focusedIds.size : 0;
  }

  // Theme palette (Req 13.2–13.4) — concrete colors per theme. Label/value text
  // is pure black (#000) in light and white (#fff) in dark, with NO low-contrast
  // greys. The canvas background and grid follow the theme too.
  _palette() {
    if (this.theme === 'light') {
      return { bg: '#f1f1ec', text: '#000', grid: 'rgba(0,0,0,0.08)' };
    }
    return { bg: '#0a0a0f', text: '#fff', grid: 'rgba(42,42,58,0.3)' };
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = r.width * devicePixelRatio;
    this.canvas.height = r.height * devicePixelRatio;
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.render();
  }

  render() {
    if (!this.project) return;
    const ctx = this.ctx;
    const w = this.canvas.width / devicePixelRatio;
    const h = this.canvas.height / devicePixelRatio;

    const pal = this._palette();
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);
    this._drawGrid(w, h);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.zoom, this.zoom);

    this.MAIN_Y = h / (2 * this.zoom);
    const sourceEvents = this.filteredEvents || this.project.events;
    const events = this._displayEventsForMode(sourceEvents);
    this._sourceEvents = sourceEvents;
    this._displayEvents = events;
    // Search highlight set (Req 10) — compute once per render. Empty query →
    // null (no highlight); otherwise the set of matching display-event ids.
    if (this.searchQuery && this.searchQuery.trim()) {
      this._matched = matchQuery(events, this.searchQuery);
      this._lastMatchCount = this._matched.size;
    } else {
      this._matched = null;
      this._lastMatchCount = 0;
    }
    const layout = this._computeLayout(events);
    this.eventPositions = [];

    this._drawUniverseBands(layout);
    this._drawMainAxis(layout);
    this._drawTimeMarkers(layout);
    this._drawUntimedZone(layout);
    this._drawBranches(layout);
    // Resolve block-vs-block overlap (readability): event cards are far larger
    // than the old dots, so co-located/near cards collide. Spread them
    // vertically before drawing threads/blocks so everything uses the resolved
    // positions. Deterministic (stable order), so re-renders are identical.
    this._resolveBlockCollisions();
    this._focusedIds = null;
    if (!this.performanceMode) this._drawDateRanges(layout);
    if (!this.performanceMode) this._drawConnections();
    // Character threads (Linie_Postaci) — v3 defaults to focused mode so the
    // timeline is clean until a character is selected.
    this._drawCharacterThreads();
    this.eventPositions.forEach(ep => this._drawEventBlock(ep));
    if (!this.performanceMode) this._drawSubEventMarkers(layout);
    this._drawDragGhost();

    ctx.restore();
    this._drawLegend(layout);
    this._drawMinimap(layout);
  }

  _displayEventsForMode(events) {
    if (this.sortMode !== 'release') return events;
    return this._buildReleaseMediaBlocks(events);
  }

  _buildReleaseMediaBlocks(events) {
    const groups = new Map();
    for (const ev of events || []) {
      const release = String(ev.releaseDate || '').trim() || 'No release date';
      const mediaInfo = this._mediaInfoFromEvent(ev);
      const mediaTitle = mediaInfo.title || ev.source || 'Unknown medium';
      const episode = mediaInfo.episode || '';
      const universe = ev.universe || 'main';

      // OET release blocks are about the released medium/issue/episode, not
      // about individual in-story event kinds. Earlier versions included
      // media.type in the grouping key, which accidentally split one episode
      // into several release blocks when Quick Add used `type: event`,
      // `type: clue`, `type: background`, etc. For release order, all events
      // with the same release date + universe + medium label belong together.
      const canonicalMediaTitle = this._canonicalReleaseMediaTitle(mediaTitle, episode);
      const key = [release, universe, canonicalMediaTitle.toLowerCase()].join('|');
      if (!groups.has(key)) groups.set(key, { release, universe, mediaType: '', mediaTitle: canonicalMediaTitle, episode: '', events: [] });
      groups.get(key).events.push(ev);
    }

    return [...groups.values()].map((g, i) => {
      const title = this._releaseBlockTitle(g);
      const childTitles = g.events.map(ev => ev.title || '(untitled)');
      const characters = this._unionList(g.events.flatMap(ev => Array.isArray(ev.characters) ? ev.characters : []));
      const tags = this._unionList(g.events.flatMap(ev => Array.isArray(ev.tags) ? ev.tags : []));
      const evidence = this._strongestEvidence(g.events.map(ev => ev.evidence));
      const mediaType = this._bestReleaseMediaType(g.events);
      return {
        id: 'release-block:' + this._stableHash([g.release, g.universe, g.mediaTitle, i].join('|')),
        title,
        universe: g.universe,
        speculativeUniverse: '',
        date: { exact: null, approximate: '', rangeFrom: '', rangeTo: '', season: '', era: '' },
        releaseDate: g.release === 'No release date' ? '' : g.release,
        source: '',
        reasoning: `Release block for ${title}. Contains ${g.events.length} in-story event(s).`,
        evidence,
        tags: this._unionList(['release-block', ...tags]),
        sortOrder: { custom: i * 10 },
        location: { realm: '', planet: '', region: '', place: '' },
        media: { type: mediaType, title: g.mediaTitle, episode: g.episode },
        subEvents: [],
        characters,
        appearance: { icon: this._mediaIcon(mediaType), background: '' },
        _releaseBlock: true,
        _releaseChildren: g.events.map(ev => ({
          id: ev.id,
          title: ev.title || '(untitled)',
          date: this._formatDate(ev),
          evidence: ev.evidence || 'shown',
          characters: Array.isArray(ev.characters) ? ev.characters : []
        })),
        _releaseChildIds: g.events.map(ev => ev.id),
        _releaseChildTitles: childTitles
      };
    });
  }

  _releaseBlockTitle(group) {
    const base = group.mediaTitle || 'Unknown medium';
    const ep = group.episode || '';
    if (ep && !base.toLowerCase().includes(ep.toLowerCase())) return `${base} ${ep}`.replace(/\s+/g, ' ').trim();
    return base.replace(/\s+/g, ' ').trim();
  }

  _canonicalReleaseMediaTitle(mediaTitle, episode = '') {
    const title = this._cleanMediaLabel(mediaTitle || 'Unknown medium');
    const ep = this._cleanMediaLabel(episode);
    if (ep && !title.toLowerCase().includes(ep.toLowerCase())) {
      return this._cleanMediaLabel(`${title} ${ep}`);
    }
    return title;
  }

  _isEventKindType(type) {
    const t = String(type || '').trim().toLowerCase();
    return ['event', 'background', 'clue', 'note', 'scene', 'timeline', 'wydarzenie', 'tlo', 'tło', 'wskazowka', 'wskazówka'].includes(t);
  }

  _bestReleaseMediaType(events) {
    // Prefer true media types (tv/comic/film/game/book). Ignore event-kind
    // values that may come from OET Quick Add's `type:` field.
    for (const ev of events || []) {
      const type = this._mediaInfoFromEvent(ev).type;
      if (type && !this._isEventKindType(type)) return type;
    }
    // If we only know an episode marker, treat it as TV/series for icon only.
    if ((events || []).some(ev => this._mediaInfoFromEvent(ev).episode)) return 'tv';
    return '';
  }

  _cleanMediaLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  _mediaInfoFromEvent(ev) {
    const media = ev?.media;
    let type = '';
    let title = '';
    let episode = '';

    if (typeof media === 'string') {
      title = media;
    } else if (media && typeof media === 'object') {
      type = String(media.type || '').trim();
      title = media.title || media.name || media.label || '';
      episode = media.episode || media.issue || media.part || '';
    }

    // Fallback for old Quick Add data and older saves: if media.title was split
    // into title + episode, render them as one readable release block label.
    title = this._cleanMediaLabel(title || ev?.source || 'Unknown medium');
    episode = this._cleanMediaLabel(episode);
    if (episode && !title.toLowerCase().includes(episode.toLowerCase())) {
      title = this._cleanMediaLabel(`${title} ${episode}`);
      episode = '';
    }

    return { type, title, episode };
  }

  _mediaIcon(type) {
    const t = String(type || '').toLowerCase();
    if (t.includes('series') || t.includes('tv')) return '📺';
    if (t.includes('film') || t.includes('movie')) return '🎬';
    if (t.includes('comic')) return '📖';
    if (t.includes('game')) return '🎮';
    if (t.includes('book')) return '📚';
    return '🎞';
  }

  _unionList(list) {
    const out = [];
    const seen = new Set();
    for (const item of list || []) {
      const value = String(item || '').trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
    return out;
  }

  _stableHash(value) {
    let h = 2166136261;
    const s = String(value || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  _strongestEvidence(values) {
    const order = ['shown', 'described', 'mentioned', 'implied', 'speculated'];
    let best = 'speculated';
    for (const v of values || []) {
      if (order.indexOf(v) >= 0 && order.indexOf(v) < order.indexOf(best)) best = v;
    }
    return best;
  }

  // ===== LAYOUT =====
  _computeLayout(events) {
    const sorted = sortEvents(events, this.sortMode);
    const universes = this.project.universes;
    const mainUni = universes.find(u => u.isMain) || universes[0];

    // Separate events that have no time source at all (Req 5.3). They must NOT
    // fall into the t=0 slot (which lands at the axis start and collides with
    // dated events) and must NOT distort the time-axis scaling. They are placed
    // in a dedicated "Bez źródła czasu" zone after the last real time slot.
    const timedEvents = [];
    const untimedEvents = [];
    sorted.forEach(ev => (isUntimed(ev) ? untimedEvents : timedEvents).push(ev));

    // Time slots — built only from events that actually have a time source.
    const slotMap = new Map();
    timedEvents.forEach(ev => {
      const t = getTimeValue(ev);
      if (!slotMap.has(t)) slotMap.set(t, { time: t, label: this._formatDate(ev), events: [] });
      slotMap.get(t).events.push(ev);
    });
    const slots = [...slotMap.values()].sort((a, b) => a.time - b.time);

    // X positions with gap compression
    let currentX = this.PADDING_LEFT;
    slots.forEach((slot, i) => {
      if (i === 0) { slot.x = currentX; return; }
      const dt = slot.time - slots[i - 1].time;
      const years = dt > 0 ? dt / (365.25 * 24 * 3600000) : 0;
      const gap = dt <= 0 ? this.MIN_GAP :
        Math.min(this.MAX_GAP, Math.max(this.MIN_GAP, this.MIN_GAP + Math.log10(Math.max(1, years)) * 80));
      currentX += gap;
      slot.x = currentX;
    });

    // "Bez źródła czasu" zone — deterministic placement after the last time
    // slot (Req 5.3 / Property 10). Untimed events are ordered by
    // sortOrder.custom then title so the position is a pure function of the
    // event data: re-rendering the same state yields identical positions.
    const untimedSorted = [...untimedEvents].sort((a, b) =>
      ((a.sortOrder?.custom || 0) - (b.sortOrder?.custom || 0)) ||
      String(a.title || '').localeCompare(String(b.title || '')));
    const untimedPositions = new Map(); // event id -> x
    const untimedStartX = currentX + this.UNTIMED_ZONE_GAP;
    untimedSorted.forEach((ev, i) => {
      untimedPositions.set(ev.id, untimedStartX + i * this.UNTIMED_SLOT_GAP);
    });
    const untimedZone = untimedSorted.length > 0
      ? { startX: untimedStartX,
          endX: untimedStartX + (untimedSorted.length - 1) * this.UNTIMED_SLOT_GAP,
          events: untimedSorted }
      : null;

    // Branch tree
    const branchInfo = new Map();
    let laneCounter = 0;
    const computeBranch = (uni) => {
      if (branchInfo.has(uni.id)) return branchInfo.get(uni.id);
      if (uni.isMain) {
        const info = { startX: this.PADDING_LEFT - 40, y: this.MAIN_Y, isMain: true, depth: 0 };
        branchInfo.set(uni.id, info);
        return info;
      }
      const parentId = uni.parentUniverse || mainUni.id;
      const parentUni = universes.find(u => u.id === parentId) || mainUni;
      const parentInfo = computeBranch(parentUni);
      const firstSlot = slots.find(s => s.events.some(e => e.universe === uni.id));
      const startX = firstSlot ? firstSlot.x - this.BRANCH_CURVE : this.PADDING_LEFT;
      laneCounter++;
      const dir = laneCounter % 2 === 1 ? -1 : 1;
      const offset = Math.ceil(laneCounter / 2) * this.WIRE_SPREAD * 4 * dir;
      const info = { startX, y: parentInfo.y + offset, parentY: parentInfo.y, isMain: false, depth: parentInfo.depth + 1, parentId };
      branchInfo.set(uni.id, info);
      return info;
    };
    universes.forEach(uni => computeBranch(uni));

    // Location sub-wires
    const locationWires = new Map();
    universes.forEach(uni => {
      const uniEvts = sorted.filter(e => e.universe === uni.id);
      const keys = [...new Set(uniEvts.map(e => getLocationKey(e)))].filter(Boolean);
      const wm = new Map();
      keys.forEach((k, i) => wm.set(k, (i - (keys.length - 1) / 2) * this.WIRE_SPREAD));
      locationWires.set(uni.id, wm);
    });

    // Helper: time value to X position (interpolated)
    const timeToX = (t) => {
      if (slots.length === 0) return this.PADDING_LEFT;
      if (t <= slots[0].time) return slots[0].x;
      if (t >= slots[slots.length - 1].time) return slots[slots.length - 1].x;
      for (let i = 1; i < slots.length; i++) {
        if (t <= slots[i].time) {
          const ratio = (t - slots[i - 1].time) / (slots[i].time - slots[i - 1].time);
          return slots[i - 1].x + ratio * (slots[i].x - slots[i - 1].x);
        }
      }
      return slots[slots.length - 1].x;
    };

    return { slots, branchInfo, universes, mainUni, locationWires, totalWidth: (untimedZone ? untimedZone.endX : currentX) + 200, sorted, timeToX, untimedZone, untimedPositions };
  }

  // ===== UNIVERSE BANDS =====
  _drawUniverseBands(layout) {
    const ctx = this.ctx;
    layout.universes.forEach(uni => {
      const info = layout.branchInfo.get(uni.id);
      if (!info) return;

      // Horizontal extent occupied by this universe's events (Req 7.4 — also
      // covers the main universe; Req 7.1 — band spans all of its events).
      const uniSlots = layout.slots.filter(s => s.events.some(e => e.universe === uni.id));
      let bandStartX, bandEndX;
      if (uniSlots.length > 0) {
        const xs = uniSlots.map(s => s.x);
        bandStartX = Math.min(...xs) - 30;
        bandEndX = Math.max(...xs) + 60;
      } else if (info.isMain) {
        // Main universe without its own events still gets a band along the axis.
        bandStartX = info.startX;
        bandEndX = layout.totalWidth;
      } else {
        return; // non-main universe with no events — nothing to draw
      }
      // Start no later than the branch origin so the band covers the branch curve.
      bandStartX = Math.min(bandStartX, info.startX);
      const bandW = bandEndX - bandStartX;

      const lw = layout.locationWires.get(uni.id);
      const bandH = Math.max(50, (lw ? lw.size : 0) * this.WIRE_SPREAD + 20);
      const bandTop = info.y - bandH / 2;

      ctx.save();
      // Fill — alpha in the 0.08–0.10 readable range (Req 7.2).
      ctx.fillStyle = uni.color;
      ctx.globalAlpha = 0.09;
      ctx.fillRect(bandStartX, bandTop, bandW, bandH);
      // Dashed border.
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = uni.color;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 8]);
      ctx.strokeRect(bandStartX, bandTop, bandW, bandH);
      // Universe name at the band's left edge, in the universe color (Req 7.3).
      // Placed at the top edge so it does not obscure events/labels on the wire.
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = uni.color;
      ctx.font = '11px "Share Tech Mono",monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(uni.name, bandStartX + 6, bandTop + 10);
      ctx.restore();
    });
  }

  // ===== MAIN AXIS =====
  _drawMainAxis(layout) {
    const ctx = this.ctx;
    const y = this.MAIN_Y;
    const c = layout.mainUni.color;
    ctx.save();
    ctx.shadowColor = c; ctx.shadowBlur = 14;
    ctx.strokeStyle = c; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(layout.totalWidth, y); ctx.stroke();
    ctx.shadowBlur = 4; ctx.strokeStyle = '#ffaa55'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(layout.totalWidth, y); ctx.stroke();
    ctx.restore();
  }

  // ===== TIME MARKERS =====
  _drawTimeMarkers(layout) {
    const ctx = this.ctx;
    const y = this.MAIN_Y;
    const pal = this._palette();
    layout.slots.forEach(slot => {
      ctx.strokeStyle = 'rgba(255,107,0,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(slot.x, y - 10); ctx.lineTo(slot.x, y + 10); ctx.stroke();
      if (slot.label) {
        ctx.save();
        ctx.fillStyle = pal.text; ctx.globalAlpha = 0.75;
        ctx.font = '9px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
        ctx.fillText(slot.label, slot.x, y + 24);
        ctx.restore();
      }
    });
    for (let i = 1; i < layout.slots.length; i++) {
      const yrs = (layout.slots[i].time - layout.slots[i - 1].time) / (365.25 * 24 * 3600000);
      if (yrs > 50) {
        ctx.save();
        ctx.fillStyle = pal.text; ctx.globalAlpha = 0.45;
        ctx.font = '10px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
        ctx.fillText(`⟨ ${Math.round(yrs)}y ⟩`, (layout.slots[i - 1].x + layout.slots[i].x) / 2, this.MAIN_Y + 38);
        ctx.restore();
      }
    }
  }

  // ===== UNTIMED ZONE ("Bez źródła czasu") =====
  // Visual separator + label for the dedicated region where events with no
  // time source (Req 5.3) are placed, so users see they are intentionally
  // grouped at the end of the axis rather than at the start.
  _drawUntimedZone(layout) {
    const zone = layout.untimedZone;
    if (!zone) return;
    const ctx = this.ctx;
    const y = this.MAIN_Y;
    const dividerX = zone.startX - this.UNTIMED_ZONE_GAP / 2;
    const pal = this._palette();

    ctx.save();
    // Dashed vertical divider between the time axis and the untimed zone.
    ctx.strokeStyle = pal.text;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(dividerX, y - 120);
    ctx.lineTo(dividerX, y + 120);
    ctx.stroke();
    // Zone label.
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = pal.text;
    ctx.font = '10px "Share Tech Mono",monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('⌀ No time source', zone.startX - 16, y - 130);
    ctx.restore();
  }

  // ===== BRANCHES =====
  _drawBranches(layout) {
    const { slots, branchInfo, universes, locationWires } = layout;
    const ctx = this.ctx;

    universes.forEach(uni => {
      const info = branchInfo.get(uni.id);
      if (!info) return;
      const locWires = locationWires.get(uni.id) || new Map();

      const uniEvents = [];
      slots.forEach(slot => {
        slot.events.filter(e => e.universe === uni.id).forEach(ev => {
          const locOffset = locWires.get(getLocationKey(ev)) || 0;
          uniEvents.push({ ev, x: slot.x, y: info.y + locOffset });
        });
      });

      // Untimed events for this universe — placed in the dedicated
      // "Bez źródła czasu" zone (Req 5.3) at their deterministic X instead of
      // the t=0 slot. Appended after timed events so they sit at the far right.
      if (layout.untimedZone) {
        layout.untimedZone.events.filter(e => e.universe === uni.id).forEach(ev => {
          const locOffset = locWires.get(getLocationKey(ev)) || 0;
          uniEvents.push({ ev, x: layout.untimedPositions.get(ev.id), y: info.y + locOffset });
        });
      }

      // De-overlap: events sharing the same (x, y) — same time slot AND same
      // location wire — would render exactly on top of each other and become
      // unreadable. Fan each collision group vertically around its base Y by a
      // fixed step. Deterministic (depends only on the stable sorted order), so
      // re-rendering the same state yields identical positions (Property 10).
      const collisionGroups = new Map();
      uniEvents.forEach(ue => {
        const key = `${Math.round(ue.x)}:${Math.round(ue.y)}`;
        if (!collisionGroups.has(key)) collisionGroups.set(key, []);
        collisionGroups.get(key).push(ue);
      });
      collisionGroups.forEach(group => {
        if (group.length < 2) return;
        const mid = (group.length - 1) / 2;
        group.forEach((ue, i) => { ue.y += (i - mid) * this.STACK_GAP; });
      });

      if (uniEvents.length === 0 && !info.isMain) return;

      if (!info.isMain) {
        this._drawBranchCurve(info.startX, info.parentY, info.y, uni.color);
        const lastX = uniEvents.length > 0 ? uniEvents[uniEvents.length - 1].x + 60 : info.startX + 200;
        const wireStart = info.startX + this.BRANCH_CURVE;

        if (locWires.size > 1) {
          locWires.forEach((off, key) => {
            this._drawWire(wireStart, info.y + off, lastX, uni.color, 0.5, uni.id + key);
            if (key) {
              ctx.save(); ctx.fillStyle = uni.color; ctx.globalAlpha = 0.5;
              ctx.font = '8px "Share Tech Mono",monospace'; ctx.textAlign = 'left';
              ctx.fillText(key, wireStart + 4, info.y + off - 4); ctx.restore();
            }
          });
        } else {
          this._drawWire(wireStart, info.y, lastX, uni.color, 0.6, uni.id);
        }
      }

      // De-overlap: events that resolve to the same point (same time slot and
      // same location wire) are fanned out vertically so their dots stay
      // individually visible, clickable and hoverable. Deterministic — uses the
      // build order, so re-rendering the same state yields identical positions.
      const colocated = new Map();
      uniEvents.forEach(ue => {
        const key = `${Math.round(ue.x)}|${Math.round(ue.y)}`;
        if (!colocated.has(key)) colocated.set(key, []);
        colocated.get(key).push(ue);
      });
      colocated.forEach(group => {
        if (group.length < 2) return;
        const spread = this.EVENT_RADIUS * 2.6;
        group.forEach((ue, i) => {
          ue.y += (i - (group.length - 1) / 2) * spread;
        });
      });

      uniEvents.forEach(ue => {
        const evi = EVIDENCE_LEVELS[ue.ev.evidence] || EVIDENCE_LEVELS.shown;
        this.eventPositions.push({
          id: ue.ev.id, x: ue.x, y: ue.y,
          radius: this.EVENT_RADIUS, color: uni.color,
          event: ue.ev, universe: uni,
          opacity: evi.opacity, dash: evi.dash
        });
      });
    });
  }

  // ===== DATE RANGES (horizontal bars) =====
  _drawDateRanges(layout) {
    const ctx = this.ctx;
    this.eventPositions.forEach(ep => {
      if (!hasDateRange(ep.event)) return;
      const startX = ep.x;
      const endTime = getTimeEndValue(ep.event);
      const endX = layout.timeToX(endTime);
      if (endX <= startX + 5) return;

      ctx.save();
      ctx.fillStyle = ep.color;
      ctx.globalAlpha = (ep.opacity || 1) * 0.15;
      const barH = 8;
      ctx.fillRect(startX, ep.y - barH / 2, endX - startX, barH);

      // Border
      ctx.globalAlpha = (ep.opacity || 1) * 0.4;
      ctx.strokeStyle = ep.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(startX, ep.y - barH / 2, endX - startX, barH);
      ctx.restore();
    });
  }

  // ===== SUB-EVENT MARKERS (drawn on universe axis, not at parent Y) =====
  _drawSubEventMarkers(layout) {
    const ctx = this.ctx;
    this.eventPositions.forEach(ep => {
      const subs = ep.event.subEvents;
      if (!subs || subs.length === 0) return;

      // Get the Y of the universe axis (not the event's location-offset Y)
      const uniInfo = layout.branchInfo.get(ep.event.universe);
      const axisY = uniInfo ? uniInfo.y : this.MAIN_Y;

      subs.forEach(sub => {
        if (!sub.date?.approximate) return;
        const subTime = this._parseSubTime(sub.date.approximate);
        if (!subTime) return;
        const subX = layout.timeToX(subTime);

        if (sub.type === 'timetravel') {
          this._drawTimeTravelArc(ep, subX, axisY, sub, layout);
        } else {
          this._drawRegularSubMarker(ep, subX, axisY, sub);
        }
      });
    });
  }

  // Regular sub-event: diamond on the universe axis + dashed connector to parent
  _drawRegularSubMarker(ep, subX, axisY, sub) {
    const ctx = this.ctx;
    ctx.save();

    // Diamond marker on the axis
    const s = 4;
    ctx.fillStyle = ep.color;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(subX, axisY - s);
    ctx.lineTo(subX + s, axisY);
    ctx.lineTo(subX, axisY + s);
    ctx.lineTo(subX - s, axisY);
    ctx.closePath();
    ctx.fill();

    // Dashed line from sub-event marker to parent event
    ctx.strokeStyle = ep.color;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(subX, axisY);
    ctx.lineTo(ep.x, ep.y);
    ctx.stroke();

    // Label on the axis — only when the parent event is hovered, to avoid
    // piling sub-event text on top of the now-large event cards (readability).
    if (this.hoveredEvent === ep.id) {
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.6;
      ctx.font = '8px "Share Tech Mono",monospace';
      ctx.textAlign = 'center';
      const typeIcons = { flashback: '⏪', callback: '🔗', postcredits: '🎬', prologue: '📖', epilogue: '📕' };
      ctx.fillText(`${typeIcons[sub.type] || ''} ${sub.label || sub.date.approximate}`, subX, axisY - 8);
    }

    ctx.restore();
  }

  // Time Travel: special arc from parent event to destination point on axis
  _drawTimeTravelArc(ep, subX, axisY, sub, layout) {
    const ctx = this.ctx;
    const isNewUniverse = sub.timeTravelMode === 'new-universe';

    // Colors: cyan for same-universe, magenta/purple for new-universe
    const ttColor = isNewUniverse ? '#e040fb' : '#00e5ff';
    const ttGlow = isNewUniverse ? 'rgba(224,64,251,0.4)' : 'rgba(0,229,255,0.4)';

    ctx.save();

    // === Glowing arc from parent event to destination on axis ===
    ctx.shadowColor = ttColor;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = ttColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;

    // Animated-looking dashed line
    ctx.setLineDash([6, 4]);

    const midX = (ep.x + subX) / 2;
    const direction = subX > ep.x ? -1 : 1; // arc curves away from travel direction
    const arcHeight = Math.min(80, Math.abs(subX - ep.x) * 0.3);
    const cpY = Math.min(ep.y, axisY) - arcHeight;

    ctx.beginPath();
    ctx.moveTo(ep.x, ep.y);
    ctx.bezierCurveTo(
      ep.x + (subX - ep.x) * 0.3, cpY,
      ep.x + (subX - ep.x) * 0.7, cpY,
      subX, axisY
    );
    ctx.stroke();

    // === Destination marker: portal circle on the axis ===
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.8;

    // Outer ring (portal)
    ctx.beginPath();
    ctx.arc(subX, axisY, 8, 0, Math.PI * 2);
    ctx.strokeStyle = ttColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner fill
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = ttColor;
    ctx.fill();

    // Center dot
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = ttColor;
    ctx.beginPath();
    ctx.arc(subX, axisY, 3, 0, Math.PI * 2);
    ctx.fill();

    // === New Universe indicator: diverging lines from portal ===
    if (isNewUniverse) {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = ttColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);

      // Two diverging lines below the axis (branching effect)
      ctx.beginPath();
      ctx.moveTo(subX, axisY + 8);
      ctx.lineTo(subX + 30, axisY + 35);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(subX, axisY + 8);
      ctx.lineTo(subX - 30, axisY + 35);
      ctx.stroke();

      // Small "new universe" label
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.5;
      ctx.font = '7px "Share Tech Mono",monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = ttColor;
      ctx.fillText('NEW BRANCH', subX, axisY + 46);
    }

    // === Arrow on the arc (direction indicator) ===
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = ttColor;
    // Arrow at destination
    const angle = Math.atan2(axisY - cpY, subX - midX);
    const arrowSize = 5;
    ctx.beginPath();
    ctx.moveTo(subX, axisY);
    ctx.lineTo(subX - arrowSize * Math.cos(angle - 0.5), axisY - arrowSize * Math.sin(angle - 0.5));
    ctx.lineTo(subX - arrowSize * Math.cos(angle + 0.5), axisY - arrowSize * Math.sin(angle + 0.5));
    ctx.closePath();
    ctx.fill();

    // === Label ===
    ctx.shadowBlur = 0;
    if (this.hoveredEvent === ep.id) {
      ctx.globalAlpha = 0.8;
      ctx.font = '9px "Share Tech Mono",monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = ttColor;
      const icon = isNewUniverse ? '🌀' : '⏳';
      ctx.fillText(`${icon} ${sub.label || 'Time Travel'}`, subX, axisY - 14);
    }

    // === Source marker: small hourglass icon at parent event ===
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = ttColor;
    ctx.lineWidth = 1.5;
    const hx = ep.x, hy = ep.y;
    // Small hourglass shape
    ctx.beginPath();
    ctx.moveTo(hx - 3, hy - 4);
    ctx.lineTo(hx + 3, hy - 4);
    ctx.lineTo(hx, hy);
    ctx.lineTo(hx + 3, hy + 4);
    ctx.lineTo(hx - 3, hy + 4);
    ctx.lineTo(hx, hy);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  _parseSubTime(str) {
    if (!str) return null;
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getTime();
    const m = str.match(/-?\d{1,4}/);
    return m ? new Date(parseInt(m[0]), 0).getTime() : null;
  }

  _drawWire(startX, y, endX, color, alpha, seed) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = alpha;
    const h = seed.length * 7;
    ctx.beginPath(); ctx.moveTo(startX, y);
    for (let x = startX; x <= endX; x += 15) ctx.lineTo(x, y + Math.sin(x * 0.01 + h * 0.3) * 2);
    ctx.stroke(); ctx.restore();
  }

  _drawBranchCurve(startX, parentY, targetY, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(startX, parentY);
    ctx.bezierCurveTo(startX + this.BRANCH_CURVE * 0.4, parentY, startX + this.BRANCH_CURVE * 0.6, targetY, startX + this.BRANCH_CURVE, targetY);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(startX, parentY, 3, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.globalAlpha = 0.9; ctx.fill();
    ctx.restore();
  }

  // ===== CHARACTER THREADS (Linie_Postaci) =====
  // Draws one polyline per character connecting the event blocks the character
  // appears in, in the active sort order (Req 7.2). Each character gets a
  // stable, distinguishable color derived from its name, plus a name label at
  // the first occurrence (Req 7.3). A character appearing in a single event
  // gets no connecting line (Req 7.5).
  _drawCharacterThreads() {
    this._focusedIds = null;
    if (!this.eventPositions || this.eventPositions.length === 0) return;
    if (this.characterThreadMode === 'off') return;

    const ctx = this.ctx;
    const events = this._displayEvents || this._displayEventsForMode(this.filteredEvents || this.project.events);
    const threads = characterThreads(events, this.sortMode);
    const posById = new Map(this.eventPositions.map(ep => [ep.id, ep]));
    const focus = String(this.focusedCharacter || '').trim().toLowerCase();

    // Focused mode is intentionally silent until a character is chosen. This is
    // the OET workflow: select "Jim Gordon" and only then draw his timeline.
    if (this.characterThreadMode === 'focused' && !focus) return;

    const q = (this.searchQuery && this.searchQuery.trim())
      ? this.searchQuery.trim().toLowerCase() : null;

    threads.forEach((ids, name) => {
      const nameLc = String(name || '').toLowerCase();
      const focused = !!focus && (nameLc === focus || nameLc.includes(focus));
      if (this.characterThreadMode === 'focused' && !focused) return;

      const pts = ids.map(id => posById.get(id)).filter(Boolean);
      if (pts.length < 2) {
        if (focused) this._focusedIds = new Set(ids);
        return;
      }

      if (focused) {
        if (!this._focusedIds) this._focusedIds = new Set();
        ids.forEach(id => this._focusedIds.add(id));
      }

      const isMatch = !q || nameLc.includes(q) || (this._matched && ids.some(id => this._matched.has(id)));
      const dim = q && !isMatch ? 0.25 : 1;
      const color = this._characterColor(name);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = (focused ? 0.86 : 0.38) * dim;
      ctx.lineWidth = focused ? 3 : 1.25;
      ctx.setLineDash([]);
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      // Event beads on the focused path make the route readable even when cards
      // are dense. Non-focused/all mode keeps old lightweight labels only.
      if (focused) {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = color;
        pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill(); });
      }

      ctx.globalAlpha = (focused ? 1 : 0.75) * dim;
      ctx.fillStyle = color;
      ctx.font = `${focused ? 'bold ' : ''}10px "Share Tech Mono",monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(name, pts[0].x + 8, pts[0].y - 8);
      if (focused && pts.length > 1) ctx.fillText(name, pts[pts.length - 1].x + 8, pts[pts.length - 1].y - 8);
      ctx.restore();
    });
  }

  // Stable per-character color (hash of the name → HSL hue). Deterministic so a
  // character keeps the same thread color across renders.
  _characterColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return `hsl(${hash % 360}, 70%, 60%)`;
  }

  // Build a rounded-rectangle path (does not fill/stroke — caller decides).
  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // Readable label color. Theme support (Req 13) lands in a later slice; until
  // then this defaults to the dark-theme palette. Kept centralized so the theme
  // slice only has to change this one place.
  _labelColor(isHovered) {
    if (this.theme === 'light') return '#000';
    return isHovered ? '#fff' : '#e0ddd4';
  }

  // ===== BLOCK COLLISION RESOLUTION =====
  // Event cards are much wider than the old dots, so cards that are close in X
  // overlap and become unreadable. This pass measures each card and pushes
  // overlapping cards vertically (alternating down/up around their base Y) until
  // they no longer collide. Mutates ep.y so threads, date ranges and hit-testing
  // all use the resolved positions. Deterministic: processes cards in a stable
  // (x, y, id) order, so the same state always yields the same layout.
  _resolveBlockCollisions() {
    if (!this.eventPositions || this.eventPositions.length === 0) return;
    const ctx = this.ctx;
    const GAP_X = 10, GAP_Y = 8, STEP = 10, MAX_TRIES = 240;

    const boxes = this.eventPositions.map(ep => {
      const ev = ep.event;
      const app = getAppearance(ev);
      const maxLen = this.zoom > 0.6 ? 22 : (this.zoom > 0.3 ? 14 : 8);
      const title = ev.title || '(untitled)';
      const label = title.length > maxLen ? title.slice(0, maxLen - 1) + '…' : title;
      ctx.font = 'bold 10px "Share Tech Mono",monospace';
      const text = (app.icon ? app.icon + ' ' : '') + label;
      const w = ctx.measureText(text).width + 16; // padX*2
      return { ep, w, h: 20 };
    });

    // Stable processing order.
    boxes.sort((a, b) =>
      (a.ep.x - b.ep.x) || (a.ep.y - b.ep.y) ||
      (a.ep.id < b.ep.id ? -1 : a.ep.id > b.ep.id ? 1 : 0));

    const placed = []; // { cx, cy, w, h }
    const hits = (cx, cy, w, h) => placed.some(p =>
      (cx - w / 2 - GAP_X) < (p.cx + p.w / 2) &&
      (cx + w / 2 + GAP_X) > (p.cx - p.w / 2) &&
      (cy - h / 2 - GAP_Y) < (p.cy + p.h / 2) &&
      (cy + h / 2 + GAP_Y) > (p.cy - p.h / 2));

    boxes.forEach(b => {
      const baseY = b.ep.y;
      let cy = baseY;
      let tries = 0;
      while (tries < MAX_TRIES && hits(b.ep.x, cy, b.w, b.h)) {
        tries++;
        const k = Math.ceil(tries / 2);
        cy = baseY + (tries % 2 === 1 ? 1 : -1) * k * STEP;
      }
      b.ep.y = cy;
      placed.push({ cx: b.ep.x, cy, w: b.w, h: b.h });
    });
  }


  _isMatchedEvent(ev) {
    if (!this._matched) return true;
    if (this._matched.has(ev.id)) return true;
    return !!(ev._releaseChildIds && ev._releaseChildIds.some(id => this._matched.has(id)));
  }

  // ===== EVENT BLOCKS (cards) =====
  // Renders an event as a card/block with its title (Req 7.1), an optional icon
  // next to the title and an optional background, both from appearance
  // (Req 9.3/9.4); a missing/empty appearance falls back to the universe color
  // (Req 9.6). Keeps the release-positioning ("≈", Req 5.2) and no-time-source
  // ("⌀", Req 5.3) markers and the sub-event count badge. Stores the block rect
  // on the position record so hit-testing uses the card bounds.
  _drawEventBlock(ep) {
    const ctx = this.ctx;
    const ev = ep.event;
    const isHovered = this.hoveredEvent === ep.id;
    const isSelected = this._selectedIds?.has(ep.id);
    let alpha = ep.opacity || 1;
    // Search dimming (Req 10.3): with an active query, non-matching blocks are
    // dimmed so the matching path stands out; matching blocks keep full alpha.
    const isMatch = !this._matched || this._isMatchedEvent(ev);
    if (!isMatch) alpha *= 0.2;
    const focusActive = !!(this.focusedCharacter && this._focusedIds);
    if (focusActive && !this._focusedIds.has(ep.id)) alpha *= this.performanceMode ? 0.22 : 0.38;
    const app = getAppearance(ev);

    const maxLen = this.zoom > 0.6 ? 16 : (this.zoom > 0.3 ? 11 : 7);
    const title = ev.title || '(untitled)';
    const label = title.length > maxLen ? title.slice(0, maxLen - 1) + '…' : title;
    const fontSize = isHovered ? 11 : 10;
    ctx.font = `bold ${fontSize}px "Share Tech Mono",monospace`;
    const text = (app.icon ? app.icon + ' ' : '') + label;
    const textW = ctx.measureText(text).width;
    const padX = 8, padY = 5;
    const bw = textW + padX * 2;
    const bh = fontSize + padY * 2;
    const bx = ep.x - bw / 2;
    const by = ep.y - bh / 2;

    ctx.save();
    if (this.connectMode) { ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 12; }
    else { ctx.shadowColor = ep.color; ctx.shadowBlur = isHovered ? 16 : 6; }
    // Card background — OPAQUE base so the card occludes threads/labels/other
    // cards behind it (readability), then a universe-color tint or the custom
    // appearance.background on top, then the border.
    const pal = this._palette();
    ctx.globalAlpha = alpha;
    this._roundRect(bx, by, bw, bh, 5);
    ctx.fillStyle = pal.bg; ctx.fill();
    ctx.shadowBlur = 0;
    if (app.background) {
      ctx.globalAlpha = alpha * 0.9;
      this._roundRect(bx, by, bw, bh, 5);
      ctx.fillStyle = app.background; ctx.fill();
    } else {
      ctx.globalAlpha = alpha * 0.32;
      this._roundRect(bx, by, bw, bh, 5);
      ctx.fillStyle = ep.color; ctx.fill();
    }
    // Border in the universe color (white when selected).
    ctx.globalAlpha = alpha;
    ctx.lineWidth = isSelected ? 2 : 1.25;
    ctx.strokeStyle = isSelected ? '#fff' : ep.color;
    if (ep.dash && ep.dash.length) ctx.setLineDash(ep.dash);
    this._roundRect(bx, by, bw, bh, 5);
    ctx.stroke();
    ctx.setLineDash([]);
    // Title text.
    ctx.globalAlpha = 1;
    ctx.fillStyle = this._labelColor(isHovered);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, ep.x, ep.y + 0.5);
    ctx.restore();

    // Hit rect for click/hover (used by _hitTest in preference to the radius).
    ep.block = { x: bx, y: by, w: bw, h: bh };

    // ===== Release-positioning marker (Req 5.2) =====
    if (!ev._releaseBlock && isPositionedByRelease(ev)) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha + 0.2);
      ctx.fillStyle = ep.color;
      ctx.font = '12px "Share Tech Mono",monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('≈', bx + bw + 8, by);
      ctx.restore();
    }

    // ===== No-time-source marker (Req 5.3) =====
    if (!ev._releaseBlock && isUntimed(ev)) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#a0a0ae';
      ctx.font = '12px "Share Tech Mono",monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⌀', bx + bw + 8, by);
      ctx.restore();
    }

    // ===== Sub-event count badge =====
    const childCount = ev._releaseBlock ? (ev._releaseChildren?.length || 0) : (ev.subEvents?.length || 0);
    if (childCount > 0) {
      ctx.save();
      ctx.fillStyle = ep.color; ctx.globalAlpha = 0.82;
      ctx.font = '8px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ev._releaseBlock ? `${childCount} events` : `+${childCount}`, bx + bw + (ev._releaseBlock ? 24 : 8), by + bh);
      ctx.restore();
    }
  }

  // ===== EVENT DOTS (with evidence opacity + label collision avoidance) =====
  _drawEventDot(ep) {
    const ctx = this.ctx;
    const isHovered = this.hoveredEvent === ep.id;
    const isSelected = this._selectedIds?.has(ep.id);
    const r = isHovered ? ep.radius * 1.8 : ep.radius;
    const alpha = ep.opacity || 1;
    const dash = ep.dash || [];

    ctx.save();
    ctx.shadowColor = ep.color;
    ctx.shadowBlur = isHovered ? 24 : 10;

    if (this.connectMode) { ctx.shadowBlur = 16; ctx.shadowColor = '#a855f7'; }

    // Selection ring
    if (isSelected) {
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 16;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(ep.x, ep.y, r + 5, 0, Math.PI * 2); ctx.stroke();
    }

    // Glow ring
    ctx.beginPath(); ctx.arc(ep.x, ep.y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = ep.color; ctx.globalAlpha = alpha * 0.2; ctx.fill();

    // Main dot
    ctx.globalAlpha = alpha;
    if (dash.length > 0) {
      ctx.setLineDash(dash); ctx.strokeStyle = ep.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ep.x, ep.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = alpha * 0.4; ctx.fillStyle = ep.color;
      ctx.beginPath(); ctx.arc(ep.x, ep.y, r, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = isHovered ? '#fff' : ep.color;
      ctx.beginPath(); ctx.arc(ep.x, ep.y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Dark core
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(ep.x, ep.y, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0f'; ctx.fill();
    ctx.restore();

    // ===== Release-positioning marker (Req 5.2) =====
    // An event with no in-universe date is placed at its releaseDate. Mark it
    // with a distinguishing dashed ring + "≈" glyph so it reads as uncertain
    // and is clearly different from events positioned by an in-universe date.
    if (isPositionedByRelease(ep.event)) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = ep.color;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.arc(ep.x, ep.y, r + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // "≈" glyph (approximate position) above-right of the dot.
      ctx.globalAlpha = Math.min(1, alpha + 0.2);
      ctx.fillStyle = ep.color;
      ctx.font = `${Math.max(9, Math.round(r * 1.4))}px "Share Tech Mono",monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('≈', ep.x + r + 6, ep.y - r - 4);
      ctx.restore();
    }

    // ===== No-time-source marker (Req 5.3) =====
    // An event with neither an in-universe date nor a release date lives in the
    // dedicated "Bez źródła czasu" zone. Mark it greyed-out with a dashed
    // outline + "⌀" glyph so it is clearly distinct from time-positioned events.
    if (isUntimed(ep.event)) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (alpha || 1));
      ctx.strokeStyle = '#8a8a98';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(ep.x, ep.y, r + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // "⌀" glyph (no time source) above-right of the dot.
      ctx.fillStyle = '#a0a0ae';
      ctx.font = `${Math.max(9, Math.round(r * 1.4))}px "Share Tech Mono",monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⌀', ep.x + r + 6, ep.y - r - 4);
      ctx.restore();
    }

    // ===== Label with collision avoidance =====
    const maxLen = this.zoom > 0.6 ? 24 : (this.zoom > 0.3 ? 14 : 8);
    const label = ep.event.title.length > maxLen ? ep.event.title.slice(0, maxLen - 2) + '…' : ep.event.title;
    const fontSize = isHovered ? 11 : 10;
    ctx.font = `${fontSize}px "Share Tech Mono",monospace`;
    const textW = ctx.measureText(label).width;
    const textH = fontSize + 4;
    const pad = 6; // padding around labels

    // Generate candidate positions with increasing distance
    const offsets = [
      r + pad,           // close
      r + pad + textH,   // medium
      r + pad + textH * 2, // far
      r + pad + textH * 3  // very far
    ];

    const candidates = [];
    for (const off of offsets) {
      // Below center, above center
      candidates.push({ x: ep.x - textW / 2, y: ep.y + off });
      candidates.push({ x: ep.x - textW / 2, y: ep.y - off - textH });
      // Right, left
      candidates.push({ x: ep.x + r + pad, y: ep.y + off - textH });
      candidates.push({ x: ep.x - textW - r - pad, y: ep.y + off - textH });
      // Diagonal right-below, left-above
      candidates.push({ x: ep.x + r + pad, y: ep.y + off });
      candidates.push({ x: ep.x - textW - r - pad, y: ep.y - off - textH });
    }

    // Prefer: above main axis → label below, below main axis → label above
    if (ep.y >= this.MAIN_Y) {
      // Swap first two so "above" is tried first
      [candidates[0], candidates[1]] = [candidates[1], candidates[0]];
    }

    let placed = false;
    for (const pos of candidates) {
      const rect = { x: pos.x - 2, y: pos.y - 2, w: textW + 4, h: textH + 4 };
      if (!this._overlapsAny(rect)) {
        this._labelRects.push(rect);
        ctx.fillStyle = isHovered ? '#fff' : `rgba(224,221,212,${alpha})`;
        ctx.textAlign = 'left';
        // Label glow (Req 7.5, optional): when enabled, draw a soft glow behind
        // the label text in the event's universe color. Wrapped in save/restore
        // so the shadow is reset afterward and other drawing (connector line,
        // sub-event badge) is unaffected. When the flag is off, behavior is
        // identical to before (plain fillText, no shadow).
        if (this.labelGlow) {
          ctx.save();
          ctx.shadowColor = ep.color;
          ctx.shadowBlur = isHovered ? 8 : 6;
          ctx.fillText(label, pos.x, pos.y + textH - 3);
          ctx.restore();
        } else {
          ctx.fillText(label, pos.x, pos.y + textH - 3);
        }

        // Draw thin line from label to dot if label is far
        const dist = Math.hypot(pos.x + textW / 2 - ep.x, pos.y + textH / 2 - ep.y);
        if (dist > r + 20) {
          ctx.save(); ctx.strokeStyle = ep.color; ctx.globalAlpha = 0.15; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(ep.x, ep.y);
          ctx.lineTo(pos.x + textW / 2, pos.y + textH / 2); ctx.stroke(); ctx.restore();
        }
        placed = true;
        break;
      }
    }

    // If no position found — only show on hover
    if (!placed && isHovered) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      if (this.labelGlow) {
        ctx.save();
        ctx.shadowColor = ep.color;
        ctx.shadowBlur = 8;
        ctx.fillText(label, ep.x, ep.y - r - 8);
        ctx.restore();
      } else {
        ctx.fillText(label, ep.x, ep.y - r - 8);
      }
    }

    // Sub-event count badge
    if (ep.event.subEvents?.length > 0 && placed) {
      ctx.fillStyle = ep.color; ctx.globalAlpha = 0.7;
      ctx.font = '8px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
      ctx.fillText(`+${ep.event.subEvents.length}`, ep.x + r + 8, ep.y + 3);
    }
  }

  _overlapsAny(rect) {
    for (const r of this._labelRects) {
      if (rect.x < r.x + r.w && rect.x + rect.w > r.x &&
          rect.y < r.y + r.h && rect.y + rect.h > r.y) return true;
    }
    return false;
  }

  // ===== CONNECTIONS =====
  _drawConnections() {
    if (!this.project.connections) return;
    const ctx = this.ctx;
    const colors = { branch: '#d4a843', crossover: '#a855f7', merge: '#27ae60', backward: '#e74c3c', reference: '#8a8778' };

    this.project.connections.forEach(conn => {
      const src = this.eventPositions.find(ep => ep.id === conn.sourceEventId);
      const tgt = this.eventPositions.find(ep => ep.id === conn.targetEventId);
      if (!src || !tgt) return;

      ctx.save();
      ctx.strokeStyle = colors[conn.type] || '#d4a843';
      ctx.lineWidth = conn.type === 'crossover' ? 2 : 1.5;
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 6;
      if (conn.type === 'reference') ctx.setLineDash([4, 4]);
      else if (conn.type === 'backward') ctx.setLineDash([2, 3]);

      const back = tgt.x < src.x;
      ctx.beginPath(); ctx.moveTo(src.x, src.y);
      if (back) {
        const arcY = Math.min(src.y, tgt.y) - 60 - Math.abs(src.x - tgt.x) * 0.1;
        ctx.bezierCurveTo(src.x, arcY, tgt.x, arcY, tgt.x, tgt.y);
      } else {
        const cpY = Math.min(src.y, tgt.y) - 40;
        ctx.quadraticCurveTo((src.x + tgt.x) / 2, cpY, tgt.x, tgt.y);
      }
      ctx.stroke();

      // Arrow
      const a = Math.atan2(tgt.y - src.y, tgt.x - src.x);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(tgt.x, tgt.y);
      ctx.lineTo(tgt.x - 6 * Math.cos(a - 0.4), tgt.y - 6 * Math.sin(a - 0.4));
      ctx.lineTo(tgt.x - 6 * Math.cos(a + 0.4), tgt.y - 6 * Math.sin(a + 0.4));
      ctx.closePath(); ctx.fill();

      if (conn.label || conn.character) {
        const mx = (src.x + tgt.x) / 2;
        const my = back ? Math.min(src.y, tgt.y) - 60 - Math.abs(src.x - tgt.x) * 0.05 : Math.min(src.y, tgt.y) - 44;
        ctx.fillStyle = ctx.strokeStyle; ctx.font = '9px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
        ctx.fillText(conn.character || conn.label, mx, my);
      }
      ctx.restore();
    });
  }

  // ===== MINIMAP =====
  _drawMinimap(layout) {
    const mm = document.getElementById('minimap');
    if (!mm) return;
    const mc = mm.getContext('2d');
    const mw = 200, mh = 100;
    mm.width = mw; mm.height = mh;

    mc.fillStyle = 'rgba(10,10,15,0.9)';
    mc.fillRect(0, 0, mw, mh);

    if (this.eventPositions.length === 0) return;

    // Compute bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.eventPositions.forEach(ep => {
      minX = Math.min(minX, ep.x); maxX = Math.max(maxX, ep.x);
      minY = Math.min(minY, ep.y); maxY = Math.max(maxY, ep.y);
    });
    const pad = 40;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const scaleX = mw / (maxX - minX || 1);
    const scaleY = mh / (maxY - minY || 1);
    const scale = Math.min(scaleX, scaleY);

    // Draw dots
    this.eventPositions.forEach(ep => {
      const x = (ep.x - minX) * scale;
      const y = (ep.y - minY) * scale;
      mc.fillStyle = ep.color;
      mc.globalAlpha = ep.opacity || 1;
      mc.fillRect(x - 1, y - 1, 2, 2);
    });

    // Draw viewport rectangle
    const vw = this.canvas.width / devicePixelRatio;
    const vh = this.canvas.height / devicePixelRatio;
    const vx1 = (-this.offsetX / this.zoom - minX) * scale;
    const vy1 = (-this.offsetY / this.zoom - minY) * scale;
    const vx2 = vw / this.zoom * scale;
    const vy2 = vh / this.zoom * scale;
    mc.globalAlpha = 0.4;
    mc.strokeStyle = '#ff6b00';
    mc.lineWidth = 1;
    mc.strokeRect(vx1, vy1, vx2, vy2);
  }

  // ===== GRID =====
  _drawGrid(w, h) {
    const ctx = this.ctx;
    ctx.strokeStyle = this._palette().grid; ctx.lineWidth = 0.5;
    const step = 50 * this.zoom;
    const ox = this.offsetX % step, oy = this.offsetY % step;
    for (let x = ox; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = oy; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }

  // ===== LEGEND =====
  _drawLegend(layout) {
    const ctx = this.ctx;
    const pal = this._palette();
    let ly = 16;
    ctx.font = '10px "Orbitron",sans-serif';
    layout.universes.forEach(uni => {
      const p = uni.parentUniverse ? layout.universes.find(u => u.id === uni.parentUniverse) : null;
      ctx.fillStyle = uni.color; ctx.fillRect(10, ly - 6, 8, 8);
      ctx.fillStyle = pal.text; ctx.textAlign = 'left';
      ctx.fillText(uni.name + (p ? ` ← ${p.name}` : ''), 24, ly + 1);
      ly += 18;
    });
  }

  _formatDate(ev) {
    if ((this.sortMode === 'release' || ev._releaseBlock) && ev.releaseDate) return ev.releaseDate;
    if (ev.date.exact) return ev.date.exact;
    if (ev.date.rangeFrom && ev.date.rangeTo) return `${ev.date.rangeFrom} — ${ev.date.rangeTo}`;
    if (ev.date.rangeFrom) return `${ev.date.rangeFrom} —`;
    let s = ev.date.approximate || '';
    if (ev.date.season) {
      const icons = { spring: '🌱', summer: '☀️', autumn: '🍂', winter: '❄️' };
      s += ` ${icons[ev.date.season] || ''}`;
    }
    if (ev.date.era) s = ev.date.era;
    return s;
  }

  // ===== INTERACTION =====
  _setupInteraction() {
    let isPanning = false, lastX = 0, lastY = 0;
    this._selectedIds = new Set();
    this._dragState = null;   // active block drag (Req 12) or null
    this._didDragBlock = false;

    this.canvas.addEventListener('mousedown', (e) => {
      // In connect mode, never drag blocks — panning only, the click handler
      // manages connection picking.
      if (this.connectMode) { isPanning = true; lastX = e.clientX; lastY = e.clientY; return; }
      const hit = this._hitTest(e);
      if (hit) {
        // Begin a potential block drag (Req 12.1). Promote to a real drag once
        // the pointer moves past a small threshold (so plain clicks still open
        // the event panel).
        const r = this.canvas.getBoundingClientRect();
        this._dragState = {
          id: hit.id,
          startClientX: e.clientX, startClientY: e.clientY,
          curX: (e.clientX - r.left - this.offsetX) / this.zoom,
          curY: (e.clientY - r.top - this.offsetY) / this.zoom,
          moved: false
        };
      } else {
        isPanning = true; lastX = e.clientX; lastY = e.clientY;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (this._dragState) {
        const r = this.canvas.getBoundingClientRect();
        this._dragState.curX = (e.clientX - r.left - this.offsetX) / this.zoom;
        this._dragState.curY = (e.clientY - r.top - this.offsetY) / this.zoom;
        if (Math.abs(e.clientX - this._dragState.startClientX) > 3 ||
            Math.abs(e.clientY - this._dragState.startClientY) > 3) {
          this._dragState.moved = true;   // visual feedback (Req 12.2)
        }
        this.render();
        return;
      }
      if (isPanning) {
        this.offsetX += e.clientX - lastX; this.offsetY += e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY; this.render();
      } else this._handleHover(e);
    });
    window.addEventListener('mouseup', (e) => {
      if (this._dragState) {
        const ds = this._dragState;
        this._dragState = null;
        if (ds.moved) {
          // Dropped inside the canvas → reorder; outside → revert (Req 12.4,
          // no data change since we never mutated until here).
          const r = this.canvas.getBoundingClientRect();
          const inside = e.clientX >= r.left && e.clientX <= r.right &&
                         e.clientY >= r.top && e.clientY <= r.bottom;
          if (inside) this._applyReorder(ds.id, ds.curX);
          this._didDragBlock = true;   // suppress the click that follows a drag
          this.render();
        }
        return;
      }
      isPanning = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.9 : 1.1;
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      this.offsetX = mx - (mx - this.offsetX) * f;
      this.offsetY = my - (my - this.offsetY) * f;
      this.zoom = Math.max(0.1, Math.min(5, this.zoom * f));
      this.render();
    }, { passive: false });

    this.canvas.addEventListener('click', (e) => {
      // A click fires right after a drag's mouseup — ignore it so a drag does
      // not also open the event panel (Req 12).
      if (this._didDragBlock) { this._didDragBlock = false; return; }
      const hit = this._hitTest(e);
      // Release-order media blocks are synthetic view objects, not real project
      // events. Never put them into the bulk-selection set, otherwise later bulk
      // delete/edit can leave a stale UI state. Open their info instead.
      if (hit?.event?._releaseBlock && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        this.onEventClick?.(hit.event);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        // Multi-select with Ctrl+click
        if (hit) {
          if (this._selectedIds.has(hit.id)) this._selectedIds.delete(hit.id);
          else this._selectedIds.add(hit.id);
          this._lastSelectedId = hit.id;
          this.render();
          this.onSelectionChange?.(this.getSelectedIds());
        }
      } else if (e.shiftKey && hit && this._selectedIds.size > 0) {
        // Shift+click: select visual range from the last anchor to this event.
        const anchor = this._lastSelectedId || this.getSelectedIds().at(-1);
        const ordered = this.eventPositions.slice().sort((a, b) => (a.block?.x ?? a.x) - (b.block?.x ?? b.x));
        const a = ordered.findIndex(ep => ep.id === anchor);
        const b = ordered.findIndex(ep => ep.id === hit.id);
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a];
          for (const ep of ordered.slice(from, to + 1)) this._selectedIds.add(ep.id);
        } else {
          this._selectedIds.add(hit.id);
        }
        this._lastSelectedId = hit.id;
        this.render();
        this.onSelectionChange?.(this.getSelectedIds());
      } else {
        // Normal click
        if (hit) {
          if (this._selectedIds.size > 0) {
            this._selectedIds.clear();
            this._lastSelectedId = null;
            this.render();
            this.onSelectionChange?.(this.getSelectedIds());
          }
          this.onEventClick?.(hit.event);
        } else {
          // Click on empty space — clear selection
          if (this._selectedIds.size > 0) {
            this._selectedIds.clear();
            this._lastSelectedId = null;
            this.render();
            this.onSelectionChange?.(this.getSelectedIds());
          }
        }
      }
    });
  }

  getSelectedIds() { return [...this._selectedIds]; }

  pruneSelection(validIds = new Set()) {
    const valid = validIds instanceof Set ? validIds : new Set(validIds || []);
    let changed = false;
    for (const id of [...this._selectedIds]) {
      if (!valid.has(id)) {
        this._selectedIds.delete(id);
        changed = true;
      }
    }
    if (this._lastSelectedId && !valid.has(this._lastSelectedId)) {
      this._lastSelectedId = null;
      changed = true;
    }
    if (changed) {
      this.render();
      this.onSelectionChange?.(this.getSelectedIds());
    }
    return changed;
  }

  clearSelection() { this._selectedIds.clear(); this._lastSelectedId = null; this.render(); this.onSelectionChange?.(this.getSelectedIds()); }

  // Reorder after a drag&drop (Req 12.1/12.3). Rebuilds the left-to-right visual
  // order, moves the dragged event to the slot matching its drop X, then
  // renumbers sortOrder.custom for all events so the new order is deterministic
  // and persists. onReorder lets the app save the project.
  _applyReorder(draggedId, dropX) {
    const ordered = this.eventPositions.slice().sort((a, b) => a.x - b.x);
    // Insertion index = how many non-dragged blocks sit left of the drop point.
    let idx = 0;
    for (const ep of ordered) {
      if (ep.id === draggedId) continue;
      if (ep.x < dropX) idx++;
    }
    const ids = ordered.map(ep => ep.id).filter(id => id !== draggedId);
    ids.splice(idx, 0, draggedId);
    const byId = new Map(this.project.events.map(ev => [ev.id, ev]));
    ids.forEach((id, i) => {
      const ev = byId.get(id);
      if (ev) ev.sortOrder = { ...(ev.sortOrder || {}), custom: i * 10 };
    });
    this.onReorder?.();
  }

  // Drag feedback (Req 12.2): a dashed drop-position indicator plus a ghost dot
  // at the pointer while a block is being dragged.
  _drawDragGhost() {
    const ds = this._dragState;
    if (!ds || !ds.moved) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#ff6b00'; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(ds.curX, this.MAIN_Y - 140); ctx.lineTo(ds.curX, this.MAIN_Y + 140); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.6; ctx.fillStyle = '#ff6b00';
    ctx.beginPath(); ctx.arc(ds.curX, ds.curY, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _handleHover(e) {
    const hit = this._hitTest(e);
    const id = hit ? hit.id : null;
    if (id !== this.hoveredEvent) {
      this.hoveredEvent = id;
      this.render();
      const tt = document.getElementById('event-tooltip');
      hit ? this._showTooltip(hit, e.clientX, e.clientY) : tt.classList.add('hidden');
    }
  }

  _hitTest(e) {
    const r = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left - this.offsetX) / this.zoom;
    const my = (e.clientY - r.top - this.offsetY) / this.zoom;
    for (const ep of this.eventPositions) {
      // Prefer the block bounds (event cards) when available; fall back to the
      // legacy radius hit-test for any position without a block rect.
      if (ep.block) {
        const b = ep.block;
        if (mx >= b.x - 3 && mx <= b.x + b.w + 3 && my >= b.y - 3 && my <= b.y + b.h + 3) return ep;
      } else {
        const dx = mx - ep.x, dy = my - ep.y;
        if (dx * dx + dy * dy < (ep.radius + 5) ** 2) return ep;
      }
    }
    return null;
  }

  _showTooltip(ep, cx, cy) {
    const tt = document.getElementById('event-tooltip');
    const ev = ep.event;
    const evi = EVIDENCE_LEVELS[ev.evidence] || EVIDENCE_LEVELS.shown;

    let h = `<div class="tt-title">${escapeHtml(ev.title)}</div>`;
    if (ev._releaseBlock) {
      h += `<span class="tt-evidence shown">📦 Release block</span>`;
      h += `<div class="tt-meta">${escapeHtml(ep.universe.name)}</div>`;
      if (ev.releaseDate) h += `<div class="tt-meta">📅 Release: ${escapeHtml(ev.releaseDate)}</div>`;
      if (ev.media?.title) h += `<div class="tt-meta">🎬 ${escapeHtml(ev.media.title)} ${escapeHtml(ev.media.episode || '')}</div>`;
      h += `<div class="tt-meta">Contains ${ev._releaseChildren?.length || 0} in-story event(s)</div>`;
      (ev._releaseChildren || []).slice(0, 18).forEach(child => {
        const d = child.date ? ` — ${escapeHtml(child.date)}` : '';
        h += `<div class="tt-sub">• ${escapeHtml(child.title)}${d}</div>`;
      });
      if ((ev._releaseChildren || []).length > 18) h += `<div class="tt-sub">…and ${(ev._releaseChildren || []).length - 18} more</div>`;
      tt.innerHTML = h;
      tt.classList.remove('hidden');
      const vp = this.canvas.parentElement.getBoundingClientRect();
      let x = cx - vp.left + 16, y = cy - vp.top - 10;
      if (x + 360 > vp.width) x = cx - vp.left - 370;
      if (y + 220 > vp.height) y = vp.height - 230;
      tt.style.left = x + 'px'; tt.style.top = y + 'px';
      return;
    }
    h += `<span class="tt-evidence ${ev.evidence || 'shown'}">${evi.label}</span>`;
    h += `<div class="tt-meta">${escapeHtml(ep.universe.name)}</div>`;
    if (ev.speculativeUniverse) {
      const su = this.project.universes.find(u => u.id === ev.speculativeUniverse);
      h += `<div class="tt-meta">→ ${escapeHtml(su?.name || ev.speculativeUniverse)}</div>`;
    }
    const d = this._formatDate(ev);
    if (d) h += `<div class="tt-meta">📅 ${d}</div>`;
    // Release-positioning uncertainty note (Req 5.4): an event with no
    // in-universe date is placed at its releaseDate — communicate that the
    // position is approximate and derived from the release date.
    if (isPositionedByRelease(ev)) {
      h += `<div class="tt-meta">≈ Pozycja przybliżona — wg daty wydania (${escapeHtml(ev.releaseDate)})</div>`;
    }
    const loc = getLocationString(ev);
    if (loc) h += `<div class="tt-meta">📍 ${escapeHtml(loc)}</div>`;
    if (ev.media?.title) h += `<div class="tt-meta">🎬 ${escapeHtml(ev.media.title)} ${escapeHtml(ev.media.episode || '')}</div>`;
    if (ev.source) h += `<div class="tt-meta">📖 ${escapeHtml(ev.source)}</div>`;
    if (ev.characters?.length) h += `<div class="tt-meta">👤 ${escapeHtml(ev.characters.join(', '))}</div>`;
    if (ev.reasoning) h += `<div class="tt-reasoning">"${escapeHtml(ev.reasoning)}"</div>`;

    // Sub-events
    if (ev.subEvents?.length > 0) {
      const icons = { flashback: '⏪', callback: '🔗', postcredits: '🎬', prologue: '📖', epilogue: '📕', timetravel: '⏳' };
      ev.subEvents.forEach(s => {
        let extra = '';
        if (s.type === 'timetravel') {
          extra = s.timeTravelMode === 'new-universe' ? ' 🌀 New Universe' : ' 🔄 Same Universe';
        }
        h += `<div class="tt-sub">${icons[s.type] || '•'} ${escapeHtml(s.label || s.type)} ${s.date?.approximate ? '(' + escapeHtml(s.date.approximate) + ')' : ''}${extra}</div>`;
      });
    }

    tt.innerHTML = h;
    tt.classList.remove('hidden');
    const vp = this.canvas.parentElement.getBoundingClientRect();
    let x = cx - vp.left + 16, y = cy - vp.top - 10;
    if (x + 320 > vp.width) x = cx - vp.left - 330;
    if (y + 150 > vp.height) y = vp.height - 160;
    tt.style.left = x + 'px'; tt.style.top = y + 'px';
  }

  onEventClick = null;
  // Callback invoked after a drag&drop reorder so the app can persist the
  // project (Req 12.3). Assigned by app.js.
  onReorder = null;
}
