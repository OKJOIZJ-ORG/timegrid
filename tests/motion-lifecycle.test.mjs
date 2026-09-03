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

// Drag movement uses one compositor transform; layout anchors never drift.
const dragStyle={top:'20px',left:'30px'},dragCtx=vm.createContext({
 mdrag:{row:{style:dragStyle},originX:50,originY:60},adrag:{row:{style:{}},originX:10,originY:20},
 resolveActDrop(){},resolveAreaDrop(){},dragAutoScroll(){}})
vm.runInContext(section('function actDragMove(e){','function resolveActDrop(')+
 section('function areaDragMove(e){','function resolveAreaDrop('),dragCtx)
vm.runInContext('actDragMove({clientX:75,clientY:95});areaDragMove({clientX:25,clientY:10})',dragCtx)
assert.equal(dragStyle.transform,'translate3d(25px,35px,0)');assert.equal(dragStyle.top,'20px');assert.equal(dragStyle.left,'30px')
assert.equal(dragCtx.adrag.row.style.transform,'translate3d(15px,-10px,0)')
assert.match(section('function actDragCancel(e){','/* smooth drag'),/renderManager\(\)/)
assert.match(section('function areaDragCancel(e){','$("#areaAdd").addEventListener'),/renderManager\(\)/)

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
