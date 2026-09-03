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
    if(url.searchParams.has('no-gsap'))html=html.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/[^>]+><\/script>/g,'')
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return
  }
  if(!/^\/(?:icons|brand)\/[\w.-]+$/.test(route)&&route!=='/manifest.webmanifest'){res.writeHead(404);res.end();return}
  const file=path.join(root,route);if(!fs.existsSync(file)){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':route.endsWith('.png')?'image/png':'application/json'});fs.createReadStream(file).pipe(res)
})
server.listen(8765,'127.0.0.1',()=>console.log('Synthetic UI: http://127.0.0.1:8765; optional ?no-gsap=1'))
