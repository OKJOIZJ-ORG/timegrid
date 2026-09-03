// Shared exact measurement identity and continuity. No state writes.
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.TG_CONTINUITY_CORE=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const WINDOW_MS=60000;
  function note(v){return String(v||"").trim().replace(/\s+/g," ");}
  function identity(v){
    const actId=String(v&&v.actId||"");if(!actId)return null;
    if(v&&v.todoId)return {kind:"todo",actId:actId,linkedId:String(v.todoId),note:""};
    if(v&&v.routineId)return {kind:"routine",actId:actId,linkedId:String(v.routineId),note:""};
    return {kind:"free",actId:actId,linkedId:"",note:note(v&&v.note)};
  }
  function same(a,b){const l=identity(a),r=identity(b);return !!l&&!!r&&l.kind===r.kind&&l.actId===r.actId&&l.linkedId===r.linkedId&&l.note===r.note;}
  function decide(previous,next,windowMs){
    const end=Number(previous&&previous.endTs)||0,start=Number(next&&next.startTs)||0,gap=start-end;
    if(!end||!start)return {merge:false,reason:"missing-exact-time",gapMs:null};
    if(!same(previous,next))return {merge:false,reason:"different-identity",gapMs:gap};
    if(gap<0)return {merge:false,reason:"overlap",gapMs:gap};
    if(gap>(Number(windowMs)||WINDOW_MS))return {merge:false,reason:"gap-too-large",gapMs:gap};
    return {merge:true,reason:"within-window",gapMs:gap};
  }
  function splitSpan(startTs,endTs){
    const start=Number(startTs)||0,end=Number(endTs)||0,out=[];let cursor=start,guard=0;
    if(!start||end<=start)return out;
    while(cursor<end&&guard<32){
      const base=new Date(cursor);base.setHours(0,0,0,0);
      const next=new Date(base);next.setDate(next.getDate()+1);
      const dayStart=base.getTime(),dayEnd=next.getTime(),fragmentEnd=Math.min(end,dayEnd);
      const date=[base.getFullYear(),String(base.getMonth()+1).padStart(2,"0"),String(base.getDate()).padStart(2,"0")].join("-");
      out.push({date:date,startTs:cursor,endTs:fragmentEnd,dayStart:dayStart,dayEnd:dayEnd});
      cursor=fragmentEnd;guard++;
    }
    return cursor===end?out:[];
  }
  function bounds(date,ev){
    const start=Number(ev?.startTs),end=Number(ev?.endTs);
    if(start>0&&end>start)return {startTs:start,endTs:end};
    if(!ev?.start||!ev?.end)return null;
    const minute=v=>{const[h,m]=v.split(':').map(Number);return h*60+m;};
    const s=minute(ev.start);let e=minute(ev.end);if(e===0&&s>0)e=1440;
    const base=new Date(date+'T00:00:00').getTime();
    return Number.isFinite(base+s+e)&&e>s?{startTs:base+s*60000,endTs:base+e*60000}:null;
  }
  function candidate(run,days){
    let best=null;
    for(const [date,day] of Object.entries(days||{}))for(const event of day.events||[]){
      const b=bounds(date,event);if(!b||b.endTs>Number(run.startTs))continue;
      const decision=decide({...event,endTs:b.endTs},run);if(!decision.merge)continue;
      if(!best||b.endTs>best.bounds.endTs)best={date,event,bounds:b,decision};
    }
    if(!best)return null;
    const id=String(best.event.continuityId||best.event.id);
    for(const [date,day] of Object.entries(days||{}))for(const event of day.events||[]){
      if(event===best.event||String(event.continuityId||event.id)===id)continue;
      const b=bounds(date,event);
      if(b&&b.startTs<Number(run.startTs)&&b.endTs>best.bounds.endTs)return null;
    }
    return best;
  }
  function logicalStart(run,days){
    const previous=candidate(run,days);
    return previous?Number(previous.event.spanStartTs||previous.bounds.startTs):Number(run.startTs);
  }
  return {WINDOW_MS,identity,same,decide,splitSpan,bounds,candidate,logicalStart};
});
