import assert from 'node:assert/strict';
import { parseFormula } from '../js/formula.js';

const block = `:::writing{variant="standard" id="48291"}
title: Wayne murders witnessed by Bruce and an unnamed future Catwoman figure
universe: Gotham
media: Gotham S01E01 Pilot
type: event
date: 2014-09-11
release: 2014-09-22
evidence: speculative
tags: Gotham; Gotham S01E01; Wayne murders; Bruce Wayne
characters: Bruce Wayne; Thomas Wayne; Martha Wayne; Alfred Pennyworth; Unnamed teenage girl
notes: Thomas and Martha Wayne are murdered by an unnamed gunman in an alley.
reasoning: Keep as speculative for now.

title: James Gordon and Harvey Bullock begin investigating the Wayne murders
universe: Gotham
media: Gotham S01E01 Pilot
type: event
date: 2014-09-11
release: 2014-09-22
evidence: inferred
tags: Gotham, Gotham S01E01, GCPD, Jim Gordon
characters: Jim Gordon; Harvey Bullock; Bruce Wayne; Alfred Pennyworth
notes: Rookie detective James Gordon and his partner Harvey Bullock investigate.
---
- tytuł: Sarah Essen appears at GCPD
- uniwersum: Gotham
- medium: Gotham S01E01 Pilot
- data: 2014-09-12
- emisja: 2014-09-22
- dowód: inferred
- tagi: Gotham; GCPD
- postacie: Sarah Essen; Edward Nygma, Barbara Kean
- notatki: Polish aliases and markdown bullets should be accepted.
:::`;

const result = parseFormula(block);
assert.equal(result.errors.length, 0, result.errors.join(' | '));
assert.equal(result.warnings.length, 0, result.warnings.join(' | '));
assert.equal(result.events.length, 3);
assert.deepEqual(result.events[0].characters, ['Bruce Wayne', 'Thomas Wayne', 'Martha Wayne', 'Alfred Pennyworth', 'Unnamed teenage girl']);
assert.equal(result.events[0].reasoning.includes('murdered'), true);
assert.equal(result.events[0].reasoning.includes('speculative'), true);
assert.deepEqual(result.events[2].characters, ['Sarah Essen', 'Edward Nygma', 'Barbara Kean']);
assert.equal(result.events[2].title, 'Sarah Essen appears at GCPD');
console.log('smoke-oet-gotham-block OK');
