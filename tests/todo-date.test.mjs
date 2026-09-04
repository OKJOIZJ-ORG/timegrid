import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import catalog from '../catalog-core.js';
const automationCore=new URL('../../TimeGridAutomation/todoSyncCore.mjs',import.meta.url);
const {decideTodoSync}=fs.existsSync(automationCore)?await import(automationCore.href):{};

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function extract(a,b){const start=html.indexOf(a),end=html.indexOf(b,start+a.length);assert.ok(start>=0&&end>start,a);return html.slice(start,end);}
const copy=v=>JSON.parse(JSON.stringify(v));
const sourceDate='2026-09-03',targetDate='2026-09-04',laterDate='2026-09-05';
const empty=()=>({todos:[],events:[],routines:[],todoMutations:[],statusMutations:[]});
function client({measured=true,done=false}={}){
  const original={id:'original',title:'Continue work',area:'Study',areaId:'area-1',actId:'act-1',done,time:'09:00',end:'10:00',privateExtra:'not a planning field'};
  const source={...empty(),todos:[original],events:measured?[{id:'event',todoId:original.id,actId:'act-1',startTs:1000,endTs:1200,start:'00:00',end:'00:01'}]:[]};
  const state={days:{[sourceDate]:source},running:null,finalizations:[]};let n=0,undo=null;
  const c=vm.createContext({state,crypto:globalThis.crypto,Map,Set,Date,Math,JSON,console,
    TG_CATALOG:catalog,ymd:d=>d.toISOString().slice(0,10),dateOf:s=>new Date(s),
    uid:()=>`new-${++n}`,tgDeviceId:()=> 'test',
    ensureDay:ds=>state.days[ds]||(state.days[ds]=empty()),
    todoMeasuredMin:(day,item)=>day.events.filter(e=>e.todoId===item.id).length/300,
    fmtDateK:ds=>ds,toast:(message,callback)=>{c.lastToast=message;undo=callback||null;},
    renderTodos(){},renderTimeline(){},renderStats(){},renderLive(){},
    save(){c.core.materialize(state.days);for(const day of Object.values(state.days))c.status.materializeDay(day);},
  });
  const guardStart=html.includes('function todoHasRecordedHistory(')?'function todoHasRecordedHistory(':'function todoMoveGuard(';
  vm.runInContext(extract('/* TODO_MUTATIONS_CORE_START */','/* TODO_MUTATIONS_CORE_END */')+
    extract('/* STATUS_MUTATIONS_CORE_START */','/* STATUS_MUTATIONS_CORE_END */')+
    extract('function appendTodoMutation(','function appendTodoRestoreIfNeeded(')+
    extract(guardStart,'function nextDateStr(')+extract('function moveTodoTo(','function updateTodoMoveDestCard(')+
    ';globalThis.core=TG_TODO_MUTATIONS;globalThis.status=TG_STATUS_MUTATIONS;',c);
  return {c,state,source,original,undo:()=>undo?.()};
}

test('measured date change retains exact source and creates an unchecked independent plan',()=>{
  const {c,state,source,original}=client({done:true}),before=JSON.stringify(source);
  assert.equal(c.moveTodoTo(original,sourceDate,targetDate),true);
  const next=state.days[targetDate].todos[0];
  assert.equal(JSON.stringify(source),before);
  assert.notEqual(next.id,original.id);assert.equal(next.continuationOf,original.id);
  assert.equal(next.done,false);assert.equal(next.privateExtra,undefined);
  for(const key of ['title','area','areaId','actId','time','end'])assert.equal(next[key],original[key]);
  assert.equal(state.days[targetDate].events.length,0);assert.equal(state.days[targetDate].statusMutations.length,0);
});
test('unmeasured date change keeps identity and existing move mutations',()=>{
  const {c,state,source,original}=client({measured:false});
  assert.equal(c.moveTodoTo(original,sourceDate,targetDate),true);
  assert.equal(source.todos.length,0);assert.equal(state.days[targetDate].todos[0].id,original.id);
  assert.equal(source.todoMutations[0].kind,'move');
});
test('ordinary move undo uses current objects and newer mutation even in the same millisecond',()=>{
  const run=client({measured:false});run.c.moveTodoTo(run.original,sourceDate,targetDate);
  const at=run.state.days[sourceDate].todoMutations[0].at;
  run.c.Date={now:()=>at};run.state.days=copy(run.state.days);run.undo();
  assert.equal(run.state.days[sourceDate].todos[0].id,run.original.id);
  assert.equal(run.state.days[targetDate].todos.length,0);
});
test('invalid and same dates make no changes',()=>{
  for(const target of [sourceDate,'','2026-99-01','2026-02-30','not a date']){
    const run=client(),before=JSON.stringify(run.state);
    assert.equal(run.c.moveTodoTo(run.original,sourceDate,target),false);assert.equal(JSON.stringify(run.state),before);
  }
});
test('repeated date choice reuses the target without overwriting edits or completion',()=>{
  const {c,state,original}=client();c.moveTodoTo(original,sourceDate,targetDate);
  const next=state.days[targetDate].todos[0];next.title='Edited';next.done=true;
  c.moveTodoTo(original,sourceDate,targetDate);
  assert.equal(state.days[targetDate].todos.length,1);assert.equal(next.title,'Edited');assert.equal(next.done,true);
});
test('equal titles without explicit lineage remain independent',()=>{
  const {c,state,original}=client();state.days[targetDate]={...empty(),todos:[{...original,id:'unrelated'}]};
  c.moveTodoTo(original,sourceDate,targetDate);assert.equal(state.days[targetDate].todos.length,2);
});
test('running and unfinalized original cannot change date; no day is fabricated',()=>{
  for(const pending of [false,true]){
    const {c,state,original}=client();const run={todoId:original.id};
    if(pending)state.finalizations=[{running:run}];else state.running=run;
    const before=JSON.stringify(state);assert.equal(c.moveTodoTo(original,sourceDate,targetDate),false);
    assert.equal(JSON.stringify(state),before);
  }
});
test('continuation can move again, or continue again after recording time',()=>{
  const {c,state,source,original}=client();c.moveTodoTo(original,sourceDate,targetDate);
  const next=state.days[targetDate].todos[0];c.moveTodoTo(next,targetDate,laterDate);
  assert.equal(state.days[targetDate].todos.length,0);assert.equal(state.days[laterDate].todos[0].id,next.id);
  state.days[laterDate].events.push({id:'new-event',todoId:next.id,start:'09:00',end:'09:01'});
  c.moveTodoTo(next,laterDate,'2026-09-06');
  assert.equal(source.todos[0].id,original.id);assert.equal(state.days[laterDate].todos[0].id,next.id);
  assert.equal(state.days['2026-09-06'].todos[0].continuationOf,next.id);
});
test('undo removes only the newly prepared plan; original and events survive',()=>{
  const run=client(),before=JSON.stringify(run.source);run.c.moveTodoTo(run.original,sourceDate,targetDate);run.undo();
  assert.equal(JSON.stringify(run.source),before);assert.equal(run.state.days[targetDate].todos.length,0);
  assert.equal(run.state.days[targetDate].todoMutations[0].kind,'delete');
});
test('undo revalidates edits, measurement, completion, pending and subsequent relocation',()=>{
  for(const change of ['edit','measure','done','pending','running','move']){
    const run=client();run.c.moveTodoTo(run.original,sourceDate,targetDate);
    const next=run.state.days[targetDate].todos[0],undo=run.undo;
    if(change==='edit')next.title='New edit';
    if(change==='measure')run.state.days[targetDate].events.push({todoId:next.id,start:'09:00',end:'09:01'});
    if(change==='done')next.done=true;
    if(change==='pending')run.state.finalizations=[{running:{todoId:next.id}}];
    if(change==='running')run.state.running={todoId:next.id};
    if(change==='move'){run.state.days[laterDate]={...empty(),todos:[next]};run.state.days[targetDate].todos=[];}
    const before=JSON.stringify(run.state);undo();assert.equal(JSON.stringify(run.state),before,change);
  }
});
test('stale menu objects resolve current Todo; missing source is a no-op',()=>{
  const {c,state,original}=client(),stale=copy(original);state.days[sourceDate].todos[0].title='Current title';
  c.moveTodoTo(stale,sourceDate,targetDate);assert.equal(state.days[targetDate].todos[0].title,'Current title');
  const before=JSON.stringify(state);assert.equal(c.moveTodoTo({id:'missing'},'2025-01-01',targetDate),false);assert.equal(JSON.stringify(state),before);
});
test('zero/subsecond and cross-midnight linked records stay on their original identity',()=>{
  const {c,state,source,original}=client({measured:false});state.days[laterDate]={...empty(),events:[{todoId:original.id,startTs:1,endTs:1}]};
  c.moveTodoTo(original,sourceDate,targetDate);assert.equal(source.todos[0].id,original.id);
});
test('existing Notion reconciliation creates the new task without moving original',{skip:!decideTodoSync},()=>{
  const {c,state,original}=client();c.moveTodoTo(original,sourceDate,targetDate);const next=state.days[targetDate].todos[0];
  const value=(date,t)=>({date,title:t.title,area:t.area,done:t.done,time:t.time,end:t.end});
  const originalValue=value(sourceDate,original),nextValue=value(targetDate,next);
  assert.equal(decideTodoSync({notion:{value:originalValue},firestore:{value:originalValue},baseline:{lastSynced:originalValue}}).action,'noop');
  assert.equal(decideTodoSync({firestore:{id:next.id,value:nextValue}}).action,'create-notion');
});
