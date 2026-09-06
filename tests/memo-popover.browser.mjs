// Historical memo autocomplete must stay attached while its dialog animates.
// Candidate selection uses a real pointer/touch input against the rendered row.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'

const require=createRequire(import.meta.url)
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const browser=await chromium.launch({channel:'msedge',headless:true})
const base=process.env.TIMEGRID_TEST_URL||'http://127.0.0.1:8765'

function anchored({input,list,viewport}){
  const expectedLeft=Math.max(viewport.x+8,Math.min(input.left,viewport.x+viewport.width-list.width-8))
  const verticalGap=Math.min(Math.abs(list.top-(input.bottom+4)),Math.abs(list.bottom-(input.top-4)))
  return {leftError:Math.abs(list.left-expectedLeft),verticalGap}
}

async function geometry(page){
  return page.evaluate(()=>{
    const input=document.querySelector('#evNote')
    const list=input?._acList
    const vv=window.visualViewport
    const box=node=>{
      const r=node.getBoundingClientRect()
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}
    }
    return {
      input:box(input),
      list:box(list),
      pendingFrame:!!list._placeFrame,
      dialogEntering:document.querySelector('#evDlg').classList.contains('dialog-entering'),
      viewport:{x:vv?.offsetLeft||0,y:vv?.offsetTop||0,width:vv?.width||innerWidth,height:vv?.height||innerHeight}
    }
  })
}

async function selectRoutineWithPointer(page,width){
  const row=page.locator('.note-ac .ac-row').filter({hasText:'독서실 이동'})
  await row.waitFor({state:'visible'})
  const box=await row.boundingBox()
  assert.ok(box&&box.width>0&&box.height>0,'routine candidate must have clickable rendered bounds')
  const x=box.x+box.width/2,y=box.y+box.height/2
  const hit=await page.evaluate(({x,y})=>{
    const node=document.elementFromPoint(x,y),dialog=document.querySelector('#evDlg').getBoundingClientRect()
    return {candidate:!!node?.closest('.note-ac .ac-row'),tag:node?.tagName,className:node?.className,text:node?.textContent,dialog:{left:dialog.left,right:dialog.right,top:dialog.top,bottom:dialog.bottom}}
  },{x,y})
  assert.equal(hit.candidate,true,JSON.stringify({width,box,x,y,hit}))
  if(width<600)await page.touchscreen.tap(x,y)
  else await page.mouse.click(x,y)
  await page.waitForTimeout(100)
  const outcome=await page.evaluate(()=>{
    const input=document.querySelector('#evNote'),dialog=document.querySelector('#evDlg')
    return {value:input.value,dialogOpen:dialog.open,dialogClass:dialog.className,entrances:window.__memoDlgInStarts}
  })
  assert.equal(outcome.value,'루틴 · 독서실 이동',JSON.stringify({width,box,x,y,hit,outcome}))
  assert.equal(outcome.dialogClass.includes('dialog-entering'),false,'pointer selection must not restart dialog entrance motion')
  assert.equal(outcome.entrances,1,'dialog entrance must run once per open')
  assert.equal(await page.evaluate(()=>window.__memoCandidateClick),true,'candidate selection must receive a trusted click')
}

async function checkPersisted(page,{exact,note,routineId}){
  const result=await page.evaluate(()=>({
    event:window.fixtureEventLink.read(),
    persisted:window.fixtureEventLink.persisted(),
    before:JSON.parse(window.fixtureEventLink.before)
  }))
  for(const event of [result.event,result.persisted]){
    assert.equal(event.id,result.before.id)
    assert.equal(event.start,result.before.start)
    assert.equal(event.end,result.before.end)
    assert.equal(event.note,note)
    assert.equal(event.routineId,routineId)
    if(exact){
      assert.equal(event.startTs,result.before.startTs)
      assert.equal(event.endTs,result.before.endTs)
    }else{
      assert.equal('startTs' in event,false)
      assert.equal('endTs' in event,false)
    }
  }
}

try{
  const widths=process.env.TIMEGRID_MEMO_WIDTH?[Number(process.env.TIMEGRID_MEMO_WIDTH)]:[390,1280]
  const timings=process.env.TIMEGRID_MEMO_TIMING?[process.env.TIMEGRID_MEMO_TIMING]:['early','late']
  for(const width of widths)for(const timing of timings){
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600,isMobile:width<600})
    const page=await context.newPage(),errors=[]
    page.setDefaultTimeout(5000)
    page.on('pageerror',error=>errors.push(error.message))
    await page.addInitScript(()=>{
      window.__memoDlgInStarts=0
      window.addEventListener('animationstart',event=>{
        if(event.target?.id==='evDlg'&&event.animationName==='dlgIn')window.__memoDlgInStarts++
      },true)
      window.addEventListener('click',event=>{
        if(event.target instanceof Element&&event.target.closest('.note-ac .ac-row'))window.__memoCandidateClick=event.isTrusted
      },true)
    })
    await page.goto(base+'/?event-linking=1',{waitUntil:'domcontentloaded'})

    const exact=timing==='early'
    if(!exact){
      await page.evaluate(()=>{
        const event=window.fixtureEventLink.read()
        const stored=state.days[window.fixtureEventLink.date].events.find(row=>row.id===event.id)
        for(const key of ['startTs','endTs','sessionId','continuityId'])delete stored[key]
        window.fixtureEventLink.before=JSON.stringify(stored)
        save()
      })
    }

    if(timing==='early'){
      await page.evaluate(()=>{
        window.fixtureEventLink.open()
        const input=document.querySelector('#evNote')
        input.value=''
        input.focus()
        input.dispatchEvent(new Event('input',{bubbles:true}))
      })
      await page.locator('.note-ac .ac-row').first().waitFor({state:'visible'})
      await page.waitForTimeout(200)
    }else{
      await page.evaluate(()=>window.fixtureEventLink.open())
      await page.locator('#evDlg').waitFor({state:'visible'})
      await page.waitForTimeout(450)
      await page.locator('#evNote').click()
      await page.locator('#evNote').fill('')
      await page.locator('.note-ac .ac-row').first().waitFor({state:'visible'})
      await page.waitForTimeout(200)
    }

    const first=await geometry(page),firstAnchor=anchored(first)
    // During the transform/containing-block transition, keep the transient list
    // close enough to remain visually associated; the settled check is exact.
    assert.ok(firstAnchor.leftError<=2&&firstAnchor.verticalGap<=20,JSON.stringify({width,timing,phase:'first',firstAnchor,first}))
    await page.waitForTimeout(300)
    await page.waitForFunction(()=>{
      const input=document.querySelector('#evNote'),dialog=document.querySelector('#evDlg')
      return !dialog.classList.contains('dialog-entering')&&!input._acList._placeFrame
    })
    const settled=await geometry(page),settledAnchor=anchored(settled)
    assert.ok(settledAnchor.leftError<=2&&settledAnchor.verticalGap<=7,JSON.stringify({width,timing,phase:'settled',settledAnchor,first,settled}))
    assert.equal(settled.pendingFrame,false,'finite motion follow-up must stop after geometry settles')
    assert.equal(settled.dialogEntering,false,'settled dialog must release its one-shot entrance class')

    await selectRoutineWithPointer(page,width)
    await page.locator('#evSave').click()
    await page.locator('#evDlg').waitFor({state:'hidden'})
    await page.waitForTimeout(50)
    assert.equal(await page.evaluate(()=>!!document.querySelector('#evNote')._acList._placeFrame),false,'hidden autocomplete must not keep a position frame pending')
    await checkPersisted(page,{exact,note:undefined,routineId:'fixture-past-routine'})

    // Reopen the saved link, replace it with a free memo, save, and reopen again.
    await page.evaluate(()=>window.fixtureEventLink.open())
    await page.locator('#evNote').waitFor({state:'visible'})
    assert.equal(await page.locator('#evNote').inputValue(),'루틴 · 독서실 이동')
    await page.locator('#evNote').fill('후속 자유 메모')
    await page.locator('#evSave').click()
    await page.locator('#evDlg').waitFor({state:'hidden'})
    await checkPersisted(page,{exact,note:'후속 자유 메모',routineId:undefined})
    await page.evaluate(()=>window.fixtureEventLink.open())
    assert.equal(await page.locator('#evNote').inputValue(),'후속 자유 메모')
    assert.deepEqual(errors,[])
    console.log(`${width}px ${timing} focus ${exact?'exact':'minute-only'} event: anchored trusted selection and reopen PASS`)
    await context.close()
  }
}finally{
  await browser.close()
}
