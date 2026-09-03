import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const catalog = require('../catalog-core.js');
const source = fs.readFileSync(new URL('../catalog-manager.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../catalog-manager.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sharedCss = [...app.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]).join('\n');
new vm.Script(source);

// Test the actual UI rename adapter, not a parallel reimplementation of it.
const rename = source.slice(source.indexOf('  function renameArea('), source.indexOf('  function edit('));
assert.ok(rename.startsWith('  function renameArea('));
const state = {
  settings: catalog.normalize({
    areas: [{ id: 'old', name: '생활', color: '#ff0000' }, { id: 'other', name: '다른 영역', color: '#0000ff' }],
    activities: [{ id: 'meal', areaId: 'old', area: '생활', name: '식사', color: '#ffaaaa' }],
    routineDefs: [{ id: 'routine', actId: 'meal', areaId: 'old', area: '생활' }]
  }),
  days: {
    '2026-09-03': {
      todos: [
        { id: 'linked', actId: 'meal', areaId: 'old', area: '생활', done: true, time: '12:00' },
        { id: 'legacy', area: '생활', name: 'Legacy plan' },
        { id: 'distinct', areaId: 'other', area: '생활', name: 'Same stale label, different identity' }
      ],
      routines: [{ id: 'r-instance', areaId: 'old', area: '생활', time: '12:30', done: true }],
      todoMutations: [{ id: 'mutation', todo: { id: 'moved', areaId: 'old', area: '생활', note: 'Preserve this' } }],
      events: [{ id: 'event', actId: 'meal', startTs: 10000, endTs: 20000, sessionIds: ['original'] }]
    }
  }
};
const eventsBefore = JSON.stringify(state.days['2026-09-03'].events);
const sandbox = { state, areaId: area => area.id };
vm.createContext(sandbox);
vm.runInContext(rename + "\nrenameArea(state.settings.areas[0], '일상');", sandbox);
assert.equal(state.settings.areas[0].id, 'old');
assert.equal(state.settings.activities[0].area, '일상');
assert.equal(state.settings.routineDefs[0].area, '일상');
assert.equal(state.days['2026-09-03'].todos[0].done, true);
assert.equal(state.days['2026-09-03'].todos[0].time, '12:00');
assert.equal(state.days['2026-09-03'].todos[1].areaId, 'old');
assert.equal(state.days['2026-09-03'].todos[2].area, '생활');
assert.equal(state.days['2026-09-03'].routines[0].area, '일상');
assert.equal(state.days['2026-09-03'].todoMutations[0].todo.area, '일상');
assert.equal(state.days['2026-09-03'].todoMutations[0].todo.note, 'Preserve this');
assert.equal(JSON.stringify(state.days['2026-09-03'].events), eventsBefore);

// UI ownership and interaction contracts; visual behavior is checked separately.
assert.match(source, /await window\.tgCloud\.deleteCatalog\(preview\)/);
assert.doesNotMatch(source, /TG_CATALOG\.(?:archive|restore|deletion)\(/);
assert.doesNotMatch(source, /createElement\(['"](?:details|summary)['"]\)/);
assert.match(source, /CATALOG_RUNNING/);
assert.match(source, /CATALOG_FINALIZING/);
assert.match(source, /CATALOG_PREVIEW_CHANGED/);
assert.match(source, /CATALOG_CLEANUP_PENDING/);
assert.match(source, /layer\.busy\(true\)/);
assert.match(source, /preview\.activities\.map/);
assert.match(source, /current\(kind, id\)/);
assert.match(source, /setPointerCapture/);
assert.match(source, /pointercancel/);
assert.match(source, /event\.altKey/);
assert.match(source, /node\.inert = wasInert/);
assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(css, /@media\(max-width:719px\)/);
assert.doesNotMatch(css, /transition\s*:\s*all/);
// The manager has one live control surface. Keep neighboring shared primitives.
assert.doesNotMatch(sharedCss, /\.(?:act-edit|act-add-row|act-paint|grp(?:-[\w-]+)?|mgr-[\w-]+|a-cnt)\b|#(?:areasList|groups)\b/);
for (const shared of ['.add-line', '.drag-placeholder', '.rt-edit-row', '.cp-sw', '.area-picker']) {
  assert.ok(sharedCss.includes(shared), 'Preserve shared control: ' + shared);
}
assert.doesNotMatch(source + css, /\uFFFD/);
console.log('Catalog manager: stable-identity rename and UI ownership contracts passed.');
