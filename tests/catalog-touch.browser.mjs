// Synthetic browser QA. No Firebase, authenticated user data, or Service Worker.
// Run the fixture server first; PLAYWRIGHT_PATH may point at the bundled package.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  for(const width of [390,1280,320]){
    const mobile=width<720;
    const context=await browser.newContext({viewport:{width,height:mobile?844:900},hasTouch:mobile,isMobile:mobile});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8765/'+(process.argv.includes('--no-gsap')?'?no-gsap=1':''));
    await page.evaluate(()=>{renderManager();openFsPanel(document.getElementById('actsDlg'));});
    const rows=page.locator('.cm-areas .cm-row');
    await rows.first().waitFor({state:'visible'});
    // Wait for the existing fullscreen panel's entry transition, not data state.
    await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await Promise.all(document.getElementById('actsDlg').getAnimations().map(a=>a.finished.catch(()=>{})));});
    const style=await rows.first().evaluate(node=>({background:getComputedStyle(node).backgroundColor,grip:getComputedStyle(node.querySelector('.cm-grip')).touchAction,select:getComputedStyle(node.querySelector('.cm-grip')).webkitUserSelect}));
    assert.equal(style.grip,'none');assert.equal(style.select,'none');
    if(mobile)assert.equal(style.background,'rgb(255, 255, 255)','mobile selection is navigation, not a retained gray row');
    // A stationary pointer gesture remains an ordinary accessible button tap.
    if(mobile)await rows.first().locator('.cm-grip').tap();
    else await rows.first().locator('.cm-grip').click();
    await page.locator('.cm-menu').waitFor({state:'visible',timeout:2000});
    assert.equal(await page.locator('.cm-menu').count(),1);
    await page.keyboard.press('Escape');
    const before=await rows.evaluateAll(nodes=>nodes.map(node=>node.dataset.id));
    const first=await rows.first().locator('.cm-grip').boundingBox(),last=await rows.nth(2).boundingBox();
    assert.ok(first&&last);
    const cdp=mobile?await context.newCDPSession(page):null;
    async function down(x,y){if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});else{await page.mouse.move(x,y);await page.mouse.down();}}
    async function move(x,y){if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});else await page.mouse.move(x,y);}
    async function up(){if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();}
    async function startDrag(){
      await page.evaluate(()=>{window.dragTrace=[];for(const type of ['pointerdown','pointermove','pointercancel','lostpointercapture'])document.addEventListener(type,e=>window.dragTrace.push([type,e.target.className,e.defaultPrevented,e.pointerId,e.button,e.isPrimary]),{capture:true,once:true});for(const type of ['blur','resize'])window.addEventListener(type,()=>window.dragTrace.push(type),{once:true});});
      await down(first.x+first.width/2,first.y+first.height/2);
      await move(first.x+first.width/2,last.y+last.height-10);
      try{await page.waitForFunction(()=>!!document.querySelector('.cm-drag-ghost'),{},{timeout:2000});}catch(e){console.log(JSON.stringify({first,last,errors,trace:await page.evaluate(()=>window.dragTrace),body:await page.locator('body').getAttribute('class')}));throw e;}
    }
    await startDrag();
    assert.equal(await page.evaluate(()=>getSelection().toString()),'');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('cm-drag-active')),true);
    assert.notDeepEqual(await rows.evaluateAll(nodes=>nodes.map(node=>node.dataset.id)),before,'cards preview their new positions while dragging');
    assert.deepEqual(await page.evaluate(()=>TG_CATALOG.areas(state.settings).map(a=>a.id||TG_CATALOG.legacyAreaId(a.name))),before,'preview has no data writes');
    await page.screenshot({path:path.join(os.tmpdir(),`timegrid-catalog-drag-${mobile?'mobile':'desktop'}.png`)});
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});else{await page.keyboard.press('Escape');await up();}
    await page.waitForFunction(()=>!document.querySelector('.cm-drag-ghost'));
    assert.deepEqual(await rows.evaluateAll(nodes=>nodes.map(node=>node.dataset.id)),before,'cancel restores initial order');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('cm-drag-active')),false);
    await startDrag();await up();
    await page.waitForFunction(()=>!document.querySelector('.cm-drag-ghost'));
    const expected=[before[1],before[2],before[0],...before.slice(3)];
    assert.deepEqual(await rows.evaluateAll(nodes=>nodes.map(node=>node.dataset.id)),expected);
    assert.deepEqual(await page.evaluate(()=>TG_CATALOG.areas(state.settings).map(a=>a.id||TG_CATALOG.legacyAreaId(a.name))),expected);
    // An editor remains selectable and mobile Back does not retain gray selection.
    await rows.first().locator('.cm-row-main').click();
    const activity=page.locator('.cm-activities .cm-row-main').first();
    if(await activity.count()){
      await activity.click();
      const input=page.locator('.cm-name-input');await input.waitFor();
      await input.fill('Selectable activity');await input.selectText();
      assert.equal(await input.evaluate(el=>el.selectionEnd-el.selectionStart),19);
      await page.keyboard.press('Escape');
    }
    if(mobile){await page.locator('.cm-back').click();assert.equal(await rows.first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');}
    await page.emulateMedia({reducedMotion:'reduce'});
    await rows.first().locator('.cm-grip').focus();await page.keyboard.press('Alt+ArrowDown');
    assert.equal(await page.evaluate(()=>document.querySelectorAll('.cm-drag-ghost,.cm-drag-origin').length),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(os.tmpdir(),`timegrid-catalog-settled-${mobile?'mobile':'desktop'}.png`)});
    console.log(`${mobile?'Touch':'Desktop'} ${width}: gesture, preview, cancel, commit, editor, keyboard, reduced motion PASS`);
    await context.close();
  }
}finally{await browser.close();}
