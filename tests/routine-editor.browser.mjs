import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  for(const width of [390,1280])for(const noGsap of [false,true]){
    const ctx=await browser.newContext({viewport:{width,height:900},hasTouch:width<600,isMobile:width<600});
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.TIMEGRID_TEST_URL||'http://127.0.0.1:8765')+'/?todo-date=1'+(noGsap?'&no-gsap=1':''));
    await page.evaluate(async()=>{
      state.viewDate=ymd(new Date());state.settings.routineDefs=[{id:'editor-first',name:'첫 루틴',days:[0,1,2,3,4,5,6]},{id:'editor-second',name:'다른 루틴',days:[0,1,2,3,4,5,6]}];
      ensureDay(state.viewDate);save();renderAll();setTab('planner');await document.fonts.ready;
      await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    await page.locator('.rt-edit-switch').click();
    const row=page.locator('.rt-edit-row[data-rd="editor-first"]'),name=row.locator('.rt-edit-name');
    await name.fill('연속 수정한 루틴');await name.press('Tab');
    await row.locator('.rt-days .dow-pill').nth(0).click();
    await row.locator('.rt-time-btn').click();
    await page.locator('#rwHr .rtt-item[data-i="9"]').click();
    await page.locator('#rwMin .rtt-item[data-i="0"]').click();
    await page.locator('#rttApply').click();
    await page.locator('.rt-edit-row[data-rd="editor-second"] .rt-edit-name').fill('다른 행도 수정');
    await row.locator('.rt-days .dow-pill').nth(1).click();
    const before=await page.evaluate(()=>{
      const current=state.settings.routineDefs.find(d=>d.id==='editor-first');
      return {current,persisted:JSON.parse(localStorage.getItem(LS_KEY)).settings.routineDefs.find(d=>d.id===current.id)};
    });
    assert.equal(before.current.name,'연속 수정한 루틴');assert.equal(before.current.time,'09:00');assert.deepEqual(before.current.days,[2,3,4,5,6]);assert.deepEqual(before.persisted,before.current);
    if(!noGsap)await page.screenshot({path:path.join(os.tmpdir(),`timegrid-routine-editor-${width}.png`)});
    await row.locator('.del').click();await row.waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>state.settings.routineDefs.some(d=>d.id==='editor-first')),false);
    await page.locator('#toast .t-undo').click();
    const restored=await page.evaluate(()=>state.settings.routineDefs.find(d=>d.id==='editor-first'));
    assert.deepEqual(restored,before.current);assert.equal(await page.locator('.rt-edit-row[data-rd="editor-first"]').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
    console.log(`${width}px GSAP=${!noGsap}: sequential name/day/time/cross-row edits, persistent state, delete and undo PASS`);
    await ctx.close();
  }
}finally{await browser.close();}
