import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fn(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return html.slice(a,b);}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('confirmed ack removal repaints the timer without waiting for the next heartbeat',async()=>{
  const receipt={id:'saved',scope:'cloud'},state={finalizations:[receipt]};let renders=0;
  const ctx=vm.createContext({state,Set,copy:x=>JSON.parse(JSON.stringify(x)),user:{uid:'synthetic'},
    userPaths:()=>({running:{get:async()=>({data:()=>({finalizations:[]})})},finalizationAcks:{doc:()=>({get:async()=>({exists:true})})}}),
    persistCatalogLocal(){},queueRender(){renders++}});
  vm.runInContext(fn('  /* FINALIZATION_OBSERVATION_CORE_START */','  /* FINALIZATION_OBSERVATION_CORE_END */')+fn('  async function refreshFinalizations(uid,','  async function acknowledgeFinalizations(uid){'),ctx);
  await ctx.refreshFinalizations('synthetic');
  assert.equal(state.finalizations.length,0);
  assert.equal(renders,1,'server-completed Stop must update the disabled button now, not on the 60s heartbeat');
});

function observationClient(){
  const state={finalizations:[{id:'saved',scope:'cloud'}],running:null};
  const ctx=vm.createContext({state,user:{uid:'first'},Set,Map,copy:x=>JSON.parse(JSON.stringify(x)),
    normRun:r=>r,persistCatalogLocal(){},queueRender(){ctx.renders++},renders:0});
  vm.runInContext(fn('  /* FINALIZATION_OBSERVATION_CORE_START */','  /* FINALIZATION_OBSERVATION_CORE_END */')+fn('  async function refreshFinalizations(uid,','  async function acknowledgeFinalizations(uid){'),ctx);
  return ctx;
}
test('positive completion survives stale pending and legacy-guard observations',()=>{
  const c=observationClient();c.applyFinalizationAcks('first',['saved']);
  c.absorbFinalizations({finalizations:[{id:'saved',scope:'cloud'}]});
  c.absorbFinalizations({running:null,legacyStopGuard:{running:{sessionId:'saved'}},updatedAtMs:1});
  assert.equal(c.state.finalizations.length,0);assert.equal(c.renders,1);
  c.absorbFinalizations({finalizations:[{id:'new',scope:'cloud'}]});
  assert.equal(c.state.finalizations[0].id,'new','a distinct Stop remains pending');
  c.user={uid:'second'};c.absorbFinalizations({finalizations:[{id:'saved',scope:'cloud'}]});
  assert.equal(c.state.finalizations.length,2,'positive evidence is scoped by account');
});
test('absence, failed reads and late previous-account completions do not clear pending',async()=>{
  const c=observationClient();
  c.userPaths=()=>({finalizationAcks:{doc:()=>({get:async()=>({exists:false})})}});
  await c.refreshFinalizations('first',{finalizations:[]});
  assert.equal(c.state.finalizations.length,1,'remote absence alone is not completion');
  c.userPaths=()=>({finalizationAcks:{doc:()=>({get:async()=>{throw Error('offline')}})}});
  await assert.rejects(c.refreshFinalizations('first',{finalizations:[]}),/offline/);
  assert.equal(c.state.finalizations.length,1);assert.equal(c.renders,0);
  const ack=deferred();c.userPaths=()=>({finalizationAcks:{doc:()=>({get:()=>ack.promise})}});
  const read=c.refreshFinalizations('first',{finalizations:[]});c.user={uid:'second'};
  ack.resolve({exists:true});await read;
  assert.equal(c.state.finalizations.length,1);assert.equal(c.renders,0);
});
test('independent ack reads apply each completed receipt without waiting for another stalled read',async()=>{
  const c=observationClient(),slow=deferred();
  c.state.finalizations.push({id:'slow',scope:'cloud'},{id:'local',scope:'local'});
  c.userPaths=()=>({finalizationAcks:{doc:id=>({get:()=>id==='slow'?slow.promise:Promise.resolve({exists:true})})}});
  const read=c.refreshFinalizations('first',{finalizations:[]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(Array.from(c.state.finalizations,f=>f.id),['slow','local']);assert.equal(c.renders,1);
  slow.resolve({exists:true});await read;
  assert.equal(c.state.finalizations.length,1);assert.equal(c.state.finalizations[0].scope,'local');
});

test('timer post-action sync never waits for unrelated history or locks a confirmed running session',async()=>{
  const calls=[],pending=deferred();
  const ctx=vm.createContext({user:{uid:'synthetic'},ready:true,navigator:{onLine:true},outbox:{run:null},
    syncBarrier:()=>{throw Error('whole-account barrier must not be in timer post-action path');},
    setRunLock:()=>{throw Error('general history must not lock the timer');},
    finalizePending:()=>{calls.push('finalize');return pending.promise;},
    schedulePush:()=>calls.push('background'),queueRender(){},hasDirty:()=>true,setLiveStatus(){},setStatus(){}});
  vm.runInContext(fn('  async function syncAction(kind){','  async function heartbeat(){'),ctx);
  assert.equal(await ctx.syncAction('start'),true);assert.deepEqual(calls,['background']);
  const stopping=ctx.syncAction('stop');assert.deepEqual(calls,['background','finalize']);
  pending.resolve();assert.equal(await stopping,true);assert.equal(calls.at(-1),'background');
});

test('foreground and background share a finalizer; failure releases ownership for retry',async()=>{
  let count=0;const pending=deferred();
  const ctx=vm.createContext({finalizationPromise:null,acknowledgeFinalizations:()=>{count++;return pending.promise;}});
  vm.runInContext(fn('  function finalizePending(uid){','  function pushNow(){'),ctx);
  const a=ctx.finalizePending('synthetic'),b=ctx.finalizePending('synthetic');assert.equal(a,b);assert.equal(count,1);
  pending.resolve();await a;assert.equal(ctx.finalizationPromise,null);
  ctx.acknowledgeFinalizations=async()=>{throw Error('offline');};
  await assert.rejects(ctx.finalizePending('synthetic'),/offline/);assert.equal(ctx.finalizationPromise,null);
});

test('background drain prioritizes Stop publication and finalization before queued settings/days',async()=>{
  const calls=[],outbox={run:{type:'clear'},settingsAt:1,days:{a:{},b:{}}};
  const ctx=vm.createContext({user:{uid:'synthetic'},db:{},ready:true,DEMO:false,outbox,flushPromise:null,flushAgain:false,flushing:false,
    markDirty(){},refreshFinalizations:async()=>calls.push('refresh'),
    flushRunning:async()=>{calls.push('stop');outbox.run=null;},
    finalizePending:async()=>calls.push('finalize'),flushSettings:async()=>{calls.push('settings');outbox.settingsAt=0;},
    flushDay:async(_,date)=>{calls.push(date);delete outbox.days[date];},
    hasDirty:()=>!!outbox.run||!!outbox.settingsAt||Object.keys(outbox.days).length>0,
    schedulePush(){},setStatus(){},persistBase(){},persistOutbox(){},persistLocal(){},lastServerOkAt:0});
  vm.runInContext(fn('  function pushNow(){','  function schedulePush(){'),ctx);
  assert.equal(await ctx.pushNow(),true);
  assert.deepEqual(calls,['refresh','stop','finalize','settings','finalize','a','finalize','b']);
});

test('incomplete bootstrap retries on resume even without cloudUnavailable; duplicate attempts coalesce',async()=>{
  const calls=[],pending=deferred();
  const ctx=vm.createContext({user:{uid:'synthetic'},ready:false,cloudUnavailable:false,navigator:{onLine:true},
    auth:{currentUser:{uid:'synthetic'}},connectionPromise:null,connectionUid:null,
    connectSignedIn:()=>{calls.push('connect');return pending.promise;},
    heartbeat:()=>calls.push('heartbeat'),markDirty:()=>calls.push('dirty'),pushNow:()=>calls.push('push')});
  vm.runInContext(fn('  function onSignedIn(u){','  async function connectSignedIn(u){')+fn('    function resume(){','    document.addEventListener("visibilitychange"'),ctx);
  ctx.resume();ctx.resume();assert.deepEqual(calls,['connect']);
  pending.resolve();await ctx.connectionPromise;
  ctx.ready=true;ctx.resume();assert.deepEqual(calls,['connect','heartbeat','dirty','push']);
});
