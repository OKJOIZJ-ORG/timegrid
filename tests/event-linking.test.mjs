import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import TG_CATALOG from '../catalog-core.js'
import TG_CONTINUITY_CORE from '../continuity-core.js'

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
const cut=(from,to)=>{
  const start=html.indexOf(from),end=html.indexOf(to,start+from.length)
  assert.ok(start>=0&&end>start,from)
  return html.slice(start,end)
}
const past='2026-09-05',today='2026-09-06'

function fixture(){
  let id=0
  const state={
    viewDate:past,
    settings:{catalogRevision:0},
    days:{
      [past]:{events:[],todos:[{id:'past-todo',title:'과거 할일'}],routines:[{id:'past-routine',name:'독서실 이동'}]},
      [today]:{events:[],todos:[{id:'today-todo',title:'오늘 할일'}],routines:[{id:'today-routine',name:'오늘 루틴'}]}
    },
    finalizations:[],running:null
  }
  class Clock extends Date{
    constructor(...args){super(...(args.length?args:[new Date(today+'T12:00:00').getTime()]))}
    static now(){return new Date(today+'T12:00:00').getTime()}
  }
  const ctx={
    state,TG_CATALOG,TG_CONTINUITY_CORE,TG_MAX_RUNNING_MS:20*3600000,Date:Clock,console,Map,Set,Math,JSON,
    uid:prefix=>prefix+'_'+(++id),copyRun:value=>JSON.parse(JSON.stringify(value)),
    ymd:value=>new Date(value).toISOString().slice(0,10),dateOf:value=>new Date(value+'T00:00:00'),
    toMin:value=>{const [h,m]=String(value).split(':').map(Number);return h*60+m},
    hhmm:value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0'),
    ensureDay:value=>state.days[value]||={events:[],todos:[],routines:[]},
    todoMeasuredMin:()=>0,routineMeasuredMin:()=>0
  }
  vm.createContext(ctx)
  vm.runInContext(
    cut('/* CONTINUITY_CORE_START */','/* CONTINUITY_CORE_END */')+
    cut('const EXACT_EVENT_KEYS=','function freeRanges(')+
    cut('function noteCandidates(','function attachNoteAC('),
    ctx
  )
  return {ctx,state}
}

test('event-note candidates use the edited event date, not the wall-clock date',()=>{
  const {ctx}=fixture()
  const items=ctx.noteCandidates('',past)
  assert.deepEqual(Array.from(items,item=>item.id),['past-todo','past-routine'])
})

test('metadata-only event edits can replace a free note with an existing routine link',()=>{
  const {ctx,state}=fixture()
  const event={id:'event',actId:'move',start:'09:00',end:'09:20',note:'자유 메모'}
  state.days[past].events=[event]
  ctx.editMeasurementMetadata(event,'move',{routineId:'past-routine'})
  assert.equal(event.routineId,'past-routine')
  assert.equal('todoId' in event,false)
  assert.equal('note' in event,false)
})
