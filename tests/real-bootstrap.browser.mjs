// Full production bootstrap and Service Worker acceptance on an isolated localhost origin.
// Firebase CDN requests are aborted before load, so no account or production data can be touched.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'

const require=createRequire(import.meta.url)
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)))
const prefix='/timegrid/'
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.ico':'image/x-icon'}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8')
const expectedShell=fs.readFileSync(path.join(root,'sw.js'),'utf8').match(/const VERSION = "([^"]+)"/)[1]+'-shell'
const gsapTag=html.match(/<script src="(https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/[^"]+)" integrity="(sha384-[^"]+)"/)
assert.ok(gsapTag,'production GSAP tag and SRI must exist')
const [,gsapUrl,gsapIntegrity]=gsapTag
const gsapResponse=await fetch(gsapUrl,{cache:'no-store'})
assert.equal(gsapResponse.ok,true,`Node CDN fetch failed: ${gsapResponse.status} ${gsapResponse.statusText}`)
const gsapBytes=Buffer.from(await gsapResponse.arrayBuffer())
const actualGsapIntegrity='sha384-'+crypto.createHash('sha384').update(gsapBytes).digest('base64')
assert.equal(actualGsapIntegrity,gsapIntegrity,'fetched GSAP bytes must match the production SRI')

const server=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1')
  if(!url.pathname.startsWith(prefix)){response.writeHead(404);response.end();return}
  let relative=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html'
  relative=path.normalize(relative)
  const file=path.resolve(root,relative)
  if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return}
  response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'})
  if(request.method==='HEAD'){response.end();return}
  fs.createReadStream(file).pipe(response)
})

await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
const address=server.address()
assert.ok(address&&typeof address==='object')
const base=`http://127.0.0.1:${address.port}${prefix}`
const browser=await chromium.launch({channel:'msedge',headless:true})
const results=[]

async function settle(page){
  await page.evaluate(async()=>{
    if(document.fonts?.ready)await document.fonts.ready
    await Promise.all(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})))
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
  })
}

try{
  for(const width of [390,1280])for(const noGsap of [false,true]){
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600,isMobile:width<600,serviceWorkers:'allow'})
    const page=await context.newPage(),pageErrors=[],failed=[]
    page.on('pageerror',error=>pageErrors.push(error.message))
    page.on('requestfailed',request=>failed.push({url:request.url(),error:request.failure()?.errorText||''}))
    await context.route('https://www.gstatic.com/firebasejs/**',route=>route.abort('blockedbyclient'))
    if(noGsap)await context.route('https://cdnjs.cloudflare.com/ajax/libs/gsap/**',route=>route.abort('blockedbyclient'))
    else await context.route(gsapUrl,route=>route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',
      headers:{'access-control-allow-origin':'*'},body:gsapBytes}))

    await page.goto(base,{waitUntil:'load',timeout:30000})
    await page.waitForFunction(()=>typeof state!=='undefined'&&window.tgCloud&&document.getElementById('swBtn'))
    if(await page.locator('#onboard').isVisible())await page.click('#onbGo')
    await settle(page)

    const initial=await page.evaluate(()=>({
      width:innerWidth,
      overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
      localGate:window.tgCloud.startGate(),
      version:document.getElementById('sidenavFoot').textContent.match(/v(\d+\.\d+\.\d+)/)?.[1],
      gsap:!!window.gsap
    }))
    assert.equal(initial.overflow<=1,true,`${width}px initial bootstrap must not overflow horizontally`)
    assert.equal(initial.localGate.allowed,true,'fresh Firebase-unavailable guest remains usable in local mode')
    assert.equal(initial.localGate.mode,'local')
    if(noGsap)assert.equal(initial.gsap,false)
    else assert.equal(initial.gsap,true,'the SRI-verified production GSAP dependency must execute')

    const areaOnlyPicker=await page.evaluate(async()=>{
      const area=state.settings.areas.find(item=>item.name==='공부')
      window._todoPickBtn._setValue({area:'공부',areaId:area?.id||null,actId:null})
      setTab('planner')
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
      const picker=window._todoPickBtn
      const areaText=picker.querySelector('.ca-ar')
      const caret=picker.querySelector('.ap-tri')
      const pickerBox=picker.getBoundingClientRect()
      const areaBox=areaText.getBoundingClientRect()
      const caretBox=caret.getBoundingClientRect()
      return {
        width:pickerBox.width,
        trailingInset:pickerBox.right-caretBox.right,
        chromeWidth:pickerBox.width-areaBox.width-caretBox.width,
        areaClipped:areaText.scrollWidth>areaText.clientWidth,
        contentClipped:picker.scrollWidth>picker.clientWidth
      }
    })
    assert.equal(areaOnlyPicker.areaClipped,false,`${width}px area-only label remains complete`)
    assert.equal(areaOnlyPicker.contentClipped,false,`${width}px area-only picker contains its label and caret`)
    assert.equal(areaOnlyPicker.trailingInset<=9,true,`${width}px area-only caret has compact optical trailing space`)
    assert.equal(areaOnlyPicker.chromeWidth<=25,true,`${width}px area-only picker has no state-independent width floor`)
    if(width<600)assert.equal(areaOnlyPicker.width<72,true,'mobile area-only picker shrinks below the former generic minimum')
    if(!noGsap){
      await page.waitForTimeout(100)
      await page.evaluate(()=>{_closeAc();_closeAp();document.activeElement?.blur()})
      await page.screenshot({path:path.join(os.tmpdir(),`timegrid-todo-area-only-${width}.png`),fullPage:false})
    }
    await page.evaluate(()=>setTab('tracker'))

    if(width<600){
      const todoComposer=await page.evaluate(async()=>{
        const area=state.settings.areas.find(item=>item.name==='공부')
        const actId='fixture-mobile-composer-activity'
        state.settings.activities.push({id:actId,name:'정치와 법',area:'공부',areaId:area?.id||null,color:'#E69494'})
        window._todoPickBtn._setValue({area:'공부',areaId:area?.id||null,actId})
        setTab('planner')
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
        const row=document.querySelector('.planner-card-todo .add-row')
        const input=document.getElementById('todoInput')
        const picker=window._todoPickBtn
        const add=document.getElementById('todoAdd')
        const areaText=picker.querySelector('.ca-ar')
        const activityText=picker.querySelector('.ca-hl')
        const box=element=>element.getBoundingClientRect()
        return {
          row:box(row),input:box(input),picker:box(picker),add:box(add),
          pickerText:picker.textContent,
          areaClipped:areaText.scrollWidth>areaText.clientWidth,
          activityClipped:activityText.scrollWidth>activityText.clientWidth,
          contentClipped:picker.scrollWidth>picker.clientWidth,
          overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth
        }
      })
      assert.match(todoComposer.pickerText,/공부\s*정치와 법/,'the composed area and activity remain present')
      assert.equal(todoComposer.areaClipped,false,'mobile composer shows the full area name')
      assert.equal(todoComposer.activityClipped,false,'mobile composer shows the full activity name')
      assert.equal(todoComposer.contentClipped,false,'mobile picker contains its full composed label and caret')
      assert.equal(Math.abs(todoComposer.input.y-todoComposer.picker.y)<=1,true,'Todo input and picker stay on one row')
      assert.equal(Math.abs(todoComposer.picker.y-todoComposer.add.y)<=1,true,'picker and Add stay on one row')
      assert.equal(todoComposer.overflow<=1,true,'content-sized mobile composer does not overflow the viewport')
      await page.screenshot({path:path.join(os.tmpdir(),`timegrid-todo-composer-${width}-${noGsap?'no-gsap':'gsap'}.png`),fullPage:false})
      await page.evaluate(()=>setTab('tracker'))
    }

    await page.selectOption('#areaSelect','공부',{force:true})
    await page.fill('#actInput','수학')
    await page.locator('#actInput').dispatchEvent('change')
    await page.waitForFunction(()=>!document.getElementById('swBtn').disabled&&document.getElementById('swBtn').textContent.includes('시작'))
    await page.click('#swBtn')
    const running=await page.waitForFunction(()=>state.running&&state.running.sessionId).then(handle=>handle.jsonValue())
    const started=await page.evaluate(()=>({run:structuredClone(state.running),stored:JSON.parse(localStorage.getItem('timegrid-proto-v1'))?.running}))
    assert.equal(started.run.sessionId,running)
    assert.equal(started.stored.sessionId,running,'Start persists the exact local session')
    assert.equal(started.run.actId,'a02')
    await new Promise(resolve=>setTimeout(resolve,1100))
    await page.click('#swBtn')
    await page.waitForFunction(()=>!state.running&&(state.finalizations||[]).length===0)
    const stopped=await page.evaluate(sessionId=>{
      const date=ymd(new Date()),day=state.days[date]
      const event=(day?.events||[]).find(item=>(item.sessionIds||[]).includes(sessionId))
      const stored=JSON.parse(localStorage.getItem('timegrid-proto-v1'))
      const storedEvent=(stored.days?.[date]?.events||[]).find(item=>(item.sessionIds||[]).includes(sessionId))
      return {date,event:structuredClone(event),storedEvent:structuredClone(storedEvent),finalizations:structuredClone(state.finalizations||[])}
    },running)
    assert.ok(stopped.event&&stopped.storedEvent,'Stop materializes and persists the local event')
    assert.equal(stopped.event.startTs,started.run.startTs)
    assert.equal(stopped.event.endTs>stopped.event.startTs,true)
    assert.equal(stopped.storedEvent.startTs,stopped.event.startTs)
    assert.equal(stopped.storedEvent.endTs,stopped.event.endTs)
    assert.deepEqual(stopped.finalizations,[])

    const worker=await page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.ready
      if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}))
      return {scope:registration.scope,active:registration.active?.state||null,controller:!!navigator.serviceWorker.controller,caches:await caches.keys()}
    })
    assert.equal(worker.scope,base)
    assert.equal(worker.active,'activated')
    assert.equal(worker.controller,true)
    assert.equal(worker.caches.includes(expectedShell),true)

    // One controlled online reload verifies normal local persistence and warms only optional runtime dependencies.
    await page.reload({waitUntil:'load',timeout:30000})
    await page.waitForFunction(()=>typeof state!=='undefined'&&window.tgCloud)
    assert.equal(await page.evaluate(sessionId=>Object.values(state.days).some(day=>(day.events||[]).some(event=>(event.sessionIds||[]).includes(sessionId))),running),true)
    await context.setOffline(true)
    await page.reload({waitUntil:'load',timeout:30000})
    await page.waitForFunction(()=>typeof state!=='undefined'&&window.tgCloud&&navigator.serviceWorker.controller)
    await settle(page)
    const offline=await page.evaluate(sessionId=>({
      controlled:!!navigator.serviceWorker.controller,
      persisted:Object.values(state.days).some(day=>(day.events||[]).some(event=>(event.sessionIds||[]).includes(sessionId))),
      overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
      gate:window.tgCloud.startGate()
    }),running)
    assert.equal(offline.controlled,true)
    assert.equal(offline.persisted,true,'offline shell reload retains the stopped exact event')
    assert.equal(offline.overflow<=1,true,`${width}px offline shell must not overflow horizontally`)
    assert.equal(offline.gate.allowed,true)
    assert.deepEqual(pageErrors,[])
    const localFailures=failed.filter(item=>item.url.startsWith(base))
    assert.deepEqual(localFailures,[],'all same-origin runtime assets load through the offline shell')

    const screenshot=path.join(os.tmpdir(),`timegrid-real-bootstrap-${width}-${noGsap?'no-gsap':'gsap'}.png`)
    await page.screenshot({path:screenshot,fullPage:false})
    results.push({width,noGsap,gsapTransport:noGsap?'intentionally-blocked':'SRI-verified-CDN-bytes-route-fulfilled',screenshot,initial,areaOnlyPicker,worker,offline,
      externalFailures:failed.filter(item=>!item.url.startsWith(base))})
    await context.setOffline(false)
    await context.close()
  }
  console.log(JSON.stringify({base,results},null,2))
  console.log('Real bootstrap, local exact Start/Stop, persistence and offline Service Worker shell PASS')
}finally{
  await browser.close()
  await new Promise(resolve=>server.close(resolve))
}
