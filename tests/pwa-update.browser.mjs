import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'

const require=createRequire(import.meta.url)
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
const style=source.match(/<style>([\s\S]*?)<\/style>/)?.[1]
const banner=source.match(/<div class="pwa-update"[\s\S]*?<\/div>\s*<\/div>/)?.[0]
const marker=source.indexOf('/* ================= PWA service worker / safe update flow ================= */')
const start=source.indexOf('(function(){',marker)
const end=source.indexOf('\n})();',start)+6
const updateSource=source.slice(start,end)
assert.ok(style&&banner&&marker>=0&&start>=0&&end>start)

const browser=await chromium.launch({channel:'msedge',headless:true})
async function openPage({waiting=false,running=false,finalizations=[],controlled=true}={}){
  const page=await browser.newPage()
  const setup=`<script>
    window.state={running:${running?'{sessionId:"active"}':'null'},finalizations:${JSON.stringify(finalizations)}};
    window.__posted=[];window.__swListeners={};
    window.__worker={state:'installed',postMessage(message){window.__posted.push(message)}};
    window.__registration={waiting:${waiting?'window.__worker':'null'},installing:null,addEventListener(){},update(){return Promise.resolve()}};
    window.__serviceWorker={controller:${controlled?'{}':'null'},register(){return Promise.resolve(window.__registration)},addEventListener(type,listener){window.__swListeners[type]=listener}};
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:window.__serviceWorker});
    window.__emitControllerChange=()=>window.__swListeners.controllerchange&&window.__swListeners.controllerchange();
  <\/script>`
  await page.setContent(`<!doctype html><html><head><style>${style}</style></head><body>${banner}${setup}<script>${updateSource}<\/script></body></html>`,{waitUntil:'load'})
  if(waiting)await page.waitForFunction(()=>document.getElementById('pwaUpdate').classList.contains('show'))
  return page
}

try{
  {
    const page=await openPage()
    const state=await page.evaluate(()=>{
      const box=document.getElementById('pwaUpdate'),button=document.getElementById('pwaUpdateBtn')
      button.focus();button.click()
      return {inert:box.inert,ariaHidden:box.getAttribute('aria-hidden'),focused:document.activeElement===button,posted:window.__posted.length}
    })
    assert.deepEqual(state,{inert:true,ariaHidden:'true',focused:false,posted:0},'a hidden update cannot receive focus or act on a click')
    await new Promise(resolve=>setTimeout(resolve,1500))
    assert.equal(await page.locator('#pwaUpdate').count(),1,'hidden click never reloads')
    await page.close()
  }

  {
    const page=await openPage({waiting:true})
    const shown=await page.evaluate(()=>{
      const box=document.getElementById('pwaUpdate'),button=document.getElementById('pwaUpdateBtn')
      button.focus()
      return {inert:box.inert,ariaHidden:box.getAttribute('aria-hidden'),focused:document.activeElement===button,disabled:button.disabled}
    })
    assert.deepEqual(shown,{inert:false,ariaHidden:'false',focused:true,disabled:false})
    await page.click('#pwaUpdateBtn')
    assert.deepEqual(await page.evaluate(()=>window.__posted),[{type:'SKIP_WAITING'}])
    // A measurement can start in the interval between the explicit click and fallback.
    await page.evaluate(()=>{state.running={sessionId:'raced-start'}})
    await new Promise(resolve=>setTimeout(resolve,1550))
    assert.equal(await page.locator('#pwaUpdate').count(),1,'the fallback does not reload a newly active measurement')
    assert.equal(await page.locator('#pwaUpdateBtn').isDisabled(),true)
    await page.evaluate(()=>{state.running=null})
    await new Promise(resolve=>setTimeout(resolve,1100))
    assert.equal(await page.locator('#pwaUpdateBtn').isEnabled(),true,'ending the measurement restores an explicit update action')
    assert.equal(await page.locator('#pwaUpdate').count(),1,'becoming safe does not auto-reload')
    await page.close()
  }

  {
    const page=await openPage({waiting:true,running:true})
    await page.evaluate(()=>window.__emitControllerChange())
    await new Promise(resolve=>setTimeout(resolve,1500))
    assert.equal(await page.locator('#pwaUpdate').count(),1,'controllerchange does not reload an active measurement')
    assert.equal(await page.locator('#pwaUpdateBtn').isDisabled(),true)
    await page.evaluate(()=>{state.running=null;state.finalizations=[{id:'pending-stop'}]})
    await new Promise(resolve=>setTimeout(resolve,1100))
    assert.equal(await page.locator('#pwaUpdateBtn').isDisabled(),true,'pending Stop finalization also blocks reload')
    await page.evaluate(()=>{state.finalizations=[]})
    await new Promise(resolve=>setTimeout(resolve,1100))
    assert.equal(await page.locator('#pwaUpdateBtn').isEnabled(),true)
    assert.match(await page.locator('#pwaUpdateMsg').textContent(),/업데이트를 눌러/)
    assert.equal(await page.locator('#pwaUpdate').count(),1,'completion leaves the explicit update prompt in place')
    await page.close()
  }

  {
    const page=await openPage({controlled:false})
    await page.evaluate(()=>window.__emitControllerChange())
    await new Promise(resolve=>setTimeout(resolve,100))
    assert.equal(await page.locator('#pwaUpdate').getAttribute('aria-hidden'),'true','first installation claim is not presented as an update')
    await page.close()
  }

  console.log('Chromium PWA update focus, fallback, controller and pending-Stop lifecycle PASS')
}finally{
  await browser.close()
}
