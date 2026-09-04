// Actual date controls and save/normalization in isolated browser storage.
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
    await page.goto('http://127.0.0.1:8765/?todo-date=1'+(noGsap?'&no-gsap=1':''));
    await page.evaluate(async()=>{setTab('planner');await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));window.scrollTo(0,0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const before=await page.evaluate(()=>JSON.stringify(state.days[fixtureTodo.source]));
    await page.locator('.todo-more').first().click();
    const tomorrow=page.locator('[data-todo-action="tomorrow"]'),date=page.locator('[data-todo-action="date"]');
    assert.equal(await tomorrow.isEnabled(),true);assert.equal(await date.isEnabled(),true);
    assert.equal(await page.locator('#todoActionNote').isVisible(),false,'eligible action needs no standing explanation');
    assert.equal(await page.locator('[data-todo-action]').count(),4,'no extra Copy menu');
    if(!noGsap)await page.screenshot({path:path.join(os.tmpdir(),`timegrid-todo-date-menu-${width}.png`)});
    await tomorrow.click();
    let data=await page.evaluate(()=>({source:JSON.stringify(state.days[fixtureTodo.source]),next:state.days[fixtureTodo.target].todos[0],events:state.days[fixtureTodo.target].events.length,persisted:JSON.parse(localStorage.getItem(LS_KEY)).days[fixtureTodo.target].todos}));
    assert.equal(data.source,before);assert.equal(data.next.done,false);assert.equal(data.events,0);assert.equal(data.persisted[0].id,data.next.id);
    await page.locator('#toast .t-undo').click();
    assert.equal(await page.evaluate(()=>state.days[fixtureTodo.target].todos.length),0,'actual normalized save supports undo');
    assert.equal(await page.evaluate(()=>JSON.stringify(state.days[fixtureTodo.source])),before);
    // Choose an arbitrary later preset via the existing modal, not a new command.
    await page.locator('.todo-more').first().click();await date.click();
    await page.locator('#todoMoveDlg').waitFor({state:'visible'});
    assert.equal(await page.locator('#todoMoveMsg').textContent(),'');
    await page.locator('#tmPre7').click();
    const target=await page.evaluate(()=>todoMoveTarget);
    if(!noGsap)await page.screenshot({path:path.join(os.tmpdir(),`timegrid-todo-date-dialog-${width}.png`)});
    await page.locator('#todoMoveOk').click();
    assert.equal(await page.evaluate(ds=>state.days[ds].todos.length,target),1);
    // Repeating the same request preserves the target row and its ID.
    await page.evaluate(ds=>moveTodoTo(state.days[fixtureTodo.source].todos[0],fixtureTodo.source,ds),target);
    assert.equal(await page.evaluate(ds=>state.days[ds].todos.length,target),1);
    assert.equal(await page.evaluate(()=>JSON.stringify(state.days[fixtureTodo.source])),before);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    console.log(`${width}px GSAP=${!noGsap}: actual date menu/dialog, persistent continuation, original conservation, undo and no duplicate PASS`);
    await ctx.close();
  }
}finally{await browser.close();}
