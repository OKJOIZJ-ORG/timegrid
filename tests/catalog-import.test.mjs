import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import C from '../catalog-core.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const section=(a,b)=>{const start=html.indexOf(a),end=html.indexOf(b,start+a.length);assert.ok(start>=0&&end>start,a);return html.slice(start,end);};
const copy=x=>JSON.parse(JSON.stringify(x));
const settings=C.normalize({areas:[{id:'life',name:'생활',color:'#123456'}],activities:[{id:'meal',name:'식사',area:'생활',color:'#456789'}],routineDefs:[{id:'r',name:'식사 루틴',actId:'meal',area:'생활'}]});
const day={events:[{id:'e',actId:'meal',start:'12:00',end:'12:20'}],todos:[{id:'t',title:'식사 준비',actId:'meal',area:'생활'}],routines:[{id:'r1',name:'식사',actId:'meal',area:'생활',extra:true}]};
const state={settings:copy(settings),days:{'2026-09-03':copy(day)},viewDate:'2026-09-03',finalizations:[]};
const ctx={state,TG_CATALOG:C,Date,JSON,Map,Set,Math,copyRun:copy,uid:p=>p+'-new',
  actById:id=>C.liveActivity(state.settings,id),recordedActById:id=>C.historicalActivity(state.settings,id),
  areaByName:name=>C.areas(state.settings).find(a=>a.name===name),normalizeSettingsColors:copy,
  TG_TODO_MUTATIONS:{normalizeList:x=>x||[],materialize(){}},TG_STATUS_MUTATIONS:{normalizeList:x=>x||[],materializeDay(){}},
  normalizeCatalogDays:()=>{for(const date of Object.keys(state.days))state.days[date]=C.normalizeDay(state.settings,state.days[date]);},
  syncDayRoutines(){},window:{tgCloud:{startGate:()=>({mode:'local'})}},recoverLocalFinalizations(){},
  resolveActivity:()=>{throw new Error('unexpected-auto-create');}};
vm.createContext(ctx);
vm.runInContext(section('function importActivity(','function applyPlan(')+section('function buildBackup(','$("#importApply")')+section('function buildRoutineDefs(','function buildPlanRange('),ctx);
const plan=ctx.buildPlan('2026-09-03'),defs=ctx.buildRoutineDefs();
assert.equal(plan.todos[0].actId,'meal');assert.equal(plan.todos[0].areaId,'life');assert.equal(defs.defs[0].actId,'meal');
assert.equal(ctx.importClassification(plan.todos[0]).actId,'meal');
state.settings=C.deletion(state.settings,C.preview(state.settings,'activity','meal'),{operationId:'removed',at:42}).settings;
ctx.normalizeCatalogDays();
const blank=ctx.buildPlan('2026-09-03');assert.equal(blank.todos[0].actId,null);assert.equal(blank.todos[0].areaId,'life');
assert.equal(ctx.importClassification(plan.todos[0]).actId,null,'stale plan cannot restore a deleted assignment');
assert.equal(ctx.importActivity({actId:'meal',act:'식사'}).id,'meal','historical log keeps its identity');
ctx.applyBackup({settings,days:{'2026-09-03':copy(day)}},'replace');
assert.equal(state.settings.activities.length,0,'pre-deletion backup cannot restore deleted live entry');
assert.equal(JSON.stringify(state.days['2026-09-03'].events),JSON.stringify(day.events));
state.settings.activities.push({id:'breakfast',name:'식사',area:'생활',areaId:'life',color:'#AABBCC'});
assert.throws(()=>ctx.importActivity({act:'식사',area:'생활'}),/ID/,'ambiguous name-only import fails explicitly');
assert.equal(ctx.importActivity({actId:'breakfast'}).id,'breakfast');
assert.throws(()=>ctx.importClassification({areaId:'foreign',area:'생활'}),/ID/,'unknown identity cannot silently attach by name');
assert.throws(()=>ctx.applyBackup({settings:{areas:[],activities:[],routineDefs:[]},days:{}},'replace'),/영역·활동/,'backup cannot bypass catalog deletion owner');
assert.equal(state.settings.activities[0].id,'breakfast');
console.log('Catalog imports: stable-ID export, stale plan/backup normalization, preserved history, recreation ambiguity and deletion-owner guard passed');
