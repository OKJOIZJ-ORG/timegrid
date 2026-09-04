// Local synthetic UI only. Never initializes Firebase or registers a worker.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1'),route=url.pathname
  if(route==='/'||route==='/index.html'){
    let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replaceAll('\r\n','\n')
      .replace('<body>','<body data-demo="1" data-pastel="1">')
      .replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^>]+><\/script>/g,'')
      .replace('load();\nmigrateRoutines();','migrateRoutines();')
      .replace('if (!("serviceWorker" in navigator)', 'if (true || !("serviceWorker" in navigator)')
      .replace('  seedDemo();',`  seedDemo();state.running=null;
        const fixtureDay=ensureDay(state.viewDate);
        fixtureDay.todos[0].time="21:30";fixtureDay.todos[1].time="09:00";fixtureDay.todos[1].end="10:10";
        fixtureDay.routines.push({id:"fixture-r1",name:"연속 루틴",time:"09:30",end:"11:20",area:"공부",extra:true});
        fixtureDay.routines.push({id:"fixture-r2",name:"연속 루틴",time:"12:00",end:"13:10",area:"공부",extra:true});
        for(let i=0;i<5;i++)state.settings.activities.push({id:"fixture-a"+i,name:i===4?"아주 긴 활동 이름을 입력하는 경우 확인":"추가 활동 "+i,area:"공부",color:"#E69494"});`)
    if(url.searchParams.has('pending-stop'))html=html.replace('state.running=null;\n        const fixtureDay=',`state.running=null;
        const pendingStart=new Date();pendingStart.setHours(2,0,0,0);
        state.finalizations=[{id:'fixture-stop',scope:'cloud',running:{sessionId:'fixture-stop',actId:'a1',startTs:pendingStart.getTime()},endedAt:pendingStart.getTime()+181234,zeroSpan:false}];
        const fixtureDay=`)
    if(url.searchParams.has('continuity')){
      const mode=url.searchParams.get('continuity');
      const same=mode==='matching';
      html=html.replace('  seedDemo();state.running=null;',`  seedDemo();state.running=null;
        state.days={};ensureDay(state.viewDate);
        const fixtureNow=Date.now();
        const fixtureAct=state.settings.activities[0].id;
        materializeExactSpan({actId:fixtureAct,sessionId:'fixture-first',startTs:fixtureNow-610000,note:'연결 메모'},fixtureNow-310000);
        const fixtureRun={actId:fixtureAct,sessionId:'fixture-second',startTs:fixtureNow-280000,note:${JSON.stringify(same?'연결 메모':'다른 메모')}};
        ${mode==='edit'?'materializeExactSpan(fixtureRun,fixtureNow-10000);':'state.running=fixtureRun;'}
      `).replace('fixtureDay.todos[0].time="21:30";fixtureDay.todos[1].time="09:00";fixtureDay.todos[1].end="10:10";','')
    }
    if(url.searchParams.has('no-gsap'))html=html.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/[^>]+><\/script>/g,'')
    if(url.searchParams.has('ack-observation')){
      html=html.replace('if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();',`
        user={uid:'fixture'};ready=true;authKnown=true;cloudUnavailable=false;
        let fixtureListener,fixtureListenerOptions,fixtureLastData,fixtureLastMetadata,fixtureReceipt,fixtureAckReads=[];
        const fixtureWaiters=[];
        userPaths=()=>({
          settings:{onSnapshot:()=>()=>{}},days:{onSnapshot:()=>()=>{}},
          running:{onSnapshot:(options,cb)=>{fixtureListenerOptions=typeof options==='function'?{}:options;fixtureListener=typeof options==='function'?options:cb;return()=>{};}},
          finalizationAcks:{doc:id=>({get:()=>{fixtureAckReads.push(id);return new Promise(resolve=>fixtureWaiters.push({id,resolve}));}})}
        });
        // Ordinary history is deliberately stalled. No timer/heartbeat will
        // rescue a missing completion render in this fixture.
        schedulePush=()=>{};
        startListeners(user.uid);
        window.fixtureAck={
          reset(){
            observedFinalizationAcks.clear();fixtureAckReads=[];fixtureWaiters.length=0;fixtureLastData=undefined;fixtureLastMetadata=undefined;
            const end=Date.now()-1000;
            fixtureReceipt=prepareFinalization({sessionId:'fixture-stop',actId:state.settings.activities[0].id,startTs:end-20000},end);
            state.running=null;state.finalizations=[fixtureReceipt];renderAll();
          },
          emit({fromCache=false,hasPendingWrites=false,stale=false}={}){
            const raw={running:null,finalizations:stale?[fixtureReceipt]:[],syncRev:99};
            const dataKey=JSON.stringify(raw),metadataKey=JSON.stringify({fromCache,hasPendingWrites});
            // Firestore suppresses same-data metadata events unless requested.
            if(dataKey===fixtureLastData&&(metadataKey===fixtureLastMetadata||!fixtureListenerOptions.includeMetadataChanges))return;
            fixtureLastData=dataKey;fixtureLastMetadata=metadataKey;
            fixtureListener({exists:true,data:()=>raw,metadata:{fromCache,hasPendingWrites}});
          },
          resolve(exists=true){for(const w of fixtureWaiters.splice(0))w.resolve({exists});},
          reads:()=>fixtureAckReads.length,
          pending:()=>state.finalizations.length
        };
        window.fixtureAck.reset();
      `)
    }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return
  }
  if(!/^\/(?:icons|brand)\/[\w.-]+$/.test(route)&&!['/manifest.webmanifest','/catalog-core.js','/continuity-core.js','/catalog-manager.js','/catalog-manager.css'].includes(route)){res.writeHead(404);res.end();return}
  const file=path.join(root,route);if(!fs.existsSync(file)){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':route.endsWith('.png')?'image/png':route.endsWith('.js')?'text/javascript':route.endsWith('.css')?'text/css':'application/json'});fs.createReadStream(file).pipe(res)
})
server.listen(8765,'127.0.0.1',()=>console.log('Synthetic UI: http://127.0.0.1:8765; optional ?no-gsap=1'))
