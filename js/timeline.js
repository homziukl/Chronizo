// timeline.js — Canvas renderer for TVA-style branching timelines

import { sortEvents } from './sorting.js';
import { getTimeValue } from './events.js';

export class TimelineRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.project = null;
    this.sortMode = 'in-universe';

    // Viewport / camera
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;

    // Interaction
    this.hoveredEvent = null;
    this.eventPositions = []; // { id, x, y, radius } for hit detection

    // Layout constants
    this.LANE_HEIGHT = 80;
    this.EVENT_RADIUS = 6;
    this.PADDING_LEFT = 120;
    this.PADDING_TOP = 60;
    this.PX_PER_UNIT = 200; // horizontal spacing between events

    this._setupInteraction();
  }

  setProject(project) {
    this.project = project;
    this.render();
  }

  setSortMode(mode) {
    this.sortMode = mode;
    this.render();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * devicePixelRatio;
    this.canvas.height = rect.height * devicePixelRatio;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.render();
  }

  render() {
    if (!this.project) return;
    const ctx = this.ctx;
    const w = this.canvas.width / devicePixelRatio;
    const h = this.canvas.height / devicePixelRatio;

    // Clear
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    // Draw subtle grid
    this._drawGrid(w, h);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.zoom, this.zoom);

    const universes = this.project.universes;
    const sorted = sortEvents(this.project.events, this.sortMode);
    this.eventPositions = [];

    // Draw universe lanes (horizontal lines)
    universes.forEach((uni, laneIdx) => {
      this._drawLane(uni, laneIdx, sorted, w);
    });

    // Draw connections (branches, crossovers)
    this._drawConnections();

    // Draw events on top
    this.eventPositions.forEach(ep => {
      this._drawEventDot(ep);
    });

    ctx.restore();

    // Draw lane labels (fixed position)
    this._drawLaneLabels(universes);
  }

  _drawGrid(w, h) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(42, 42, 58, 0.4)';
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

  _drawLane(universe, laneIdx, sortedEvents, viewWidth) {
    const ctx = this.ctx;
    const y = this.PADDING_TOP + laneIdx * this.LANE_HEIGHT;
    const laneEvents = sortedEvents.filter(e => e.universe === universe.id);

    // Main lane line — glowing effect
    ctx.save();
    ctx.shadowColor = universe.color;
    ctx.shadowBlur = universe.isMain ? 12 : 6;
    ctx.strokeStyle = universe.color;
    ctx.lineWidth = universe.isMain ? 2.5 : 1.5;
    ctx.globalAlpha = universe.isMain ? 1.0 : 0.7;

    // Draw wavy line for non-main universes
    ctx.beginPath();
    const startX = 0;
    const endX = Math.max(viewWidth / this.zoom + 200, (laneEvents.length + 2) * this.PX_PER_UNIT);

    if (universe.isMain) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    } else {
      // Slight organic wave
      ctx.moveTo(startX, y);
      for (let x = startX; x < endX; x += 20) {
        const wave = Math.sin(x * 0.008 + laneIdx * 2) * 4;
        ctx.lineTo(x, y + wave);
      }
    }
    ctx.stroke();
    ctx.restore();

    // Place events along the lane
    laneEvents.forEach((ev, i) => {
      const x = this.PADDING_LEFT + i * this.PX_PER_UNIT;
      const waveY = universe.isMain ? y : y + Math.sin(x * 0.008 + laneIdx * 2) * 4;

      this.eventPositions.push({
        id: ev.id,
        x,
        y: waveY,
        radius: this.EVENT_RADIUS,
        color: universe.color,
        event: ev,
        universe
      });
    });
  }

  _drawEventDot(ep) {
    const ctx = this.ctx;
    const isHovered = this.hoveredEvent === ep.id;
    const r = isHovered ? ep.radius * 1.6 : ep.radius;

    // Glow
    ctx.save();
    ctx.shadowColor = ep.color;
    ctx.shadowBlur = isHovered ? 20 : 8;

    // Outer ring
    ctx.beginPath();
    ctx.arc(ep.x, ep.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isHovered ? '#fff' : ep.color;
    ctx.fill();

    // Inner dot
    ctx.beginPath();
    ctx.arc(ep.x, ep.y, r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0f';
    ctx.fill();

    ctx.restore();

    // Label below dot
    ctx.fillStyle = '#e0ddd4';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    const label = ep.event.title.length > 20 ? ep.event.title.slice(0, 18) + '…' : ep.event.title;
    ctx.fillText(label, ep.x, ep.y + r + 14);

    // Date above dot
    const dateStr = this._formatDate(ep.event);
    if (dateStr) {
      ctx.fillStyle = '#8a8778';
      ctx.font = '9px "Share Tech Mono", monospace';
      ctx.fillText(dateStr, ep.x, ep.y - r - 6);
    }
  }

  _drawConnections() {
    if (!this.project.connections) return;
    const ctx = this.ctx;

    this.project.connections.forEach(conn => {
      const src = this.eventPositions.find(ep => ep.id === conn.sourceEventId);
      const tgt = this.eventPositions.find(ep => ep.id === conn.targetEventId);
      if (!src || !tgt) return;

      ctx.save();
      ctx.setLineDash(conn.type === 'reference' ? [4, 4] : []);

      const colors = {
        branch: '#d4a843',
        crossover: '#a855f7',
        merge: '#27ae60',
        reference: '#8a8778'
      };
      ctx.strokeStyle = colors[conn.type] || '#d4a843';
      ctx.lineWidth = conn.type === 'crossover' ? 2 : 1.5;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 6;

      // Curved connection line
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      const cpX = (src.x + tgt.x) / 2;
      const cpY = Math.min(src.y, tgt.y) - 30;
      ctx.quadraticCurveTo(cpX, cpY, tgt.x, tgt.y);
      ctx.stroke();

      // Arrow at target
      this._drawArrow(tgt.x, tgt.y, cpX, cpY, ctx.strokeStyle);

      // Label on connection
      if (conn.label || conn.character) {
        const midX = cpX;
        const midY = cpY - 4;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = '9px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(conn.character || conn.label, midX, midY);
      }

      ctx.restore();
    });
  }

  _drawArrow(toX, toY, fromX, fromY, color) {
    const ctx = this.ctx;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const size = 6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - size * Math.cos(angle - 0.4), toY - size * Math.sin(angle - 0.4));
    ctx.lineTo(toX - size * Math.cos(angle + 0.4), toY - size * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  }

  _drawLaneLabels(universes) {
    const ctx = this.ctx;
    universes.forEach((uni, i) => {
      const y = this.PADDING_TOP + i * this.LANE_HEIGHT + this.offsetY * 1;
      ctx.fillStyle = uni.color;
      ctx.font = `11px "Orbitron", sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(uni.name, 10, y + 4);
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

  // ===== Interaction: pan, zoom, hover, click =====

  _setupInteraction() {
    let isDragging = false;
    let lastX = 0, lastY = 0;

    this.canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        this.offsetX += e.clientX - lastX;
        this.offsetY += e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
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

      // Zoom toward cursor
      this.offsetX = mx - (mx - this.offsetX) * factor;
      this.offsetY = my - (my - this.offsetY) * factor;
      this.zoom *= factor;
      this.zoom = Math.max(0.1, Math.min(5, this.zoom));
      this.render();
    }, { passive: false });

    this.canvas.addEventListener('click', (e) => {
      const hit = this._hitTest(e);
      if (hit) {
        this.onEventClick?.(hit.event);
      }
    });

    this.canvas.addEventListener('dblclick', (e) => {
      const hit = this._hitTest(e);
      if (hit) {
        this.onEventDblClick?.(hit.event);
      }
    });
  }

  _handleHover(e) {
    const hit = this._hitTest(e);
    const newHovered = hit ? hit.id : null;

    if (newHovered !== this.hoveredEvent) {
      this.hoveredEvent = newHovered;
      this.render();

      // Show/hide tooltip
      const tooltip = document.getElementById('event-tooltip');
      if (hit) {
        this._showTooltip(hit, e.clientX, e.clientY);
      } else {
        tooltip.classList.add('hidden');
      }
    }
  }

  _hitTest(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - this.offsetX) / this.zoom;
    const my = (e.clientY - rect.top - this.offsetY) / this.zoom;

    for (const ep of this.eventPositions) {
      const dx = mx - ep.x;
      const dy = my - ep.y;
      if (dx * dx + dy * dy < (ep.radius + 4) ** 2) {
        return ep;
      }
    }
    return null;
  }

  _showTooltip(ep, clientX, clientY) {
    const tooltip = document.getElementById('event-tooltip');
    const ev = ep.event;

    let html = `<div class="tt-title">${ev.title}</div>`;
    html += `<div class="tt-meta">${ep.universe.name}`;
    if (ev.speculativeUniverse) {
      const specUni = this.project.universes.find(u => u.id === ev.speculativeUniverse);
      html += ` → <em>${specUni?.name || ev.speculativeUniverse}</em>`;
    }
    html += `</div>`;

    const dateStr = this._formatDate(ev);
    if (dateStr) html += `<div class="tt-meta">📅 ${dateStr}</div>`;
    if (ev.media?.title) html += `<div class="tt-meta">🎬 ${ev.media.title} ${ev.media.episode || ''}</div>`;
    if (ev.source) html += `<div class="tt-meta">📖 ${ev.source}</div>`;
    if (ev.reasoning) html += `<div class="tt-reasoning">"${ev.reasoning}"</div>`;

    tooltip.innerHTML = html;
    tooltip.classList.remove('hidden');

    // Position near cursor
    const viewport = this.canvas.parentElement.getBoundingClientRect();
    let x = clientX - viewport.left + 16;
    let y = clientY - viewport.top - 10;
    if (x + 320 > viewport.width) x = clientX - viewport.left - 330;
    if (y + 150 > viewport.height) y = viewport.height - 160;

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  // Public callbacks (set by app.js)
  onEventClick = null;
  onEventDblClick = null;
}
