// Actual running-snapshot callback, ack reducer, queueRender and rendered button.
// Uses only tests/serve-fixture.mjs; Firebase, heartbeat and worker are disabled.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  for(const width of [390,1280])for(const noGsap of [false,true]){
    const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width<720,hasTouch:width<720});
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8765/?ack-observation=1'+(noGsap?'&no-gsap=1':''));
    await page.evaluate(()=>setTab('tracker'));
    const button=page.locator('#swBtn');
    assert.equal(await button.isDisabled(),true);
    assert.match(await button.textContent(),/기록 동기화/);
    // Cached/locally pending observations cannot clear the real pending state.
    await page.evaluate(()=>{fixtureAck.emit({fromCache:true});fixtureAck.emit({hasPendingWrites:true});});
    assert.equal(await page.evaluate(()=>fixtureAck.reads()),0);
    assert.equal(await button.isDisabled(),true);
    // Identical cached -> server data must still deliver metadata changes.
    // Server receipt absence triggers direct ack observation, even while the
    // ordinary upload queue remains stalled. Missing ack is still pending.
    await page.evaluate(()=>{fixtureAck.emit();fixtureAck.resolve(false);});
    assert.equal(await button.isDisabled(),true);
    await page.evaluate(()=>{fixtureAck.emit({fromCache:true});fixtureAck.emit();});
    assert.equal(await page.evaluate(()=>fixtureAck.reads()),2);
    const observedAt=Date.now();
    await page.evaluate(()=>fixtureAck.resolve(true));
    await page.waitForFunction(()=>!document.getElementById('swBtn').disabled,{},{timeout:2000});
    assert.equal(await page.evaluate(()=>fixtureAck.pending()),0);
    assert.match(await button.textContent(),/시작/);
    const releaseMs=Date.now()-observedAt;
    // A delayed old snapshot must not bring back a completed pending receipt.
    await page.evaluate(()=>fixtureAck.emit({stale:true}));
    await page.evaluate(()=>new Promise(requestAnimationFrame));
    assert.equal(await button.isDisabled(),false);
    assert.equal(await page.evaluate(()=>fixtureAck.reads()),2);
    assert.deepEqual(errors,[]);
    console.log(`${width}px GSAP=${!noGsap}: pending gate, authoritative ack, stale snapshot and button release PASS (${releaseMs}ms after synthetic ack)`);
    await ctx.close();
  }
}finally{await browser.close();}
