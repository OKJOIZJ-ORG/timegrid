import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import C from '../catalog-core.js';
import TG_CONTINUITY_CORE from '../continuity-core.js';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const previous=execFileSync('git',['show','cea7e2a:index.html'],{cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8',maxBuffer:4*1024*1024});
const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
const serialize=x=>JSON.stringify(x);
function fn(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return html.slice(a,b);}
const base=()=>C.normalize({catalogEnforced:true,areas:[{id:'life',name:'생활'},{id:'study',name:'공부'}],activities:[{id:'meal',name:'식사',area:'생활'},{id:'math',name:'수학',area:'공부'}],routineDefs:[],catalogRevision:0});
const start=new Date(2026,8,3,10).getTime(),date='2026-09-03';
const run=(id='stop',at=start,actId='meal')=>({sessionId:id,actId,startTs:at});
const empty=()=>({events:[],todos:[],routines:[],todoMutations:[],statusMutations:[]});

// Execute production transaction callbacks with read-version validation and
// atomic commits. This harness models retry/interleaving; security rules are
// independently interpreted by the real emulator in catalog-rules.test.mjs.
function database(settings=base(),running=null){
  const data=new Map([['settings',copy(settings)],['running',{running:copy(running),syncRev:7,finalizations:[]}]]);
  const server={data,attempts:0,commits:[],failNextCommit:false,beforeCommitOnce:null};
  const snap=k=>({exists:data.has(k),data:()=>copy(data.get(k))});
  const ref=k=>({key:k,get:async()=>snap(k)});
  server.paths={settings:ref('settings'),running:ref('running'),history:{doc:id=>ref('history/'+id)},days:{doc:id=>ref('days/'+id)},finalizationAcks:{doc:id=>ref('acks/'+id)}};
  server.db={async runTransaction(callback){
    for(let attempt=0;attempt<8;attempt++){
      server.attempts++;
      const reads=new Map(),writes=[];let wrote=false;
      const tx={get:async r=>{assert.equal(wrote,false,'all transaction reads precede writes');const v=copy(data.get(r.key));reads.set(r.key,serialize(v));return {exists:v!==undefined,data:()=>copy(v)};},set:(r,v,opt)=>{wrote=true;writes.push([r.key,copy(v),opt]);}};
      const result=await callback(tx);
      const hook=server.beforeCommitOnce;server.beforeCommitOnce=null;
      if(hook)await hook({reads,writes,attempt});
      if([...reads].some(([key,value])=>serialize(data.get(key))!==value))continue;
      if(server.failNextCommit){server.failNextCommit=false;throw Error('injected-atomic-commit-failure');}
      for(const [key,v,opt]of writes)data.set(key,opt?.merge?{...(data.get(key)||{}),...copy(v)}:copy(v));
      server.commits.push(writes.map(([key])=>key));
      return result;
    }
    throw Error('transaction-retry-limit');
  }};
  return server;
}
function client(server,{local=false,now=start+20_000}={}){
  const state={settings:copy(server.data.get('settings')),days:{},running:copy(server.data.get('running').running),finalizations:[]};
  let seq=0;
  class Clock extends Date {static now(){return now;}}
  const ctx={state,TG_CATALOG:C,TG_CONTINUITY_CORE,console,Date:Clock,JSON,Map,Set,Math,copy,copyRun:copy,uid:p=>p+'_'+(++seq),
    user:local?null:{uid:'synthetic'},ready:true,authKnown:true,cloudUnavailable:false,runLocking:false,runLockLabel:'',navigator:{onLine:true},
    db:server.db,userPaths:()=>server.paths,TG_MAX_RUNNING_MS:20*3600000,outbox:{run:null,days:{}},syncBase:{settings:copy(state.settings),days:{},dayMeta:{},running:copy(state.running),runningVersion:7},
    normSettings:s=>C.normalize({...s,catalogHistory:C.mergeHistory(state.settings.catalogHistory,s?.catalogHistory)}),
    normRun:r=>r?{...r,sessionId:r.sessionId||'legacy-'+r.startTs+'-'+r.actId}:null,effectiveRun:r=>r,runStale:()=>false,
    metaOf:r=>({rev:r.syncRev||0,at:r.updatedAtMs||0}),serverStamp:()=>0,tgDeviceId:()=> 'test-device',
    toMin:value=>{const[h,m]=value.split(':').map(Number);return h*60+m;},
    hhmm:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),
    dateOf:d=>{const[y,m,v]=d.split('-').map(Number);return new Date(y,m-1,v);},
    ensureDay:d=>state.days[d]||=empty(),actById:id=>C.liveActivity(state.settings,id),
    setRunLock:(x,label)=>{ctx.runLocking=x;ctx.runLockLabel=label;},setStatus(){},toast(){},queueRender(){},renderAll(){},save(){},
    persistLocal(){},persistBase(){},persistOutbox(){},persistCatalogLocal:()=>{ctx.saved=copy(state);},markServerOk(){},markRunningServerOk(){},pushNow:async()=>true,
    normalizeCatalogDays:()=>{for(const k of Object.keys(state.days))state.days[k]=C.normalizeDay(state.settings,state.days[k]);},
    syncBarrier:async()=>{state.settings=C.normalize({...copy(server.data.get('settings')),catalogHistory:[...server.data.entries()].filter(([k])=>k.startsWith('history/')).map(([,v])=>copy(v))});},
    window:{},localStorage:{setItem(){}},LS_KEY:'synthetic-local'};
  const s=fn('/* CONTINUITY_CORE_START */','/* CONTINUITY_CORE_END */')
    +fn('/* TODO_MUTATIONS_CORE_START */','/* TODO_MUTATIONS_CORE_END */')
    +fn('/* STATUS_MUTATIONS_CORE_START */','/* STATUS_MUTATIONS_CORE_END */')
    +fn('const EXACT_EVENT_KEYS=','function freeRanges(')
    +fn('function prepareFinalization(','async function swStop(')
    +fn('  function copy(v){ return v==null?v:JSON.parse(JSON.stringify(v)); }','  function normSettings(s){')
    +fn('  function itemKey(x,i,prefix){','  function mergeSettings(')
    +fn('  function markDirty(){','  function userPaths(')
    +fn('  function validateCatalogRevision(raw){','  async function readCatalogHistory(')
    +fn('  function absorbFinalizations(raw){','  async function readAndApply(')
    +fn('  async function flushDay(uid,date){','  async function deleteCatalog(')
    +fn('  async function deleteCatalog(preview){','  function startGate(){')
    +fn('  function startGate(){','  function setRunLock(')
    +fn('  async function requestStart(candidate){','  async function flushRunning(')
    +fn('  function finalizationDates(receipt,days){','  function pushNow(){');
  vm.createContext(ctx);vm.runInContext(s,ctx);return ctx;
}
function publish(server,ctx,r=run(),end=start+20_000){
  const intent=ctx.prepareFinalization(r,end);
  server.data.set('running',{...server.data.get('running'),running:null,finalizations:[copy(intent)]});
  ctx.state.running=null;ctx.state.finalizations=[copy(intent)];return intent;
}
const events=server=>[...server.data.entries()].filter(([k])=>k.startsWith('days/')).flatMap(([,d])=>d.events||[]);
function seedDays(server,ctx,days=ctx.state.days){for(const[d,v]of Object.entries(days)){server.data.set('days/'+d,{...copy(v),syncRev:2});ctx.syncBase.days[d]=copy(v);ctx.syncBase.dayMeta[d]={rev:2,at:0};}}
function oldStopMaterialization(ctx,r,end){
  const slice=(from,to)=>{const a=previous.indexOf(from),b=previous.indexOf(to,a);assert.ok(a>=0&&b>a);return previous.slice(a,b);};
  let seq=0;
  const old={state:ctx.state,Date,JSON,Map,Set,Math,toMin:ctx.toMin,hhmm:ctx.hhmm,dateOf:ctx.dateOf,ensureDay:ctx.ensureDay,uid:p=>'actual-old-'+p+'-'+(++seq)};
  vm.createContext(old);
  vm.runInContext(slice('/* CONTINUITY_CORE_START */','/* CONTINUITY_CORE_END */')+slice('const EXACT_EVENT_KEYS=','function freeRanges('),old);
  assert.equal(old.materializeExactSpan(copy(r),end),true);
}

test('start and deletion remain serializable in both winning orders',async()=>{
  let s=database(),a=client(s),b=client(s);
  assert.equal((await a.requestStart(run('first'))).ok,true);
  await assert.rejects(()=>b.deleteCatalog(C.preview(b.state.settings,'activity','meal')),/CATALOG_RUNNING/);
  assert.equal(s.data.get('running').running.sessionId,'first');
  s=database();a=client(s);b=client(s);
  await a.deleteCatalog(C.preview(a.state.settings,'activity','meal'));
  assert.equal((await b.requestStart(run('stale'))).ok,false);
  assert.equal(s.data.get('running').running,null);
  assert.equal(s.data.get('settings').activities.some(x=>x.id==='meal'),false);
  assert.equal((s.data.get('settings').catalogHistory||[]).length,0);
});

test('unrelated running session survives deletion; affected pending intent blocks it',async()=>{
  const s=database(base(),run('math-run',start,'math')),a=client(s);
  await a.deleteCatalog(C.preview(a.state.settings,'activity','meal'));
  assert.equal(s.data.get('running').running.sessionId,'math-run');
  const pending=database(),b=client(pending);publish(pending,b);
  await assert.rejects(()=>b.deleteCatalog(C.preview(b.state.settings,'activity','meal')),/CATALOG_FINALIZING/);
});

test('online Stop atomically publishes intent; finalizer atomically writes days, ack, and removes pending',async()=>{
  const s=database(base(),run()),a=client(s);
  const stop=await a.requestStop(copy(a.state.running));
  assert.equal(stop.ok,true);
  assert.equal(s.data.get('running').running,null);
  assert.equal(s.data.get('running').finalizations[0].id,'stop');
  assert.equal(events(s).length,0,'Stop publication does not leak a tentative day snapshot');
  await a.acknowledgeFinalizations('synthetic');
  assert.equal(events(s).length,1);
  assert.equal(events(s)[0].endTs,start+20_000);
  assert.equal(s.data.get('running').finalizations.length,0);
  assert.equal(s.data.get('acks/stop').intent.endedAt,start+20_000);
  const committed=s.commits.find(keys=>keys.includes('acks/stop'));
  assert.ok(committed.includes('running')&&committed.includes('days/'+date),'one commit contains all canonical changes');
  await a.deleteCatalog(C.preview(a.state.settings,'activity','meal'));
});

test('Stop does not wait for unrelated history sync and captures the click endpoint',async()=>{
  const s=database(base(),run()),a=client(s);
  let barriers=0;
  a.syncBarrier=async()=>{barriers++;throw Error('unrelated-history-offline');};
  const stop=await a.requestStop(copy(a.state.running));
  assert.equal(stop.ok,true,'an unrelated backlog cannot prevent the running-only Stop transaction');
  assert.equal(barriers,0);
  assert.equal(stop.endedAt,start+20_000);
  assert.deepEqual(s.commits[0],['running']);
});

test('Stop fixes its endpoint before network waits or transaction retries',async()=>{
  const s=database(base(),run()),a=client(s);
  const original=s.db.runTransaction;
  s.db.runTransaction=async callback=>{
    a.Date.now=()=>start+80_000;
    return original(callback);
  };
  const stop=await a.requestStop(copy(a.state.running));
  assert.equal(stop.endedAt,start+20_000);
});

test('atomic commit failure leaves days, pending, and ack unchanged, then retry succeeds',async()=>{
  const s=database(),a=client(s);publish(s,a);
  const before=serialize([...s.data]);s.failNextCommit=true;
  await assert.rejects(()=>a.acknowledgeFinalizations('synthetic'),/injected-atomic-commit-failure/);
  assert.equal(serialize([...s.data]),before);
  assert.equal(a.state.finalizations.length,1);
  await a.acknowledgeFinalizations('synthetic');
  assert.equal(events(s).length,1);assert.equal(a.state.finalizations.length,0);
});

test('a crash after cloud commit recovers from ack without resurrecting a later user deletion',async()=>{
  const s=database(),a=client(s),intent=publish(s,a);
  a.persistCatalogLocal=()=>{throw Error('local-crash-after-commit');};
  await assert.rejects(()=>a.acknowledgeFinalizations('synthetic'),/local-crash-after-commit/);
  assert.ok(s.data.has('acks/stop'));
  s.data.get('days/'+date).events=[];
  const reboot=client(s);reboot.state.finalizations=[copy(intent)];
  await reboot.acknowledgeFinalizations('synthetic');
  assert.equal(events(s).length,0);
  assert.equal(reboot.state.finalizations.length,0);
  assert.deepEqual(s.commits.at(-1),[],'existing ack returns without writes');
});

test('refresh removes a stale acknowledged intent before projection or dirty day upload',async()=>{
  const s=database(),a=client(s),intent=publish(s,a);await a.acknowledgeFinalizations('synthetic');
  s.data.get('days/'+date).events=[];
  const stale=client(s);stale.state.finalizations=[copy(intent)];stale.state.days[date]=empty();
  await stale.refreshFinalizations('synthetic');
  assert.equal(stale.state.finalizations.length,0);
  assert.equal(Object.values(stale.measurementDays()).flatMap(d=>d.events).length,0);
  assert.equal(events(s).length,0);
});

test('latest server predecessor deletion after intent preparation is not undone',async()=>{
  const s=database(),a=client(s);
  a.materializeExactSpan(run('earlier'),start+20_000);seedDays(s,a);
  publish(s,a,run('later',start+50_000),start+70_000);
  s.data.get('days/'+date).events=[];
  await a.acknowledgeFinalizations('synthetic');
  assert.equal(events(s).length,1);
  assert.equal(events(s)[0].startTs,start+50_000);
  assert.equal(events(s)[0].endTs,start+70_000);
  assert.equal(a.state.days[date].events.length,1,'stale canonical client predecessor also clears');
});

test('a conflicting day edit forces production finalizer retry against the latest revision',async()=>{
  const s=database(),a=client(s);
  a.materializeExactSpan(run('earlier'),start+20_000);seedDays(s,a);
  publish(s,a,run('later',start+50_000),start+70_000);
  s.beforeCommitOnce=()=>{s.data.get('days/'+date).events=[];s.data.get('days/'+date).syncRev++;};
  await a.acknowledgeFinalizations('synthetic');
  assert.equal(s.attempts,2,'read-version conflict retried the actual callback');
  assert.equal(events(s)[0].startTs,start+50_000);
  assert.equal(s.data.get('days/'+date).syncRev,4);
});

test('two simultaneous finalizers converge to one immutable ack and one saved span',async()=>{
  const s=database(),a=client(s),intent=publish(s,a),b=client(s);b.state.finalizations=[copy(intent)];
  await Promise.all([a.acknowledgeFinalizations('synthetic'),b.acknowledgeFinalizations('synthetic')]);
  assert.equal(events(s).length,1);
  assert.equal(s.commits.filter(keys=>keys.includes('acks/stop')).length,1);
  assert.ok(s.attempts>=3,'losing finalizer retries and observes the ack');
  assert.equal(a.state.finalizations.length+b.state.finalizations.length,0);
});

test('unrelated local Todo edit while finalization waits survives merge and later upload',async()=>{
  const s=database(),a=client(s);a.state.days[date]={...empty(),todos:[{id:'t',name:'Before'}]};seedDays(s,a);publish(s,a);
  s.beforeCommitOnce=()=>{a.state.days[date].todos[0].name='During transaction';};
  await a.acknowledgeFinalizations('synthetic');
  assert.equal(a.state.days[date].todos[0].name,'During transaction');
  assert.equal(s.data.get('days/'+date).todos[0].name,'Before');
  await a.flushDay('synthetic',date);
  assert.equal(s.data.get('days/'+date).todos[0].name,'During transaction');
  assert.equal(events(s).length,1);
});

for(const winner of ['finalizer','day'])test('concurrent Stop finalization and generic day upload preserve both changes: '+winner,async()=>{
  const s=database(),a=client(s);
  a.materializeExactSpan(run('earlier'),start+20_000);seedDays(s,a);
  a.state.days[date].todos.push({id:'new-todo',name:'Preserve local edit'});
  a.markDirty();
  publish(s,a,run('later',start+50_000),start+70_000);
  if(winner==='finalizer'){
    s.beforeCommitOnce=()=>a.acknowledgeFinalizations('synthetic');
    await a.flushDay('synthetic',date);
  }else{
    s.beforeCommitOnce=()=>a.flushDay('synthetic',date);
    await a.acknowledgeFinalizations('synthetic');
  }
  assert.equal(events(s).length,1);assert.equal(events(s)[0].endTs,start+70_000);
  assert.equal(s.data.get('days/'+date).todos[0].id,'new-todo');
  assert.equal(a.state.days[date].events[0].endTs,start+70_000);
  assert.equal(a.state.days[date].todos[0].id,'new-todo');
  assert.ok(s.data.has('acks/later'));
});

for(const edit of ['note','delete'])test('priority finalization respects queued predecessor '+edit+' before deciding continuity',async()=>{
  const s=database(),a=client(s);
  a.materializeExactSpan({...run('earlier'),note:'original'},start+20_000);seedDays(s,a);
  if(edit==='note')a.state.days[date].events[0].note='different';
  else a.state.days[date].events=[];
  a.markDirty();
  publish(s,a,{...run('later',start+50_000),note:'original'},start+70_000);
  await a.acknowledgeFinalizations('synthetic');
  const result=events(s);
  assert.equal(result.length,edit==='note'?2:1);
  const later=result.find(e=>(e.sessionIds||[]).includes('later'));
  assert.equal(later.startTs,start+50_000);assert.equal(later.endTs,start+70_000);
  if(edit==='note')assert.equal(result.find(e=>(e.sessionIds||[]).includes('earlier')).note,'different');
  assert.deepEqual(copy(a.state.days[date].events),copy(s.data.get('days/'+date).events));
});

test('pending display projection does not enter actual flushDay payload',async()=>{
  const s=database(),a=client(s);a.state.days[date]={...empty(),todos:[{id:'t',name:'Local edit'}]};publish(s,a);
  assert.equal(a.measurementDays()[date].events.length,1);
  a.markDirty();await a.flushDay('synthetic',date);
  assert.equal(events(s).length,0);
  assert.equal(s.data.get('days/'+date).todos[0].name,'Local edit');
  assert.equal(s.data.get('running').finalizations.length,1);
});

test('live continuity projection cannot leak through generic day upload or raw running identity',async()=>{
  const live=run('live',start+50_000),s=database(base(),live),a=client(s,{now:start+70_000});
  a.materializeExactSpan(run('earlier'),start+20_000);seedDays(s,a);
  const canonical=copy(events(s)),raw=copy(a.state.running);
  a.state.days[date].todos.push({id:'local-todo',name:'Unrelated edit'});
  const projected=a.measurementDays()[date].events;
  assert.equal(projected.length,1);assert.equal(projected[0].endTs,start+70_000);
  assert.equal(projected[0].runningProjection,true);
  a.markDirty();await a.flushDay('synthetic',date);
  assert.deepEqual(events(s),canonical);
  assert.deepEqual(copy(a.state.running),raw);
  assert.deepEqual(s.data.get('running').running,raw);
  assert.equal(s.data.get('days/'+date).todos[0].id,'local-todo');
});

test('cross-midnight finalization reads and commits every lineage fragment, preserving exact overlap',async()=>{
  const s=database(),a=client(s),midnight=new Date(2026,8,4).getTime();
  a.materializeExactSpan(run('earlier',midnight-40_000),midnight-20_000);seedDays(s,a);
  publish(s,a,run('later',midnight+20_000),midnight+40_000);
  await a.acknowledgeFinalizations('synthetic');
  const rows=events(s);
  assert.equal(rows.length,2);
  assert.equal(new Set(rows.map(e=>e.continuityId)).size,1);
  assert.equal(rows.reduce((v,e)=>v+e.endTs-e.startTs,0),80_000);
  assert.ok(s.commits.at(-1).includes('days/2026-09-03')&&s.commits.at(-1).includes('days/2026-09-04'));
});

test('zero-duration Stop commits ack and removes pending without fabricating day writes',async()=>{
  const s=database(),a=client(s);publish(s,a,run('zero'),start);
  await a.acknowledgeFinalizations('synthetic');
  assert.equal(events(s).length,0);
  assert.equal(s.data.get('running').finalizations.length,0);
  assert.equal(s.data.get('acks/zero').intent.zeroSpan,true);
  assert.equal(s.commits.at(-1).some(k=>k.startsWith('days/')),false);
});

test('offline account Stop durably stores intent only and storage failure rolls back',async()=>{
  const s=database(base(),run()),a=client(s);a.navigator.onLine=false;
  const stopped=await a.requestStop(run());
  assert.equal(stopped.ok,true);assert.equal(stopped.offline,true);assert.equal(stopped.local,false);
  assert.equal(a.saved.running,null);assert.equal(a.saved.finalizations[0].scope,'cloud');
  assert.deepEqual(a.saved.days,{});
  assert.equal(s.data.get('running').running.sessionId,'stop','offline does not pretend server accepted Stop');
  const b=client(s);b.navigator.onLine=false;b.persistCatalogLocal=()=>{throw Error('quota');};
  assert.equal((await b.requestStop(run())).ok,false);
  assert.equal(b.state.running.sessionId,'stop');assert.equal(b.state.finalizations.length,0);
});

test('local delete storage rollback and account auth loss preserve original catalog',async()=>{
  const s=database(),a=client(s,{local:true});a.state.days={d:{events:[],todos:[{id:'t',actId:'meal',area:'생활'}]}};
  a.persistCatalogLocal=()=>{throw Error('full');};
  await assert.rejects(()=>a.deleteCatalog(C.preview(a.state.settings,'activity','meal')),/storage/);
  assert.equal(a.state.settings.activities.length,2);assert.equal(a.state.days.d.todos[0].actId,'meal');
  const b=client(s,{local:true});b.cloudUnavailable=true;
  await assert.rejects(()=>b.deleteCatalog(C.preview(b.state.settings,'activity','meal')),/cloud-unavailable/);
});

test('guarded old-client Stop preserves endpoint until atomic finalization clears its guard',async()=>{
  const s=database(),a=client(s,{now:start+90_000});
  s.data.set('running',{running:null,finalizations:[],syncRev:8,updatedAtMs:start+20_000,legacyStopGuard:{running:run('legacy'),installedAt:start+1}});
  a.absorbFinalizations(s.data.get('running'));
  assert.equal(a.state.finalizations[0].endedAt,start+20_000);
  await assert.rejects(()=>a.deleteCatalog(C.preview(a.state.settings,'activity','meal')),/CATALOG_FINALIZING/);
  await a.acknowledgeFinalizations('synthetic');
  assert.equal(events(s)[0].endTs,start+20_000);
  assert.equal(s.data.get('acks/legacy').source,'legacy-stop');
  assert.equal(s.data.get('running').legacyStopGuard,null);
});

test('legacy transition strips actual old-writer speculative span, restores predecessor, and preserves unrelated edits',async()=>{
  const s=database(),a=client(s);a.state.legacyCatalogClient=true;
  a.materializeExactSpan(run('earlier'),start+20_000);seedDays(s,a);
  const predecessor=copy(a.state.days[date].events),legacy=run('legacy',start+50_000);
  oldStopMaterialization(a,legacy,start+70_000);
  a.state.days[date].todos.push({id:'unrelated-todo',title:'Keep local edit'});
  const independent={id:'manual',actId:'math',start:'12:00',end:'12:15'};
  a.state.days[date].events.push(independent);
  const oldCache=copy(a.state.days),preimages=[];
  a.localStorage.setItem=(key,value)=>preimages.push([key,JSON.parse(value)]);
  const raw={running:null,finalizations:[],legacyStopGuard:{running:legacy},updatedAtMs:start+70_000};
  await a.reconcileLegacyStops('synthetic',raw);
  assert.equal(a.state.legacyCatalogClient,false);
  assert.deepEqual(copy(a.state.days[date].events).sort((x,y)=>x.id.localeCompare(y.id)),[...predecessor,independent].sort((x,y)=>x.id.localeCompare(y.id)));
  assert.equal(a.state.days[date].todos[0].title,'Keep local edit');
  assert.equal(preimages.length,1);
  assert.deepEqual(preimages[0][1].days,oldCache);
  assert.deepEqual(copy(a.syncBase.days[date].events),predecessor,'sync base stays canonical');
});

test('legacy transition consults immutable ack after pending/guard disappeared',async()=>{
  const s=database(),a=client(s);a.state.legacyCatalogClient=true;
  const legacy=run('legacy');oldStopMaterialization(a,legacy,start+20_000);
  const intent=a.prepareFinalization(legacy,start+20_000);
  s.data.set('acks/legacy',{id:'legacy',intent:copy(intent)});
  // The server user has since removed the acknowledged measurement.
  s.data.set('days/'+date,{...empty(),syncRev:5});
  await a.reconcileLegacyStops('synthetic',{running:null,finalizations:[]});
  assert.equal(a.state.days[date].events.length,0,'old cached measured span cannot be re-uploaded after later deletion');
  assert.equal(events(s).length,0);
  assert.equal(a.state.legacyCatalogClient,false);
});

test('legacy transition refuses ambiguous modified span without changing local state or completion marker',async()=>{
  const s=database(),a=client(s);a.state.legacyCatalogClient=true;
  const legacy=run('legacy');oldStopMaterialization(a,legacy,start+20_000);
  a.state.days[date].events[0].endTs+=1000;
  const before=serialize(a.state);
  await assert.rejects(()=>a.reconcileLegacyStops('synthetic',{running:null,finalizations:[],legacyStopGuard:{running:legacy},updatedAtMs:start+20_000}),/legacy-stop-local-conflict/);
  assert.equal(serialize(a.state),before);
});

test('legacy preimage storage failure leaves speculative data and recovery marker untouched',async()=>{
  const s=database(),a=client(s);a.state.legacyCatalogClient=true;
  const legacy=run('legacy');oldStopMaterialization(a,legacy,start+20_000);
  const before=serialize(a.state);a.localStorage.setItem=()=>{throw Error('legacy-backup-quota');};
  await assert.rejects(()=>a.reconcileLegacyStops('synthetic',{running:null,finalizations:[],legacyStopGuard:{running:legacy},updatedAtMs:start+20_000}),/legacy-backup-quota/);
  assert.equal(serialize(a.state),before);
});

for(const kind of ['midnight-continuity','overlap-clipping'])test('legacy transition reverses actual old-writer '+kind+' without losing precursor time',async()=>{
  const s=database(),a=client(s);a.state.legacyCatalogClient=true;
  const midnight=new Date(2026,8,4).getTime();
  let legacy,end;
  if(kind==='midnight-continuity'){
    a.materializeExactSpan(run('earlier',midnight-40_000),midnight-20_000);
    legacy=run('legacy',midnight+20_000);end=midnight+40_000;
  }else{
    a.materializeExactSpan(run('earlier',start,'math'),start+180_000);
    legacy=run('legacy',start+70_000);end=start+80_000;
  }
  seedDays(s,a);const before=copy(a.state.days);
  oldStopMaterialization(a,legacy,end);
  await a.reconcileLegacyStops('synthetic',{running:null,finalizations:[],legacyStopGuard:{running:legacy},updatedAtMs:end});
  const beforeEvents=Object.values(before).flatMap(d=>d.events),afterEvents=Object.values(a.state.days).flatMap(d=>d.events);
  assert.deepEqual(copy(afterEvents),beforeEvents);
  assert.equal(a.state.legacyCatalogClient,false);
});
