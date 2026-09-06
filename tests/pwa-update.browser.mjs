import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
const marker=source.indexOf('/* ================= PWA service worker / safe update flow ================= */')
const start=source.indexOf('(function(){',marker),end=source.indexOf('\n})();',start)+6
const updateSource=source.slice(start,end),build=updateSource.match(/const BUILD_VERSION="([^"]+)"/)[1]
assert.ok(!/pwaUpdate|pwa-update|새 버전이 준비됐어요/.test(source),'remove the complete retry control surface')
const browser=await chromium.launch({channel:'msedge',headless:true})
async function openPage({waiting=true,running=false,pending=false}={}){
  const page=await browser.newPage()
  await page.setContent(`<body><input id="draft"><div id="alive"></div><script>
    window.state={running:${running?'{}':'null'},finalizations:${pending?'[{}]':'[]'}};
    window.__posted=[];window.__events={};window.__hidden=false;
    Object.defineProperty(document,'hidden',{get:()=>window.__hidden});
    Object.defineProperty(window,'sessionStorage',{value:{getItem:()=>null,setItem:()=>{}}});
    window.__worker={state:'installed',postMessage(m,p){if(m.type==='GET_VERSION')p[0].postMessage({version:'test-next'});else window.__posted.push(m)}};
    window.__reg={waiting:${waiting?'window.__worker':'null'},addEventListener(){},update:async()=>{}};
    window.__sw={controller:{postMessage(m,p){p[0].postMessage({version:'${build}'})}},register:async()=>window.__reg,addEventListener:(t,f)=>window.__events[t]=f};
    Object.defineProperty(navigator,'serviceWorker',{value:window.__sw});
    window.__claim=()=>{window.__worker.state='activated';window.__reg.waiting=null;window.__sw.controller=window.__worker;window.__events.controllerchange()};
    window.__visibility=h=>{window.__hidden=h;document.dispatchEvent(new Event('visibilitychange'))};
  </script><script>${updateSource}</script></body>`,{waitUntil:'load'})
  return page
}
try{
  {
    const page=await openPage()
    await page.evaluate(()=>__claim())
    await page.waitForFunction(()=>!document.getElementById('alive'),undefined,{timeout:3000})
    assert.equal(await page.locator('#alive').count(),0,'an untouched entry reloads an identified different build')
    await page.close()
  }
  {
    const page=await openPage()
    assert.equal(await page.evaluate(()=>__posted.length),1,'untouched entry activates an already prepared worker')
    await page.waitForTimeout(1700)
    assert.equal(await page.locator('#alive').count(),1,'waiting never causes a timer reload or retry prompt')
    await page.locator('#draft').fill('unsaved note')
    await page.evaluate(()=>__claim())
    await page.waitForTimeout(100)
    assert.equal(await page.locator('#draft').evaluate(el=>el.value),'unsaved note','input during activation cancels entry reload')
    await page.close()
  }
  for(const options of [{running:true},{pending:true}]){
    const page=await openPage(options)
    assert.equal(await page.evaluate(()=>__posted.length),0,'running and pending Stop prohibit activation')
    await page.evaluate(()=>{state.running=null;state.finalizations=[]})
    await page.waitForTimeout(100)
    assert.equal(await page.evaluate(()=>__posted.length),0,'becoming idle never interrupts the current screen')
    await page.evaluate(()=>__visibility(true))
    assert.equal(await page.evaluate(()=>__posted.length),1,'safe hidden transition prepares next entry')
    await page.evaluate(()=>__claim())
    assert.equal(await page.locator('#alive').count(),1,'hidden transition does not reload')
    await page.close()
  }
  {
    const page=await openPage({waiting:false})
    await page.evaluate(()=>{__reg.waiting=__worker})
    assert.equal(await page.evaluate(()=>__posted.length),0,'background discovery is quiet during foreground use')
    await page.locator('#draft').fill('keep editor')
    await page.evaluate(()=>__visibility(true))
    assert.equal(await page.evaluate(()=>__posted.length),0,'an open editor defers background activation')
    await page.close()
  }
  console.log('Passive PWA entry, delayed activation, editing, running and pending-Stop guards PASS')
}finally{await browser.close()}
