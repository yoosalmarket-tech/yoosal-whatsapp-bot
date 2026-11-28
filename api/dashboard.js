const {getConfig,validateConfig}=require('../bot.cjs');
const {send}=require('./webhook.js');
const ratingText='شكراً لتواصلك مع فريقنا 💛\nكم تقيّم الخدمة؟';
const origin='https://yoosal-whatsapp-bot.vercel.app';
const cookie='__Host-yoosal_session';
const statuses=['new','contacted','closed'];
const base=()=>process.env.SUPABASE_URL?.replace(/\/$/,'');
const authKey=()=>process.env.SUPABASE_PUBLISHABLE_KEY;
const adminEmail=()=>String(process.env.YOOSAL_DASHBOARD_ADMIN_EMAIL||'').trim().toLowerCase();
async function auth(path,body,token){
 const r=await fetch(base()+'/auth/v1/'+path,{method:body?'POST':'GET',headers:{apikey:authKey(),'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
 return r.ok?await r.json().catch(()=>({})):null;
}
async function db(path,method='GET',body){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const r=await fetch(base()+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('DB '+r.status);return r.status===204?[]:await r.json();
}
function authorized(u){return Boolean(u?.id&&u?.email_confirmed_at&&String(u.email||'').toLowerCase()===adminEmail());}
async function access(u){
 if(authorized(u))return {role:'owner',name:'مدير الموقع'};
 if(!u?.id||!u.email_confirmed_at||!isUuid(u.id))return null;
 const rows=await db('yoosal_bot_staff?user_id=eq.'+u.id+'&active=eq.true&select=name,email');
 if(!rows[0]||rows[0].email!==String(u.email||'').toLowerCase())return null;
 return {role:'staff',name:rows[0].name};
}
function isUuid(id){return typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);}
async function adminAuth(method,path,body){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const r=await fetch(base()+'/auth/v1/admin/users'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
 if(!r.ok)return {ok:false,status:r.status};
 return {ok:true,data:await r.json().catch(()=>({}))};
}
const staffFields='user_id,name,email,active,created_at';
function session(req){const m=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookie+'='));return m?m.slice(cookie.length+1):'';}
function setSession(res,value,age){res.setHeader('Set-Cookie',cookie+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+age);}
async function bodyOf(req){if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;const raw=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString():'';if(raw.length>50000)throw Error('Invalid body');return raw?JSON.parse(raw):{};}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Cookie');
 if(!base()||!authKey()||!adminEmail()||!process.env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({error:'Dashboard configuration required'});
 if(!['GET','POST','PATCH'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(req.method!=='GET'&&req.headers.origin!==origin)return res.status(403).json({error:'Origin not allowed'});
 try{
  const payload=req.method==='GET'?{}:await bodyOf(req);
  if(req.method==='POST'&&payload.action==='login'){
   const email=String(payload.email||'').trim().toLowerCase(),password=String(payload.password||'');
   if(!email||email.length>254||!password||password.length>256)return res.status(401).json({error:'Invalid credentials'});
   const data=await auth('token?grant_type=password',{email,password});
   if(!data?.access_token||!await access(data.user))return res.status(401).json({error:'Invalid credentials'});
   const lifetime=Math.min(3600,Number(data.expires_in)||3600);setSession(res,data.access_token,lifetime);
   return res.status(200).json({ok:true});
  }
  if(req.method==='POST'&&payload.action==='logout'){setSession(res,'',0);return res.status(200).json({ok:true});}
  const token=session(req);if(!token||token.length>5000)return res.status(401).json({error:'Login required'});
  const user=await auth('user',null,token),member=await access(user);if(!member){setSession(res,'',0);return res.status(401).json({error:'Login required'});}
  if(req.method==='GET'){
   const q=new URL(req.url,origin).searchParams,phone=q.get('phone');
   if(q.get('view')==='chats'){
    const [sessions,handoffs,history,leads]=await Promise.all([
     db('yoosal_bot_sessions?select=phone,last_message_id&limit=1000'),
     db('yoosal_bot_handoffs?select=phone,mode,reason,updated_at&limit=1000'),
     db('yoosal_bot_history?select=phone,body,direction,created_at&order=created_at.desc&limit=1000'),
     db('yoosal_bot_leads?select=phone,name,business,created_at&order=created_at.desc&limit=200')
    ]);
    const byPhone=new Map();
    for(const session of sessions)byPhone.set(session.phone,{phone:session.phone,mode:'auto'});
    for(const h of handoffs)byPhone.set(h.phone,{...byPhone.get(h.phone),phone:h.phone,mode:h.mode,reason:h.reason,modeUpdatedAt:h.updated_at});
    for(const msg of history){const rec=byPhone.get(msg.phone)||{phone:msg.phone,mode:'auto'};if(!rec.lastAt){rec.lastAt=msg.created_at;rec.preview=msg.body;rec.direction=msg.direction;}byPhone.set(msg.phone,rec);}
    for(const lead of leads){const rec=byPhone.get(lead.phone)||{phone:lead.phone,mode:'auto'};if(!rec.business){rec.business=lead.business;rec.name=lead.name;}byPhone.set(lead.phone,rec);}
    const chats=Array.from(byPhone.values()).sort((a,b)=>Number(b.mode==='human')-Number(a.mode==='human')||new Date(b.lastAt||b.modeUpdatedAt||0)-new Date(a.lastAt||a.modeUpdatedAt||0));
    return res.status(200).json({chats,limited:sessions.length===1000||history.length===1000||leads.length===200});
   }
   if(q.get('view')==='staff'){if(member.role!=='owner')return res.status(403).json({error:'Owner access required'});const staff=await db('yoosal_bot_staff?select='+staffFields+'&order=created_at.desc&limit=200');return res.status(200).json({staff});}
   if(q.get('view')==='config'){if(member.role!=='owner')return res.status(403).json({error:'Owner access required'});const rows=await db('yoosal_bot_config?id=eq.1&select=config');return res.status(200).json({config:getConfig(rows[0]?.config)});}
   if(phone!==null){if(!/^\d{6,20}$/.test(phone))return res.status(400).json({error:'Invalid phone'});const history=await db('yoosal_bot_history?phone=eq.'+phone+'&select=event_id,direction,body,message_type,created_at&order=created_at.desc&limit=100');const outbox=await db('yoosal_bot_outbox?phone=eq.'+phone+'&select=event_id,status,error_code&order=created_at.desc&limit=100');const byEvent=new Map(outbox.map(x=>[x.event_id,x]));const handoff=await db('yoosal_bot_handoffs?phone=eq.'+phone+'&select=mode,reason,updated_at');const ratings=await db('yoosal_bot_ratings?phone=eq.'+phone+'&select=id,actor_name,reactivated_at,rating,rated_at,request_outbox_id,skip_reason&order=reactivated_at.desc&limit=20');const byOutbox=new Map(outbox.map(x=>[x.event_id,x.status]));return res.status(200).json({mode:handoff[0]?.mode||'auto',ratings:ratings.map(r=>({...r,survey_status:r.skip_reason||byOutbox.get('rating:'+r.id)||'unknown'})),history:history.reverse().map(m=>({...m,delivery:m.direction==='out'?byEvent.get(m.event_id)||null:null}))});}
   const [leads,history,alerts,outbox]=await Promise.all([db('yoosal_bot_leads?select=message_id,phone,service,name,business,details,status,notes,created_at,updated_at&order=created_at.desc&limit=200'),db('yoosal_bot_sessions?select=phone&limit=1000'),member.role==='owner'?db('yoosal_bot_alerts?select=kind,code,created_at&order=created_at.desc&limit=20'):Promise.resolve([]),db('yoosal_bot_outbox?select=status&order=created_at.desc&limit=1000')]);
   return res.status(200).json({member,leads,conversations:history.length,alerts,delivery:outbox.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{}),limited:leads.length===200||history.length===1000});
  }
  if(req.method==='POST'&&payload.action==='create_staff'){
   if(member.role!=='owner')return res.status(403).json({error:'Owner access required'});
   const email=String(payload.email||'').trim().toLowerCase(),name=String(payload.name||'').trim(),password=String(payload.password||'');
   if(email===adminEmail()||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2||name.length>100||password.length<12||password.length>128)return res.status(400).json({error:'Invalid employee name, email or password'});
   const existing=await db('yoosal_bot_staff?email=eq.'+encodeURIComponent(email)+'&select=user_id&limit=1');
   if(existing.length)return res.status(409).json({error:'Employee already exists'});
   const result=await adminAuth('POST','',{email,password,email_confirm:true,app_metadata:{yoosal_bot_staff:true}});
   if(!result.ok)return res.status(result.status===422||result.status===400?409:502).json({error:'Could not create user; email may already exist in Supabase'});
   const id=result.data.id||result.data.user?.id;
   if(!isUuid(id))return res.status(502).json({error:'Invalid authentication response'});
   try{await db('yoosal_bot_staff','POST',{user_id:id,email,name});}catch(e){await adminAuth('DELETE','/'+id).catch(()=>{});throw e;}
   return res.status(201).json({ok:true});
  }
  if(req.method==='PATCH'){
   if(payload.action==='set_mode'){
    const phone=String(payload.phone||''),mode=String(payload.mode||'');
    if(!/^\d{6,20}$/.test(phone)||!['auto','human'].includes(mode))return res.status(400).json({error:'Invalid chat or mode'});
    const actor=member.role+':'+user.id;
    if(mode==='human'){
     const result=await db('rpc/yoosal_bot_set_mode','POST',{p_phone:phone,p_mode:mode,p_reason:'dashboard_takeover',p_actor:actor});
     return res.status(200).json({ok:true,mode:result.mode});
    }
    const name=member.role==='owner'?member.name+' ('+user.email+')':member.name;
    const result=await db('rpc/yoosal_bot_resume_with_rating','POST',{p_phone:phone,p_actor:actor,p_name:name,p_text:ratingText});
    let surveyStatus=result.survey_status;
    if(result.outbox_id){
     const report=(status,metaId,code)=>db('rpc/yoosal_bot_delivery','POST',{p_id:result.outbox_id,p_meta:metaId||null,p_status:status,p_code:code||null});
     const options=['سيئة','ضعيفة','مقبولة','جيدة','ممتازة'].map((label,i)=>({id:'rating:'+result.survey_id+':'+(i+1),label:(i+1)+' '+ '⭐'.repeat(i+1)+' '+label}));
     try{
      if(!await db('rpc/yoosal_bot_can_dispatch','POST',{p_phone:phone,p_id:result.outbox_id}))surveyStatus='cancelled';
      else{
       const outcome=await send(phone,{text:ratingText,options},result.outbox_id);
       surveyStatus=outcome.metaId?'accepted':outcome.status>=400&&outcome.status<500&&outcome.status!==408?'failed':'uncertain';
       await report(surveyStatus,outcome.metaId,outcome.metaId?null:String(outcome.code||'unknown'));
      }
     }catch(e){surveyStatus='uncertain';await report('uncertain',null,'rating_dispatch_uncertain').catch(()=>{});}
    }
    return res.status(200).json({ok:true,mode:result.mode,survey_status:surveyStatus,reactivated_by:name});
   }
   if(payload.action==='staff_access'){
    if(member.role!=='owner')return res.status(403).json({error:'Owner access required'});
    if(!isUuid(payload.id)||typeof payload.active!=='boolean')return res.status(400).json({error:'Invalid employee'});
    const rows=await db('yoosal_bot_staff?user_id=eq.'+payload.id,'PATCH',{active:payload.active});
    return rows.length?res.status(200).json({ok:true}):res.status(404).json({error:'Employee not found'});
   }
   if(payload.action==='save_config'){if(member.role!=='owner')return res.status(403).json({error:'Owner access required'});let config;try{config=validateConfig(payload.config);}catch(e){return res.status(400).json({error:e.message});}await db('yoosal_bot_config?id=eq.1','PATCH',{config,updated_at:new Date().toISOString()});return res.status(200).json({ok:true,config});}
   const id=String(payload.id||''),status=String(payload.status||''),notes=String(payload.notes||'');
   if(!/^[\w.+=\/-]{1,250}$/.test(id)||!statuses.includes(status)||notes.length>2000)return res.status(400).json({error:'Invalid enquiry'});
   const rows=await db('yoosal_bot_leads?message_id=eq.'+encodeURIComponent(id),'PATCH',{status,notes,updated_at:new Date().toISOString()});
   return rows.length?res.status(200).json({ok:true}):res.status(404).json({error:'Enquiry not found'});
  }
  return res.status(400).json({error:'Invalid action'});
 }catch(e){console.error('Dashboard request failed');return res.status(500).json({error:'Request failed'});}
};
module.exports.authorized=authorized;
module.exports.access=access;
