import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import C from '../catalog-core.js';
const html=fs.readFileSync(process.env.TIMEGRID_TEST_HTML||new URL('../index.html',import.meta.url),'utf8');
const section=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return html.slice(i,j);};
const copy=x=>JSON.parse(JSON.stringify(x));
const date='2026-09-06',base=new Date(2026,8,6,9).getTime();
function fixture(){
  let sequence=0;
  const state={settings:C.normalize({areas:[{id:'area',name:'Area',color:'#123456'}],activities:[{id:'a',name:'Activity',areaId:'area',area:'Area',color:'#123456'}],routineDefs:[]}),days:{},viewDate:date,finalizations:[]};
  const ctx={state,TG_CATALOG:C,Date,JSON,Map,Set,Math,crypto:globalThis.crypto,copyRun:copy,uid:p=>p+(++sequence),tgDeviceId:()=> 'test',
    toMin:s=>s.split(':').map(Number).reduce((h,m)=>h*60+m),hhmm:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),dateOf:s=>new Date(...s.split('-').map((v,i)=>Number(v)-(i===1?1:0))),
    ensureDay:ds=>state.days[ds]??={events:[],todos:[],routines:[],todoMutations:[],statusMutations:[]},
    recordedActById:id=>C.historicalActivity(state.settings,id),normalizeSettingsColors:copy,
    normalizeCatalogDays:()=>{for(const ds of Object.keys(state.days))state.days[ds]=C.normalizeDay(state.settings,state.days[ds]);},
    syncDayRoutines(){},recoverLocalFinalizations(){},window:{tgCloud:{startGate:()=>({mode:'local'})}},
    normTodoWindow:t=>({time:t.time||'',end:t.end||''}),appendTodoRestoreIfNeeded(){},parseRoutine:name=>({name,time:''}),
    dayDetail:()=>({perArea:{},perAct:{},perAreaId:{},total:0,todoMin:0,routineMin:0}),todoMeasuredMin:()=>0,routineMeasuredMin:()=>0};
  vm.createContext(ctx);
  vm.runInContext(section('/* ROUTINE_DEFINITION_MIGRATION_CORE_START */','/* ROUTINE_DEFINITION_MIGRATION_CORE_END */')+section('/* TODO_MUTATIONS_CORE_START */','/* TODO_MUTATIONS_CORE_END */')+section('/* STATUS_MUTATIONS_CORE_START */','/* ROUTINE_IDENTITY_CORE_START */')+section('const EXACT_EVENT_KEYS=','function continuityCandidate(')+section('function importActivity(','function applyPlan(')+section('function applyLog(','function applyRoutineDefs(')+section('function buildBackup(','$("#importApply")')+section('function buildLog(','$("#copyBtn")')+';globalThis.todoCore=TG_TODO_MUTATIONS;globalThis.statusCore=TG_STATUS_MUTATIONS;',ctx);
  return {ctx,state,day:()=>ctx.ensureDay(date)};
}
const event=(id,start,end,extra={})=>({id,actId:'a',start:'09:00',end:'09:01',startTs:base+start,endTs:base+end,...extra});
for(const mode of ['merge','replace'])test(`exact log ${mode} preserves independent same-minute spans and event IDs`,()=>{
  const {ctx,day}=fixture();ctx.applyLog({date,events:[event('e1',0,10000),event('e2',20000,30000)]},mode);
  assert.deepEqual(Array.from(day().events,e=>e.id),['e1','e2']);
  assert.equal(day().events.reduce((n,e)=>n+e.endTs-e.startTs,0),20000);
  ctx.applyLog({date,events:[event('e1',0,10000),event('e2',20000,30000)]},'merge');assert.equal(day().events.length,2);
});
test('true overlap clips only exact covered interval',()=>{
  const {ctx,day}=fixture();ctx.applyLog({date,events:[event('original',0,50000,{continuityId:'old'}),event('insert',10000,20000)]},'replace');
  assert.equal(day().events.length,3);assert.equal(day().events.reduce((n,e)=>n+e.endTs-e.startTs,0),50000);
  assert.ok(day().events.filter(e=>e.id!=='insert').every(e=>!e.continuityId));
});
test('same-name explicit Todos and routines roundtrip exact linked IDs and completion',()=>{
  const {ctx,day,state}=fixture();
  const log={date,todos:[{id:'t1',title:'Same',done:true},{id:'t2',title:'Same',done:false}],routines:[{id:'r1',name:'Same',done:true},{id:'r2',name:'Same',done:false}],events:[event('e1',0,10000,{todoId:'t2',todo:'Same'}),event('e2',20000,30000,{routineId:'r2',routine:'Same'})]};
  ctx.applyLog(log,'replace');assert.equal(day().todos.length,2);assert.equal(day().routines.length,2);assert.equal(day().todos[0].done,true);assert.equal(day().routines[0].done,true);
  const out=ctx.buildLog(date);assert.equal(out.events[0].todoId,'t2');assert.equal(out.events[1].routineId,'r2');
  state.days={};ctx.applyLog(out,'replace');assert.equal(day().events[0].todoId,'t2');assert.equal(day().events[1].routineId,'r2');
});
test('ambiguous legacy links fail rather than attach to the first matching title',()=>{
  const {ctx,day}=fixture();day().todos=[{id:'t1',title:'Same'},{id:'t2',title:'Same'}];
  assert.throws(()=>ctx.applyLog({date,events:[event('e',0,10000,{todo:'Same'})]},'merge'),/ID|구분/);
});

test('unambiguous legacy name links remain supported',()=>{
  const {ctx,day}=fixture();
  ctx.applyLog({date,todos:[{id:'t',title:'Legacy'}],routines:[{id:'r',name:'Legacy'}],events:[event('e1',0,10000,{todo:'Legacy'}),event('e2',60000,70000,{start:'09:01',end:'09:02',routine:'Legacy'})]},'replace');
  assert.equal(day().events[0].todoId,'t');assert.equal(day().events[1].routineId,'r');
});

test('cross-midnight exact fragments retain one lineage without rebuilding missing fragments',()=>{
  const {ctx,state}=fixture(),nextDate='2026-09-07',midnight=new Date(2026,8,7).getTime();
  const shared={actId:'a',continuityId:'span',spanStartTs:midnight-10000,spanEndTs:midnight+20000,fragmentCount:2,sessionIds:['session']};
  ctx.applyLog({date:nextDate,events:[{...shared,id:'next',start:'00:00',end:'00:01',startTs:midnight,endTs:midnight+20000,fragmentIndex:1}]},'replace');
  assert.equal(state.days[date],undefined,'importing one fragment cannot fabricate the missing day');
  ctx.applyLog({date,events:[{...shared,id:'previous',start:'23:59',end:'24:00',startTs:midnight-10000,endTs:midnight,fragmentIndex:0}]},'replace');
  const events=Object.values(state.days).flatMap(d=>d.events);
  assert.equal(events.length,2);assert.equal(events.reduce((n,e)=>n+e.endTs-e.startTs,0),30000);
  assert.ok(events.every(e=>e.continuityId==='span'&&e.fragmentCount===2));
});
test('backup merge preserves plan-only day and unions stable IDs with current fields winning',()=>{
  const {ctx,day,state}=fixture();day().todos=[{id:'keep',title:'Current'}];day().routines=[{id:'r',name:'Keep',extra:true}];
  const backup={settings:copy(state.settings),days:{[date]:{events:[event('e',0,10000)],todos:[{id:'keep',title:'Stale'},{id:'new',title:'Add'}],routines:[]}}};
  ctx.applyBackup(backup,'merge');assert.deepEqual(Array.from(day().todos,t=>t.title),['Current','Add']);assert.equal(day().routines[0].id,'r');assert.equal(day().events[0].id,'e');
  backup.days[date].events.push(event('e2',20000,30000));ctx.applyBackup(backup,'merge');assert.equal(day().events.length,2);assert.equal(day().todos.length,2);
});

test('backup merge unions immutable mutations and materializes their latest status and deletion',()=>{
  const {ctx,day,state}=fixture(),now=Date.now();
  day().todos=[{id:'keep',title:'Current',done:false},{id:'deleted',title:'Delete by mutation'}];
  const oldStatus=ctx.statusCore.create('todo','keep',false,{id:'old-status',at:now-100});
  const newStatus=ctx.statusCore.create('todo','keep',true,{id:'new-status',at:now});
  day().statusMutations=[oldStatus];
  const deletion=ctx.todoCore.create('delete',{id:'deleted',title:'Delete by mutation'},date,date,{id:'delete',at:now});
  const backup={settings:copy(state.settings),days:{[date]:{events:[],todos:[],routines:[],statusMutations:[newStatus],todoMutations:[deletion]}}};
  ctx.applyBackup(backup,'merge');
  assert.equal(day().todos.length,1);assert.equal(day().todos[0].id,'keep');assert.equal(day().todos[0].done,true);
  assert.equal(day().statusMutations.length,2);assert.equal(day().todoMutations.length,1);
  ctx.applyBackup(backup,'merge');assert.equal(day().statusMutations.length,2);assert.equal(day().todoMutations.length,1);
});

test('backup merge rejects different-ID exact overlap before mutating any settings or day',()=>{
  const {ctx,day,state}=fixture();day().events=[event('current',0,50000)];
  const backup={settings:copy(state.settings),days:{[date]:{events:[event('incoming',10000,20000)],todos:[],routines:[]}}};
  backup.settings.routineDefs.push({id:'new-definition',name:'Do not partially import'});
  const before=JSON.stringify(state);
  assert.throws(()=>ctx.applyBackup(backup,'merge'),/겹|충돌/);
  assert.equal(JSON.stringify(state),before,'failed backup validation must preserve all current state');
});

test('backup same-ID events keep current fields while disjoint same-minute new IDs append',()=>{
  const {ctx,day,state}=fixture();day().events=[event('current',0,10000)];
  const backup={settings:copy(state.settings),days:{[date]:{events:[event('current',0,30000),event('new',20000,30000)],todos:[],routines:[]}}};
  ctx.applyBackup(backup,'merge');assert.equal(day().events.length,2);
  assert.equal(day().events.find(e=>e.id==='current').endTs,base+10000);
  assert.equal(day().events.reduce((sum,e)=>sum+e.endTs-e.startTs,0),20000);
});


test('legacy backup merge retains multiple ID-less definitions with stable idempotent identities',()=>{
  const {ctx,state}=fixture();
  const backup={settings:{...copy(state.settings),routineDefs:[{name:'Legacy A',time:'08:00'},{name:'Legacy B',time:'09:00'}]},days:{}};
  ctx.applyBackup(backup,'merge');
  assert.deepEqual(Array.from(state.settings.routineDefs,r=>r.name),['Legacy A','Legacy B']);
  const ids=Array.from(state.settings.routineDefs,r=>r.id);
  assert.equal(new Set(ids).size,2);assert.ok(ids.every(id=>id.startsWith('rd_legacy_')));
  ctx.applyBackup(backup,'merge');
  assert.deepEqual(Array.from(state.settings.routineDefs,r=>r.id),ids);
});
