(function(){
"use strict";
/* ---------- config ---------- */
const CONFIG={
  name:"Vini",
  targets:{gym:4, work:30, study:5},   // per rolling 7 days: sessions, hours, hours
  repTop:10, kgStep:2.5,                 // reps at/above repTop → suggest +kgStep next time
  workouts:["A","B","C","D","E","Rest"],
  // Supabase project. Both values are public by design: the database's row-level security
  // rule ("own rows") is what keeps the data private. Never put the secret/service_role key here.
  supabase:{url:"https://yzknzznfnfdobcnnrktm.supabase.co", key:"sb_publishable_8j91TLDczcj-lJOTMSecFQ_SjJGkcZm"}
};

/* ---------- helpers ---------- */
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,"0");
const keyOf=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const fromKey=k=>{const [y,m,d]=k.split("-").map(Number);return new Date(y,m-1,d)};
const todayKey=()=>keyOf(new Date());
const addDays=(k,n)=>{const d=fromKey(k);d.setDate(d.getDate()+n);return keyOf(d)};
const dayDiff=(a,b)=>Math.round((fromKey(a)-fromKey(b))/864e5);
const num=v=>{const n=parseFloat(String(v??"").replace(",","."));return isFinite(n)?n:0}; // accepts "62,5"
const fmtNum=(n,dp=1)=>String(Math.round(n*10**dp)/10**dp).replace(".",",");
const fmtH=min=>{min=Math.round(min||0);const h=Math.floor(min/60),m=min%60;return h?(m?h+"h"+pad(m):h+"h"):m+"m"};
const ddmm=k=>{const d=fromKey(k);return pad(d.getDate())+"/"+pad(d.getMonth()+1)};
const ddmmyyyy=k=>ddmm(k)+"/"+fromKey(k).getFullYear();
const WD=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* motion: restart a CSS animation class on an element (skipped if the phone asks for reduced motion) */
const reduceMotion=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
function play(el,cls){if(!el||reduceMotion())return;el.classList.remove("enter","enter-x","turn");void el.offsetWidth;el.classList.add(cls)}
let newRow=null; // which list just got a row added, so only that row animates in
const listJoin=a=>a.length<2?a.join(""):a.slice(0,-1).join(", ")+" and "+a[a.length-1];
const blank=k=>({date:k,treino:"",gym:[],work:[],study:[],meals:{breakfast:"",lunch:"",dinner:"",snacks:""},protein:false,energy:0,mood:0,wins:"",notes:""});
const norm=(k,d)=>Object.assign(blank(k),d||{},{date:k,meals:Object.assign(blank(k).meals,(d&&d.meals)||{})});
const clone=o=>JSON.parse(JSON.stringify(o));
const sumMin=a=>(a||[]).reduce((t,x)=>t+num(x.min),0);
const exName=g=>(g.ex||"").trim();

/* ---------- what counts as "logged" ---------- */
const SECTIONS=[
  ["gym","gym",d=>!!d.treino||(d.gym||[]).some(exName)],
  ["work","work",d=>sumMin(d.work)>0],
  ["study","study",d=>sumMin(d.study)>0],
  ["meals","meals",d=>!!d.protein||Object.values(d.meals||{}).some(s=>String(s).trim())],
  ["journal","journal",d=>!!(d.energy||d.mood||(d.wins||"").trim()||(d.notes||"").trim())]
];
const hasData=d=>!!d&&SECTIONS.some(s=>s[2](d));
const isTrainDay=d=>!!d&&(/^[A-E]$/.test(d.treino||"")||(d.gym||[]).some(exName));

/* ---------- state ---------- */
let days={};               // key -> day doc (all history)
let cur=todayKey();
let state=blank(cur);
let saveTimer=null, dirty=false, lastEdit=0, insightIdx=0;
const LS="logbook-fallback";

function setStatus(t,kind){const s=$("status");s.textContent=t;s.className="status"+(kind?" "+kind:"")}

/* ---------- storage ---------- */
function lsLoad(){try{return JSON.parse(localStorage.getItem(LS)||"{}")}catch(e){return {}}}
function lsSave(){try{localStorage.setItem(LS,JSON.stringify(days));return true}catch(e){return false}}

function scheduleSave(){
  dirty=true;lastEdit=Date.now();setStatus("Saving…");
  renderDone();
  clearTimeout(saveTimer);saveTimer=setTimeout(save,700);
}
function save(){
  const startedAt=Date.now(), k=state.date, body=clone(state);
  body.updatedAt=startedAt;
  days[k]=body;
  if(lsSave()){if(lastEdit<=startedAt)dirty=false;setStatus(sync.signedIn?"Saved · syncing…":"Saved on this device","ok");sync.markDirty(k)}
  else setStatus("Couldn't save. Storage is full or blocked.","err");
}
function flush(){if(dirty){clearTimeout(saveTimer);save()}}

/* ---------- today: header + hero ---------- */
const RING_C=2*Math.PI*18;
function renderDone(){
  const done=SECTIONS.filter(s=>s[2](state)), left=SECTIONS.filter(s=>!s[2](state)).map(s=>s[1]);
  $("ringArc").setAttribute("stroke-dasharray",`${(done.length/5*RING_C).toFixed(1)} 200`);
  $("ringNum").textContent=done.length;
  $("ringArc").closest(".ring").classList.toggle("full",done.length===5);
  SECTIONS.forEach(s=>{const on=s[2](state),el=$("ok-"+s[0]);el.hidden=!on;el.closest("section").classList.toggle("done",on)});
  $("heroLine").innerHTML=done.length===0?"Nothing logged yet. Start with whatever just happened."
    :done.length===5?"<b>All five logged.</b> That's the day done."
    :`<b>${done.length} of 5 logged</b> · ${esc(listJoin(left))} left.`;
}
function renderHero(){
  const tk=todayKey(), d=fromKey(state.date), wd=WD[d.getDay()];
  if(state.date===tk){
    const h=new Date().getHours(), part=h<12?"morning":h<18?"afternoon":"evening";
    $("kicker").textContent=`Logbook · ${wd} ${part}`;
    $("heroTitle").innerHTML=`Good ${part},<br><span>${esc(CONFIG.name)}.</span>`;
  }else{
    const n=dayDiff(tk,state.date);
    $("kicker").textContent=n===1?"Logbook · yesterday":`Logbook · ${n} days ago`;
    $("heroTitle").innerHTML=`${wd},<br><span>${ddmm(state.date)}.</span>`;
  }
}

/* ---------- today: gym ---------- */
function exerciseHistory(name,beforeKey){
  name=(name||"").trim().toLowerCase(); if(!name) return null;
  const keys=Object.keys(days).filter(k=>k<beforeKey).sort().reverse();
  for(const k of keys){const g=(days[k].gym||[]).find(x=>exName(x).toLowerCase()===name&&(x.kg||x.reps));if(g) return {k,g}}
  return null;
}
function hintFor(ex){
  const h=exerciseHistory(ex,state.date); if(!h) return "";
  let s=`Last ${ddmm(h.k)}: <b>${esc(fmtNum(num(h.g.kg)))}kg ${esc(h.g.sets||"?")}×${esc(h.g.reps||"?")}</b>`;
  if(num(h.g.reps)>=CONFIG.repTop&&num(h.g.kg)>0) s+=` <span class="up">· ready for ${fmtNum(num(h.g.kg)+CONFIG.kgStep)}kg</span>`;
  return s;
}
function lastSession(letter,beforeKey){
  const keys=Object.keys(days).filter(k=>k<beforeKey).sort().reverse();
  for(const k of keys){const d=days[k];if(d.treino===letter&&(d.gym||[]).some(exName)) return {k,d}}
  return null;
}
function renderLoadLast(){
  const box=$("loadLast"), L=state.treino;
  const s=/^[A-E]$/.test(L)&&!state.gym.some(exName)?lastSession(L,state.date):null;
  if(!s){box.hidden=true;return}
  const ex=s.d.gym.filter(exName);
  box.hidden=false;
  box.innerHTML=`<span>↺ Load last Treino ${esc(L)}</span><small>${ddmm(s.k)} · ${ex.length} exercise${ex.length===1?"":"s"}</small>`;
  box.onclick=()=>{
    state.gym=ex.map(g=>({ex:g.ex,kg:g.kg||"",sets:g.sets||"",reps:g.reps||""}));
    scheduleSave();renderGym();renderTotals();renderLoadLast();
  };
}
function fillDatalist(id,values){
  let dl=$(id); if(!dl){dl=document.createElement("datalist");dl.id=id;document.body.appendChild(dl)}
  const count={};values.forEach(v=>{v=String(v||"").trim();if(v)count[v]=(count[v]||0)+1});
  dl.innerHTML=Object.keys(count).sort((a,b)=>count[b]-count[a]||a.localeCompare(b)).slice(0,40).map(v=>`<option value="${esc(v)}">`).join("");
}
function renderGym(){
  const list=$("gymList");list.innerHTML="";
  $("gymHead").hidden=!state.gym.length;
  state.gym.forEach((g,i)=>{
    const wrap=document.createElement("div");
    wrap.innerHTML=`<div class="row gym">
      <input id="g-ex-${i}" list="dl-ex" placeholder="Bench press" value="${esc(g.ex)}" autocomplete="off" aria-label="Exercise">
      <input class="num" inputmode="decimal" placeholder="kg" value="${esc(g.kg)}" aria-label="Weight in kg">
      <input class="num" inputmode="numeric" placeholder="2" value="${esc(g.sets)}" aria-label="Sets">
      <input class="num" inputmode="numeric" placeholder="8" value="${esc(g.reps)}" aria-label="Reps">
      <button class="del" aria-label="Remove exercise">×</button></div>
      <div class="hint" id="g-h-${i}">${hintFor(g.ex)}</div>`;
    const [ex,kg,s,r]=wrap.querySelectorAll("input");
    ex.oninput=()=>{g.ex=ex.value;scheduleSave()};
    ex.onchange=()=>{$("g-h-"+i).innerHTML=hintFor(g.ex);renderLoadLast()};
    kg.oninput=()=>{g.kg=kg.value;scheduleSave()};
    s.oninput=()=>{g.sets=s.value;scheduleSave();renderTotals()};
    r.oninput=()=>{g.reps=r.value;scheduleSave()};
    wrap.querySelector(".del").onclick=()=>{state.gym.splice(i,1);scheduleSave();renderGym();renderTotals();renderLoadLast()};
    if(newRow==="gym"&&i===state.gym.length-1)wrap.className="row-new";
    list.appendChild(wrap);
  });
  const all=[];Object.values(days).forEach(d=>(d.gym||[]).forEach(g=>all.push(g.ex)));
  fillDatalist("dl-ex",all);
}

/* ---------- today: work / study ---------- */
const TL={
  work:{list:"workList",field:"what",ph:"What did you work on?",dl:"dl-work"},
  study:{list:"studyList",field:"topic",ph:"Topic (sales, English…)",dl:"dl-study"}
};
function renderTimeList(kind){
  const c=TL[kind], list=$(c.list);list.innerHTML="";
  state[kind].forEach((it,i)=>{
    const row=document.createElement("div");row.className="row time";
    row.innerHTML=`<input id="${kind}-m-${i}" class="num" inputmode="numeric" placeholder="min" value="${esc(it.min)}" aria-label="Minutes">
      <input id="${kind}-t-${i}" list="${c.dl}" placeholder="${c.ph}" value="${esc(it[c.field])}" autocomplete="off" aria-label="${kind==="work"?"What":"Topic"}">
      <button class="del" aria-label="Remove session">×</button>`;
    const [m,t]=row.querySelectorAll("input");
    m.oninput=()=>{it.min=m.value;scheduleSave();renderTotals()};
    t.oninput=()=>{it[c.field]=t.value;scheduleSave()};
    row.querySelector(".del").onclick=()=>{state[kind].splice(i,1);scheduleSave();renderTimeList(kind);renderTotals()};
    if(newRow===kind&&i===state[kind].length-1)row.classList.add("row-new");
    list.appendChild(row);
  });
  const all=[];Object.values(days).forEach(d=>(d[kind]||[]).forEach(x=>all.push(x[c.field])));
  fillDatalist(c.dl,all);
}
function addSession(kind,min){
  state[kind].push({min:min?String(min):"",[TL[kind].field]:""});
  newRow=kind;renderTimeList(kind);newRow=null;renderTotals();scheduleSave();
  const i=state[kind].length-1;$((min?`${kind}-t-`:`${kind}-m-`)+i).focus();
}
function renderTotals(){
  const w=sumMin(state.work),s=sumMin(state.study);
  $("workTotal").textContent=w?fmtH(w):"";
  $("studyTotal").textContent=s?fmtH(s):"";
  const named=state.gym.filter(exName), sets=named.reduce((t,g)=>t+num(g.sets),0);
  $("gymTotal").textContent=named.length?`${named.length} ex · ${sets} sets`:"";
}

/* ---------- today: chips + render ---------- */
function chipGroup(id,values,get,set,after){
  const el=$(id);el.innerHTML="";
  values.forEach(v=>{const b=document.createElement("button");b.className="chip";b.textContent=v;
    b.setAttribute("aria-pressed",String(get()===v));
    b.onclick=()=>{set(get()===v?(typeof v==="number"?0:""):v);scheduleSave();chipGroup(id,values,get,set,after);after&&after()};
    el.appendChild(b)});
}
function renderToday(){
  const d=fromKey(state.date),tk=todayKey();
  $("dateMain").textContent=state.date===tk?"Today":WD[d.getDay()];
  $("dateSub").textContent=ddmmyyyy(state.date);
  $("next").disabled=state.date>=tk;
  chipGroup("treino",CONFIG.workouts,()=>state.treino,v=>state.treino=v,renderLoadLast);
  chipGroup("energy",[1,2,3,4,5],()=>state.energy,v=>state.energy=v);
  chipGroup("mood",[1,2,3,4,5],()=>state.mood,v=>state.mood=v);
  renderGym();renderLoadLast();
  renderTimeList("work");renderTimeList("study");
  document.querySelectorAll("[data-meal]").forEach(i=>i.value=state.meals[i.dataset.meal]||"");
  $("protein").checked=!!state.protein;
  $("wins").value=state.wins||"";$("notes").value=state.notes||"";
  renderTotals();renderHero();renderDone();
}
document.querySelectorAll("[data-meal]").forEach(i=>i.oninput=()=>{state.meals[i.dataset.meal]=i.value;scheduleSave()});
$("protein").onchange=e=>{state.protein=e.target.checked;scheduleSave()};
$("wins").oninput=e=>{state.wins=e.target.value;scheduleSave()};
$("notes").oninput=e=>{state.notes=e.target.value;scheduleSave()};
$("addGym").onclick=()=>{state.gym.push({ex:"",kg:"",sets:"",reps:""});newRow="gym";renderGym();newRow=null;renderLoadLast();scheduleSave();$("g-ex-"+(state.gym.length-1)).focus()};
$("addWork").onclick=()=>addSession("work");
$("addStudy").onclick=()=>addSession("study");
document.querySelectorAll(".actions[data-kind] .quick").forEach(b=>b.onclick=()=>addSession(b.parentElement.dataset.kind,Number(b.dataset.min)));

function goto(k){flush();const dir=k>cur?1:-1;cur=k;state=norm(k,days[k]?clone(days[k]):null);renderToday();window.scrollTo(0,0);
  const v=$("view-today");v.style.setProperty("--dx",(dir*14)+"px");play(v,"enter-x")}
$("prev").onclick=()=>goto(addDays(cur,-1));
$("next").onclick=()=>{const k=addDays(cur,1);if(k<=todayKey())goto(k)};

/* ---------- progress: numbers ---------- */
function windowStats(endKey){ // 7 days ending endKey (inclusive)
  let gym=0,work=0,study=0,moodS=0,moodN=0,enS=0,enN=0,prot=0,logged=0;
  for(let i=0;i<7;i++){const d=days[addDays(endKey,-i)];if(!d)continue;
    if(isTrainDay(d))gym++; work+=sumMin(d.work); study+=sumMin(d.study);
    if(d.mood){moodS+=d.mood;moodN++} if(d.energy){enS+=d.energy;enN++}
    if(d.protein)prot++; if(hasData(d))logged++}
  return {gym,work:work/60,study:study/60,mood:moodN?moodS/moodN:null,energy:enN?enS/enN:null,prot,logged};
}
function streaks(){
  const tk=todayKey();let cur=0,i=hasData(days[tk])?0:1;
  while(hasData(days[addDays(tk,-i)])){cur++;i++}
  let best=0,run=0,prev=null;
  Object.keys(days).filter(k=>hasData(days[k])).sort().forEach(k=>{run=prev&&addDays(prev,1)===k?run+1:1;best=Math.max(best,run);prev=k});
  return {cur,best};
}
function spark(vals,min,max,cls){
  const w=64,h=22,n=vals.length;
  const pts=vals.map((v,i)=>v==null?null:[2+i*(w-4)/(n-1),h-3-((v-min)/((max-min)||1))*(h-6)]).filter(Boolean);
  if(pts.length<2) return `<svg class="spark flat" width="${w}" height="${h}" aria-hidden="true"></svg>`;
  const last=pts[pts.length-1];
  return `<svg class="spark ${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ")}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.4" fill="currentColor"/></svg>`;
}

/* ---------- progress: insights (rule-based, no AI) ---------- */
function avg(a){return a.length?a.reduce((t,x)=>t+x,0)/a.length:null}
function buildInsights(){
  const tk=todayKey(), out=[];
  const recent=[];for(let i=0;i<42;i++){const k=addDays(tk,-i);if(days[k])recent.push([k,days[k]])}

  // mood on training days vs not
  const mT=recent.filter(([,d])=>d.mood&&isTrainDay(d)).map(([,d])=>d.mood);
  const mN=recent.filter(([,d])=>d.mood&&!isTrainDay(d)).map(([,d])=>d.mood);
  if(mT.length>=3&&mN.length>=3){const a=avg(mT),b=avg(mN);if(Math.abs(a-b)>=0.4)out.push({goal:"Train",
    html:a>b?`On days you train, your mood averages <mark>${fmtNum(a)}</mark>. On days you don't, <mark class="warn">${fmtNum(b)}</mark>. The gym is doing more than building muscle.`
             :`Your mood is lower on training days (${fmtNum(a)} vs ${fmtNum(b)}). Worth checking sleep and food on those days.`})}

  // energy with protein vs without
  const eP=recent.filter(([,d])=>d.energy&&d.protein).map(([,d])=>d.energy);
  const eN=recent.filter(([,d])=>d.energy&&!d.protein).map(([,d])=>d.energy);
  if(eP.length>=3&&eN.length>=3){const a=avg(eP),b=avg(eN);if(a-b>=0.4)out.push({goal:"Meals",
    html:`When you hit your protein, energy averages <mark>${fmtNum(a)}</mark>. When you miss it, <mark class="warn">${fmtNum(b)}</mark>.`})}

  // work this week vs last
  const w1=windowStats(tk).work,w0=windowStats(addDays(tk,-7)).work;
  if(w0>=2){const p=(w1-w0)/w0;if(Math.abs(p)>=0.2)out.push({goal:"Work",
    html:p>0?`You worked <mark>${fmtNum(w1)}h</mark> in the last 7 days, <mark>up ${Math.round(p*100)}%</mark> on the week before.`
            :`Work is <mark class="warn">down ${Math.round(-p*100)}%</mark> on last week (${fmtNum(w1)}h vs ${fmtNum(w0)}h).`})}

  // study gap
  const lastStudy=Object.keys(days).filter(k=>k<=tk&&sumMin(days[k].study)>0).sort().pop();
  if(lastStudy){const gap=dayDiff(tk,lastStudy);if(gap>=3){const t=(days[lastStudy].study.find(x=>(x.topic||"").trim())||{}).topic;
    out.push({goal:"Study",html:`<mark class="warn">${gap} days</mark> since your last study session${t?` (${esc(t.trim())})`:""}. Even 15 minutes keeps the thread.`})}}

  // biggest lift gain in 6 weeks
  const lifts={};recent.slice().reverse().forEach(([k,d])=>(d.gym||[]).forEach(g=>{const n=exName(g);if(!n||!num(g.kg))return;
    const key=n.toLowerCase();(lifts[key]=lifts[key]||{name:n,pts:[]}).pts.push([k,num(g.kg)])}));
  let top=null;Object.values(lifts).forEach(l=>{if(l.pts.length<2)return;const gain=l.pts[l.pts.length-1][1]-l.pts[0][1];
    if(gain>0&&(!top||gain>top.gain))top={...l,gain,from:l.pts[0],to:l.pts[l.pts.length-1]}});
  if(top){const wk=Math.max(1,Math.round(dayDiff(top.to[0],top.from[0])/7));out.push({goal:"Train",
    html:`${esc(top.name)} is <mark>up ${fmtNum(top.gain)}kg</mark> in ${wk} week${wk===1?"":"s"} (${fmtNum(top.from[1])} → ${fmtNum(top.to[1])}kg). Progressive overload is working.`})}

  // best work weekday (28d)
  const byWd=[0,0,0,0,0,0,0];let workDays=0;
  for(let i=0;i<28;i++){const k=addDays(tk,-i),m=sumMin(days[k]?.work);if(m>0){workDays++;byWd[fromKey(k).getDay()]+=m}}
  if(workDays>=6){const bi=byWd.indexOf(Math.max(...byWd));out.push({goal:"Work",
    html:`Your strongest work day is <mark>${WD[bi]}</mark>, averaging ${fmtH(byWd[bi]/4)} over the last 4 weeks. Protect it.`})}

  // streak
  const st=streaks();
  if(st.cur>=5)out.push({goal:"Logging",html:`<mark>${st.cur}-day</mark> logging streak.${st.best>st.cur?` Your record is ${st.best}.`:" That's your best run yet."}`});

  return out;
}

/* ---------- progress: render ---------- */
function renderProgress(){
  const tk=todayKey(),T=CONFIG.targets;
  const loggedTotal=Object.keys(days).filter(k=>hasData(days[k])).length;
  $("pKicker").textContent=`Your progress · ${loggedTotal} day${loggedTotal===1?"":"s"} of data`;
  $("pTitle").innerHTML=`Here's your week,<br><span>${esc(CONFIG.name)}.</span>`;

  // goals
  const series=[5,4,3,2,1,0].map(i=>windowStats(addDays(tk,-7*i)));
  const GOALS=[
    {name:"Train consistently",sub:`target ${T.gym}×/week`,key:"gym",target:T.gym,fmt:v=>`${v}/${T.gym}`,say:v=>`${v} session${v===1?"":"s"}`},
    {name:"Put in the work",sub:`target ${T.work}h/week`,key:"work",target:T.work,fmt:v=>fmtNum(v)+"h",say:v=>fmtNum(v)+"h"},
    {name:"Keep learning",sub:`target ${T.study}h/week`,key:"study",target:T.study,fmt:v=>fmtNum(v)+"h",say:v=>fmtNum(v)+"h"},
    {name:"Feel good",sub:"average mood, 1–5",key:"mood",target:null,fmt:v=>v==null?"–":fmtNum(v),say:v=>v==null?"no ratings":fmtNum(v)+" / 5"}
  ];
  $("goals").innerHTML=GOALS.map(g=>{
    const vals=series.map(s=>s[g.key]),c=vals[5],p=vals[4];
    let cls="flat",badge="–",label="no data";
    if(c!=null){
      const pct=p?((c-p)/p):null;
      badge=pct==null?(c>0?"new":"–"):(pct>=0?"▲ ":"▼ ")+Math.abs(Math.round(pct*100))+"%";
      if(g.target&&c>=g.target){cls="up";label="on track"}
      else if(pct==null){cls=c>0?"up":"flat";label=c>0?"started":"not yet"}
      else if(pct>=0.05){cls="up";label="rising"}
      else if(pct<=-0.05){cls="down";label="slipping"}
      else label="steady";
    }
    const min=g.key==="mood"?1:0, max=g.key==="mood"?5:Math.max(g.target||0,...vals.map(v=>v||0),1);
    const detail=c==null?"Rate your mood in the journal to see this.":
      `Last 7 days: <b>${g.say(c)}</b>${g.target?` (target ${g.say(g.target)})`:""}. The 7 days before: <b>${g.say(p)}</b>. The line shows six weeks.`;
    return `<details class="goal"><summary><div class="gname"><b>${g.name}</b><small>${g.sub}</small></div>
      ${spark(vals,min,max,cls)}<div class="trend ${cls}"><b>${badge}</b><small>${label}</small></div></summary>
      <div class="gdetail">${detail}</div></details>`;
  }).join("");

  // stat chips
  const now=series[5],st=streaks(),good=(v,t)=>v>=t?"good":"warn";
  $("stats").innerHTML=[
    ["Train",`${now.gym}/${T.gym}`,good(now.gym,T.gym)],
    ["Protein",`${now.prot}/7`,good(now.prot,5)],
    ["Mood",now.mood==null?"–":fmtNum(now.mood),now.mood==null?"":good(now.mood,3.5)],
    ["Energy",now.energy==null?"–":fmtNum(now.energy),now.energy==null?"":good(now.energy,3.5)],
    ["Streak",st.cur,st.cur>=3?"good":""]
  ].map(([l,v,c])=>`<span class="stat">${l}<b class="${c}">${v}</b></span>`).join("");

  // insight
  renderInsight();

  // last 7 days bars
  let max=60;const rows=[];
  for(let n=6;n>=0;n--){const k=addDays(tk,-n),d=days[k]||{},w=sumMin(d.work),s=sumMin(d.study);max=Math.max(max,w+s);rows.push({k,w,s})}
  $("bars").innerHTML=rows.map(r=>`<div class="bar" title="${ddmm(r.k)}: ${fmtH(r.w)} work · ${fmtH(r.s)} study"><i class="s" style="height:${r.s/max*100}%"></i><i class="w" style="height:${r.w/max*100}%"></i></div>`).join("");
  $("barlbl").innerHTML=rows.map(r=>`<span>${WD[fromKey(r.k).getDay()][0]}</span>`).join("");

  // 28 days dots
  let dots="",gymDays=0;
  for(let n=27;n>=0;n--){const k=addDays(tk,-n),d=days[k];dots+=`<i class="${hasData(d)?"on":""}" title="${ddmm(k)}"></i>`;if(isTrainDay(d))gymDays++}
  $("dots").innerHTML=dots;$("k-gym").textContent=gymDays+" gym days";

  // lifts
  const lifts={},cut=addDays(tk,-28);
  Object.keys(days).sort().forEach(k=>(days[k].gym||[]).forEach(g=>{
    const n=exName(g);if(!n)return;const key=n.toLowerCase(),kg=num(g.kg);
    const L=lifts[key]=lifts[key]||{name:n,best:0,recent:[]};
    L.best=Math.max(L.best,kg);L.last=`${fmtNum(kg)}kg ${g.sets||"?"}×${g.reps||"?"}`;L.name=n;
    if(k>=cut&&kg)L.recent.push(kg)}));
  const L=Object.values(lifts).sort((a,b)=>a.name.localeCompare(b.name));
  $("lifts").innerHTML=L.length?L.map(l=>{
    const d=l.recent.length>=2?l.recent[l.recent.length-1]-l.recent[0]:null;
    const dc=d==null?"":d>0?"pos":d<0?"neg":"";
    const ds=d==null?"–":(d>0?"+":d<0?"−":"")+fmtNum(Math.abs(d));
    return `<tr><td>${esc(l.name)}</td><td class="n">${esc(l.last)}</td><td class="n">${fmtNum(l.best)}</td><td class="n ${dc}">${ds}</td></tr>`}).join("")
    :`<tr><td class="empty" colspan="4">Log a workout and your lifts show up here.</td></tr>`;

  // study topics
  const topics={};
  for(let n=0;n<28;n++){(days[addDays(tk,-n)]?.study||[]).forEach(x=>{const tp=(x.topic||"").trim()||"Other";topics[tp]=(topics[tp]||0)+num(x.min)})}
  const Tp=Object.entries(topics).filter(([,m])=>m>0).sort((a,b)=>b[1]-a[1]);
  $("topics").innerHTML=Tp.length?Tp.map(([n,m])=>`<tr><td>${esc(n)}</td><td class="n">${fmtH(m)}</td></tr>`).join("")
    :`<tr><td class="empty">No study sessions yet.</td></tr>`;
}
let insights=[];
function renderInsight(){
  insights=buildInsights();
  if(!insights.length){
    $("insight").innerHTML="Log a few more days and patterns will start showing up here.";
    $("idots").innerHTML="";$("nextInsight").hidden=true;return;
  }
  insightIdx%=insights.length;
  const it=insights[insightIdx];
  $("insight").innerHTML=it.html;
  $("idots").innerHTML=insights.map((_,i)=>`<i class="${i===insightIdx?"on":""}"></i>`).join("");
  $("nextInsight").hidden=insights.length<2;
}
$("nextInsight").onclick=()=>{insightIdx++;renderInsight();play($("insight"),"enter")};

/* ---------- backup ---------- */
$("exportBtn").onclick=()=>{
  flush();
  const blob=new Blob([JSON.stringify({app:"logbook",version:1,exportedAt:new Date().toISOString(),days},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`logbook-backup-${todayKey()}.json`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  lsSet(LS_EXPORT,String(Date.now()));checkBackupReminder();
};
$("importBtn").onclick=()=>$("importFile").click();
$("importFile").onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{
    const data=JSON.parse(await f.text()),incoming=data.days||data;let n=0;
    for(const [k,d] of Object.entries(incoming)){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(k)||!d||typeof d!=="object")continue;
      if(days[k]&&(days[k].updatedAt||0)>=(d.updatedAt||0))continue;
      const body=norm(k,d);body.updatedAt=d.updatedAt||Date.now();days[k]=body;n++;sync.markDirty(k);
    }
    lsSave();
    state=norm(cur,days[cur]?clone(days[cur]):null);renderToday();renderProgress();
    $("backupHint").textContent=`Imported ${n} day${n===1?"":"s"}.`;
  }catch(err){$("backupHint").textContent="That file couldn't be read as a logbook backup."}
  e.target.value="";
};

/* ---------- theme: auto (follows the phone) → dark → light ---------- */
const THEMES=["auto","dark","light"], LS_THEME="logbook-theme";
const THEME_ICON={
  auto:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  dark:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  light:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
};
function applyTheme(t){
  if(!THEMES.includes(t))t="auto";
  if(t==="auto")delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t;
  const b=$("themeBtn");b.innerHTML=THEME_ICON[t];if(b.dataset.ready)play(b.firstChild,"turn");b.dataset.ready="1";
  b.setAttribute("aria-label",`Theme: ${t}. Tap to change.`);b.title=`Theme: ${t[0].toUpperCase()+t.slice(1)}`;
  requestAnimationFrame(()=>{const m=document.querySelector('meta[name="theme-color"]');
    if(m)m.content=getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()||"#060B1E"});
}
let theme=lsGet(LS_THEME)||"auto";
applyTheme(theme);
$("themeBtn").onclick=()=>{
  theme=THEMES[(THEMES.indexOf(theme)+1)%THEMES.length];lsSet(LS_THEME,theme);
  if(document.startViewTransition&&!reduceMotion())document.startViewTransition(()=>applyTheme(theme));
  else applyTheme(theme);
};

/* ---------- tabs ---------- */
function tab(which){
  const p=which==="progress";
  $("tab-today").setAttribute("aria-selected",String(!p));$("tab-progress").setAttribute("aria-selected",String(p));
  $("view-today").hidden=p;$("view-progress").hidden=!p;$("datebar").hidden=p;
  if(p){flush();renderProgress()}
  window.scrollTo(0,0);
  placeTabPill();play($(p?"view-progress":"view-today"),"enter");
}
function placeTabPill(){
  const t=document.querySelector(".tabs"),on=t.querySelector('[aria-selected="true"]');
  t.style.setProperty("--tx",(on.offsetLeft-3)+"px");t.style.setProperty("--tw",on.offsetWidth+"px");
}
placeTabPill();
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{placeTabPill();requestAnimationFrame(()=>document.querySelector(".tabs").classList.add("ready"))});
addEventListener("resize",placeTabPill);
$("tab-today").onclick=()=>tab("today");$("tab-progress").onclick=()=>tab("progress");
document.addEventListener("visibilitychange",()=>{if(document.hidden)flush()});
window.addEventListener("pagehide",flush);

/* ---------- backup reminder (no export in 14 days) ---------- */
const LS_EXPORT="logbook-lastExport", LS_FIRST="logbook-firstRun", REMIND_DAYS=14;
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function checkBackupReminder(){
  const n=$("notice");
  if(!Object.values(days).some(hasData)){n.hidden=true;return}
  if(!lsGet(LS_FIRST))lsSet(LS_FIRST,String(Date.now()));
  const since=Number(lsGet(LS_EXPORT)||lsGet(LS_FIRST))||Date.now();
  const age=Math.floor((Date.now()-since)/864e5);
  if(age<REMIND_DAYS||(sync.signedIn&&Date.now()-sync.lastSync<REMIND_DAYS*864e5)){n.hidden=true;return}
  n.hidden=false;
  n.innerHTML=`${lsGet(LS_EXPORT)?`Last backup was ${age} days ago.`:"You haven't exported a backup yet."} ${sync.signedIn?"":"Your entries live only on this device. "}<button class="pill" id="noticeExport">Export now</button>`;
  $("noticeExport").onclick=()=>$("exportBtn").click();
}

/* ---------- sync (Supabase, see sync.js) ---------- */
const fmtClock=t=>{const d=new Date(t);return pad(d.getHours())+":"+pad(d.getMinutes())};
const sync=window.createLogbookSync({
  url:CONFIG.supabase.url, key:CONFIG.supabase.key,
  getDays:()=>days,
  applyRemote(got){
    const editing=dirty||Date.now()-lastEdit<2500;
    let touchedCur=false;
    for(const [k,d] of Object.entries(got)){
      if(k===cur&&editing)continue;                 // what he's typing right now wins
      const body=norm(k,d);body.updatedAt=d.updatedAt;days[k]=body;
      if(k===cur)touchedCur=true;
    }
    lsSave();
    const a=document.activeElement, typing=a&&$("view-today").contains(a)&&a.matches("input,textarea");
    if(touchedCur&&!typing){state=norm(cur,clone(days[cur]));renderToday()}
    if(!$("view-progress").hidden)renderProgress();
  },
  onStatus(kind){
    if(dirty)return;                                // "Saving…" takes priority while typing
    if(kind==="syncing")setStatus("Syncing…");
    else if(kind==="synced")setStatus("Saved · synced","ok");
    else if(kind==="offline")setStatus("Saved on this device · syncs when online","ok");
    else if(kind==="signedout")setStatus("Signed out of sync · saved on this device","err");
    else setStatus("Saved on this device · sync failed, will retry","err");
    renderSyncCard();
  },
  onAuthChange(){renderSyncCard();checkBackupReminder()}
});
function renderSyncCard(){
  const on=sync.signedIn;
  $("signinForm").hidden=on;$("syncOn").hidden=!on;
  $("syncCard").classList.toggle("done",on);
  if(on){
    const t=sync.lastSync, today=new Date().toDateString()===new Date(t).toDateString();
    $("syncWho").innerHTML=`Signed in as <b>${esc(sync.email)}</b>.<br>${t?`Last synced ${today?"today":ddmm(keyOf(new Date(t)))} at ${fmtClock(t)}.`:"Not synced yet."}${sync.pendingCount?` ${sync.pendingCount} day${sync.pendingCount===1?"":"s"} waiting to upload.`:""}`;
  }
}
$("signinForm").onsubmit=async e=>{
  e.preventDefault();
  const btn=$("sBtn"),msg=$("sMsg");btn.disabled=true;btn.textContent="Signing in…";msg.textContent="";
  try{await sync.signIn($("sEmail").value,$("sPass").value);$("sPass").value="";}
  catch(err){
    msg.textContent=err instanceof TypeError?"No connection. Try again when you're online."
      :/invalid/i.test(err.message)?"Wrong email or password.":"Couldn't sign in: "+err.message;
  }
  btn.disabled=false;btn.textContent="Sign in";renderSyncCard();
};
$("syncNowBtn").onclick=()=>{flush();sync.syncNow()};
$("signOutBtn").onclick=()=>{
  if(confirm("Sign out of sync on this device? Your entries stay here; they just stop syncing."))sync.signOut();
};

/* ---------- boot ---------- */
days=lsLoad();state=norm(cur,days[cur]?clone(days[cur]):null);renderToday();
setStatus(sync.signedIn?"Syncing…":"Saved on this device","ok");
renderSyncCard();
checkBackupReminder();
sync.syncNow();
if("serviceWorker" in navigator&&location.protocol!=="file:"){
  window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
}
})();
