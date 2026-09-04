import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
const core=html.slice(html.indexOf('/* SYNC_OBSERVATION_CORE_START */'),html.indexOf('/* SYNC_OBSERVATION_CORE_END */'))
const ctx=vm.createContext({})
vm.runInContext(core+';this.core=TG_SYNC_OBSERVATION',ctx)
const policy=ctx.core
assert.equal(policy.expectsCloud(null,null),false,'a new guest retains local tracking')
assert.equal(policy.expectsCloud(null,'prior-account'),true,'legacy linked installations survive a cleared marker')
assert.equal(policy.expectsCloud('prior-account',null),true)
assert.equal(policy.expectsCloud('local','prior-account'),false,'explicit logout opts into local scope')
const connected={authKnown:true,signedIn:true,expectedCloud:true,ready:true,online:true,pending:false,matches:true,confirmedAt:1000,now:1001}
assert.equal(policy.view(connected).kind,'ok')
for(const patch of [{ready:false},{online:false}])assert.equal(policy.view({...connected,...patch}).kind,'pending','initial/connectivity wait belongs to the timer button and account panel')
assert.doesNotMatch(core,/서버 연결 대기 · 기기 기록 보관 중/)
for(const patch of [{pending:true},{matches:false},{confirmedAt:0},{now:91001}]) {
  assert.equal(policy.view({...connected,...patch}).kind,'warn',JSON.stringify(patch))
}
assert.equal(policy.view({...connected,now:91000}).kind,'ok','90 second existing confirmation boundary is inclusive')
assert.match(policy.view({...connected,signedIn:false}).text,/연결 끊김/)
assert.match(policy.view({...connected,signedIn:false,expectedCloud:false}).text,/이 기기에만 저장/)
assert.equal(policy.view({...connected,authKnown:false}).kind,'pending')

const node={dataset:{},hidden:false},label={textContent:''}
let visual={kind:'ok',text:'confirmed'}
const paintCtx=vm.createContext({document:{getElementById:id=>id==='trackingSync'?node:label},TG_SYNC_OBSERVATION:{view:()=>visual},
 authKnown:true,user:{},cloudUnavailable:false,expectsCloud:()=>true,ready:true,navigator:{onLine:true},outbox:{run:null},
 state:{running:null},syncBase:{running:null},same:()=>true,normRun:x=>x,lastRunningServerAt:1000})
const paintStart=html.indexOf('  function paintTrackingSync(){'),paintEnd=html.indexOf('  function paintStatus(',paintStart)
vm.runInContext(html.slice(paintStart,paintEnd)+';this.paint=paintTrackingSync',paintCtx)
paintCtx.paint();assert.equal(node.hidden,true,'healthy confirmation is silent')
visual={kind:'pending',text:'initializing'};paintCtx.paint();assert.equal(node.hidden,true)
visual={kind:'warn',text:'reconnect'};paintCtx.paint();assert.equal(node.hidden,false);assert.equal(label.textContent,'reconnect')

// Execute the production auth-null handler; neither a timer nor its outbox is reset.
const authHandler=html.slice(html.indexOf('  function onSignedOut(){'),html.indexOf('  async function login(){'))
const calls=[]
const authCtx=vm.createContext({authKnown:false,cloudUnavailable:false,ready:true,user:{},lastRunningServerAt:99,pushTimer:null,
  expectsCloud:()=>true,stopListeners:()=>calls.push('stop'),paintUser:()=>{},paintTrackingSync:()=>{},queueRender:()=>{},
  localStorage:{removeItem:()=>{throw Error('passive auth loss must preserve account expectation')}}})
vm.runInContext(authHandler+';onSignedOut()',authCtx)
assert.equal(authCtx.cloudUnavailable,true)
assert.equal(authCtx.ready,false)
assert.equal(authCtx.user,null)
assert.equal(authCtx.lastRunningServerAt,0)
assert.deepEqual(calls,['stop'])
assert.doesNotMatch(authHandler,/state\.running\s*=|outbox\s*=/)
assert.match(html,/id="trackingSyncText"/)
assert.match(html,/function tickLiveStatus\(\)\{\s*paintTrackingSync\(\)/)
assert.match(html,/!snap\.metadata\.fromCache&&!snap\.metadata\.hasPendingWrites/,'local cached callbacks cannot confirm server receipt')
assert.match(html,/localStorage\.setItem\(CLOUD_ACCOUNT_KEY,"local"\)/)
console.log('Sync scope, guest and reauthentication preservation tests passed')
