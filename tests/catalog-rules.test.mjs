import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// --remote evaluates inline rules with synthetic auth/documents and function mocks.
// It never creates a ruleset/release or submits Firestore document writes.
// https://firebase.google.com/docs/reference/rules/rest/v1/projects/test
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const previous=execFileSync('git',['show','cea7e2a:index.html'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const source=fs.readFileSync(path.join(root,'firestore.rules'),'utf8').replace(/\r\n?/g,'\n');
const syntheticUid='catalog-rule-synthetic-user';
const documentPath=suffix=>`/databases/(default)/documents/users/${syntheticUid}/${suffix}`;
const stamp=1788390000000;
const desired={actId:'activity-live',sessionId:'session-synthetic',startTs:stamp};
const merged={version:2,areas:[{id:'area-live',name:'Area',color:'#888888'}],activities:[{id:'activity-live',areaId:'area-live',area:'Area',name:'Activity',color:'#999999'}],routineDefs:[],events:[],todos:[],routines:[],todoMutations:[],statusMutations:[]};
function oldPayload(functionName){
  const start=previous.indexOf(`async function ${functionName}(`);
  assert.ok(start>=0,functionName+' exists in actual v3.13.7 source');
  const match=previous.slice(start).match(/tx\.set\(ref,(\{[^\n]+\}),\{merge:true\}\);/);
  assert.ok(match,functionName+' has the expected real merge writer');
  return JSON.parse(JSON.stringify(vm.runInNewContext('('+match[1]+')',{merged,desired,rev:8,now:stamp,serverStamp:()=>stamp,tgDeviceId:()=>'synthetic-device'})));
}
const old={settings:oldPayload('flushSettings'),day:oldPayload('flushDay'),start:oldPayload('requestStart'),stop:oldPayload('requestStop')};
for(const payload of Object.values(old)){
  assert.equal(payload.syncRev,8);
  assert.equal(Object.hasOwn(payload,'catalogProtocol'),false);
  assert.equal(Object.hasOwn(payload,'catalogWriteRev'),false);
}
const settings={...merged,catalogEnforced:true,catalogProtocol:2,catalogWriteRev:7,syncRev:7,catalogRevision:3,latestCatalogOperation:'operation-3'};
const day={events:[],todos:[],routines:[],todoMutations:[],statusMutations:[],catalogProtocol:2,catalogWriteRev:7,syncRev:7,catalogRevision:3};
const running={running:desired,finalizations:[],catalogProtocol:2,catalogWriteRev:7,syncRev:7,catalogRevision:3};
function fixture(name,suffix,before,after,expectation='ALLOW',opts={}){
  const getData=opts.settings||settings;
  const getAfterData=opts.getAfter||{revision:4,catalogRevision:4,latestCatalogOperation:'operation-4'};
  const mocks=[
    {function:'get',args:[{anyValue:{}}],result:{value:{data:getData}}},
    {function:'getAfter',args:[{anyValue:{}}],result:{value:{data:getAfterData}}},
    {function:'exists',args:[{anyValue:{}}],result:{value:true}},
  ];
  const request={path:documentPath(suffix),method:opts.method||(before?'update':'create'),auth:opts.auth===null?null:{uid:opts.uid||syntheticUid,token:{timegridOwner:opts.owner!==false}},resource:{data:after}};
  return {name,test:{expectation,request,resource:before?{data:before}:null,functionMocks:mocks,pathEncoding:'PLAIN',expressionReportLevel:'FULL'}};
}
const cases=[];
for(const [kind,suffix,before] of [['settings','settings/main',settings],['day','days/2026-09-03',day],['start','meta/running',running],['stop','meta/running',running]]){
  const oldAfter={...before,...old[kind]};
  assert.equal(oldAfter.catalogProtocol,2,'merge:true preserves the unknown static version');
  assert.equal(oldAfter.catalogWriteRev,7,'merge:true preserves the stale sequence');
  assert.equal(oldAfter.syncRev,8,'actual old writer increments syncRev');
  cases.push(fixture(`old-${kind}-blocked`,suffix,before,oldAfter,'DENY'));
  cases.push(fixture(`current-${kind}-allowed`,suffix,before,{...oldAfter,catalogProtocol:2,catalogWriteRev:8,catalogRevision:3}));
}
cases.push(fixture('current-day-create','days/2026-09-04',null,{...day,catalogWriteRev:1,syncRev:1}));
cases.push(fixture('stale-day-catalog-blocked','days/2026-09-03',day,{...day,catalogWriteRev:8,syncRev:8,catalogRevision:2},'DENY'));
cases.push(fixture('stale-start-catalog-blocked','meta/running',running,{...running,catalogWriteRev:8,syncRev:8,catalogRevision:2},'DENY'));
cases.push(fixture('stop-with-old-catalog-allowed','meta/running',running,{...running,running:null,catalogWriteRev:8,syncRev:8,catalogRevision:2}));
cases.push(fixture('cannot-disable-fence','settings/main',settings,{...settings,catalogWriteRev:8,syncRev:8,catalogEnforced:false},'DENY'));
cases.push(fixture('cannot-skip-revision','settings/main',settings,{...settings,catalogWriteRev:8,syncRev:8,catalogRevision:5},'DENY'));
cases.push(fixture('settings-receipt-publish','settings/main',settings,{...settings,catalogWriteRev:8,syncRev:8,catalogRevision:4,latestCatalogOperation:'operation-4'}));
cases.push(fixture('receipt-create','catalogHistory/operation-4',null,{id:'operation-4',revision:4,areas:[],activities:[]}));
cases.push(fixture('receipt-is-immutable','catalogHistory/operation-4',{id:'operation-4',revision:4},{id:'operation-4',revision:4,areas:[]},'DENY'));
cases.push(fixture('wrong-owner-blocked','days/2026-09-03',day,{...day,catalogWriteRev:8,syncRev:8},'DENY',{uid:'other-synthetic-user'}));
cases.push(fixture('missing-owner-claim-blocked','days/2026-09-03',day,{...day,catalogWriteRev:8,syncRev:8},'DENY',{owner:false}));
cases.push(fixture('anonymous-blocked','days/2026-09-03',day,{...day,catalogWriteRev:8,syncRev:8},'DENY',{auth:null}));
cases.push(fixture('premigration-old-writer-allowed','settings/main',{...settings,catalogEnforced:false},{...settings,...old.settings,catalogEnforced:false},'ALLOW',{settings:{...settings,catalogEnforced:false}}));
const guarded={...running,legacyStopGuard:{running:structuredClone(desired),installedAt:stamp-1}};
const guardedStop={...guarded,...old.stop};
cases.push(fixture('guarded-actual-old-stop-allowed','meta/running',guarded,guardedStop));
cases.push(fixture('guarded-actual-old-start-blocked','meta/running',guarded,{...guarded,...old.start},'DENY'));
cases.push(fixture('guarded-different-session-blocked','meta/running',{...guarded,running:{...desired,sessionId:'another-session'}},guardedStop,'DENY'));
cases.push(fixture('guarded-altered-receipt-blocked','meta/running',guarded,{...guardedStop,legacyStopGuard:{...guarded.legacyStopGuard,installedAt:stamp}},'DENY'));
cases.push(fixture('guarded-missing-receipt-blocked','meta/running',guarded,{...guardedStop,legacyStopGuard:null},'DENY'));
cases.push(fixture('guarded-altered-finalizations-blocked','meta/running',guarded,{...guardedStop,finalizations:[{id:'invented'}]},'DENY'));
cases.push(fixture('guarded-end-before-start-blocked','meta/running',guarded,{...guardedStop,updatedAtMs:stamp-1},'DENY'));
cases.push(fixture('guarded-sequence-skip-blocked','meta/running',guarded,{...guardedStop,syncRev:9},'DENY'));
cases.push(fixture('guarded-second-clear-blocked','meta/running',guardedStop,{...guardedStop,...old.stop,syncRev:9},'DENY'));
cases.push(fixture('guarded-old-restart-after-clear-blocked','meta/running',guardedStop,{...guardedStop,...old.start,syncRev:9},'DENY'));
const ack={id:desired.sessionId,intent:{id:desired.sessionId,running:desired,endedAt:stamp+20_000,zeroSpan:false,scope:'cloud'},committedAt:stamp+20_001,source:'stop'};
const ackPath='finalizationAcks/'+desired.sessionId;
cases.push(fixture('finalization-ack-create',ackPath,null,ack));
cases.push(fixture('finalization-zero-ack-create',ackPath,null,{...ack,intent:{...ack.intent,endedAt:stamp,zeroSpan:true}}));
cases.push(fixture('finalization-ack-immutable-update',ackPath,ack,{...ack,committedAt:stamp+30_000},'DENY'));
cases.push(fixture('finalization-ack-immutable-delete',ackPath,ack,null,'DENY',{method:'delete'}));
cases.push(fixture('finalization-ack-wrong-path',ackPath,null,{...ack,id:'other-session'},'DENY'));
cases.push(fixture('finalization-ack-wrong-intent-id',ackPath,null,{...ack,intent:{...ack.intent,id:'other-session'}},'DENY'));
cases.push(fixture('finalization-ack-wrong-running-id',ackPath,null,{...ack,intent:{...ack.intent,running:{...desired,sessionId:'other-session'}}},'DENY'));
cases.push(fixture('finalization-ack-end-before-start',ackPath,null,{...ack,intent:{...ack.intent,endedAt:stamp-1}},'DENY'));
cases.push(fixture('finalization-ack-missing-intent',ackPath,null,{id:desired.sessionId},'DENY'));
cases.push(fixture('finalization-ack-wrong-owner',ackPath,null,ack,'DENY',{uid:'other-synthetic-user'}));
cases.push(fixture('finalization-ack-missing-owner-claim',ackPath,null,ack,'DENY',{owner:false}));
cases.push(fixture('finalization-ack-anonymous',ackPath,null,ack,'DENY',{auth:null}));
cases.push(fixture('finalization-ack-string-timestamps',ackPath,null,{...ack,intent:{...ack.intent,running:{...desired,startTs:'a'},endedAt:'z'}},'DENY'));
cases.push(fixture('finalization-ack-string-commit-time',ackPath,null,{...ack,committedAt:'not-a-timestamp'},'DENY'));
assert.match(source,/catalogWriteRev\s*==\s*request\.resource\.data\.syncRev/);
assert.match(source,/resource\.data\.get\('syncRev', 0\) \+ 1/);
console.log(JSON.stringify({ok:true,local:'actual previous-release merge payloads extracted',cases:cases.length,sourceSha256:crypto.createHash('sha256').update(source).digest('hex')}));

if(process.argv.includes('--emulator')){
  const origin='http://127.0.0.1:8787';
  const project='demo-timegrid-catalog';
  const prefix=`projects/${project}/databases/(default)/documents`;
  let caseUid=syntheticUid;
  const name=suffix=>`${prefix}/users/${caseUid}/${suffix}`;
  const typed=value=>value===null?{nullValue:null}:typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?{integerValue:String(value)}:typeof value==='string'?{stringValue:value}:Array.isArray(value)?{arrayValue:{values:value.map(typed)}}:{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,typed(v)]))}};
  const document=(documentName,data)=>({name:documentName,fields:typed(data).mapValue.fields});
  const token=auth=>{
    const now=Math.floor(Date.now()/1000),payload={iss:`https://securetoken.google.com/${project}`,aud:project,iat:now,exp:now+3600,auth_time:now,sub:auth.uid,user_id:auth.uid,...auth.token,firebase:{sign_in_provider:'custom',identities:{}}};
    return Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.';
  };
  async function call(url,method,body,bearer='owner'){
    const response=await fetch(origin+url,{method,headers:{'content-type':'application/json',...(bearer?{authorization:'Bearer '+bearer}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  }
  const compile=await call(`/emulator/v1/projects/${project}:securityRules`,'PUT',{rules:{files:[{name:'firestore.rules',content:source}]}});
  assert.equal(compile.status,200,JSON.stringify(compile.body));
  assert.equal((compile.body.issues||[]).some(x=>x.severity==='ERROR'),false,JSON.stringify(compile.body));
  console.log(JSON.stringify({emulator:'rules compiled',issues:compile.body.issues||[]}));
  const results=[];
  let caseIndex=0;
  for(const item of cases){
    caseUid=syntheticUid+'-'+Date.now()+'-'+caseIndex++;
    const t=item.test,suffix=t.request.path.split('/'+syntheticUid+'/')[1];
    const seedSettings=t.functionMocks[0].result.value.data;
    const seeds=new Map([[name('settings/main'),seedSettings]]);
    if(t.resource)seeds.set(name(suffix),t.resource.data);
    const seeded=await call(`/v1/${prefix}:commit`,'POST',{writes:[...seeds].map(([doc,data])=>({update:document(doc,data)}))});
    assert.equal(seeded.status,200,JSON.stringify(seeded.body));
    const writes=t.request.method==='delete'?[{delete:name(suffix),currentDocument:{exists:true}}]:[{update:document(name(suffix),t.request.resource.data),currentDocument:{exists:!!t.resource}}];
    if(item.name==='settings-receipt-publish')writes.push({update:document(name('catalogHistory/operation-4'),{id:'operation-4',revision:4,areas:[],activities:[]}),currentDocument:{exists:false}});
    if(item.name==='receipt-create')writes.push({update:document(name('settings/main'),{...settings,catalogRevision:4,latestCatalogOperation:'operation-4',syncRev:8,catalogWriteRev:8}),currentDocument:{exists:true}});
    const auth=t.request.auth&&{...t.request.auth,uid:t.request.auth.uid===syntheticUid?caseUid:t.request.auth.uid};
    const outcome=await call(`/v1/${prefix}:commit`,'POST',{writes},auth?token(auth):null);
    const expected=t.expectation==='ALLOW'?200:403;
    results.push({name:item.name,expected,actual:outcome.status,pass:outcome.status===expected,...(outcome.status!==expected?{error:outcome.body.error}: {})});
    console.log(JSON.stringify(results.at(-1)));
  }
  console.log(JSON.stringify({emulator:true,cases:results.length,passed:results.filter(x=>x.pass).length,sourceSha256:crypto.createHash('sha256').update(source).digest('hex')}));
  assert.equal(results.every(x=>x.pass),true,'all real emulator rule outcomes match');
}

if(process.argv.includes('--remote')){
  const automation=path.resolve(root,'..','TimeGridAutomation');
  const require=createRequire(path.join(automation,'package.json'));
  const {GoogleAuth}=require('google-auth-library');
  const secretPath=process.env.FIREBASE_SERVICE_ACCOUNT_PATH||process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(automation,'secrets','firebase-service-account.json');
  const credentials=process.env.FIREBASE_SERVICE_ACCOUNT_JSON?JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON):JSON.parse(fs.readFileSync(secretPath,'utf8'));
  const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/cloud-platform']});
  const client=await auth.getClient();
  const headers=new Headers(await client.getRequestHeaders());headers.set('content-type','application/json');
  const response=await fetch(`https://firebaserules.googleapis.com/v1/projects/${credentials.project_id}:test`,{method:'POST',headers,body:JSON.stringify({source:{files:[{name:'firestore.rules',content:source}]},testSuite:{testCases:cases.map(x=>x.test)}})});
  const result=await response.json();
  if(!response.ok)throw new Error(`Rules test unavailable: HTTP ${response.status}; ${result.error?.message||'unknown error'}`);
  const issues=(result.issues||[]).map(x=>({severity:x.severity,description:x.description,line:x.sourcePosition?.line,column:x.sourcePosition?.column}));
  const summaries=(result.testResults||[]).map((r,i)=>({name:cases[i].name,expected:cases[i].test.expectation,state:r.state,debugMessages:r.debugMessages||[],functions:(r.functionCalls||[]).map(f=>f.function)}));
  console.log(JSON.stringify({remote:true,issues,results:summaries},null,2));
  if(result.issues?.some(x=>x.severity==='ERROR')||summaries.length!==cases.length||summaries.some(x=>x.state!=='SUCCESS'))process.exitCode=1;
}
