import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fn(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return html.slice(a,b);}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

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
