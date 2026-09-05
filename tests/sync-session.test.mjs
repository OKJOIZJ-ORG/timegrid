import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const section=(a,b)=>{const start=html.indexOf(a),end=html.indexOf(b,start+a.length);assert.ok(start>=0&&end>start,a);return html.slice(start,end);};
const helpers=html.includes('  /* SYNC_SESSION_CORE_START */')?section('  /* SYNC_SESSION_CORE_START */','  /* SYNC_SESSION_CORE_END */'):'';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
const empty=()=>({events:[],todos:[],routines:[],todoMutations:[],statusMutations:[]});
function client(){
  const c=vm.createContext({user:{uid:'first'},auth:{currentUser:{uid:'first'}},ready:true,authKnown:true,cloudUnavailable:false,
    heartbeatBusy:false,connectionPromise:null,connectionUid:null,pushTimer:null,lastRunningServerAt:0,runLocking:false,
    state:{settings:{catalogRevision:0},days:{},running:null,finalizations:[]},syncBase:{running:null,runningVersion:0,days:{},dayMeta:{}},outbox:{run:null,days:{}},
    navigator:{onLine:true},document:{visibilityState:'visible'},Set,Map,copy,copyRun:copy,stable:JSON.stringify,same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    normRun:x=>x,effectiveRun:x=>x,normDay:x=>copy(x||empty()),emptyDay:empty,metaOf:r=>({rev:r.syncRev||0,at:r.updatedAtMs||0}),
    expectsCloud:()=>true,stopListeners(){},paintUser(){},paintTrackingSync(){},queueRender(){},setStatus(){},markServerOk(){},markRunningServerOk(){},
    persistLocal(){},persistCatalogLocal(){},persistBase(){},persistOutbox(){},markDirty(){},schedulePush(){},validateCatalogRevision(){},
    setRunLock(on){c.runLocking=on;},toast(){},serverStamp:()=>0,tgDeviceId:()=> 'fixture',
    TG_TODO_MUTATIONS:{materialize(){}},TG_STATUS_MUTATIONS:{materializeDay(){}},
    absorbFinalizations:r=>c.state.finalizations.push(...(r.finalizations||[])),
    applyRemoteSettings:r=>{c.state.settings=copy(r);},applyRemoteDay:(date,r)=>{c.state.days[date]=copy(r);},
    mergeDay:(_base,local,remote)=>({...copy(remote),...copy(local)})});
  vm.runInContext(helpers+section('  function onSignedOut(){','  async function login(){'),c);
  return c;
}
function changeAccount(c,uid){c.onSignedOut();c.user={uid};c.auth.currentUser={uid};c.ready=true;}

for(const nextUid of ['second','first'])test('late heartbeat is ignored after auth generation changes to '+nextUid,async()=>{
  const c=client(),read=deferred();
  c.userPaths=()=>({running:{get:()=>read.promise}});
  vm.runInContext(section('  function applyRemoteRunning(raw,','  function validateCatalogRevision(')+section('  async function heartbeat(){','  function refreshStatus(){'),c);
  const task=c.heartbeat();changeAccount(c,nextUid);
  read.resolve({exists:true,data:()=>({syncRev:99,running:{sessionId:'old-session'},finalizations:[{id:'old-stop',scope:'cloud'}]})});
  await task;
  assert.equal(c.state.running,null);assert.equal(c.state.finalizations.length,0);assert.equal(c.syncBase.runningVersion,0);
});

test('late bootstrap read cannot install old account settings, days or pending',async()=>{
  const c=client(),read=deferred();c.readCatalogHistory=async()=>[];c.reconcileLegacyStops=async()=>{};
  c.userPaths=()=>({settings:{get:()=>read.promise},days:{get:async()=>({forEach(fn){fn({id:'old-date',data:()=>({events:[{id:'old-event'}]})});}})},running:{get:async()=>({exists:true,data:()=>({finalizations:[{id:'old-stop'}]})})}});
  vm.runInContext(section('  async function readAndApply(uid,','  async function flushSettings('),c);
  const task=c.readAndApply('first',false,true).catch(e=>e);changeAccount(c,'second');
  read.resolve({exists:true,data:()=>({catalogRevision:0,areas:[{id:'old-area'}]})});await task;
  assert.equal(c.state.settings.areas,undefined);assert.equal(Object.keys(c.state.days).length,0);assert.equal(c.state.finalizations.length,0);
});

test('queued settings and day listeners from a previous login cannot apply or delete',()=>{
  const c=client(),callbacks={};
  c.userPaths=()=>({settings:{onSnapshot(fn){callbacks.settings=fn;}},days:{onSnapshot(fn){callbacks.days=fn;}},running:{onSnapshot(_options,fn){callbacks.running=fn;}}});
  vm.runInContext(section('  function startListeners(uid){','  async function bootstrap('),c);
  c.startListeners('first');changeAccount(c,'first');
  c.state.days.keep=empty();c.syncBase.days.keep=empty();
  callbacks.settings({exists:true,data:()=>({catalogRevision:0,old:true}),metadata:{fromCache:false}});
  callbacks.days({docChanges:()=>[{type:'removed',doc:{id:'keep'}}],metadata:{fromCache:false}});
  assert.equal(c.state.settings.old,undefined);assert.ok(c.state.days.keep);
});

test('late day transaction response preserves the current account and its outbox',async()=>{
  const c=client(),commit=deferred();c.state.days.date=empty();c.outbox.days.date={at:1};
  c.userPaths=()=>({days:{doc:()=>({})}});c.db={runTransaction:()=>commit.promise};
  vm.runInContext(section('  async function flushDay(uid,date){','  async function deleteCatalog('),c);
  const task=c.flushDay('first','date').catch(e=>e);changeAccount(c,'second');
  c.state.days.date={...empty(),todos:[{id:'second-todo'}]};c.outbox.days.date={at:77};
  commit.resolve({value:{...empty(),events:[{id:'old-event'}]},meta:{rev:90,at:90}});await task;
  assert.equal(c.syncBase.days.date,undefined);assert.equal(c.outbox.days.date.at,77);assert.equal(c.state.days.date.events.length,0);
});

test('auth change during Stop transaction read prevents publication in that expired session',async()=>{
  const c=client(),read=deferred();let writes=0;
  c.state.running={sessionId:'stop',actId:'act',startTs:1};
  c.userPaths=()=>({running:{}});c.prepareFinalization=(running,endedAt)=>({id:running.sessionId,running,endedAt});
  c.db={runTransaction:callback=>callback({get:()=>read.promise,set(){writes++;}})};
  vm.runInContext(section('  async function requestStop(candidate){','  async function flushRunning('),c);
  const task=c.requestStop(copy(c.state.running));changeAccount(c,'first');c.state.running={sessionId:'new-login'};
  read.resolve({exists:true,data:()=>({running:{sessionId:'stop'},syncRev:1})});const result=await task;
  assert.equal(writes,0);assert.equal(result.ok,false);assert.equal(c.state.running.sessionId,'new-login');
});

test('same-UID relogin starts a fresh bootstrap after an expired connection settles',async()=>{
  const c=client(),token=deferred();let requests=0,bootstraps=0;
  const account={uid:'first',getIdTokenResult(){requests++;return requests===1?token.promise:Promise.resolve({claims:{timegridOwner:true}});}};
  Object.assign(c,{user:null,auth:{currentUser:account},OWNER_CLAIM:'timegridOwner',CLOUD_ACCOUNT_KEY:'fixture-account',
    localStorage:{setItem(){}},bootstrap:async()=>{bootstraps++;},startListeners(){},pushNow:async()=>true,hasDirty:()=>false,lastServerOkAt:1,setLiveStatus(){}});
  vm.runInContext(section('  function onSignedIn(u){','  function onSignedOut(){'),c);
  const old=c.onSignedIn(account);c.onSignedOut();const fresh=c.onSignedIn(account);
  token.resolve({claims:{timegridOwner:true}});await Promise.all([old,fresh]);
  assert.equal(requests,2);assert.equal(bootstraps,1);assert.equal(c.ready,true);assert.equal(c.user.uid,'first');
});

test('late positive ack from a previous login cannot clear a same-UID current pending receipt',async()=>{
  const c=client(),ack=deferred();c.state.finalizations=[{id:'saved',scope:'cloud'}];
  c.userPaths=()=>({finalizationAcks:{doc:()=>({get:()=>ack.promise})}});
  vm.runInContext(section('  /* FINALIZATION_OBSERVATION_CORE_START */','  /* FINALIZATION_OBSERVATION_CORE_END */')+section('  async function refreshFinalizations(uid,','  async function acknowledgeFinalizations('),c);
  const old=c.refreshFinalizations('first',{finalizations:[]});changeAccount(c,'first');
  ack.resolve({exists:true});await old;
  assert.equal(c.state.finalizations.length,1);
});
