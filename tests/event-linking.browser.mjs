import assert from 'node:assert/strict'
import {createRequire} from 'node:module'

const require=createRequire(import.meta.url)
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const browser=await chromium.launch({channel:'msedge',headless:true})

try{
  const widths=process.env.TIMEGRID_BROWSER_WIDTH?[Number(process.env.TIMEGRID_BROWSER_WIDTH)]:process.env.TIMEGRID_SINGLE_BROWSER==='1'?[390]:[390,1280]
  const gsapModes=process.env.TIMEGRID_GSAP_MODE?[process.env.TIMEGRID_GSAP_MODE==='off']:process.env.TIMEGRID_SINGLE_BROWSER==='1'?[true]:[true,false]
  for(const width of widths)for(const noGsap of gsapModes){
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600,isMobile:width<600})
    const page=await context.newPage(),errors=[]
    page.setDefaultTimeout(5000)
    page.setDefaultNavigationTimeout(10000)
    page.on('pageerror',error=>errors.push(error.message))
    await page.goto((process.env.TIMEGRID_TEST_URL||'http://127.0.0.1:8765')+'/?event-linking=1'+(noGsap?'&no-gsap=1':''),{waitUntil:'domcontentloaded'})
    await page.evaluate(()=>window.fixtureEventLink.open())
    await page.locator('#evDlg').waitFor({state:'visible'})
    await page.evaluate(()=>{
      const input=document.querySelector('#evNote')
      input.value=''
      input.focus()
      input.dispatchEvent(new Event('input',{bubbles:true}))
    })
    const candidates=page.locator('.note-ac .ac-row')
    await page.waitForTimeout(200)
    const candidateState=await page.evaluate(()=>({
      eventDate:typeof editingEvDate==='undefined'?null:editingEvDate,
      value:document.querySelector('#evNote')?.value,
      list:document.querySelector('#evNote')?._acList?.outerHTML||null
    }))
    assert.ok(await candidates.count(),JSON.stringify({candidateState,errors}))
    await candidates.first().waitFor({state:'visible'})
    const labels=await candidates.allTextContents()
    assert.ok(labels.some(label=>label.includes('과거 날짜 할일')))
    assert.ok(labels.some(label=>label.includes('독서실 이동')))
    assert.equal(labels.some(label=>label.includes('오늘 날짜 할일')),false)
    assert.equal(labels.some(label=>label.includes('오늘 날짜 루틴')),false)
    await candidates.filter({hasText:'독서실 이동'}).click()
    await page.locator('#evNote').waitFor({state:'visible'})
    await page.waitForFunction(()=>document.querySelector('#evNote').value==='루틴 · 독서실 이동')
    await page.locator('#evSave').click()
    await page.locator('#evDlg').waitFor({state:'hidden'})
    const result=await page.evaluate(()=>({event:window.fixtureEventLink.read(),persisted:window.fixtureEventLink.persisted(),before:JSON.parse(window.fixtureEventLink.before),expected:window.fixtureEventLink.routineId}))
    for(const event of [result.event,result.persisted]){
      assert.equal(event.id,result.before.id)
      assert.equal(event.routineId,result.expected)
      assert.equal('todoId' in event,false)
      assert.equal('note' in event,false)
      assert.equal(event.startTs,result.before.startTs)
      assert.equal(event.endTs,result.before.endTs)
    }
    assert.deepEqual(errors,[])
    console.log(`${width}px GSAP=${!noGsap}: historical candidates and persisted routine link PASS`)
    await context.close()
  }
}finally{
  await browser.close()
}
