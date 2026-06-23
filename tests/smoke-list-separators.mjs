import assert from 'node:assert/strict';
import { parseFormula } from '../js/formula.js';
import { parseQuickUpdate } from '../js/quick_update.js';
import { normalizeLoadedProject } from '../js/storage.js';

const add = parseFormula(`title: Test event
characters: Bruce Wayne; Alfred Pennyworth, Jim Gordon
tags: Gotham; Pilot, OET
`);
assert.equal(add.errors.length, 0);
assert.deepEqual(add.events[0].characters, ['Bruce Wayne', 'Alfred Pennyworth', 'Jim Gordon']);
assert.deepEqual(add.events[0].tags, ['Gotham', 'Pilot', 'OET']);

const update = parseQuickUpdate(`mode: update
match: tag=Gotham
add_characters: Harvey Bullock; Sarah Essen, Edward Nygma
add_tags: GCPD; investigation
`);
assert.equal(update.errors.length, 0);
assert.deepEqual(update.operations[0].addCharacters, ['Harvey Bullock', 'Sarah Essen', 'Edward Nygma']);
assert.deepEqual(update.operations[0].addTags, ['GCPD', 'investigation']);

const project = normalizeLoadedProject({
  meta: { name: 'Test' },
  universes: [{ id: 'main', name: 'Main Timeline', isMain: true }],
  events: [{
    title: 'Bad separator event',
    universe: 'main',
    characters: ['Bruce Wayne; Alfred Pennyworth', 'Jim Gordon'],
    tags: ['Gotham; Pilot']
  }]
});
assert.deepEqual(project.events[0].characters, ['Bruce Wayne', 'Alfred Pennyworth', 'Jim Gordon']);
assert.deepEqual(project.events[0].tags, ['Gotham', 'Pilot']);

console.log('smoke-list-separators OK');
