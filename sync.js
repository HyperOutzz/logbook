/* Logbook sync with Supabase. No library: plain fetch calls to Supabase's auth and REST APIs.

   How it works (offline-first):
   - The app always saves to this device first (localStorage). Sync is a bonus on top.
   - Every edited day is remembered as "pending" until the server has it, so edits made
     with no signal are uploaded later, even after the app is closed and reopened.
   - A sync cycle: (1) ask the server for the list of days + their updatedAt (tiny),
     (2) download only the days that are newer on the server, (3) upload the days that
     are newer here. One row per day; the newer updatedAt wins. The database also refuses
     to let an older edit overwrite a newer one (the keep_newest trigger).
   - Sign-in is email + password (Supabase needs paid email templates for codes).
     The session is kept on the device and refreshed automatically. */
(function(){
"use strict";
const LS_SESSION="logbook-session", LS_PENDING="logbook-pending", LS_LASTSYNC="logbook-lastSync";
function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
function set(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}}
function readJSON(k,d){try{const v=JSON.parse(get(k));return v==null?d:v}catch(e){return d}}

class AuthError extends Error{}   // the server said no (wrong password, expired session)

window.createLogbookSync=function(o){
  // o = {url, key, getDays(), applyRemote({date: day}), onStatus(kind, error), onAuthChange()}
  const base=o.url.replace(/\/$/,"");
  let session=readJSON(LS_SESSION,null);
  const pending=new Set(readJSON(LS_PENDING,[]));
  let running=null, again=false, timer=null;
  const savePending=()=>set(LS_PENDING,JSON.stringify([...pending]));
  const saveSession=()=>set(LS_SESSION,session?JSON.stringify(session):null);

  /* ---------- auth ---------- */
  async function authCall(path,body,bearer){
    const headers={apikey:o.key,"Content-Type":"application/json"};
    if(bearer)headers.Authorization="Bearer "+bearer;
    const r=await fetch(base+"/auth/v1/"+path,{method:"POST",headers,body:JSON.stringify(body||{})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){
      const msg=j.error_description||j.msg||j.message||("HTTP "+r.status);
      const e=r.status>=400&&r.status<500&&r.status!==429?new AuthError(msg):new Error(msg);
      e.status=r.status;throw e;
    }
    return j;
  }
  function keep(j){
    session={access_token:j.access_token,refresh_token:j.refresh_token,
      expires_at:j.expires_at?j.expires_at*1000:Date.now()+(j.expires_in||3600)*1000,
      user_id:j.user&&j.user.id||(session&&session.user_id),email:j.user&&j.user.email||(session&&session.email)};
    saveSession();
  }
  function dropSession(){session=null;saveSession();o.onAuthChange&&o.onAuthChange()}
  async function token(){
    if(!session)throw new AuthError("Signed out");
    if(Date.now()<session.expires_at-60000)return session.access_token;
    try{keep(await authCall("token?grant_type=refresh_token",{refresh_token:session.refresh_token}))}
    catch(e){if(e instanceof AuthError)dropSession();throw e}   // offline: keep the session, retry later
    return session.access_token;
  }

  /* ---------- database ---------- */
  async function rest(method,path,body,extra){
    const t=await token();
    const r=await fetch(base+"/rest/v1/"+path,{method,
      headers:Object.assign({apikey:o.key,Authorization:"Bearer "+t,"Content-Type":"application/json"},extra||{}),
      body:body?JSON.stringify(body):undefined});
    if(r.status===401){if(session){session.expires_at=0;saveSession()}throw new Error("Session expired, refreshing")}
    if(!r.ok)throw new Error("HTTP "+r.status+" "+(await r.text().catch(()=>"")).slice(0,200));
    return method==="GET"?r.json():null;
  }

  async function cycle(){
    // 1. what does the server have?
    const list=await rest("GET","days?select=date,updated_at");
    const remote={};list.forEach(r=>{remote[r.date]=Number(r.updated_at)||0});
    let local=o.getDays();
    const down=Object.keys(remote).filter(k=>remote[k]>((local[k]&&local[k].updatedAt)||0));
    Object.keys(local).forEach(k=>{if((local[k].updatedAt||0)>(remote[k]||0))pending.add(k)});

    // 2. download what's newer there
    const got={};
    for(let i=0;i<down.length;i+=80){
      const chunk=down.slice(i,i+80).map(encodeURIComponent).join(",");
      const rows=await rest("GET",`days?select=date,data,updated_at&date=in.(${chunk})`);
      rows.forEach(r=>{const d=Object.assign({},r.data||{});d.updatedAt=Number(r.updated_at)||0;got[r.date]=d});
    }
    if(Object.keys(got).length)o.applyRemote(got);

    // 3. upload what's newer here
    local=o.getDays();
    const up=[...pending].filter(k=>local[k]&&(local[k].updatedAt||0)>(remote[k]||0));
    [...pending].forEach(k=>{if(!up.includes(k))pending.delete(k)});
    savePending();
    if(up.length){
      const sent=up.map(k=>[k,local[k].updatedAt]);
      const rows=up.map(k=>({user_id:session.user_id,date:k,data:local[k],updated_at:local[k].updatedAt||Date.now()}));
      for(let i=0;i<rows.length;i+=200)
        await rest("POST","days?on_conflict=user_id,date",rows.slice(i,i+200),{Prefer:"resolution=merge-duplicates,return=minimal"});
      const now=o.getDays();
      sent.forEach(([k,u])=>{if(now[k]&&now[k].updatedAt===u)pending.delete(k)}); // edited again meanwhile? stays pending
      savePending();
    }
    set(LS_LASTSYNC,String(Date.now()));
  }

  function syncNow(){
    if(!session)return Promise.resolve();
    if(running){again=true;return running}
    running=(async()=>{
      o.onStatus("syncing");
      try{do{again=false;await cycle()}while(again);o.onStatus("synced")}
      catch(e){o.onStatus(!session?"signedout":(e instanceof TypeError||navigator.onLine===false)?"offline":"error",e)}
      finally{running=null}
    })();
    return running;
  }

  // the app calls this after every local save
  function markDirty(k){
    pending.add(k);savePending();
    if(!session)return;
    clearTimeout(timer);timer=setTimeout(syncNow,1500);
  }

  async function signIn(email,password){
    keep(await authCall("token?grant_type=password",{email:email.trim(),password}));
    o.onAuthChange&&o.onAuthChange();
    return syncNow();
  }
  async function signOut(){
    const t=session&&session.access_token;
    if(t)authCall("logout",{},t).catch(()=>{});
    set(LS_LASTSYNC,null);dropSession();
  }

  // sync when the connection comes back, when the app is reopened, and every 2 minutes while open
  window.addEventListener("online",()=>syncNow());
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncNow()});
  setInterval(()=>{if(!document.hidden)syncNow()},120000);

  return {signIn,signOut,syncNow,markDirty,
    get signedIn(){return !!session}, get email(){return session&&session.email||""},
    get lastSync(){return Number(get(LS_LASTSYNC))||0}, get pendingCount(){return pending.size}};
};
})();
