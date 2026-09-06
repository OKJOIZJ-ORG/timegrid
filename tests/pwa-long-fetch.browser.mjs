// Actual Chromium regression for Service Worker activation behind a long-lived
// cross-origin GET. All traffic stays on isolated localhost origins.
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
const deployedCandidateCommit='ef9d31569ffa3e2b11ea30db84d0f030570b3344'

const baselineSw=execFileSync('git',['show',`${baselineCommit}:sw.js`],{cwd:root,encoding:'utf8'})
const deployedCandidateSw=execFileSync('git',['show',`${deployedCandidateCommit}:sw.js`],{cwd:root,encoding:'utf8'})
const currentSw=fs.readFileSync(path.join(root,'sw.js'),'utf8')
const baselineVersion=baselineSw.match(/const VERSION\s*=\s*["']([^"']+)/)?.[1]
const deployedCandidateVersion=deployedCandidateSw.match(/const VERSION\s*=\s*["']([^"']+)/)?.[1]
const currentVersion=currentSw.match(/const VERSION\s*=\s*["']([^"']+)/)?.[1]
assert.ok(baselineVersion&&deployedCandidateVersion&&currentVersion,'fixture versions must be declared')
assert.equal(deployedCandidateVersion,'timegrid-v3.14.7-20260906','historical reproduction must stay pinned to deployed v3.14.7')
assert.match(currentSw,/if \(url\.origin !== self\.location\.origin\) return;/,'current worker must bypass cross-origin requests')

function minimalHtml(version){
  return `<!doctype html><html><body><script>const BUILD_VERSION="${version}";<\/script></body></html>`
}
const baselineHtml=minimalHtml(baselineVersion)
const deployedCandidateHtml=minimalHtml(deployedCandidateVersion)
const currentHtml=minimalHtml(currentVersion)

// Install a distinct fixture-only successor after the current worker. This
// proves the current worker can be replaced while an unrelated stream remains open.
const nextVersion=`${currentVersion}-test-successor`
const nextHtml=minimalHtml(nextVersion)
const nextSw=currentSw.replaceAll(currentVersion,nextVersion)
assert.notEqual(nextHtml,currentHtml)
assert.notEqual(nextSw,currentSw)

function deferred(){
  let resolve
  const promise=new Promise(done=>{resolve=done})
  return {promise,resolve}
}

function withTimeout(promise,timeoutMs,label){
  let timer
  return Promise.race([
    promise,
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${timeoutMs}ms`)),timeoutMs)})
  ]).finally(()=>clearTimeout(timer))
}

async function startLongResponseServer(){
  const opened=deferred()
  const closed=deferred()
  let stream=null
  const server=http.createServer((request,response)=>{
    if(new URL(request.url,'http://127.0.0.1').pathname!=='/stream'){
      response.writeHead(404);response.end();return
    }
    assert.equal(stream,null,'each scenario expects one long response')
    stream={request,response,released:false}
    request.once('aborted',()=>closed.resolve('request-aborted'))
    response.once('close',()=>closed.resolve(stream.released?'released':'response-closed'))
    response.writeHead(200,{
      'Access-Control-Allow-Origin':'*',
      'Cache-Control':'no-store',
      'Content-Type':'text/plain; charset=utf-8'
    })
    response.flushHeaders?.()
    response.write('open\n')
    opened.resolve()
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const address=server.address()
  assert.ok(address&&typeof address==='object')
  return {
    url:`http://127.0.0.1:${address.port}/stream`,
    opened:opened.promise,
    closed:closed.promise,
    release(){
      assert.ok(stream,'long response must be open before release')
      stream.released=true
      stream.response.end('done\n')
    },
    async close(){
      if(stream&&!stream.response.writableEnded)stream.response.destroy()
      await new Promise(resolve=>server.close(resolve))
    }
  }
}

async function startAppServer({baselineHtmlSource,baselineSwSource,candidateHtmlSource,candidateSwSource}){
  let release='baseline'
  const requests=[]
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url,'http://127.0.0.1')
    requests.push({method:request.method,pathname:url.pathname,release})
    if(!url.pathname.startsWith(prefix)){response.writeHead(404);response.end();return}
    let relative=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html'
    relative=path.normalize(relative)
    const file=path.resolve(root,relative)
    if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return}

    let body=null
    if(relative==='index.html')body=release==='candidate'?candidateHtmlSource:baselineHtmlSource
    else if(relative==='sw.js')body=release==='candidate'?candidateSwSource:baselineSwSource
    if(body!==null){
      response.writeHead(200,{'Content-Type':types[path.extname(relative)]||'application/octet-stream','Cache-Control':'no-store'})
      response.end(request.method==='HEAD'?'':body)
      return
    }
    if(!path.extname(file)){response.writeHead(404);response.end();return}
    try{if(!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return}}catch(_){response.writeHead(404);response.end();return}
    response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'})
    if(request.method==='HEAD'){response.end();return}
    fs.createReadStream(file).pipe(response)
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const address=server.address()
  assert.ok(address&&typeof address==='object')
  return {
    base:`http://127.0.0.1:${address.port}${prefix}`,
    requests,
    useCandidate(){release='candidate'},
    close:()=>new Promise(resolve=>server.close(resolve))
  }
}

async function workerVersion(page,which,timeoutMs=1800){
  return page.evaluate(async ({which,timeoutMs})=>{
    const registration=await navigator.serviceWorker.getRegistration('./')
    const worker=which==='controller'?navigator.serviceWorker.controller:registration?.[which]
    if(!worker)return null
    const channel=new MessageChannel()
    return new Promise(resolve=>{
      const timer=setTimeout(()=>resolve(null),timeoutMs)
      channel.port1.onmessage=event=>{clearTimeout(timer);resolve(event.data?.version||null)}
      worker.postMessage({type:'GET_VERSION'},[channel.port2])
    })
  },{which,timeoutMs})
}

async function registrationState(page){
  const lifecycle=await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.getRegistration('./')
    return {
      controlled:!!navigator.serviceWorker.controller,
      controllerIsActive:navigator.serviceWorker.controller===registration?.active,
      installing:registration?.installing?.state||null,
      waiting:registration?.waiting?.state||null,
      active:registration?.active?.state||null,
      controllerChanges:window.__controllerChanges||0,
      longFetchState:window.__longFetchState||null,
      requestedState:window.__requestedWaiting?.state||null,
      requestedTransitions:window.__requestedTransitions||[]
    }
  })
  return {
    ...lifecycle,
    controllerVersion:await workerVersion(page,'controller'),
    waitingVersion:await workerVersion(page,'waiting')
  }
}

async function waitForCandidateControl(page,timeoutMs=10000){
  return page.evaluate(timeoutMs=>new Promise((resolve,reject)=>{
    const started=performance.now()
    const timer=setInterval(async()=>{
      const registration=await navigator.serviceWorker.getRegistration('./')
      const complete=!!window.__requestedWaiting && !registration?.waiting && registration?.active?.state==='activated' &&
        window.__requestedWaiting.state==='activated' &&
        (window.__controllerChanges||0)>=1 &&
        navigator.serviceWorker.controller===registration?.active &&
        navigator.serviceWorker.controller===window.__requestedWaiting
      if(complete){
        clearInterval(timer)
        resolve({controllerChanges:window.__controllerChanges,requestedState:window.__requestedWaiting.state,activeState:registration.active.state})
      }else if(performance.now()-started>timeoutMs){
        clearInterval(timer);reject(new Error('candidate control timed out'))
      }
    },50)
  }),timeoutMs)
}

async function runScenario(browser,{name,resolution,baselineHtmlSource,baselineSwSource,candidateHtmlSource,candidateSwSource,expectedCandidateVersion,expectBypass=false}){
  console.log(`scenario:${name}:start`)
  const app=await startAppServer({baselineHtmlSource,baselineSwSource,candidateHtmlSource,candidateSwSource})
  const long=await startLongResponseServer()
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'allow'})
  const page=await context.newPage()
  const pageErrors=[]
  page.on('pageerror',error=>pageErrors.push(error.message))
  try{
    await page.goto(app.base,{waitUntil:'load',timeout:30000})
    await page.evaluate(()=>navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}))
    await page.waitForFunction(()=>navigator.serviceWorker.controller&&navigator.serviceWorker.ready,undefined,{timeout:15000})
    await page.reload({waitUntil:'load',timeout:30000})
    await page.waitForFunction(()=>navigator.serviceWorker.controller,undefined,{timeout:5000})
    await page.evaluate(()=>{window.__startingController=navigator.serviceWorker.controller})

    await page.evaluate(url=>{
      window.__controllerChanges=0
      navigator.serviceWorker.addEventListener('controllerchange',()=>{window.__controllerChanges++})
      window.__longFetchController=new AbortController()
      window.__longFetchState='pending'
      window.__longFetchPromise=fetch(url,{signal:window.__longFetchController.signal})
        .then(response=>response.text())
        .then(body=>{window.__longFetchState=`resolved:${body.trim()}`})
        .catch(error=>{window.__longFetchState=`rejected:${error.name}`})
    },long.url)
    await withTimeout(long.opened,5000,`${name} long response opening`)
    assert.equal(await page.evaluate(()=>window.__longFetchState),'pending')

    app.useCandidate()
    await page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.getRegistration('./')
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('candidate did not install')),15000)
        const arm=worker=>{
          if(!worker)return
          window.__requestedWaiting=worker
          window.__requestedTransitions=[worker.state]
          let posted=false
          const observe=()=>{
            if(window.__requestedTransitions.at(-1)!==worker.state)window.__requestedTransitions.push(worker.state)
            if(worker.state==='installed'&&!posted){
              posted=true
              window.__beforeSkip={waiting:'installed',active:registration.active?.state||null,longFetchState:window.__longFetchState}
              worker.postMessage({type:'SKIP_WAITING'})
              clearTimeout(timer);resolve()
            }
          }
          worker.addEventListener('statechange',observe)
          observe()
        }
        registration.addEventListener('updatefound',()=>arm(registration.installing),{once:true})
        registration.update().catch(reject)
      })
    })
    const beforeSkip=await page.evaluate(()=>window.__beforeSkip)
    assert.deepEqual(beforeSkip,{waiting:'installed',active:'activated',longFetchState:'pending'})

    if(expectBypass){
      const controlProof=await waitForCandidateControl(page)
      const afterActivation=await registrationState(page)
      assert.equal(afterActivation.longFetchState,'pending','native cross-origin stream remains open while replacement activates')
      assert.deepEqual(controlProof,{controllerChanges:1,requestedState:'activated',activeState:'activated'})
      long.release()
      await page.waitForFunction(()=>window.__longFetchState.startsWith('resolved:'),undefined,{timeout:5000})
      return {name,beforeSkip,blocked:null,controlProof,afterResolution:afterActivation,longFetchStayedOpen:true}
    }

    await page.waitForTimeout(1800)
    const blocked=await registrationState(page)
    assert.equal(blocked.waiting,'installed','an unresolved intercepted cross-origin fetch must keep the candidate waiting')
    assert.equal(blocked.active,'activated')
    assert.equal(blocked.controllerChanges,0)
    assert.equal(blocked.longFetchState,'pending')
    assert.equal(blocked.requestedState,'installed')
    assert.equal(blocked.requestedTransitions.at(-1),'installed')

    if(resolution==='release')long.release()
    else if(resolution==='abort')await page.evaluate(()=>window.__longFetchController.abort())
    else assert.fail(`unknown resolution ${resolution}`)

    const controlProof=await waitForCandidateControl(page)
    const afterResolution=await registrationState(page)
    assert.deepEqual(controlProof,{controllerChanges:1,requestedState:'activated',activeState:'activated'})
    if(resolution==='release')await page.waitForFunction(()=>window.__longFetchState.startsWith('resolved:'),undefined,{timeout:5000})
    else await page.waitForFunction(()=>window.__longFetchState==='rejected:AbortError',undefined,{timeout:5000})
    afterResolution.longFetchState=await page.evaluate(()=>window.__longFetchState)
    assert.deepEqual(pageErrors,[])
    return {name,beforeSkip,blocked,controlProof,afterResolution,longFetchStayedOpen:false}
  }finally{
    await context.close()
    await long.close()
    await app.close()
  }
}

const browser=await chromium.launch({channel:'msedge',headless:true})
try{
  const historical={baselineHtmlSource:baselineHtml,baselineSwSource:baselineSw,candidateHtmlSource:deployedCandidateHtml,candidateSwSource:deployedCandidateSw,expectedCandidateVersion:deployedCandidateVersion}
  const release=await runScenario(browser,{name:'v3.14.6-intercepted-release',resolution:'release',...historical})
  const passThrough=await runScenario(browser,{name:'current-cross-origin-pass-through',resolution:'release',baselineHtmlSource:currentHtml,baselineSwSource:currentSw,candidateHtmlSource:nextHtml,candidateSwSource:nextSw,expectedCandidateVersion:nextVersion,expectBypass:true})
  console.log(JSON.stringify({baselineCommit,deployedCandidateCommit,baselineVersion,deployedCandidateVersion,currentVersion,nextVersion,release,passThrough},null,2))
  console.log('Long cross-origin fetch Service Worker activation regression PASS')
}finally{
  await browser.close()
}
