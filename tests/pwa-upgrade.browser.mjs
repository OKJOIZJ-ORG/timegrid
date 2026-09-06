// Actual Service Worker upgrade regression on an isolated localhost origin.
// The baseline and candidate never contact Firebase, production, or personal data.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'

const require=createRequire(import.meta.url)
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)))
const prefix='/timegrid/'
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.ico':'image/x-icon'}

const baselineCommit='9280231f3e5c312e87ab1371d20ac285b4e0b176'
// Omit only external SDK tags instead of Playwright request routing, which can
// suspend a replacement worker's requests during a second navigation.
function withoutExternalSDKs(html){
  const tags=html.match(/<script src="https:\/\/(?:www\.gstatic\.com|cdnjs\.cloudflare\.com)[^>]*><\/script>/g)||[]
  assert.equal(tags.length,4,'fixture removes exactly Firebase SDKs and GSAP')
  for(const tag of tags)html=html.replace(tag,'')
  return html
}
const baselineHtml=withoutExternalSDKs(execFileSync('git',['show',`${baselineCommit}:index.html`],{cwd:root,encoding:'utf8'}))
const baselineSw=execFileSync('git',['show',`${baselineCommit}:sw.js`],{cwd:root,encoding:'utf8'})
const candidateHtml=withoutExternalSDKs(fs.readFileSync(path.join(root,'index.html'),'utf8'))
const candidateSwSource=fs.readFileSync(path.join(root,'sw.js'),'utf8')
const baselineVersion=baselineSw.match(/const VERSION\s*=\s*["']([^"']+)/)?.[1]
const candidateVersion=candidateSwSource.match(/const VERSION\s*=\s*["']([^"']+)/)?.[1]
const candidateBuildVersion=candidateHtml.match(/const BUILD_VERSION\s*=\s*["']([^"']+)/)?.[1]
assert.ok(baselineVersion&&candidateVersion&&candidateBuildVersion,'baseline SW, candidate SW and candidate page versions must be declared')
assert.notEqual(candidateVersion,baselineVersion,'the browser regression requires a new candidate Service Worker version')
assert.equal(candidateBuildVersion,candidateVersion,'the candidate page and Service Worker must share one build version')

const activationHook=/self\.addEventListener\(["']activate["'],\s*event\s*=>\s*\{\s*event\.waitUntil\(\(async\s*\(\)\s*=>\s*\{/
assert.match(candidateSwSource,activationHook,'candidate Service Worker must have an awaited activate lifecycle')
const activationDelayMs=1600
const candidateSw=candidateSwSource.replace(activationHook,match=>`${match}\n    await new Promise(resolve=>setTimeout(resolve,${activationDelayMs}));`)
assert.notEqual(candidateSw,candidateSwSource,'the isolated fixture must delay candidate activation')

let release='baseline'
let staleNavigation=false
const requests=[]
const server=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1')
  const isNavigation=request.headers['sec-fetch-mode']==='navigate'||request.headers['sec-fetch-dest']==='document'
  requests.push({pathname:url.pathname,isNavigation,release,staleNavigation})
  if(!url.pathname.startsWith(prefix)){response.writeHead(404);response.end();return}
  let relative=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html'
  relative=path.normalize(relative)
  const file=path.resolve(root,relative)
  if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return}

  let body=null
  if(relative==='index.html'){
    body=release==='candidate'&&!(staleNavigation&&isNavigation)?candidateHtml:baselineHtml
  }else if(relative==='sw.js'){
    body=release==='candidate'?candidateSw:baselineSw
  }
  if(body!==null){
    response.writeHead(200,{'Content-Type':types[path.extname(relative)]||'application/octet-stream','Cache-Control':'no-store'})
    response.end(request.method==='HEAD'?'':body)
    return
  }
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
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'allow'})
const page=await context.newPage()
const pageErrors=[]
const browserLogs=[]
let mainFrameNavigations=0
page.on('pageerror',error=>pageErrors.push(error.message))
page.on('console',message=>browserLogs.push(`${message.type()}: ${message.text()}`))
page.on('framenavigated',frame=>{if(frame===page.mainFrame())mainFrameNavigations++})

async function registrationState(){
  return page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.getRegistration('./')
    return {
      controlled:!!navigator.serviceWorker.controller,
      installing:registration?.installing?.state||null,
      waiting:registration?.waiting?.state||null,
      active:registration?.active?.state||null
    }
  })
}

async function controllerVersion(timeoutMs=700){
  return page.evaluate(async timeout=>{
    const controller=navigator.serviceWorker.controller
    if(!controller)return null
    const channel=new MessageChannel()
    return new Promise(resolve=>{
      const timer=setTimeout(()=>resolve(null),timeout)
      channel.port1.onmessage=event=>{clearTimeout(timer);resolve(event.data?.version||null)}
      controller.postMessage({type:'GET_VERSION'},[channel.port2])
    })
  },timeoutMs)
}

async function bannerState(){
  return page.evaluate(()=>{
    const box=document.getElementById('pwaUpdate')
    const button=document.getElementById('pwaUpdateBtn')
    return {shown:!!box&&box.classList.contains('show')&&!box.inert&&box.getAttribute('aria-hidden')!=='true',disabled:!!button?.disabled,message:document.getElementById('pwaUpdateMsg')?.textContent||''}
  })
}

async function pageHasBuild(version){
  return page.evaluate(expected=>Array.from(document.scripts).some(script=>script.textContent.includes(`const BUILD_VERSION="${expected}";`)),version)
}

try{
  // Install and claim the committed baseline, then make one controlled baseline navigation.
  await page.goto(base,{waitUntil:'load',timeout:30000})
  if(await page.locator('#onboard').isVisible())await page.click('#onbGo')
  await page.waitForFunction(()=>navigator.serviceWorker.controller&&navigator.serviceWorker.ready,undefined,{timeout:15000})
  await page.reload({waitUntil:'load',timeout:30000})
  await page.waitForFunction(()=>navigator.serviceWorker.controller)
  assert.equal((await registrationState()).active,'activated')

  // The baseline worker is network-first for navigation. It therefore displays the
  // candidate page while the baseline still controls it and the candidate waits.
  release='candidate'
  await page.reload({waitUntil:'load',timeout:30000})
  await page.waitForFunction(expected=>Array.from(document.scripts).some(script=>script.textContent.includes(`const BUILD_VERSION="${expected}";`)),candidateVersion)
  assert.equal(await pageHasBuild(candidateVersion),true,'new network HTML is displayed before the old controller is replaced')
  await page.waitForFunction(async()=>{
    const registration=await navigator.serviceWorker.getRegistration('./')
    return registration?.waiting?.state==='installed'
  },undefined,{timeout:15000})
  assert.equal(await controllerVersion(),null,'the committed baseline controller has no candidate version handshake')
  assert.deepEqual(await registrationState(),{controlled:true,installing:null,waiting:'installed',active:'activated'})
  await page.waitForFunction(()=>{
    const box=document.getElementById('pwaUpdate')
    return box?.classList.contains('show')&&!box.inert&&box.getAttribute('aria-hidden')!=='true'
  },undefined,{timeout:5000})
  assert.equal((await bannerState()).shown,true,'the waiting candidate is offered once')

  // From this point the origin deliberately serves stale HTML to navigations.
  // The delayed candidate activation proves there is no blind 900ms reload, and
  // the activated worker must then load its own precached candidate page.
  staleNavigation=true
  const navigationsBeforeClick=requests.filter(item=>item.isNavigation).length
  const browserNavigationsBeforeClick=mainFrameNavigations
  await page.evaluate(()=>{window.__upgradeDocumentIdentity=crypto.randomUUID()})
  const documentIdentity=await page.evaluate(()=>window.__upgradeDocumentIdentity)
  assert.equal(await page.evaluate(()=>{
    const button=document.getElementById('pwaUpdateBtn'),rect=button.getBoundingClientRect()
    const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)
    return hit===button||button.contains(hit)
  }),true,'the real update button must own its pointer hit area')
  const updateButtonBox=await page.locator('#pwaUpdateBtn').boundingBox()
  assert.ok(updateButtonBox,'the visible update button must have a pointer target')
  const reloadAfterControllerChange=page.waitForEvent('framenavigated',{predicate:frame=>frame===page.mainFrame(),timeout:15000})
  await page.mouse.click(updateButtonBox.x+updateButtonBox.width/2,updateButtonBox.y+updateButtonBox.height/2)
  await page.waitForFunction(()=>document.getElementById('pwaUpdateMsg')?.textContent.includes('적용 중'),undefined,{timeout:1000})
  await new Promise(resolve=>setTimeout(resolve,1100))
  assert.equal(mainFrameNavigations,browserNavigationsBeforeClick,'a delayed activation must not trigger the removed 900ms fallback reload')
  assert.equal(requests.filter(item=>item.isNavigation).length,navigationsBeforeClick,'no navigation starts before the actual controller change')

  try{
    await reloadAfterControllerChange
  }catch(error){
    const diagnostic={registration:await registrationState(),controllerVersion:await controllerVersion(2000),banner:await bannerState(),identity:await page.evaluate(()=>window.__upgradeDocumentIdentity||null),tracking:await page.evaluate(()=>({running:!!state?.running,finalizations:(state?.finalizations||[]).length})),requests:requests.slice(-12),browserLogs}
    console.error('upgrade diagnostic:',JSON.stringify(diagnostic,null,2))
    throw error
  }
  await page.waitForLoadState('load')
  await page.waitForFunction(expected=>navigator.serviceWorker.controller&&Array.from(document.scripts).some(script=>script.textContent.includes(`const BUILD_VERSION="${expected}";`)),candidateVersion,{timeout:15000})
  assert.notEqual(await page.evaluate(()=>window.__upgradeDocumentIdentity||null),documentIdentity,'the controller-confirmed update replaces the old document')
  assert.equal(await controllerVersion(2000),candidateVersion,'the clicked update reloads only after the candidate controls the page')
  assert.equal(requests.filter(item=>item.isNavigation).length,navigationsBeforeClick,'the activated worker serves its precached candidate shell despite stale network HTML')
  assert.equal((await bannerState()).shown,false,'the activated matching build hides the update banner')
  assert.equal((await registrationState()).waiting,null)

  await page.reload({waitUntil:'load',timeout:15000})
  await page.waitForFunction(expected=>Array.from(document.scripts).some(script=>script.textContent.includes(`const BUILD_VERSION="${expected}";`)),candidateVersion)
  await page.waitForTimeout(1200)
  assert.equal(await controllerVersion(2000),candidateVersion)
  assert.equal(requests.filter(item=>item.isNavigation).length,navigationsBeforeClick,'repeated reloads stay on the activated release shell')
  assert.equal((await bannerState()).shown,false,'the same activated release never reopens a phantom update banner')
  assert.equal((await registrationState()).waiting,null)
  assert.deepEqual(pageErrors,[])

  console.log(JSON.stringify({base,baselineCommit,baselineVersion,candidateVersion,activationDelayMs,navigationsBeforeClick,finalRegistration:await registrationState(),finalBanner:await bannerState()},null,2))
  console.log('Actual delayed Service Worker upgrade, activated-shell navigation and no-repeat banner PASS')
}finally{
  await context.close()
  await browser.close()
  await new Promise(resolve=>server.close(resolve))
}
