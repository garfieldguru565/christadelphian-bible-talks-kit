// Live check against the real API: node test/smoke.mjs (run `npm run build` first).
import assert from 'node:assert/strict';
import { createBibleTalksClient, createSpeakerNormalizer, parseSpeakerNames, yearsOf } from '../dist/index.js';

const talks = createBibleTalksClient();

const latest = await talks.listStudies({ count: 5 });
assert.equal(latest.length, 5, 'listStudies returns a page');
assert.ok(latest.every((s) => s.posted === 1), 'only posted studies');
console.log('latest:', latest.map((s) => `${s.id} ${s.title} (${s.speaker})`).join(' | '));

const all = await talks.listStudies();
assert.ok(all.length > 1000, `full catalog (${all.length} studies)`);
console.log(`catalog: ${all.length} studies, ${yearsOf(all).length} years`);

const study = await talks.getStudy(latest.find((s) => s.id)?.id ?? all[0].id);
const withClasses = study?.classes.length ? study : await talks.getStudy(742);
assert.ok(withClasses && withClasses.classes.length > 0, 'getStudy returns classes');
const url = talks.audioUrl(withClasses.classes[0]);
const head = await fetch(url, { headers: { Range: 'bytes=0-1' } });
assert.equal(head.status, 206, `audio URL serves byte ranges: ${url}`);
assert.equal(head.headers.get('access-control-allow-origin'), '*', 'audio is CORS-open');
console.log('audio ok:', url);

assert.equal(await talks.getStudy(99999999), null, 'missing study is null');

const found = await talks.searchStudies({ title: 'Mary & Martha' });
assert.ok(found.some((s) => s.id === 742), 'search matches class titles, not just series titles');
console.log('search "Mary & Martha":', found.length, 'studies');

assert.deepEqual(parseSpeakerNames('Bre Roger Lewis, Paul Billington & CALEB LAWRENCE'), [
  'Roger Lewis', 'Paul Billington', 'Caleb Lawrence',
]);
const speakers = createSpeakerNormalizer();
assert.deepEqual(speakers.canonicalNames('Bro. Dave Fraser'), ['David Fraser']);
console.log('speakers:', speakers.speakersOf(all).length, 'distinct');

console.log('All checks passed.');
