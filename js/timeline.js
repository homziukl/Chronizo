// timeline.js — Canvas renderer for Chronizo
// Features:
// - Main axis = immutable time ruler with compressed gaps
// - Branches grow from parent (main or another branch)
// - Location sub-wires within same universe = cable bundle
// - Transparent universe-colored background bands
// - Backward connections (branch created in 1999, starts at 1956)

import { sortEvents } from './sorting.js';
import { getTimeValue, getLocationKey, getLocationString } from './events.js';

export class TimelineRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.project = null;
    this.sortMode = 'in-universe';

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
    this.LANE_BAND_HEIGHT = 50; // height of transparent background band

    this._setupInteraction();
  }

  setProject(p) { this.project = p; this.render(); }
  setSortMode(m) { this.sortMode = m; this.render(); }

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

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);
    this._drawGrid(w, h);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.zoom, this.zoom);

    this.MAIN_Y = h / (2 * this.zoom);
    const layout = this._computeLayout();
    this.eventPositions = [];

    // 1. Transparent background bands per universe
    this._drawUniverseBands(layout);
    // 2. Main time axis
    this._drawMainAxis(layout, w);
    // 3. Time markers
    this._drawTimeMarkers(layout);
    // 4. Branch wires + location sub-wires
    this._drawBranches(layout);
    // 5. Connections (crossovers, backward links)
    this._drawConnections();
    // 6. Event dots
    this.eventPositions.forEach(ep => this._drawEventDot(ep));

    ctx.restore();
    this._drawLegend(layout);
  }

  // ===== LAYOUT =====
  _computeLayout() {
    const sorted = sortEvents(this.project.events, this.sortMode);
    const universes = this.project.universes;
    const mainUni = universes.find(u => u.isMain) || universes[0];

    // Build time slots
    const slotMap = new Map();
    sorted.forEach(ev => {
      const t = getTimeValue(ev);
      if (!slotMap.has(t)) {
        slotMap.set(t, { time: t, label: this._formatDate(ev), events: [] });
      }
      slotMap.get(t).events.push(ev);
    });
    const slots = [...slotMap.values()].sort((a, b) => a.time - b.time);

    // Compute X positions with gap compression
    let currentX = this.PADDING_LEFT;
    slots.forEach((slot, i) => {
      if (i === 0) { slot.x = currentX; return; }
      const timeDelta = slot.time - slots[i - 1].time;
      let gap;
      if (timeDelta <= 0) {
        gap = this.MIN_GAP;
      } else {
        const years = timeDelta / (365.25 * 24 * 3600000);
        gap = Math.min(this.MAX_GAP, Math.max(this.MIN_GAP, this.MIN_GAP + Math.log10(Math.max(1, years)) * 80));
      }
      currentX += gap;
      slot.x = currentX;
    });

    // Build branch tree — each universe knows its Y offset and where it starts
    // Recursive: branch of branch gets offset relative to parent
    const branchInfo = new Map();
    let laneCounter = 0;

    const computeBranch = (uni) => {
      if (branchInfo.has(uni.id)) return branchInfo.get(uni.id);

      if (uni.isMain) {
        const info = { startX: this.PADDING_LEFT - 40, y: this.MAIN_Y, isMain: true, depth: 0 };
        branchInfo.set(uni.id, info);
        return info;
      }

      // Find parent
      const parentId = uni.parentUniverse || mainUni.id;
      const parentUni = universes.find(u => u.id === parentId) || mainUni;
      const parentInfo = computeBranch(parentUni);

      // Find first event in this universe to determine branch X
      const firstSlot = slots.find(s => s.events.some(e => e.universe === uni.id));
      const startX = firstSlot ? firstSlot.x - this.BRANCH_CURVE : this.PADDING_LEFT;

      laneCounter++;
      const direction = laneCounter % 2 === 1 ? -1 : 1;
      const offset = Math.ceil(laneCounter / 2) * this.WIRE_SPREAD * 4 * direction;

      const info = {
        startX,
        y: parentInfo.y + offset,
        parentY: parentInfo.y,
        parentX: startX,
        isMain: false,
        depth: parentInfo.depth + 1,
        parentId
      };
      branchInfo.set(uni.id, info);
      return info;
    };

    universes.forEach(uni => computeBranch(uni));

    // Build location sub-wire offsets within each universe
    const locationWires = new Map(); // universeId -> Map<locationKey, wireOffset>
    universes.forEach(uni => {
      const uniEvents = sorted.filter(e => e.universe === uni.id);
      const locKeys = [...new Set(uniEvents.map(e => getLocationKey(e)))].filter(Boolean);
      const wireMap = new Map();
      locKeys.forEach((key, i) => {
        const offset = (i - (locKeys.length - 1) / 2) * this.WIRE_SPREAD;
        wireMap.set(key, offset);
      });
      locationWires.set(uni.id, wireMap);
    });

    return { slots, branchInfo, universes, mainUni, locationWires, totalWidth: currentX + 200 };
  }

  // ===== TRANSPARENT BACKGROUND BANDS =====
  _drawUniverseBands(layout) {
    const ctx = this.ctx;
    const { branchInfo, universes } = layout;

    universes.forEach(uni => {
      if (uni.isMain) return; // main axis doesn't need a band
      const info = branchInfo.get(uni.id);
      if (!info) return;

      const locWires = layout.locationWires.get(uni.id);
      const wireCount = locWires ? locWires.size : 0;
      const bandH = Math.max(this.LANE_BAND_HEIGHT, wireCount * this.WIRE_SPREAD + 20);

      ctx.save();
      ctx.fillStyle = uni.color;
      ctx.globalAlpha = 0.04; // very subtle
      ctx.fillRect(info.startX, info.y - bandH / 2, layout.totalWidth - info.startX, bandH);

      // Slightly brighter border
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = uni.color;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 8]);
      ctx.strokeRect(info.startX, info.y - bandH / 2, layout.totalWidth - info.startX, bandH);
      ctx.restore();
    });
  }

  // ===== MAIN AXIS =====
  _drawMainAxis(layout, viewW) {
    const ctx = this.ctx;
    const y = this.MAIN_Y;
    const color = layout.mainUni.color;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(layout.totalWidth, y);
    ctx.stroke();

    // Bright core
    ctx.shadowBlur = 4;
    ctx.strokeStyle = '#ffaa55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(layout.totalWidth, y);
    ctx.stroke();
    ctx.restore();
  }

  // ===== TIME MARKERS =====
  _drawTimeMarkers(layout) {
    const ctx = this.ctx;
    const y = this.MAIN_Y;

    layout.slots.forEach(slot => {
      ctx.strokeStyle = 'rgba(255, 107, 0, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(slot.x, y - 10);
      ctx.lineTo(slot.x, y + 10);
      ctx.stroke();

      if (slot.label) {
        ctx.fillStyle = '#8a8778';
        ctx.font = '9px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(slot.label, slot.x, y + 24);
      }
    });

    // Compression markers
    for (let i = 1; i < layout.slots.length; i++) {
      const years = (layout.slots[i].time - layout.slots[i - 1].time) / (365.25 * 24 * 3600000);
      if (years > 50) {
        const midX = (layout.slots[i - 1].x + layout.slots[i].x) / 2;
        ctx.fillStyle = '#4a4a5a';
        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`⟨ ${Math.round(years)}y ⟩`, midX, this.MAIN_Y + 38);
      }
    }
  }

  // ===== BRANCHES + LOCATION SUB-WIRES =====
  _drawBranches(layout) {
    const { slots, branchInfo, universes, locationWires } = layout;
    const ctx = this.ctx;

    universes.forEach(uni => {
      const info = branchInfo.get(uni.id);
      if (!info) return;

      const locWires = locationWires.get(uni.id) || new Map();

      // Collect events with positions
      const uniEvents = [];
      slots.forEach(slot => {
        const evs = slot.events.filter(e => e.universe === uni.id);
        evs.forEach(ev => {
          const locKey = getLocationKey(ev);
          const locOffset = locWires.get(locKey) || 0;
          const y = info.y + locOffset;
          uniEvents.push({ ev, x: slot.x, y, locKey });
        });
      });

      if (uniEvents.length === 0 && !info.isMain) return;

      if (!info.isMain) {
        // Draw branch curve from parent to this lane
        this._drawBranchCurve(info.startX, info.parentY, info.y, uni.color);

        // Draw lane wire(s)
        const lastX = uniEvents.length > 0 ? uniEvents[uniEvents.length - 1].x + 60 : info.startX + 200;
        const wireStartX = info.startX + this.BRANCH_CURVE;

        // If multiple locations, draw separate sub-wires
        if (locWires.size > 1) {
          locWires.forEach((offset, locKey) => {
            const wireY = info.y + offset;
            this._drawWire(wireStartX, wireY, lastX, uni.color, 0.5, uni.id + locKey);
          });
        } else {
          this._drawWire(wireStartX, info.y, lastX, uni.color, 0.6, uni.id);
        }

        // Location sub-wire labels
        if (locWires.size > 1) {
          locWires.forEach((offset, locKey) => {
            if (!locKey) return;
            ctx.save();
            ctx.fillStyle = uni.color;
            ctx.globalAlpha = 0.5;
            ctx.font = '8px "Share Tech Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillText(locKey, wireStartX + 4, info.y + offset - 4);
            ctx.restore();
          });
        }
      }

      // Register event positions
      uniEvents.forEach(ue => {
        this.eventPositions.push({
          id: ue.ev.id,
          x: ue.x,
          y: ue.y,
          radius: this.EVENT_RADIUS,
          color: uni.color,
          event: ue.ev,
          universe: uni
        });
      });
    });
  }

  _drawWire(startX, y, endX, color, alpha, seed) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = alpha;

    // Slight organic wave using seed for variation
    const hash = seed.length * 7;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    for (let x = startX; x <= endX; x += 15) {
      const wave = Math.sin(x * 0.01 + hash * 0.3) * 2;
      ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawBranchCurve(startX, parentY, targetY, color) {
    const ctx = this.ctx;
    const endX = startX + this.BRANCH_CURVE;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;

    ctx.beginPath();
    ctx.moveTo(startX, parentY);
    ctx.bezierCurveTo(
      startX + this.BRANCH_CURVE * 0.4, parentY,
      startX + this.BRANCH_CURVE * 0.6, targetY,
      endX, targetY
    );
    ctx.stroke();

    // Branch point dot
    ctx.beginPath();
    ctx.arc(startX, parentY, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.restore();
  }

  // ===== EVENT DOTS =====
  _drawEventDot(ep) {
    const ctx = this.ctx;
    const isHovered = this.hoveredEvent === ep.id;
    const r = isHovered ? ep.radius * 1.8 : ep.radius;

    ctx.save();
    ctx.shadowColor = ep.color;
    ctx.shadowBlur = isHovered ? 24 : 10;

    // Glow ring
    ctx.beginPath();
    ctx.arc(ep.x, ep.y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = ep.color;
    ctx.globalAlpha = 0.2;
    ctx.fill();

    // Main dot
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(ep.x, ep.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isHovered ? '#fff' : ep.color;
    ctx.fill();

    // Dark core
    ctx.beginPath();
    ctx.arc(ep.x, ep.y, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0f';
    ctx.fill();
    ctx.restore();

    // Title
    ctx.fillStyle = isHovered ? '#fff' : '#e0ddd4';
    ctx.font = `${isHovered ? 11 : 10}px "Share Tech Mono", monospace`;
    ctx.textAlign = 'center';
    const label = ep.event.title.length > 24 ? ep.event.title.slice(0, 22) + '…' : ep.event.title;
    const labelY = ep.y < this.MAIN_Y ? ep.y - r - 8 : ep.y + r + 14;
    ctx.fillText(label, ep.x, labelY);

    // Location hint
    const loc = getLocationString(ep.event);
    if (loc && isHovered) {
      ctx.fillStyle = '#8a8778';
      ctx.font = '8px "Share Tech Mono", monospace';
      ctx.fillText('📍 ' + loc, ep.x, labelY + (ep.y < this.MAIN_Y ? -12 : 12));
    }
  }

  // ===== CONNECTIONS (crossovers, backward links) =====
  _drawConnections() {
    if (!this.project.connections) return;
    const ctx = this.ctx;

    this.project.connections.forEach(conn => {
      const src = this.eventPositions.find(ep => ep.id === conn.sourceEventId);
      const tgt = this.eventPositions.find(ep => ep.id === conn.targetEventId);
      if (!src || !tgt) return;

      const colors = {
        branch: '#d4a843',
        crossover: '#a855f7',
        merge: '#27ae60',
        reference: '#8a8778',
        backward: '#e74c3c'  // backward time connection
      };

      ctx.save();
      ctx.strokeStyle = colors[conn.type] || '#d4a843';
      ctx.lineWidth = conn.type === 'crossover' ? 2 : 1.5;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 6;

      // Dashed for reference, dotted for backward
      if (conn.type === 'reference') ctx.setLineDash([4, 4]);
      else if (conn.type === 'backward') ctx.setLineDash([2, 3]);
      else ctx.setLineDash([]);

      // Determine if this is a backward connection (target is earlier in time)
      const isBackward = tgt.x < src.x;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);

      if (isBackward) {
        // Backward arc — goes up/down and back in time
        const midX = (src.x + tgt.x) / 2;
        const arcY = Math.min(src.y, tgt.y) - 60 - Math.abs(src.x - tgt.x) * 0.1;
        ctx.bezierCurveTo(src.x, arcY, tgt.x, arcY, tgt.x, tgt.y);
      } else {
        // Forward curve
        const cpX = (src.x + tgt.x) / 2;
        const cpY = Math.min(src.y, tgt.y) - 40;
        ctx.quadraticCurveTo(cpX, cpY, tgt.x, tgt.y);
      }
      ctx.stroke();

      // Arrow at target
      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(tgt.x, tgt.y);
      ctx.lineTo(tgt.x - 6 * Math.cos(angle - 0.4), tgt.y - 6 * Math.sin(angle - 0.4));
      ctx.lineTo(tgt.x - 6 * Math.cos(angle + 0.4), tgt.y - 6 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();

      // Label
      if (conn.label || conn.character) {
        const midX = (src.x + tgt.x) / 2;
        const midY = isBackward
          ? Math.min(src.y, tgt.y) - 60 - Math.abs(src.x - tgt.x) * 0.05
          : Math.min(src.y, tgt.y) - 44;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = '9px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(conn.character || conn.label, midX, midY);
      }
      ctx.restore();
    });
  }

  // ===== GRID =====
  _drawGrid(w, h) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(42, 42, 58, 0.3)';
    ctx.lineWidth = 0.5;
    const step = 50 * this.zoom;
    const ox = this.offsetX % step;
    const oy = this.offsetY % step;
    for (let x = ox; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = oy; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  // ===== LEGEND =====
  _drawLegend(layout) {
    const ctx = this.ctx;
    let ly = 16;
    ctx.font = '10px "Orbitron", sans-serif';
    layout.universes.forEach(uni => {
      const parent = uni.parentUniverse
        ? layout.universes.find(u => u.id === uni.parentUniverse)
        : null;
      ctx.fillStyle = uni.color;
      ctx.fillRect(10, ly - 6, 8, 8);
      ctx.fillStyle = '#e0ddd4';
      ctx.textAlign = 'left';
      const suffix = parent ? ` ← ${parent.name}` : '';
      ctx.fillText(uni.name + suffix, 24, ly + 1);
      ly += 18;
    });
  }

  _formatDate(ev) {
    if (ev.date.exact) return ev.date.exact;
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
    let isDragging = false;
    let lastX = 0, lastY = 0;

    this.canvas.addEventListener('mousedown', (e) => {
      isDragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        this.offsetX += e.clientX - lastX;
        this.offsetY += e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        this.render();
      } else {
        this._handleHover(e);
      }
    });
    window.addEventListener('mouseup', () => { isDragging = false; });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.offsetX = mx - (mx - this.offsetX) * factor;
      this.offsetY = my - (my - this.offsetY) * factor;
      this.zoom = Math.max(0.1, Math.min(5, this.zoom * factor));
      this.render();
    }, { passive: false });

    this.canvas.addEventListener('click', (e) => {
      const hit = this._hitTest(e);
      if (hit) this.onEventClick?.(hit.event);
    });
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
    const rect = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - this.offsetX) / this.zoom;
    const my = (e.clientY - rect.top - this.offsetY) / this.zoom;
    for (const ep of this.eventPositions) {
      const dx = mx - ep.x, dy = my - ep.y;
      if (dx * dx + dy * dy < (ep.radius + 5) ** 2) return ep;
    }
    return null;
  }

  _showTooltip(ep, cx, cy) {
    const tt = document.getElementById('event-tooltip');
    const ev = ep.event;
    let h = `<div class="tt-title">${ev.title}</div>`;
    h += `<div class="tt-meta">${ep.universe.name}</div>`;
    if (ev.speculativeUniverse) {
      const su = this.project.universes.find(u => u.id === ev.speculativeUniverse);
      h += `<div class="tt-meta">→ ${su?.name || ev.speculativeUniverse}</div>`;
    }
    const d = this._formatDate(ev);
    if (d) h += `<div class="tt-meta">📅 ${d}</div>`;
    const loc = getLocationString(ev);
    if (loc) h += `<div class="tt-meta">📍 ${loc}</div>`;
    if (ev.media?.title) h += `<div class="tt-meta">🎬 ${ev.media.title} ${ev.media.episode || ''}</div>`;
    if (ev.source) h += `<div class="tt-meta">📖 ${ev.source}</div>`;
    if (ev.reasoning) h += `<div class="tt-reasoning">"${ev.reasoning}"</div>`;

    tt.innerHTML = h;
    tt.classList.remove('hidden');
    const vp = this.canvas.parentElement.getBoundingClientRect();
    let x = cx - vp.left + 16, y = cy - vp.top - 10;
    if (x + 320 > vp.width) x = cx - vp.left - 330;
    if (y + 150 > vp.height) y = vp.height - 160;
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
  }

  onEventClick = null;
}
