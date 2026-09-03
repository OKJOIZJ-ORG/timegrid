import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
// Run real bootstrap order, not just hoisted helpers in isolation.
const boot=vm.createContext({window:{matchMedia:()=>({addEventListener(){}})},
  document:{addEventListener(){},documentElement:{dataset:{}},body:{dataset:{}}}})
const app=html.slice(html.indexOf('"use strict";'),html.indexOf('function darkTone('))
const dateHelper=html.slice(html.indexOf('function ymd('),html.indexOf('\n}',html.indexOf('function ymd('))+2)
vm.runInContext(dateHelper+'\n'+app+';this.seed=state.settings',boot)
assert.equal(boot.seed.areas.length,8);assert.equal(boot.seed.activities.length,18)
assert.equal(boot.seed.activities.find(a=>a.id==='a14').area,'회복')
assert.equal(boot.seed.activities.find(a=>a.id==='a12').area,'운동')
assert.ok(boot.seed.activities.every(a=>/^#[0-9A-F]{6}$/.test(a.color)))
const core=html.slice(html.indexOf('/* CATALOG_CORE_START */'),html.indexOf('/* CATALOG_CORE_END */'))
const ctx=vm.createContext({});vm.runInContext(core+';this.c=TG_CATALOG',ctx)
const c=ctx.c,settings={areas:[{name:'운동'},{name:'공부'},{name:'회복'}],activities:[
  {id:'a',name:'수학',area:'공부',lastUsed:100},{id:'b',name:'PT',area:'운동',lastUsed:0},
  {id:'c',name:'국어',area:'공부',lastUsed:999}],routineDefs:[{id:'r',actId:'b',area:'운동'}]}
assert.deepEqual(Array.from(c.activities(settings),a=>a.id),['b','a','c'],'area order then managed activity order, never recency')
const events=[{id:'e',actId:'b',startTs:1000,endTs:601000}]
const eventBytes=JSON.stringify(events)
const stats=()=>events.reduce((a,e)=>{const item=settings.activities.find(a=>a.id===e.actId);a.minutes+=(e.endTs-e.startTs)/60000;a.name=item.name;a.area=item.area;return a},{minutes:0})
c.archive(settings.activities[1],123)
assert.deepEqual(Array.from(c.activities(settings),a=>a.id),['a','c'])
assert.equal(stats().minutes,10);assert.equal(stats().name,'PT')
assert.equal(JSON.stringify(events),eventBytes,'retirement never deletes or rewrites measurements')
c.restore(settings,settings.activities[1]);c.move(settings,'b','회복')
assert.equal(stats().area,'회복');assert.equal(settings.routineDefs[0].area,'회복')
settings.activities[1].name='회복 운동';assert.equal(stats().name,'회복 운동')
c.archive(settings.areas[2],124);assert.equal(c.activities(settings).some(x=>x.id==='b'),false)
c.restore(settings,settings.activities[1]);assert.equal(settings.areas[2].archived,undefined)
assert.equal(c.move(settings,'missing','공부'),false)

const fnStart=html.indexOf('  function itemKey('),fnEnd=html.indexOf('  function mergeDay(',fnStart)
const m=vm.createContext({copy:x=>x===undefined?undefined:structuredClone(x),same:(a,b)=>JSON.stringify(a)===JSON.stringify(b)})
vm.runInContext(html.slice(fnStart,fnEnd)+';this.merge=mergeList',m)
const base=[{id:'a',name:'A',lastUsed:0},{id:'b',name:'B',lastUsed:0}]
const local=structuredClone(base);local[0].lastUsed=99
const remote=[{...base[1]}, {...base[0],archived:true,archivedAt:12}]
const merged=JSON.parse(JSON.stringify(m.merge(base,local,remote,true,'activity')))
assert.deepEqual(merged.map(x=>x.id),['b','a'],'local timer use cannot undo remote ordering')
assert.equal(merged[1].lastUsed,99);assert.equal(merged[1].archived,true,'independent archive and usage edits both survive')
const last=m.merge(base,[{...base[0],lastUsed:500},base[1]],[{...base[0],lastUsed:600},base[1]],true,'activity')
assert.equal(last[0].lastUsed,600,'last-use time is monotonic across clients')
const mv=vm.createContext({TG_CATALOG:c,state:{settings},autoColor:()=>"#abcdef"})
vm.runInContext(html.slice(html.indexOf('function moveActivity('),html.indexOf('function actByName('))+';this.move=moveActivity',mv)
const preserved=settings.activities[0];preserved.color='#123456';mv.move(preserved,preserved.area)
assert.equal(preserved.color,'#123456','same-area reorder preserves a custom color')
assert.match(html,/let acts=orderedActivities\(\)/)
assert.doesNotMatch(html,/for\(const a of acts\.slice\(0,8\)\)/,'all choices remain reachable')
assert.doesNotMatch(html,/state\.settings\.activities=state\.settings\.activities\.filter\(x=>x!==a\)/)
assert.match(html,/renderCatalogArchive\(\);/)
console.log('Catalog ordering, archive/restore, historical identity, and concurrent metadata merge passed')
