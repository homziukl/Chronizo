// Temporary smoke test for sortByMix (task 3.3). Deleted after verification.
import {
  sortEvents, sortByMix, SORT_MODES,
  mediumAnchorTime, isMinorityRetrospective
} from './js/sorting.js';
import { getTimeValue } from './js/events.js';

function ev(id, title, year, { release = '', flashback = false } = {}) {
  return {
    id,
    title: id,
    media: { type: '', title, episode: '' },
    date: { exact: year == null ? null : String(year), approximate: '', season: '', rangeFrom: '', rangeTo: '' },
    releaseDate: release,
    subEvents: flashback ? [{ type: 'flashback' }] : [],
    characters: []
  };
}

let fails = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}`); if (!cond) fails++; };

// --- Registration ---
check('mix registered in SORT_MODES', SORT_MODES.mix === sortByMix);

const input = [
  ev('A_mid',   'ShowA', 200),
  ev('A_early', 'ShowA', 100),
  ev('A_late',  'ShowA', 300),
  ev('A_flashTime', 'ShowA', 10),                        // far below anchor
  ev('A_flashFlag', 'ShowA', 250, { flashback: true }),  // marker retrospective
  ev('B_only',  'ShowB', 1000),
  ev('NoMed_50',  '', 50),
  ev('NoMed_5000', '', 5000)
];

const out = sortByMix(input);
const ids = out.map(e => e.id);

// --- Permutation of input ---
const sameSet = input.length === out.length &&
  [...input.map(e => e.id)].sort().join(',') === [...ids].sort().join(',');
check('result is a permutation of input (same multiset of ids)', sameSet);

// --- Input not mutated ---
check('input array not mutated (order preserved)', input[0].id === 'A_mid' && input.length === 8);

// --- Determinism ---
const out2 = sortByMix([...input]).map(e => e.id).join(',');
const out3 = sortEvents(input, 'mix').map(e => e.id).join(',');
check('deterministic across repeated sortByMix calls', ids.join(',') === out2);
check('sortEvents(_, "mix") dispatches to sortByMix', ids.join(',') === out3);

// --- Generic partition property (matches spec definition of retrospective):
//     within each medium, every majority event precedes every retrospective
//     event, and each block is ordered by getTimeValue (non-decreasing). ---
function checkMedium(title) {
  const anchor = mediumAnchorTime(input, title);
  const seq = out.filter(e => e.media.title === title);
  let seenRetro = false;
  let okPartition = true;
  let lastMajT = -Infinity, lastRetT = -Infinity, okOrder = true;
  for (const e of seq) {
    const retro = isMinorityRetrospective(e, anchor);
    if (retro) {
      seenRetro = true;
      if (getTimeValue(e) < lastRetT) okOrder = false;
      lastRetT = getTimeValue(e);
    } else {
      if (seenRetro) okPartition = false;        // a majority event after a retrospective
      if (getTimeValue(e) < lastMajT) okOrder = false;
      lastMajT = getTimeValue(e);
    }
  }
  check(`[${title}] majority events all precede retrospectives`, okPartition);
  check(`[${title}] each block ordered by getTimeValue`, okOrder);
}
checkMedium('ShowA');

// --- Intuition check: the explicitly flagged flashback lands after the
//     clear majority events (>= anchor, unflagged) of ShowA. ---
const pos = id => ids.indexOf(id);
const anchorA = mediumAnchorTime(input, 'ShowA');
const majIds = ['A_mid', 'A_early', 'A_late', 'A_flashTime', 'A_flashFlag']
  .filter(id => !isMinorityRetrospective(input.find(e => e.id === id), anchorA));
const majMax = Math.max(...majIds.map(pos));
check('flagged flashback (A_flashFlag) after all ShowA majority events', pos('A_flashFlag') > majMax);

console.log('\nShowA anchor (median):', anchorA / (365.25 * 24 * 3600000), 'years');
console.log('Final order:', ids.join(' > '));
console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
