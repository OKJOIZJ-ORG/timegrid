/* Shared, side-effect-free catalog lifecycle. Cloud receipts live outside settings/main. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TG_CATALOG=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PROTOCOL=2;
  const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
  const list=x=>Array.isArray(x)?x:[];
  function canonical(x){
    if(Array.isArray(x))return x.map(canonical);
    if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,canonical(x[k])]));
    return x;
  }
  const key=x=>JSON.stringify(canonical(x));
  const legacyAreaId=name=>'area_legacy_'+encodeURIComponent(String(name));
  function references(settings){
    const areas=new Map(),activities=new Map();
    for(const op of list(settings.catalogHistory).slice().sort((a,b)=>a.revision-b.revision)){
      for(const a of list(op.areas))if(!areas.has(a.id))areas.set(a.id,a);
      for(const a of list(op.activities))if(!activities.has(a.id))activities.set(a.id,a);
    }
    return {areas,activities};
  }
  function normalize(input){
    const s=clone(input||{}),refs=references(s);
    s.catalogRevision=Number(s.catalogRevision)||0;
    s.catalogHistory=list(s.catalogHistory);
    s.areas=list(s.areas).map(a=>({...a,id:a.id||legacyAreaId(a.name)})).filter(a=>!refs.areas.has(a.id));
    s.activities=list(s.activities).filter(a=>!refs.activities.has(a.id)).map(a=>{
      const parent=s.areas.find(ar=>a.areaId?ar.id===a.areaId:ar.name===a.area);
      return {...a,areaId:parent?.id||a.areaId||legacyAreaId(a.area||''),area:parent?.name||a.area||''};
    }).filter(a=>!refs.areas.has(a.areaId));
    s.routineDefs=list(s.routineDefs).map(r=>assignment(s,r));
    return s;
  }
  function areas(s){return list(s.areas).filter(a=>!a.archived);}
  function activities(s){
    const rank=new Map(areas(s).map((a,i)=>[a.name,i]));
    return list(s.activities).filter(a=>!a.archived&&rank.has(a.area))
      .map((a,i)=>({a,i})).sort((x,y)=>rank.get(x.a.area)-rank.get(y.a.area)||x.i-y.i).map(x=>x.a);
  }
  function liveActivity(s,id){return activities(s).find(a=>a.id===id);}
  function historicalArea(s,id){return list(s.areas).find(a=>a.id===id)||references(s).areas.get(id);}
  function historicalActivity(s,id){
    const a=list(s.activities).find(a=>a.id===id)||references(s).activities.get(id);
    if(!a)return undefined;
    const parent=historicalArea(s,a.areaId)||(!a.areaId?list(s.areas).find(ar=>ar.name===a.area):null);
    return {...a,areaId:parent?.id||a.areaId,area:parent?.name||a.area||'',areaColor:parent?.color};
  }
  function assignment(s,item){
    const out=clone(item),refs=references(s);
    if(!out)return out;
    if(!out.areaId&&out.area&&refs.areas.has(legacyAreaId(out.area)))out.areaId=legacyAreaId(out.area);
    if(!out.areaId&&out.area)out.areaId=list(s.areas).find(a=>a.name===out.area)?.id||null;
    const act=liveActivity(s,out.actId);
    const deleted=refs.activities.get(out.actId);
    const archived=list(s.activities).find(a=>a.id===out.actId&&a.archived);
    const prior=act||deleted||archived;
    const parent=prior
      ?areas(s).find(a=>prior.areaId?a.id===prior.areaId:a.name===prior.area)
      :areas(s).find(a=>out.areaId?a.id===out.areaId:a.name===out.area);
    // History is a reference, not a copy of the mutable plan. Never change it twice.
    if((deleted||archived||refs.areas.has(out.areaId)||list(s.areas).some(a=>a.id===out.areaId&&a.archived))&&!out.recordedClassification){
      out.recordedClassification={actId:out.actId||null,areaId:prior?.areaId||out.areaId||null};
    }
    out.actId=act?.id||null;
    out.areaId=parent?.id||null;
    out.area=parent?.name||null;
    return out;
  }
  function normalizeDay(s,input){
    const day=clone(input||{});
    for(const k of ['todos','routines'])day[k]=list(day[k]).map(x=>assignment(s,x));
    day.todoMutations=list(day.todoMutations).map(m=>m.todo?{...m,todo:assignment(s,m.todo)}:m);
    return day;
  }
  function historicalAssignment(s,item){
    const ref=item?.recordedClassification||item||{},act=historicalActivity(s,ref.actId);
    const area=act?historicalArea(s,act.areaId):historicalArea(s,ref.areaId||legacyAreaId(ref.area||''));
    return {actId:act?.id||null,areaId:area?.id||act?.areaId||null,area:area?.name||act?.area||ref.area||null};
  }
  function move(s,id,area){
    const act=list(s.activities).find(a=>a.id===id),parent=areas(s).find(a=>a.name===area);
    if(!act||!parent)return false;
    act.area=parent.name;act.areaId=parent.id||legacyAreaId(parent.name);
    for(const def of list(s.routineDefs))if(def.actId===id){def.area=parent.name;def.areaId=act.areaId;}
    return true;
  }
  function target(s,kind,id){
    const area=kind==='area'?list(s.areas).find(a=>a.id===id):null;
    const acts=kind==='area'?list(s.activities).filter(a=>a.areaId===id):list(s.activities).filter(a=>a.id===id);
    if((kind==='area'&&!area)||(kind==='activity'&&!acts.length)||!['area','activity'].includes(kind))throw new Error('CATALOG_TARGET_MISSING');
    return {areas:area?[{id:area.id,name:area.name,color:area.color||'#BDB4A8'}]:[],
      activities:acts.map(a=>({id:a.id,name:a.name,color:a.color||'#BDB4A8',areaId:a.areaId}))};
  }
  function preview(input,kind,id,days){
    const s=normalize(input),t=target(s,kind,id),ids=new Set(t.activities.map(a=>a.id)),areaIds=new Set(t.areas.map(a=>a.id));
    const affected=x=>ids.has(x?.actId)||areaIds.has(x?.areaId);
    let todos=0,routines=0;
    for(const day of Object.values(days||{})){
      todos+=list(day.todos).map(x=>assignment(s,x)).filter(affected).length;
      routines+=list(day.routines).map(x=>assignment(s,x)).filter(affected).length;
    }
    return {kind,id,revision:s.catalogRevision,fingerprint:key(t),...t,todos,routines};
  }
  function affects(p,run,s){
    if(!run)return false;
    const a=historicalActivity(s,run.actId);
    return p.activities.some(x=>x.id===run.actId)||p.areas.some(x=>x.id===(a?.areaId||run.areaId));
  }
  function gate(s,p,{running=null,finalizations=[],pendingRun=null}={}){
    if(affects(p,running,s)||affects(p,pendingRun?.running,s))return 'running';
    if(list(finalizations).some(f=>affects(p,f.running,s)))return 'finalizing';
    return null;
  }
  function deletion(input,p,{operationId,at, running=null,finalizations=[],pendingRun=null}={}){
    if(!operationId)throw new Error('CATALOG_OPERATION_REQUIRED');
    const s=normalize(input),existing=s.catalogHistory.find(x=>x.id===operationId);
    if(existing)return {settings:s,receipt:clone(existing),replayed:true};
    const fresh=preview(s,p.kind,p.id);
    if(fresh.fingerprint!==p.fingerprint)throw new Error('CATALOG_PREVIEW_CHANGED');
    const blocked=gate(s,fresh,{running,finalizations,pendingRun});
    if(blocked)throw new Error(blocked==='running'?'CATALOG_RUNNING':'CATALOG_FINALIZING');
    const receipt={id:operationId,revision:s.catalogRevision+1,deletedAt:Number(at)||Date.now(),areas:fresh.areas,activities:fresh.activities};
    // Firestore document bound: fail before any mutation, never truncate a target set.
    if(JSON.stringify(receipt).length>180000)throw new Error('CATALOG_OPERATION_TOO_LARGE');
    s.catalogRevision=receipt.revision;s.catalogProtocol=PROTOCOL;s.latestCatalogOperation=receipt.id;s.catalogHistory.push(receipt);
    return {settings:normalize(s),receipt,replayed:false};
  }
  function reportLabels(rows){
    const byId=new Map();
    for(const row of rows)if(row&&!byId.has(row.id))byId.set(row.id,row);
    const all=[...byId.values()],counts=new Map(),labels=new Map();
    for(const row of all)counts.set(row.name,(counts.get(row.name)||0)+1);
    // Literal user names own their spelling; generated identity labels cannot take it.
    const reserved=new Set(counts.keys()),used=new Set();
    const stable=all.slice().sort((a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
    for(const row of stable){
      let label=row.name;
      if(counts.get(row.name)>1){
        const base=row.name+' · '+row.id;label=base;
        for(let suffix=2;reserved.has(label)||used.has(label);suffix++)label=base+' · '+suffix;
      }
      used.add(label);labels.set(row.id,label);
    }
    return all.map(row=>({...row,label:labels.get(row.id)}));
  }
  function reportAreas(s,additional=[]){
    return reportLabels([...list(s.areas),...references(s).areas.values(),...list(additional)]);
  }
  function reportActivities(s,additional=[]){
    const all=[...list(s.activities),...references(s).activities.values()].map(a=>historicalActivity(s,a.id));
    return reportLabels([...all,...list(additional)]);
  }
  function cloudSettings(s){
    const out=normalize(s);delete out.catalogHistory;
    return out;
  }
  function spanStored(days,run,end){
    if(end===run.startTs)return true;
    const spans=Object.values(days||{}).flatMap(d=>list(d.events)).filter(e=>list(e.sessionIds).includes(run.sessionId))
      .map(e=>[Number(e.startTs),Number(e.endTs)]).filter(([s,e])=>Number.isFinite(s)&&e>s).sort((a,b)=>a[0]-b[0]);
    let cursor=Number(run.startTs);
    for(const [start,stop] of spans){if(start>cursor)break;cursor=Math.max(cursor,stop);if(cursor>=end)return true;}
    return false;
  }
  function mergeHistory(...sources){
    const out=new Map();
    for(const source of sources)for(const r of list(source)){
      if(out.has(r.id)&&key(out.get(r.id))!==key(r))throw new Error('CATALOG_RECEIPT_CONFLICT');
      out.set(r.id,clone(r));
    }
    return [...out.values()].sort((a,b)=>a.revision-b.revision||a.id.localeCompare(b.id));
  }
  return {PROTOCOL,clone,key,legacyAreaId,references,normalize,areas,activities,liveActivity,
    historicalArea,historicalActivity,historicalAssignment,assignment,normalizeDay,move,preview,affects,gate,deletion,cloudSettings,mergeHistory,spanStored,reportAreas,reportActivities};
});
