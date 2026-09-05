import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import catalog from '../catalog-core.js';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function section(a,b){const start=html.indexOf(a),end=html.indexOf(b,start+a.length);assert.ok(start>=0&&end>start,a);return html.slice(start,end);}
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};}
  append(...items){this.children.push(...items);}
  appendChild(item){this.children.push(item);}
  addEventListener(name,callback){this.listeners[name]=callback;}
  setAttribute(){}
  getBoundingClientRect(){return {height:72};}
}
function fixture({animated=false}={}){
  const state={settings:catalog.normalize({areas:[{id:'area',name:'Study'}],activities:[{id:'act',name:'Reading',areaId:'area',area:'Study'}],routineDefs:[
    {id:'r1',name:'First',days:[0,1,2,3,4,5,6]}, {id:'r2',name:'Second',days:[0,1,2,3,4,5,6]},
  ]}),days:{},viewDate:'2026-09-06'};
  let rerenders=0,undo=null,finish=null;
  const c={state,TG_CATALOG:catalog,document:{createElement:tag=>new Element(tag)},rtEditFilter:'all',_rtEditAnim:null,rmPref:()=>!animated,
    GS:animated?{killTweensOf(){},set(){},timeline(options){finish=options.onComplete;return {to(){return this;}};}}:null,
    DEMO:false,normalizeSettingsColors:x=>x,TG_TODO_MUTATIONS:{materialize(){}},TG_STATUS_MUTATIONS:{materializeDay(){}},normalizeCatalogDays(){},persistCatalogLocal(){},window:{},
    syncDayRoutines(){},renderTimeline(){},renderLive(){},renderRoutines(){rerenders++;},toast(message,callback){undo=callback;},
    actById:id=>catalog.liveActivity(state.settings,id),
    timeBtn:(value,callback)=>Object.assign(new Element('time'),{callback}),catActBtn:(value,callback)=>Object.assign(new Element('classification'),{callback}),
  };
  vm.createContext(c);
  const editorStart=html.includes('function currentRoutineDef(')?'function currentRoutineDef(':'function removeRtEditRow(';
  vm.runInContext(section('function save(){','function load(){')+section('function commitRoutineDefs(','function renderRoutines(')+section(editorStart,'$("#rtEditToggle")'),c);
  const list=new Element('list');c.renderRoutineEditor(list);
  const rows=list.children.filter(row=>row.className==='rt-edit-row').map(row=>({row,
    name:row.children.find(e=>e.tag==='input'),time:row.children.find(e=>e.tag==='time'),classification:row.children.find(e=>e.tag==='classification'),
    days:row.children.find(e=>e.className==='rt-days').children,remove:row.children.find(e=>e.className==='del icon-btn'),
  }));
  return {state,c,rows,get rerenders(){return rerenders;},undo:()=>undo?.(),finish:()=>finish?.(),get definition(){return state.settings.routineDefs.find(d=>d.id==='r1');}};
}
const changeName=(row,value)=>{row.name.value=value;row.name.listeners.change();};
const remove=row=>row.remove.listeners.click({preventDefault(){},stopPropagation(){}});

test('actual editor callbacks retain sequential edits across normalization without rerendering',()=>{
  const f=fixture(),[first,second]=f.rows;
  changeName(first,'Renamed');
  first.time.callback({time:'09:00',end:'10:00'});
  first.days[0].listeners.click();
  first.classification.callback({actId:'act',areaId:'area',area:'Study'});
  changeName(second,'Other row');
  f.c.save(); // An unrelated persistence event replaces all settings objects again.
  first.days[1].listeners.click();
  assert.equal(f.definition.name,'Renamed');assert.equal(f.definition.time,'09:00');assert.equal(f.definition.end,'10:00');
  assert.deepEqual(Array.from(f.definition.days),[2,3,4,5,6]);assert.equal(f.definition.actId,'act');
  assert.equal(f.state.settings.routineDefs[1].name,'Other row');assert.equal(f.rerenders,0,'retain the active input and focus');
  changeName(first,'   ');assert.equal(first.name.value,'Renamed','invalid edit restores the current name');
});
test('delete after editing removes current identity and undo restores the latest fields once',()=>{
  const f=fixture(),row=f.rows[0];changeName(row,'Renamed');row.time.callback({time:'09:00',end:'10:00'});
  const before=JSON.stringify(f.definition);remove(row);assert.equal(f.definition,undefined);
  f.undo();assert.equal(JSON.stringify(f.definition),before);assert.equal(f.state.settings.routineDefs[0].id,'r1');
  f.undo();assert.equal(f.state.settings.routineDefs.filter(d=>d.id==='r1').length,1);
});
test('delayed delete reads the latest definition and undo does not overwrite a reappearing identity',()=>{
  const f=fixture({animated:true}),row=f.rows[0];remove(row);
  f.c.save();f.definition.name='Updated during animation';f.finish();assert.equal(f.definition,undefined);
  f.state.settings.routineDefs.push({id:'r1',name:'Restored elsewhere',days:[1]});f.undo();
  assert.equal(f.definition.name,'Restored elsewhere');assert.equal(f.state.settings.routineDefs.filter(d=>d.id==='r1').length,1);
});
test('stale callbacks cannot mutate a deleted definition or adopt a same-name replacement',()=>{
  const f=fixture(),row=f.rows[0];f.state.settings.routineDefs=f.state.settings.routineDefs.filter(d=>d.id!=='r1');
  f.state.settings.routineDefs.push({id:'replacement',name:'First',days:[1]});const before=JSON.stringify(f.state.settings);
  changeName(row,'Stale');row.time.callback({time:'09:00'});row.days[2].listeners.click();row.classification.callback({actId:'act'});remove(row);
  assert.equal(JSON.stringify(f.state.settings),before);
});
