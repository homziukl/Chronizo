// sorting.js — Multi-directional sorting engine

import { getTimeValue, hasInUniverseDate } from './events.js?v=3.8';

// Registry of sort modes. Most entries are pairwise comparators consumed by
// Array.prototype.sort. The 'mix' entry is a whole-list sorter (it must build
// per-medium anchors before comparing, see sortByMix) — sortEvents dispatches
// to it directly instead of passing it to .sort().
export const SORT_MODES = {
  'in-universe': sortByInUniverse,
  'release': sortByRelease,
  'mix': sortByMix,
  'custom': sortByCustom
};

export function sortEvents(events, mode = 'in-universe') {
  // 'mix' needs the full event set up front to compute medium anchors once,
  // so it is a whole-list sorter rather than a pairwise comparator.
  if (mode === 'mix') return sortByMix(events);
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

// Anchor time for a medium ("majority" chronology). Collects events of the
// given medium (matched by media.title) that carry an in-universe date and
// returns the MEDIAN of their time values, so a few minority flashbacks do
// not drag the anchor the way an average would. When the medium has no dated
// events, falls back to the median of release-date-derived time values; when
// even that is unavailable, returns 0. Pure and deterministic — the result
// depends only on the input.
export function mediumAnchorTime(events, mediaTitle) {
  const ofMedium = events.filter(ev => ev.media?.title === mediaTitle);

  // Primary anchor: median of in-universe dated events' time values.
  const dated = ofMedium.filter(hasInUniverseDate).map(getTimeValue);
  if (dated.length > 0) return median(dated);

  // Fallback: median of release-date-derived time values (undated events
  // resolve to their releaseDate through getTimeValue).
  const released = ofMedium.filter(ev => !!ev.releaseDate).map(getTimeValue);
  if (released.length > 0) return median(released);

  // No time source at all.
  return 0;
}

// Median of numeric values: average of the two middle values for an even
// count, the middle value for an odd count, after ascending sort.
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// True when the event reads as a minority retrospective relative to its
// medium — a flashback/retrospection against the medium as a whole. Two
// independent signals make it true (logical OR):
//
//   1. Time criterion ("significantly earlier"): getTimeValue(ev) is strictly
//      before anchorTime, the median chronology of the medium (its "majority"
//      center, see mediumAnchorTime). We deliberately pick a simple, fully
//      deterministic strict-less-than rule (getTimeValue(ev) < anchorTime)
//      instead of a tunable margin: the function only receives the event and
//      the anchor, with no view of the medium's spread, so any event placed
//      before its medium's chronological center is treated as looking back at
//      the whole. Strict "<" means an event sitting exactly on the anchor is
//      majority, not retrospective.
//   2. Explicit marker: the event carries an authored sub-event of type
//      'flashback', regardless of its time value.
//
// Used by sortByMix and the renderer hierarchy to push such events below the
// medium's majority events. Pure and deterministic — the result depends only
// on the event and the anchor.
export function isMinorityRetrospective(ev, anchorTime) {
  // Signal 1 — earlier than the medium's median anchor (majority center).
  if (getTimeValue(ev) < anchorTime) return true;
  // Signal 2 — an explicit flashback segment authored on the event.
  const subEvents = Array.isArray(ev.subEvents) ? ev.subEvents : [];
  return subEvents.some(seg => seg?.type === 'flashback');
}

// Mixed sort (Tryb_Sortowania 'mix') — blends in-universe chronology with
// release order, anchored by each medium's majority chronology. The ordering
// is defined by a deterministic lexicographic key per event:
//
//   1. anchor   — primary placement on the timeline. For an event that belongs
//                 to a medium (media.title set) this is mediumAnchorTime of that
//                 medium (its majority/median chronology, see mediumAnchorTime).
//                 For an event with no medium this is the event's own
//                 getTimeValue, so it interleaves by its own chronology.
//   2. title    — groups events of the same medium together when two media
//                 happen to share an anchor value (empty title for no-medium
//                 events, which therefore sort ahead of equal-anchor media).
//   3. retro    — within a medium group, majority events (0) come before
//                 minority retrospectives (1). isMinorityRetrospective is only
//                 applied to events that belong to a medium; no-medium events
//                 are always 0 (the retrospective concept needs a medium anchor).
//   4. time     — within a (medium, retro) group, order by getTimeValue.
//   5. release  — releaseDate-derived tie-breaker (missing releaseDate sorts
//                 last via +Infinity); this is the explicit tie-breaker for
//                 no-medium events and a further tie-breaker for medium events.
//   6. id       — final tie-breaker; event ids are unique, so the total order
//                 is fully deterministic and independent of input order.
//
// The result is a new array that is a permutation of the input (no events
// added or dropped, input not mutated). Pure and deterministic.
//
// Performance: mediumAnchorTime is computed at most once per unique media.title
// (memoized in anchorByTitle), not once per comparison, keeping the cost at
// O(n log n) comparisons plus O(k * n) anchor computation for k unique media.
export function sortByMix(events) {
  const list = [...events];

  const anchorByTitle = new Map();
  const anchorFor = (title) => {
    if (!anchorByTitle.has(title)) {
      anchorByTitle.set(title, mediumAnchorTime(list, title));
    }
    return anchorByTitle.get(title);
  };

  // Precompute the sort key for each event once (O(n)).
  const keyed = list.map(ev => {
    const title = ev.media?.title || '';
    const hasMedium = title !== '';
    const time = getTimeValue(ev);
    const anchor = hasMedium ? anchorFor(title) : time;
    const retro = hasMedium && isMinorityRetrospective(ev, anchor) ? 1 : 0;
    const release = ev.releaseDate ? new Date(ev.releaseDate).getTime() : Infinity;
    return { ev, anchor, title, retro, time, release };
  });

  keyed.sort((a, b) =>
    cmpNum(a.anchor, b.anchor) ||
    cmpStr(a.title, b.title) ||
    cmpNum(a.retro, b.retro) ||
    cmpNum(a.time, b.time) ||
    cmpNum(a.release, b.release) ||
    cmpStr(a.ev.id, b.ev.id)
  );

  return keyed.map(k => k.ev);
}

// Numeric comparison that is safe for non-finite values (e.g. +Infinity used
// for a missing releaseDate): subtraction would yield NaN for Infinity-Infinity
// and break the comparator, so compare with < / > instead.
function cmpNum(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// String comparison by code point, stable and deterministic.
function cmpStr(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Build character threads (Linie_Postaci): for each character name, the list
// of event ids the character appears in, ordered by the active sort mode.
// Events are first ordered with sortEvents(events, mode) so the thread follows
// the timeline the user currently sees. A character appearing in exactly one
// event yields a length-1 list (the renderer draws no connecting line for it).
// Duplicate names within a single event's characters list are counted once for
// that event. Pure and deterministic — the result depends only on the inputs.
export function characterThreads(events, mode = 'in-universe') {
  const sorted = sortEvents(events, mode);
  const threads = new Map();
  for (const ev of sorted) {
    const chars = Array.isArray(ev.characters) ? ev.characters : [];
    const seen = new Set();
    for (const name of chars) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      if (!threads.has(name)) threads.set(name, []);
      threads.get(name).push(ev.id);
    }
  }
  return threads;
}

// Return the set of event ids matching the query against the event title, the
// media title, or any character name (case-insensitive substring). An empty or
// whitespace-only query yields an empty set, which the renderer interprets as
// "no highlight". Pure and deterministic.
export function matchQuery(events, query) {
  const result = new Set();
  const q = (query || '').trim().toLowerCase();
  if (!q) return result;
  for (const ev of events) {
    const title = (ev.title || '').toLowerCase();
    const media = (ev.media?.title || '').toLowerCase();
    const chars = Array.isArray(ev.characters) ? ev.characters : [];
    const inChars = chars.some(c => (c || '').toLowerCase().includes(q));
    if (title.includes(q) || media.includes(q) || inChars) {
      result.add(ev.id);
    }
  }
  return result;
}
