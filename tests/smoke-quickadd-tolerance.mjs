import { parseFormula } from '../js/formula.js';
const sample = `title: One
notes: First note
reasoning: First reason

title: Two
description: Second note
characters: A; B`;
const result = parseFormula(sample);
if (result.errors.length) throw new Error(result.errors.join(' | '));
if (result.events.length !== 2) throw new Error(`Expected 2 events, got ${result.events.length}`);
if (!result.events[0].reasoning.includes('First note') || !result.events[0].reasoning.includes('First reason')) throw new Error('notes/reasoning were not merged');
if (!result.events[1].reasoning.includes('Second note')) throw new Error('description was not accepted');
console.log('smoke-quickadd-tolerance OK');
