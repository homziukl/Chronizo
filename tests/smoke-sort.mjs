import { sortEvents, sortByMix, SORT_MODES } from '../js/sorting.js';

function ev(id, title, year) {
  return {
    id,
    title: id,
    media: { type: '', title, episode: '' },
    date: { exact: year == null ? null : String(year), approximate: '', season: '', rangeFrom: '', rangeTo: '' },
    releaseDate: '',
    subEvents: [],
    characters: [],
    sortOrder: { custom: 0 }
  };
}

const input = [ev('b', 'Show', 200), ev('a', 'Show', 100), ev('c', '', 50)];
if (SORT_MODES.mix !== sortByMix) throw new Error('mix not registered');
if (sortEvents(input, 'mix').length !== input.length) throw new Error('mix lost events');
if (sortEvents(input, 'custom').length !== input.length) throw new Error('custom lost events');
console.log('Chronizo smoke-sort OK');
