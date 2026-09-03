import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import TG_CATALOG from '../catalog-core.js'
import TG_CONTINUITY_CORE from '../continuity-core.js'
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
const cut=(from,to)=>{const s=html.indexOf(from),e=html.indexOf(to,s+from.length);assert.ok(s>=0&&e>s,from);return html.slice(s,e)}
const base=new Date(2026,8,3,10).getTime(),date='2026-09-03'
function fixture(){
  let now=base,n=0
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
  const state={viewDate:date,settings:{catalogRevision:0},days:{},finalizations:[],running:null}
  const nodes=new Map(),node=id=>nodes.get(id)||nodes.set(id,{value:'',dataset:{},classList:{},close(){},addEventListener(type,fn){this[type]=fn}}).get(id)
  const ctx={state,TG_CATALOG,TG_CONTINUITY_CORE,TG_MAX_RUNNING_MS:20*3600000,Date:Clock,console,Map,Set,Math,JSON,
    copyRun:v=>JSON.parse(JSON.stringify(v)),uid:p=>p+'_'+(++n),toMin:v=>{const[h,m]=v.split(':').map(Number);return h*60+m},
    hhmm:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),dateOf:d=>new Date(d+'T00:00:00'),
    ensureDay:d=>state.days[d]||={events:[],todos:[],routines:[]},$:node,window:{},save(){},renderAll(){},
    recordedActById:id=>({id,name:id}),actById:id=>({id,name:id}),resolveActivity:name=>({id:name,name})}
  vm.createContext(ctx)
  vm.runInContext(cut('/* CONTINUITY_CORE_START */','/* CONTINUITY_CORE_END */')+
    cut('const EXACT_EVENT_KEYS=','function freeRanges(')+
    cut('function prepareFinalization(','async function swStop(')+
    cut('function totalSec(){','function renderTotal(')+
    cut('let editingEvId=null;','function openEvDlg(')+
    cut('$("#evSave").addEventListener','$("#evEnd").addEventListener'),ctx)
  return {ctx,state,node,at:value=>now=value,events:()=>Object.values(state.days).flatMap(d=>d.events),
    record:(start,end,note='',extra={})=>ctx.materializeExactSpan({actId:'a',sessionId:'s'+(++n),startTs:start,note,...extra},end),
    start:(at,note='',extra={})=>{now=at;state.running={actId:'a',sessionId:'s'+(++n),startTs:at,note,...extra}},
    edit:ev=>{vm.runInContext('editingEvId='+JSON.stringify(ev.id),ctx);node('#evAct').value=ev.actId;node('#evStart').value=ev.start;node('#evEnd').value=ev.end}}
}
for(const gap of [0,59999,60000,60001])test('live and Stop agree at '+gap+'ms, without canonical writes',()=>{
  const f=fixture();f.record(base,base+20000);f.start(base+20000+gap);f.at(base+40000+gap)
  const before=JSON.stringify(f.state),live=f.ctx.measurementDays(),events=live[date].events
  assert.equal(events.length,gap<=60000?1:2)
  assert.equal(f.ctx.totalSec(),(40000+(gap<=60000?gap:0))/1000)
  assert.equal(JSON.stringify(f.state),before)
  assert.equal(events.filter(e=>e.runningProjection).length,1)
  f.ctx.materializeExactSpan(f.state.running,base+40000+gap);f.state.running=null
  assert.equal(f.ctx.totalSec(),(40000+(gap<=60000?gap:0))/1000)
})
test('bridge appears at the exact restart instant; zero stop remains zero',()=>{
  const f=fixture();f.record(base,base+20000);f.start(base+50000)
  assert.equal(f.ctx.totalSec(),50)
  assert.equal(f.ctx.measurementDays()[date].events.filter(e=>e.runningProjection).length,1)
  assert.equal(f.ctx.materializeExactSpan(f.state.running,base+50000),false)
  assert.equal(f.events()[0].endTs,base+20000)
})
test('different memo stays separate, without display-minute overlap loss',()=>{
  const f=fixture();f.record(base,base+20000,'left');f.start(base+50000,'right');f.at(base+70000)
  assert.equal(f.ctx.totalSec(),40);assert.equal(f.ctx.measurementDays()[date].events.length,2)
})
test('memo-only editor preserves exact endpoints and joins both eligible neighbors',()=>{
  const f=fixture();f.record(base,base+20123,'same');f.record(base+40000,base+50234,'other');f.record(base+80000,base+90123,'same')
  const firstId=f.events()[0].id,middle=f.events()[1];f.edit(middle);f.node('#evNote').value='same'
  f.node('#evSave').click()
  const events=f.events();assert.equal(events.length,1);assert.equal(events[0].id,firstId)
  assert.equal(events[0].startTs,base);assert.equal(events[0].endTs,base+90123)
  assert.equal(events[0].gapIncludedMs,19877+29766);assert.equal(events[0].sessionIds.length,3)
  f.ctx.editMeasurementMetadata(events[0],'a','new');assert.equal(f.events()[0].endTs,base+90123)
  assert.equal(f.events()[0].note,'new','a merged measurement has one editable memo')
})
for(const gap of [60000,60001])test('later memo match honors original exact gap '+gap,()=>{
  const f=fixture();f.record(base,base+20123,'same');f.record(base+20123+gap,base+40123+gap,'other')
  f.ctx.editMeasurementMetadata(f.events()[1],'a','same');assert.equal(f.events().length,gap===60000?1:2)
})
test('intervening record and distinct link remain independent',()=>{
  const f=fixture();f.record(base,base+10000,'same');f.record(base+15000,base+16000,'other',{actId:'b'});f.record(base+20000,base+30000,'other')
  f.ctx.editMeasurementMetadata(f.events()[2],'a','same');assert.equal(f.events().length,3)
  const g=fixture();g.record(base,base+10000,'',{todoId:'one'});g.start(base+20000,'',{todoId:'two'});g.at(base+30000)
  assert.equal(g.ctx.totalSec(),20)
})

test('an intervening unfinalized Stop also prevents a metadata-induced bridge',()=>{
  const f=fixture();f.record(base,base+20000,'same');f.record(base+50000,base+70000,'other');f.at(base+80000)
  f.state.finalizations=[{id:'pending',scope:'cloud',running:{actId:'b',sessionId:'pending',startTs:base+30000},endedAt:base+40000,zeroSpan:false}]
  const pending=JSON.stringify(f.state.finalizations)
  f.edit(f.events()[1]);f.node('#evNote').value='same';f.node('#evSave').click()
  assert.equal(f.events().length,2,'unfinalized measured time in the gap cannot be swallowed')
  assert.equal(JSON.stringify(f.state.finalizations),pending)
  assert.equal(f.ctx.totalSec(),50)
})
test('midnight live projection and memo edit preserve every logical fragment',()=>{
  const f=fixture(),midnight=new Date(2026,8,4).getTime()
  f.record(midnight-30000,midnight-10000,'same');f.start(midnight+10000,'same');f.at(midnight+30000)
  const before=JSON.stringify(f.state.days),days=f.ctx.measurementDays()
  assert.equal(days[date].events[0].endTs,midnight);assert.equal(days['2026-09-04'].events[0].startTs,midnight)
  assert.equal(days[date].events[0].runningProjection,true);assert.equal(JSON.stringify(f.state.days),before)
  f.state.running=null;f.record(midnight+10000,midnight+30000,'other')
  f.ctx.editMeasurementMetadata(f.events()[1],'a','same')
  assert.equal(f.events().length,2);assert.equal(new Set(f.events().map(e=>e.continuityId)).size,1)
  f.ctx.editMeasurementMetadata(f.events()[1],'a','revised');assert.ok(f.events().every(e=>e.note==='revised'))
})
test('editing a stopped memo can join an active projection without mutating raw run',()=>{
  const f=fixture();f.record(base,base+20123,'old');f.start(base+50000,'same');f.at(base+70123)
  const raw=JSON.stringify(f.state.running);f.edit(f.events()[0]);f.node('#evNote').value='same';f.node('#evSave').click()
  assert.equal(f.ctx.totalSec(),70.123);assert.equal(JSON.stringify(f.state.running),raw)
  assert.equal(f.events()[0].endTs,base+20123)
})
test('active projection is invalidated on predecessor deletion and pending stays separate',()=>{
  const f=fixture();f.record(base,base+20000);f.start(base+50000);f.at(base+70000)
  assert.equal(f.ctx.totalSec(),70);f.state.days[date].events=[];assert.equal(f.ctx.totalSec(),20)
  assert.equal(f.ctx.pendingEventEdit(date,null,600,602),true)
})

test('unchanged legacy midnight time control is a metadata edit, not a rounded rewrite',()=>{
  const f=fixture(),midnight=new Date(2026,8,4).getTime()
  f.record(midnight-20123,midnight,'old');const ev=f.events()[0];ev.end='00:00'
  f.edit(ev);f.node('#evNote').value='new';f.node('#evSave').click()
  assert.equal(f.events()[0].startTs,midnight-20123);assert.equal(f.events()[0].endTs,midnight)
  assert.equal(f.events()[0].note,'new');assert.equal(f.events()[0].id,ev.id)
})

test('metadata edits never rebuild missing head or tail fragments of imported lineage',()=>{
  for(const missing of ['head','tail']){
    const f=fixture(),midnight=new Date(2026,8,4).getTime()
    f.record(midnight-20000,midnight+20000,'before')
    const parts=f.events(),removed=parts[missing==='head'?0:1]
    for(const day of Object.values(f.state.days))day.events=day.events.filter(e=>e!==removed)
    const survivor=f.events()[0]
    f.record(survivor.endTs+10000,survivor.endTs+20000,'after')
    f.ctx.editMeasurementMetadata(f.events().find(e=>e.note==='after'),'a','before')
    assert.equal(f.events().length,2)
    assert.equal(f.events().reduce((sum,e)=>sum+e.endTs-e.startTs,0),30000)
  }
})
