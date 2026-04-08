// sorting.js — Multi-directional sorting engine

import { getTimeValue } from './events.js';

export const SORT_MODES = {
  'in-universe': sortByInUniverse,
  'release': sortByRelease,
  'custom': sortByCustom
};

export function sortEvents(events, mode = 'in-universe') {
  const sortFn = SORT_MODES[mode] || sortByInUniverse;
  return [...events].sort(sortFn);
}

function sortByInUniverse(a, b) {
  const ta = getTimeValue(a);
  const tb = getTimeValue(b);
  if (ta !== tb) return ta - tb;
  // Fallback: custom order
  return (a.sortOrder?.custom || 0) - (b.sortOrder?.custom || 0);
}

function sortByRelease(a, b) {
  const ra = a.releaseDate ? new Date(a.releaseDate).getTime() : Infinity;
  const rb = b.releaseDate ? new Date(b.releaseDate).getTime() : Infinity;
  if (ra !== rb) return ra - rb;
  return sortByInUniverse(a, b);
}

function sortByCustom(a, b) {
  const ca = a.sortOrder?.custom || 0;
  const cb = b.sortOrder?.custom || 0;
  if (ca !== cb) return ca - cb;
  return sortByInUniverse(a, b);
}
