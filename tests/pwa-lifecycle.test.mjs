import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8')
const version=source.match(/const VERSION = "([^"]+)"/)?.[1]
assert.ok(version)
const shellName=`${version}-shell`,runtimeName=`${version}-runtime`

function harness({names=[],cacheFor=()=>({match:async()=>undefined,put:async()=>{},addAll:async()=>{}}),fetchImpl=async()=>new Response('network')}={}){
  const handlers=new Map(),deleted=[],opened=[],claims=[]
  const context=vm.createContext({
    URL,Request,Response,DOMException,
    fetch:fetchImpl,
    caches:{
      keys:async()=>names,
      delete:async name=>{deleted.push(name);return true},
      open:async name=>{opened.push(name);return cacheFor(name)},
      match:async()=>{throw new Error('global caches.match must not read another app cache')}
    },
    self:{
      location:{origin:'https://okjoizj-org.github.io'},
      clients:{claim:async()=>{claims.push(true)}},
      skipWaiting(){},
      addEventListener(type,listener){handlers.set(type,listener)}
    }
  })
  vm.runInContext(source,context)
  return {handlers,deleted,opened,claims}
}

async function activate(h){
  let promise
  h.handlers.get('activate')({waitUntil(value){promise=value}})
  await promise
}

async function fetchThrough(h,request){
  let promise
  h.handlers.get('fetch')({request,respondWith(value){promise=value}})
  return {promise,response:()=>promise}
}

{
  const oldOwn='timegrid-v0.0.0-20000101-shell'
  const h=harness({names:[oldOwn,shellName,runtimeName,'other-pwa-v9-shell','shared-assets']})
  await activate(h)
  assert.deepEqual(h.deleted,[oldOwn],'activation deletes only stale TimeGrid caches')
  assert.equal(h.claims.length,1)
}

{
  let networkCalls=0
  const shell={match:async request=>String(request.url||request).endsWith('/catalog-core.js')?new Response('owned-shell'):undefined}
  const runtime={match:async()=>undefined,put:async()=>{}}
  const h=harness({cacheFor:name=>name===shellName?shell:runtime,fetchImpl:async()=>{networkCalls++;throw new Error('unexpected network')}})
  const {response}=await fetchThrough(h,new Request('https://okjoizj-org.github.io/timegrid/catalog-core.js'))
  assert.equal(await (await response()).text(),'owned-shell')
  assert.equal(networkCalls,0)
}

{
  const shell={match:async request=>request==='./index.html'?new Response('owned-index'):undefined}
  const runtime={match:async()=>undefined,put:async()=>{}}
  const h=harness({cacheFor:name=>name===shellName?shell:runtime,fetchImpl:async()=>{throw new Error('offline')}})
  const request={method:'GET',mode:'navigate',url:'https://okjoizj-org.github.io/timegrid/deep-link'}
  const {response}=await fetchThrough(h,request)
  assert.equal(await (await response()).text(),'owned-index','offline navigation falls back only through owned caches')
}

{
  let releasePut
  const putDone=new Promise(resolve=>{releasePut=resolve})
  const shell={match:async()=>undefined}
  const runtime={match:async()=>undefined,put:async()=>putDone}
  const h=harness({cacheFor:name=>name===shellName?shell:runtime,fetchImpl:async()=>new Response('network-ok')})
  const {response}=await fetchThrough(h,new Request('https://okjoizj-org.github.io/timegrid/catalog-core.js'))
  let responseSettled=false
  response().then(()=>{responseSettled=true})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(responseSettled,false,'fetch response lifetime includes the runtime cache write')
  releasePut()
  assert.equal(await (await response()).text(),'network-ok')
}

{
  const shell={match:async()=>undefined}
  const runtime={match:async()=>undefined,put:async()=>{throw new DOMException('quota','QuotaExceededError')}}
  const h=harness({cacheFor:name=>name===shellName?shell:runtime,fetchImpl:async()=>new Response('network-survives')})
  const {response}=await fetchThrough(h,new Request('https://okjoizj-org.github.io/timegrid/catalog-core.js'))
  assert.equal(await (await response()).text(),'network-survives','cache storage failure does not discard a network response')
}

console.log('PWA cache ownership, offline fallback and event-lifetime regressions passed')
