import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import C from '../catalog-core.js';
import TG_CONTINUITY_CORE from '../continuity-core.js';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
function section(from,to){const start=html.indexOf(from),end=html.indexOf(to,start+from.length);assert.ok(start>=0&&end>start,from+' is extractable');return html.slice(start,end);}
function fixture(){
  let n=0,saved;
  const state={settings:{catalogRevision:0},days:{},running:null,finalizations:[]};
  const context={state,TG_CATALOG:C,TG_CONTINUITY_CORE,console,Date,JSON,Map,Set,Math,copy,copyRun:copy,
    uid:prefix=>prefix+'-'+(++n),
    toMin:value=>{const[h,m]=value.split(':').map(Number);return h*60+m;},
    hhmm:minute=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'),
    dateOf:date=>{const[y,m,d]=date.split('-').map(Number);return new Date(y,m-1,d);},
    ensureDay:date=>state.days[date]||={events:[],todos:[],routines:[]},
    persistCatalogLocal:()=>{saved=copy(state);},
  };
  vm.createContext(context);
  vm.runInContext(section('/* CONTINUITY_CORE_START */','/* CONTINUITY_CORE_END */')+
    section('function statSpan(ev){','function statRangeDays(')+
    section('const EXACT_EVENT_KEYS=','/* ================= autocomplete (custom) ================= */')+
    section('function prepareFinalization(','async function swStop('),context);
  return {state,context,saved:()=>saved,events:(days=state.days)=>Object.values(days).flatMap(d=>d.events)};
}
const start=new Date(2026,8,3,10).getTime(),date='2026-09-03';
const run=(session='session',at=start,act='activity')=>({actId:act,sessionId:session,startTs:at});

test('Stop preparation is an immutable intent, not a day snapshot',()=>{
  const f=fixture(),original=run();
  f.context.materializeExactSpan(run('earlier'),start+20_000);
  const before=JSON.stringify(f.state.days),intent=f.context.prepareFinalization(original,start+60_000);
  original.actId='changed';
  assert.equal(intent.running.actId,'activity');
  assert.equal(intent.id,'session');
  assert.equal(intent.endedAt,start+60_000);
  assert.equal(intent.scope,'cloud');
  assert.equal(Object.hasOwn(intent,'fragments'),false);
  assert.equal(Object.hasOwn(intent,'days'),false);
  assert.equal(JSON.stringify(f.state.days),before);
  assert.throws(()=>f.context.prepareFinalization(run(),start-1),/stop-time-invalid/);
  assert.throws(()=>f.context.prepareFinalization(run(),NaN),/stop-time-invalid/);
});

test('clone materialization conserves canonical objects and restores them on failure',()=>{
  const f=fixture(),days=f.state.days;
  days[date]={events:[],todos:[{id:'todo',name:'Keep'}],routines:[]};
  const before=JSON.stringify(days),intent=f.context.prepareFinalization(run(),start+20_000);
  const projected=f.context.materializedFinalizationDays([intent],days);
  assert.equal(f.state.days,days);
  assert.equal(JSON.stringify(days),before);
  assert.notEqual(projected,days);
  assert.notEqual(projected[date].todos[0],days[date].todos[0]);
  assert.equal(f.events(projected).length,1);
  const writer=f.context.materializeExactSpan;
  f.context.materializeExactSpan=()=>{throw Error('injected-writer-failure');};
  assert.throws(()=>f.context.materializedFinalizationDays([intent],days),/injected-writer-failure/);
  assert.equal(f.state.days,days);
  assert.equal(JSON.stringify(days),before);
  f.context.materializeExactSpan=writer;
});

test('display projection caches safely, invalidates on edits, and never persists pending events',()=>{
  const f=fixture();
  f.state.days[date]={events:[],todos:[{id:'t',name:'Before'}],routines:[]};
  const canonical=f.state.days;
  f.state.finalizations=[f.context.prepareFinalization(run(),start+20_000)];
  const view=f.context.measurementDays();
  assert.equal(f.events(view).length,1);
  assert.equal(f.events(view)[0].pendingFinalization,true);
  assert.equal(f.context.measurementDays(),view,'unchanged input reuses projection');
  assert.equal(f.context.measurementDay(date),view[date]);
  assert.equal(f.context.measuredDayView(canonical[date]),view[date]);
  assert.equal(f.state.days,canonical);
  assert.equal(f.events().length,0);
  f.context.persistCatalogLocal();
  assert.equal(f.events(f.saved().days).length,0,'persisted state is canonical, not view');
  f.state.days[date].todos[0].name='After';
  const changed=f.context.measurementDays();
  assert.notEqual(changed,view);
  assert.equal(changed[date].todos[0].name,'After');
  f.state.finalizations=[];
  assert.equal(f.context.measurementDays(),canonical);
});

test('intent uses latest predecessor state and cannot resurrect a deleted predecessor',()=>{
  const f=fixture();
  f.context.materializeExactSpan(run('earlier'),start+20_000);
  const intent=f.context.prepareFinalization(run('later',start+50_000),start+70_000);
  f.state.days[date].events=[];
  const result=f.context.materializedFinalizationDays([intent],f.state.days);
  assert.equal(f.events(result).length,1);
  assert.equal(f.events(result)[0].startTs,start+50_000);
  assert.equal(f.events(result)[0].endTs,start+70_000);
});

for(const gap of [60_000,60_001])test('finalization preserves D-015 restart boundary '+gap+'ms',()=>{
  const f=fixture();
  f.context.materializeExactSpan(run('earlier'),start+20_000);
  const intent=f.context.prepareFinalization(run('later',start+20_000+gap),start+40_000+gap);
  const result=f.context.materializedFinalizationDays([intent],f.state.days),events=f.events(result);
  assert.equal(events.length,gap===60_000?1:2);
  assert.equal(events.reduce((sum,e)=>sum+e.endTs-e.startTs,0),gap===60_000?100_000:40_000);
});

test('cross-midnight exact spans retain one lineage and zero spans create no fabricated event',()=>{
  const f=fixture(),midnight=new Date(2026,8,4).getTime();
  const intent=f.context.prepareFinalization(run('midnight',midnight-20_000),midnight+20_000);
  const result=f.context.materializedFinalizationDays([intent],{}),events=f.events(result);
  assert.equal(events.length,2);
  assert.equal(new Set(events.map(e=>e.continuityId)).size,1);
  assert.equal(events.reduce((sum,e)=>sum+e.endTs-e.startTs,0),40_000);
  const zero=f.context.prepareFinalization(run('zero'),start);
  assert.equal(zero.zeroSpan,true);
  assert.equal(f.events(f.context.materializedFinalizationDays([zero],{})).length,0);
});

test('overlap finalization clips only covered time and preserves unrelated short intervals',()=>{
  const f=fixture();
  f.context.materializeExactSpan(run('long',start,'other'),start+180_000);
  const intent=f.context.prepareFinalization(run('middle',start+70_000),start+80_000);
  const events=f.events(f.context.materializedFinalizationDays([intent],f.state.days));
  assert.deepEqual(copy(events.map(e=>[e.actId,e.startTs-start,e.endTs-start])),[
    ['other',0,70_000],['activity',70_000,80_000],['other',80_000,180_000],
  ]);
});

test('local crash recovery atomically stores event, clears timer/intent, and is idempotent',()=>{
  const f=fixture(),intent={...f.context.prepareFinalization(run(),start+20_000),scope:'local'};
  f.state.running=run();f.state.finalizations=[intent];
  f.context.recoverLocalFinalizations();
  assert.equal(f.state.running,null);
  assert.equal(f.state.finalizations.length,0);
  assert.equal(f.events().length,1);
  assert.equal(f.saved().running,null);
  assert.equal(f.saved().finalizations.length,0);
  assert.equal(f.events(f.saved().days).length,1);
  const stored=JSON.stringify(f.saved());
  f.context.recoverLocalFinalizations();
  assert.equal(JSON.stringify(f.saved()),stored);
});

test('failed local atomic storage retains original recoverable state and unrelated running session',()=>{
  const f=fixture(),intent={...f.context.prepareFinalization(run(),start+20_000),scope:'local'};
  f.state.running=run('different');f.state.finalizations=[intent];
  const before=JSON.stringify(f.state),days=f.state.days;
  f.context.persistCatalogLocal=()=>{throw Error('quota');};
  assert.throws(()=>f.context.recoverLocalFinalizations(),/quota/);
  assert.equal(JSON.stringify(f.state),before);
  assert.equal(f.state.days,days);
  f.context.persistCatalogLocal=()=>{};
  f.context.recoverLocalFinalizations();
  assert.equal(f.state.running.sessionId,'different');
});

for(const control of ['#evSave','#evDelete'])test('already-open event editor revalidates pending Stop before '+control,()=>{
  const f=fixture(),listeners=new Map(),elements=new Map();
  f.state.viewDate=date;
  f.context.materializeExactSpan(run('earlier'),start+20_000);
  const originalId=f.events()[0].id;
  const element=selector=>{
    if(!elements.has(selector))elements.set(selector,{value:'',dataset:{},textContent:'',className:'',close(){},addEventListener:(event,handler)=>listeners.set(selector+':'+event,handler)});
    return elements.get(selector);
  };
  Object.assign(f.context,{$:element,toast(){},save(){},renderAll(){},recordedActById:()=>({id:'activity',name:'Meal',area:'Life'}),actById:()=>({id:'activity',name:'Meal',area:'Life'}),window:{}});
  vm.runInContext(section('/* ================= event edit dialog ================= */','/* ================= stats ================= */'),f.context);
  vm.runInContext('editingEvId='+JSON.stringify(originalId),f.context);
  element('#evAct').value='Meal';element('#evArea').value='Life';
  element('#evStart').value='10:00';element('#evEnd').value='10:01';
  f.state.finalizations=[f.context.prepareFinalization(run('later',start+50_000),start+70_000)];
  const before=JSON.stringify(f.state.days);
  listeners.get(control+':click')();
  assert.equal(JSON.stringify(f.state.days),before,'pending lineage must be checked at mutation time, not only when opening');
});

test('pending edit guard permits unrelated records but rejects moving one across a pending span',()=>{
  const f=fixture();
  f.context.materializeExactSpan(run('earlier'),start+20_000);
  f.context.materializeExactSpan(run('unrelated',start+600_000,'other'),start+620_000);
  f.state.finalizations=[f.context.prepareFinalization(run('later',start+50_000),start+70_000)];
  vm.runInContext(section('function pendingEventEdit(','function openEvDlg('),f.context);
  const unrelated=f.events().find(e=>e.actId==='other');
  assert.equal(f.context.pendingEventEdit(date,unrelated),false);
  assert.equal(f.context.pendingEventEdit(date,unrelated,610,611),false);
  assert.equal(f.context.pendingEventEdit(date,unrelated,599,602),true);
  assert.equal(f.context.pendingEventEdit(date,null,610,611),false);
});

for(const endOffset of [0,1,1234,59_999])test('pending exact end 02:03 + '+endOffset+'ms reserves its entire occupied edit minute',()=>{
  const f=fixture(),dayStart=new Date(2026,8,3).getTime();
  f.state.viewDate=date;
  const end=dayStart+123*60_000+endOffset;
  f.state.finalizations=[f.context.prepareFinalization(run('precise',dayStart+120*60_000+567),end)];
  const canonical=JSON.stringify(f.state.days),intent=JSON.stringify(f.state.finalizations);
  const projected=f.context.measurementDay(date),pending=projected.events[0],before=JSON.stringify(pending);
  const firstFree=endOffset===0?123:124;
  assert.deepEqual(copy(f.context.freeRanges(projected,123,140)),[[firstFree,140]],'manual edit starts after the whole occupied minute');
  assert.deepEqual(copy(f.context.freeRanges(projected,110,130)),[[110,120],[firstFree,130]],'start rounds outward to its containing minute too');
  vm.runInContext(section('function pendingEventEdit(','function openEvDlg('),f.context);
  assert.equal(f.context.pendingEventEdit(date,null,123,140),endOffset!==0,'retiming must use the same outward boundary');
  assert.equal(f.context.pendingEventEdit(date,null,124,140),false,'first free whole minute remains editable');
  assert.equal(JSON.stringify(f.state.days),canonical,'occupation calculation never changes canonical storage');
  assert.equal(JSON.stringify(f.state.finalizations),intent,'occupation calculation never rounds the intent');
  assert.equal(JSON.stringify(pending),before,'projection retains exact time and display metadata');
  assert.equal(pending.startTs,dayStart+120*60_000+567);
  assert.equal(pending.endTs,end);
});

test('manual insertion after pending fractional endpoint remains separate and editable after materialization',()=>{
  const f=fixture(),dayStart=new Date(2026,8,3).getTime(),end=dayStart+123*60_000+1234;
  f.state.viewDate=date;
  f.state.finalizations=[f.context.prepareFinalization(run('precise',dayStart+120*60_000),end)];
  const projected=f.context.measurementDay(date),free=f.context.freeRanges(projected,123,140);
  for(const [s,e]of free)f.context.addInterval(f.context.ensureDay(date),'manual',s,e);
  const manualBefore=copy(f.events().find(e=>e.actId==='manual'));
  const materialized=f.context.materializedFinalizationDays(f.state.finalizations,f.state.days);
  const rows=f.events(materialized),manualAfter=rows.find(e=>e.actId==='manual'),precise=rows.find(e=>e.actId==='activity');
  assert.deepEqual(copy(manualAfter),manualBefore,'finalization does not clip, rename, or detach the newly inserted manual event');
  assert.equal(manualAfter.start,'02:04');
  assert.equal(manualAfter.end,'02:20');
  assert.equal(manualAfter.pendingFinalization,undefined);
  assert.equal(precise.endTs,end);
  assert.ok(f.context.exactEventBounds(date,manualAfter).startTs>=precise.endTs);
});

test('pending fractional span across midnight reserves each day boundary without rounding saved timestamps',()=>{
  const f=fixture(),midnight=new Date(2026,8,4).getTime(),next='2026-09-04';
  f.state.viewDate=date;
  f.state.finalizations=[f.context.prepareFinalization(run('midnight-precise',midnight-1234),midnight+1234)];
  const days=f.context.measurementDays();
  assert.deepEqual(copy(f.context.freeRanges(days[date],1438,1440)),[[1438,1439]]);
  f.state.viewDate=next;
  assert.deepEqual(copy(f.context.freeRanges(days[next],0,20)),[[1,20]]);
  const rows=f.events(days);
  assert.equal(rows[0].startTs,midnight-1234);
  assert.equal(rows[1].endTs,midnight+1234);
  assert.equal(rows.reduce((total,e)=>total+e.endTs-e.startTs,0),2468);
});

test('ordinary canonical exact records retain their existing minute edit boundary',()=>{
  const f=fixture(),dayStart=new Date(2026,8,3).getTime();
  f.state.viewDate=date;
  f.context.materializeExactSpan(run('stored',dayStart+120*60_000),dayStart+123*60_000+1234);
  const before=JSON.stringify(f.state.days),stored=f.events()[0];
  assert.equal(stored.end,'02:03');
  assert.deepEqual(copy(f.context.freeRanges(f.state.days[date],123,140)),[[123,140]],'outward reservation applies only while exact Stop is pending');
  assert.equal(JSON.stringify(f.state.days),before);
});
