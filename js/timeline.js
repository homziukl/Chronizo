// timeline.js — Canvas renderer for Chronizo
// Full feature set: branches, sub-wires, evidence opacity, date ranges,
// sub-events, minimap, connect mode, filtering

import { sortEvents } from './sorting.js';
import { getTimeValue, getTimeEndValue, hasDateRange, getLocationKey,
         getLocationString, EVIDENCE_LEVELS } from './events.js';

export class TimelineRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.project = null;
    this.filteredEvents = null; // null = show all
    this.sortMode = 'in-universe';
    this.connectMode = false;

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

    this._setupInteraction();
  }

  setProject(p) { this.project = p; this.render(); }
  setSortMode(m) { this.sortMode = m; this.render(); }
  setFilteredEvents(evts) { this.filteredEvents = evts; this.render(); }
  setConnectMode(on) { this.connectMode = on; this.render(); }

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
    const events = this.filteredEvents || this.project.events;
    const layout = this._computeLayout(events);
    this.eventPositions = [];

    this._drawUniverseBands(layout);
    this._drawMainAxis(layout);
    this._drawTimeMarkers(layout);
    this._drawBranches(layout);
    this._drawDateRanges(layout);
    this._drawConnections();
    // Label collision tracking — collect placed label rects
    this._labelRects = [];
    this.eventPositions.forEach(ep => this._drawEventDot(ep));
    this._drawSubEventMarkers(layout);

    ctx.restore();
    this._drawLegend(layout);
    this._drawMinimap(layout);
  }

  // ===== LAYOUT =====
  _computeLayout(events) {
    const sorted = sortEvents(events, this.sortMode);
    const universes = this.project.universes;
    const mainUni = universes.find(u => u.isMain) || universes[0];

    // Time slots
    const slotMap = new Map();
    sorted.forEach(ev => {
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

    return { slots, branchInfo, universes, mainUni, locationWires, totalWidth: currentX + 200, sorted, timeToX };
  }

  // ===== UNIVERSE BANDS =====
  _drawUniverseBands(layout) {
    const ctx = this.ctx;
    layout.universes.forEach(uni => {
      if (uni.isMain) return;
      const info = layout.branchInfo.get(uni.id);
      if (!info) return;
      const lw = layout.locationWires.get(uni.id);
      const bandH = Math.max(50, (lw ? lw.size : 0) * this.WIRE_SPREAD + 20);
      ctx.save();
      ctx.fillStyle = uni.color;
      ctx.globalAlpha = 0.04;
      ctx.fillRect(info.startX, info.y - bandH / 2, layout.totalWidth - info.startX, bandH);
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = uni.color;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 8]);
      ctx.strokeRect(info.startX, info.y - bandH / 2, layout.totalWidth - info.startX, bandH);
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
    layout.slots.forEach(slot => {
      ctx.strokeStyle = 'rgba(255,107,0,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(slot.x, y - 10); ctx.lineTo(slot.x, y + 10); ctx.stroke();
      if (slot.label) {
        ctx.fillStyle = '#8a8778'; ctx.font = '9px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
        ctx.fillText(slot.label, slot.x, y + 24);
      }
    });
    for (let i = 1; i < layout.slots.length; i++) {
      const yrs = (layout.slots[i].time - layout.slots[i - 1].time) / (365.25 * 24 * 3600000);
      if (yrs > 50) {
        ctx.fillStyle = '#4a4a5a'; ctx.font = '10px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
        ctx.fillText(`⟨ ${Math.round(yrs)}y ⟩`, (layout.slots[i - 1].x + layout.slots[i].x) / 2, this.MAIN_Y + 38);
      }
    }
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

    // Label on the axis
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.6;
    ctx.font = '8px "Share Tech Mono",monospace';
    ctx.textAlign = 'center';
    const typeIcons = { flashback: '⏪', callback: '🔗', postcredits: '🎬', prologue: '📖', epilogue: '📕' };
    ctx.fillText(`${typeIcons[sub.type] || ''} ${sub.label || sub.date.approximate}`, subX, axisY - 8);

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
    ctx.globalAlpha = 0.8;
    ctx.font = '9px "Share Tech Mono",monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = ttColor;
    const icon = isNewUniverse ? '🌀' : '⏳';
    ctx.fillText(`${icon} ${sub.label || 'Time Travel'}`, subX, axisY - 14);

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
        ctx.fillText(label, pos.x, pos.y + textH - 3);

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
      ctx.fillText(label, ep.x, ep.y - r - 8);
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
    ctx.strokeStyle = 'rgba(42,42,58,0.3)'; ctx.lineWidth = 0.5;
    const step = 50 * this.zoom;
    const ox = this.offsetX % step, oy = this.offsetY % step;
    for (let x = ox; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = oy; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }

  // ===== LEGEND =====
  _drawLegend(layout) {
    const ctx = this.ctx;
    let ly = 16;
    ctx.font = '10px "Orbitron",sans-serif';
    layout.universes.forEach(uni => {
      const p = uni.parentUniverse ? layout.universes.find(u => u.id === uni.parentUniverse) : null;
      ctx.fillStyle = uni.color; ctx.fillRect(10, ly - 6, 8, 8);
      ctx.fillStyle = '#e0ddd4'; ctx.textAlign = 'left';
      ctx.fillText(uni.name + (p ? ` ← ${p.name}` : ''), 24, ly + 1);
      ly += 18;
    });
  }

  _formatDate(ev) {
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
    let isDragging = false, lastX = 0, lastY = 0;
    this._selectedIds = new Set();

    this.canvas.addEventListener('mousedown', (e) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        this.offsetX += e.clientX - lastX; this.offsetY += e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY; this.render();
      } else this._handleHover(e);
    });
    window.addEventListener('mouseup', () => { isDragging = false; });

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
      const hit = this._hitTest(e);
      if (e.ctrlKey || e.metaKey) {
        // Multi-select with Ctrl+click
        if (hit) {
          if (this._selectedIds.has(hit.id)) this._selectedIds.delete(hit.id);
          else this._selectedIds.add(hit.id);
          this.render();
          this.onSelectionChange?.(this.getSelectedIds());
        }
      } else if (e.shiftKey && hit && this._selectedIds.size > 0) {
        // Shift+click: select range (all events between last selected and this one)
        this._selectedIds.add(hit.id);
        this.render();
        this.onSelectionChange?.(this.getSelectedIds());
      } else {
        // Normal click
        if (hit) {
          if (this._selectedIds.size > 0) {
            this._selectedIds.clear();
            this.render();
            this.onSelectionChange?.(this.getSelectedIds());
          }
          this.onEventClick?.(hit.event);
        } else {
          // Click on empty space — clear selection
          if (this._selectedIds.size > 0) {
            this._selectedIds.clear();
            this.render();
            this.onSelectionChange?.(this.getSelectedIds());
          }
        }
      }
    });
  }

  getSelectedIds() { return [...this._selectedIds]; }
  clearSelection() { this._selectedIds.clear(); this.render(); }

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
      const dx = mx - ep.x, dy = my - ep.y;
      if (dx * dx + dy * dy < (ep.radius + 5) ** 2) return ep;
    }
    return null;
  }

  _showTooltip(ep, cx, cy) {
    const tt = document.getElementById('event-tooltip');
    const ev = ep.event;
    const evi = EVIDENCE_LEVELS[ev.evidence] || EVIDENCE_LEVELS.shown;

    let h = `<div class="tt-title">${ev.title}</div>`;
    h += `<span class="tt-evidence ${ev.evidence || 'shown'}">${evi.label}</span>`;
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

    // Sub-events
    if (ev.subEvents?.length > 0) {
      const icons = { flashback: '⏪', callback: '🔗', postcredits: '🎬', prologue: '📖', epilogue: '📕', timetravel: '⏳' };
      ev.subEvents.forEach(s => {
        let extra = '';
        if (s.type === 'timetravel') {
          extra = s.timeTravelMode === 'new-universe' ? ' 🌀 New Universe' : ' 🔄 Same Universe';
        }
        h += `<div class="tt-sub">${icons[s.type] || '•'} ${s.label || s.type} ${s.date?.approximate ? '(' + s.date.approximate + ')' : ''}${extra}</div>`;
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
}
