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
function session(req){const m=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookie+'='));return m?m.slice(cookie.length+1):'';}
function setSession(res,value,age){res.setHeader('Set-Cookie',cookie+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+age);}
async function bodyOf(req){if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;const raw=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString():'';if(raw.length>12000)throw Error('Invalid body');return raw?JSON.parse(raw):{};}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Cookie');
 if(!base()||!authKey()||!adminEmail()||!process.env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({error:'Dashboard configuration required'});
 if(!['GET','POST','PATCH'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(req.method!=='GET'&&req.headers.origin!==origin)return res.status(403).json({error:'Origin not allowed'});
 try{
  const payload=req.method==='GET'?{}:await bodyOf(req);
  if(req.method==='POST'&&payload.action==='login'){
   const email=String(payload.email||'').trim().toLowerCase(),password=String(payload.password||'');
   if(email!==adminEmail()||!password||password.length>256)return res.status(401).json({error:'Invalid credentials'});
   const data=await auth('token?grant_type=password',{email,password});
   if(!data?.access_token||!authorized(data.user))return res.status(401).json({error:'Invalid credentials'});
   const lifetime=Math.min(3600,Number(data.expires_in)||3600);setSession(res,data.access_token,lifetime);
   return res.status(200).json({ok:true});
  }
  if(req.method==='POST'&&payload.action==='logout'){setSession(res,'',0);return res.status(200).json({ok:true});}
  const token=session(req);if(!token||token.length>5000)return res.status(401).json({error:'Login required'});
  const user=await auth('user',null,token);if(!authorized(user)){setSession(res,'',0);return res.status(401).json({error:'Login required'});}
  if(req.method==='GET'){
   const q=new URL(req.url,origin).searchParams,phone=q.get('phone');
   if(phone!==null){if(!/^\d{6,20}$/.test(phone))return res.status(400).json({error:'Invalid phone'});const history=await db('yoosal_bot_history?phone=eq.'+phone+'&select=direction,body,message_type,created_at&order=created_at.desc&limit=100');return res.status(200).json({history:history.reverse()});}
   const [leads,history]=await Promise.all([db('yoosal_bot_leads?select=message_id,phone,service,name,business,details,status,notes,created_at,updated_at&order=created_at.desc&limit=200'),db('yoosal_bot_sessions?select=phone&limit=1000')]);
   return res.status(200).json({leads,conversations:history.length,limited:leads.length===200||history.length===1000});
  }
  if(req.method==='PATCH'){
   const id=String(payload.id||''),status=String(payload.status||''),notes=String(payload.notes||'');
   if(!/^[\w.+=\/-]{1,250}$/.test(id)||!statuses.includes(status)||notes.length>2000)return res.status(400).json({error:'Invalid enquiry'});
   const rows=await db('yoosal_bot_leads?message_id=eq.'+encodeURIComponent(id),'PATCH',{status,notes,updated_at:new Date().toISOString()});
   return rows.length?res.status(200).json({ok:true}):res.status(404).json({error:'Enquiry not found'});
  }
  return res.status(400).json({error:'Invalid action'});
 }catch(e){console.error('Dashboard request failed');return res.status(500).json({error:'Request failed'});}
};
module.exports.authorized=authorized;
