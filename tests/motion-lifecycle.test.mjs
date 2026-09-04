import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)+a.length))
function element(){const listeners=new Map(),classes=new Set();return {style:{},dataset:{},
 classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,v)=>v?classes.add(x):classes.delete(x)},
 addEventListener:(k,f)=>{if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f)},
 removeEventListener:(k,f)=>listeners.get(k)?.delete(f),emit:(k,e)=>[...(listeners.get(k)||[])].forEach(f=>f(e))}}
const media={...element(),matches:false},timers=new Map();let seq=0,reduce=false
const doc=element();
const context={document:doc,window:{matchMedia:()=>media},rmPref:()=>reduce,setTimeout:f=>{timers.set(++seq,f);return seq},clearTimeout:i=>timers.delete(i)}
const c=vm.createContext(context)
vm.runInContext(section('/* MOTION_COMPLETION_CORE_START */','/* MOTION_COMPLETION_CORE_END */')+';this.after=afterTransition',c)
const el=element();let done=0
c.after(el,'transform',100,()=>done++)
el.emit('transitionend',{target:element(),propertyName:'transform'});assert.equal(done,0)
el.emit('transitionend',{target:el,propertyName:'opacity'});assert.equal(done,0)
el.emit('transitioncancel',{target:el,propertyName:'transform'});assert.equal(done,0,'queued old cancel must not complete a new owner')
el.emit('transitionend',{target:el,propertyName:'transform'});assert.equal(done,1);assert.equal(timers.size,0)
const cancel=c.after(el,'transform',100,()=>done++);cancel();assert.equal(timers.size,0)
c.after(el,'transform',100,()=>done++);[...timers.values()].forEach(f=>f());assert.equal(done,2,'missing event reaches bounded completion')
reduce=true;c.after(el,'transform',100,()=>done++);assert.equal(done,3,'reduced motion finishes immediately');reduce=false
c.after(el,'transform',100,()=>done++);media.matches=true;media.emit('change',{});assert.equal(done,4);media.matches=false
c.after(el,'transform',100,()=>done++);reduce=true;doc.emit('keydown',{});assert.equal(done,5);reduce=false

// Execute the real render dispatch for A→B→A before either transition settles.
let desired=['A'];const dispatch=[]
const w=vm.createContext({weekStripDates:['A'],weekTargetDates:null,weekDaysFor:()=>desired,state:{viewDate:'x'},
 isWeekChartVisible:()=>true,animateWeekWindowTo:ds=>{dispatch.push('animate');w.weekTargetDates=ds},snapRenderWeekWindow:()=>dispatch.push('snap')})
vm.runInContext(section('function renderStWeek(){','let weekMode='),w)
desired=['B'];vm.runInContext('renderStWeek()',w);desired=['A'];vm.runInContext('renderStWeek()',w);vm.runInContext('renderStWeek()',w)
assert.deepEqual(dispatch,['animate','animate'],'reverse retargets; identical in-flight request does not snap')

// Actual wheel cancellation path restores event processing after a glide.
const wheels={'#rwHr':{scrollTop:1},'#rwMin':{scrollTop:2}}
const rw=vm.createContext({$:(id)=>wheels[id],GS:{killTweensOf:()=>{}},clearTimeout:()=>{},rwMark:()=>{},rmPref:()=>false,
 _rwEpoch:1,_rwTarget:'08:20',_rwSquelch:true,_rwTimer:7,RW_H:38})
vm.runInContext(section('function rwCancel(){','function rttPad(')+section('function rwScrollTo(','function rttSetActive(')+';rwScrollTo("07:00",false)',rw)
assert.equal(rw._rwSquelch,false);assert.equal(wheels['#rwHr'].scrollTop,7*38);assert.equal(rw._rwTarget,null)

// Clicked wheel values belong to the originating field, not an animation callback.
const tweenCallbacks=[];wheels['#rwHr'].childElementCount=24;wheels['#rwMin'].childElementCount=60
Object.assign(rw,{_rttField:'start',_rttVal:{start:'07:00',end:'09:00'},rttRenderField:()=>{},rttHintDefault:()=>{},
 GS:{killTweensOf:()=>{},to:(el,opts)=>tweenCallbacks.push(opts.onComplete)}})
vm.runInContext(section('function rttPad(','function rttFieldEl(')+section('function rwIdx(','function rwMark(')+section('function rwGlide(','function rwScrollTo('),rw)
vm.runInContext('rwGlide($("#rwHr"),8)',rw)
assert.equal(rw._rttVal.start,'08:00','semantic selection is immediate')
vm.runInContext('_rttField="end";rwScrollTo("09:00",false)',rw);tweenCallbacks[0]()
assert.equal(rw._rttVal.start,'08:00');assert.equal(rw._rttVal.end,'09:00')

// A previous calendar session cannot apply a date or close a reopened picker.
const dlg=element(),scroll=element(),pending=new Map();let applied=0,closed=0,id=0
dlg.open=true;dlg.close=()=>{closed++;dlg.open=false}
const ec=vm.createContext({$:(selector)=>selector==='#expCalDlg'?dlg:scroll,GS:null,
 ecalSession:1,ecalApplyTimer:null,ecalCloseCancel:null,ecalScrollTween:null,ecalClosing:false,ecalMode:'day',
 ecalPaint:()=>{},ecalCellPop:()=>{},weekReducedMotion:()=>false,ecalApplyNow:()=>applied++,
 setTimeout:f=>{pending.set(++id,f);return id},clearTimeout:i=>pending.delete(i)})
vm.runInContext(section('function resetEcalSession(){','$("#expCalDlg").addEventListener')+section('function ecalPickDay(','let ecalCallback='),ec)
vm.runInContext('ecalPickDay("2026-09-01")',ec);const stalePick=[...pending.values()][0]
vm.runInContext('resetEcalSession()',ec);stalePick();assert.equal(applied,0)
vm.runInContext('ecalCloseFx(ecalApplyNow)',ec);const staleClose=[...pending.values()][0]
vm.runInContext('resetEcalSession()',ec);staleClose();assert.equal(closed,0);assert.equal(applied,0)

// Execute the real manager drag owner: compositor-only lift, pointer ownership,
// threshold, cancellation, lost capture, and one commit on a completed drop.
const managerSource=fs.readFileSync(new URL('../catalog-manager.js',import.meta.url),'utf8')
const managerDrag=managerSource.slice(managerSource.indexOf('  function attachDrag('),managerSource.indexOf('  function catalogRow('))
assert.ok(managerDrag.startsWith('  function attachDrag('))
const handle=element(),dragRow=element(),dropRow=element(),dragList=element(),captures=new Set(),ghosts=[],drops=[]
let removedGhosts=0,openedMenus=0
dragList.setPointerCapture=i=>captures.add(i);dragList.hasPointerCapture=i=>captures.has(i);dragList.releasePointerCapture=i=>captures.delete(i)
dragList.children=[dragRow,dropRow];dragRow.parentNode=dropRow.parentNode=dragList
dragList.getBoundingClientRect=()=>({top:0});dropRow.offsetTop=80;dropRow.offsetHeight=44
dragList.append=node=>{dragList.children=dragList.children.filter(n=>n!==node);dragList.children.push(node)}
dragList.insertBefore=(node,target)=>{dragList.children=dragList.children.filter(n=>n!==node);const i=target?dragList.children.indexOf(target):dragList.children.length;dragList.children.splice(i,0,node)}
dragRow.getBoundingClientRect=()=>({top:20,left:30,width:220,height:44})
dragRow.cloneNode=()=>({...element(),getBoundingClientRect:dragRow.getBoundingClientRect,setAttribute(){},querySelectorAll:()=>[],remove:()=>removedGhosts++})
dropRow.dataset={kind:'activity',id:'next'};dropRow.getBoundingClientRect=()=>({top:80,height:44});dropRow.closest=()=>dropRow
const dragDoc={...element(),body:{...element(),append:g=>ghosts.push(g)},querySelectorAll:()=>[dragRow,dropRow],querySelector:()=>null,elementFromPoint:()=>dropRow}
const dragFrames=new Map();let nextFrame=0
const dragCtx=vm.createContext({document:dragDoc,window:{...element(),innerWidth:390,getSelection:()=>({removeAllRanges(){}})},dragCancel:null,canMove:()=>false,cancelRowMotion(){},openMenu(){openedMenus++},rowPositions:()=>new Map(),animateRows(){},requestAnimationFrame:f=>{dragFrames.set(++nextFrame,f);return nextFrame},cancelAnimationFrame:i=>dragFrames.delete(i),setTimeout:()=>1,reorder:(...args)=>drops.push(args)})
const moveDrag=e=>{dragList.emit('pointermove',e);for(const[id,f]of [...dragFrames]){dragFrames.delete(id);f()}}
vm.runInContext(managerDrag+';this.attach=attachDrag',dragCtx)
dragCtx.attach(handle,dragRow,'activity','original')
const pe=(x,y,pointerId=1)=>({button:0,isPrimary:true,pointerId,clientX:x,clientY:y,preventDefault(){},stopPropagation(){}})
handle.emit('pointerdown',pe(50,60));moveDrag(pe(75,95,2))
assert.equal(ghosts.length,0,'another pointer cannot move this drag')
moveDrag(pe(75,95))
assert.equal(ghosts.length,1)
assert.equal(ghosts[0].style.transform,'translate3d(25px,35px,0)')
assert.equal(ghosts[0].style.top,'20px');assert.equal(ghosts[0].style.left,'30px')
assert.equal(ghosts[0].inert,true,'the visual clone cannot receive keyboard focus')
dragList.emit('pointercancel',pe(75,95))
assert.equal(removedGhosts,1);assert.equal(captures.size,0);assert.equal(drops.length,0)
assert.equal(dragCtx.dragCancel,null);assert.equal(dragRow.classList.contains('cm-drag-origin'),false)
assert.equal(dropRow.classList.contains('cm-drop-before'),false)
moveDrag(pe(90,100));assert.equal(ghosts.length,1,'cancel removes movement listeners')
handle.emit('pointerdown',pe(50,60));moveDrag(pe(52,62));dragList.emit('pointerup',pe(52,62))
assert.equal(ghosts.length,1);assert.equal(drops.length,0,'a click-sized movement cannot reorder')
assert.equal(openedMenus,1,'a stationary captured gesture opens the grip menu once')
handle.emit('pointerdown',pe(50,60));moveDrag(pe(75,95));dragCtx.dragCancel()
assert.equal(removedGhosts,2);assert.equal(drops.length,0,'re-render/blur cancellation never commits')
handle.emit('pointerdown',pe(50,60));moveDrag(pe(75,95));dragList.emit('lostpointercapture',pe(75,95))
assert.equal(removedGhosts,3);assert.equal(drops.length,0,'unexpected capture loss restores the list')
handle.emit('pointerdown',pe(50,60));moveDrag(pe(75,95));dragList.emit('pointerup',pe(75,95))
assert.equal(drops.length,1);assert.deepEqual(drops[0],['activity','original','next',true])
assert.equal(dragCtx.dragCancel,null);assert.equal(captures.size,0)
assert.equal(openedMenus,1,'drag completion or cancellation never activates a menu')

// Logical keys, not labels or segment geometry, own pointer state.
const one=element(),two=element(),other=element();one.dataset.hoverKey=two.dataset.hoverKey='routine/date/id1';other.dataset.hoverKey='routine/date/id2'
one.closest=()=>one;two.closest=()=>two;other.closest=()=>other
const h=vm.createContext({window:{matchMedia:()=>({matches:true})}})
vm.runInContext(section('/* LOGICAL_HOVER_CORE_START */','/* LOGICAL_HOVER_CORE_END */')+';this.paint=paintLogicalHover',h)
const root={querySelectorAll:()=>[one,two,other]}
h.paint(root,{target:one,pointerType:'mouse'},true)
assert.ok(one.classList.contains('hover-group')&&two.classList.contains('hover-group'));assert.equal(other.classList.contains('hover-group'),false)
h.paint(root,{target:one,relatedTarget:two,pointerType:'mouse'},false);assert.ok(two.classList.contains('hover-group'))
h.paint(root,{target:two,pointerType:'mouse'},false);assert.equal(one.classList.contains('hover-group'),false)
h.paint(root,{target:one,pointerType:'touch'},true);assert.equal(one.classList.contains('hover-group'),false)
assert.doesNotMatch(html,/transition:\s*all\b/)
assert.match(html,/sc\.style\.scrollSnapType="y mandatory";\s*const target=/)
console.log('Motion completion, retarget, wheel cancellation, and logical hover regressions passed')
