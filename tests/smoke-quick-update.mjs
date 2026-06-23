import assert from 'node:assert/strict';
import { looksLikeQuickUpdate, parseQuickUpdate } from '../js/quick_update.js';

const text = [
  'mode: update',
  'match: tag=TVA-arc',
  'match: media=Loki S01E01',
  'date: 2012-05',
  'evidence: mentioned',
  'add_tags: date-confirmed',
  'remove_tags: date-inferred',
  'append_reasoning: Later episode clarified the chronology.'
].join('\n');

assert.equal(looksLikeQuickUpdate(text), true);
const parsed = parseQuickUpdate(text);
assert.equal(parsed.errors.length, 0);
assert.equal(parsed.operations.length, 1);
assert.equal(parsed.operations[0].matchers.length, 2);
assert.deepEqual(parsed.operations[0].set.date, { exact: null, approximate: '2012-05' });
assert.equal(parsed.operations[0].set.evidence, 'mentioned');
assert.deepEqual(parsed.operations[0].addTags, ['date-confirmed']);
assert.deepEqual(parsed.operations[0].removeTags, ['date-inferred']);

console.log('smoke-quick-update OK');
