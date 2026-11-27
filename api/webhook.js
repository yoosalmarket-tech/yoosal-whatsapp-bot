const crypto=require('node:crypto');
const {step}=require('../bot.cjs');
const required=['META_APP_SECRET','META_VERIFY_TOKEN','META_ACCESS_TOKEN','META_PHONE_NUMBER_ID','META_GRAPH_VERSION','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
async function db(path,method='GET',data,prefer){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const r=await fetch(process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('Database HTTP '+r.status);
 return r.status===204?null:await r.json();
}
async function send(to,reply){
 const base={messaging_product:'whatsapp',recipient_type:'individual',to};
 let body={...base,type:'text',text:{body:reply.text}};
 if(reply.options.length){
  const text={text:reply.text};
  body={...base,type:'interactive',interactive:reply.options.length<=3?{type:'button',body:text,action:{buttons:reply.options.map(o=>({type:'reply',reply:{id:o.id,title:o.label.slice(0,20)}}))}}:{type:'list',body:text,action:{button:'اختر من القائمة',sections:[{title:'وكالة يوصل',rows:reply.options.map(o=>({id:o.id,title:o.label.slice(0,24)}))}]}}};
 }
 async function transmit(payload){
  const r=await fetch('https://graph.facebook.com/'+process.env.META_GRAPH_VERSION.trim()+'/'+process.env.META_PHONE_NUMBER_ID.trim()+'/messages',{method:'POST',headers:{Authorization:'Bearer '+process.env.META_ACCESS_TOKEN.trim(),'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
  if(r.ok){console.info('Meta reply accepted; messageType='+payload.type);return null;}
  const data=await r.json().catch(()=>null);
  const e=data?.error||{};
  const code=Number.isSafeInteger(e.code)?e.code:'unknown';
  const detail=String(e.error_data?.details||e.message||'');
  const field=['interactive.body.text','interactive.body','interactive.action','recipient_type','title','button','sections','rows'].find(x=>detail.toLowerCase().includes(x))||'unknown';
  console.warn('Meta rejected reply: HTTP '+r.status+' code='+code+' field='+field+' messageType='+payload.type);
  return {status:r.status,code};
 }
 let error=await transmit(body);
 if(error&&body.type==='interactive'&&error.status===400&&[100,131009].includes(error.code)){
  console.info('Trying numbered text fallback');
  const numbered=reply.text+'\n\n'+reply.options.map((o,i)=>(i+1)+'. '+o.label).join('\n')+'\n\nاكتب رقم الخيار.';
  error=await transmit({...base,type:'text',text:{body:numbered}});
 }
 if(error)throw Error('Meta HTTP '+error.status+' code='+error.code);
}
async function rawBody(req){
 if(Buffer.isBuffer(req.body))return req.body;
 if(typeof req.body==='string')return Buffer.from(req.body);
 const chunks=[];let n=0;
 for await(const c of req){n+=Buffer.byteLength(c);if(n>1000000)throw Error('Payload too large');chunks.push(Buffer.from(c));}
 return Buffer.concat(chunks);
}
function validSignature(raw,sig,secret){
 if(!/^sha256=[0-9a-f]{64}$/.test(sig))return false;
 const expected='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));
}
module.exports=async(req,res)=>{
 if(req.method==='GET'){
  if(!process.env.META_VERIFY_TOKEN)return res.status(503).send('Configuration required');
  const q=new URL(req.url,'https://example.invalid').searchParams;
  return q.get('hub.mode')==='subscribe'&&q.get('hub.verify_token')===process.env.META_VERIFY_TOKEN?res.status(200).send(q.get('hub.challenge')||''):res.status(403).send('Forbidden');
 }
 if(req.method!=='POST')return res.status(405).end();
 if(required.some(k=>!process.env[k]))return res.status(503).send('Configuration required');
 try{
  const raw=await rawBody(req);
  if(!validSignature(raw,String(req.headers['x-hub-signature-256']||''),process.env.META_APP_SECRET))return res.status(401).end();
  const body=JSON.parse(raw.toString());
  for(const entry of body.entry||[])for(const change of entry.changes||[]){
   const v=change.value||{};if(String(v.metadata?.phone_number_id)!==process.env.META_PHONE_NUMBER_ID){console.info('Webhook event ignored: nonmatching phone number ID');continue;}
   for(const m of v.messages||[]){
    if(!m.id||!/^\d{6,20}$/.test(m.from||''))continue;
    const ts=Number(m.timestamp);
    if(!Number.isSafeInteger(ts)||ts<=0)continue;
    const phone=m.from,token=crypto.randomUUID(),claim={p_phone:phone,p_id:m.id,p_ts:ts,p_token:token};
    const status=await db('rpc/yoosal_bot_claim','POST',claim);
    if(status==='duplicate'){console.info('Duplicate or stale inbound event ignored');continue;}
    if(status==='busy')throw Error('Conversation busy; retry');
    if(status!=='claimed')throw Error('Unexpected event claim result');
    let sent=false;
    try{
     const previous=await db('yoosal_bot_sessions?phone=eq.'+phone+'&select=state,last_message_id');
     const state=previous[0]?.state||{};
     const chosen=m.interactive?.button_reply?.id||m.interactive?.list_reply?.id;
     let input=chosen||m.text?.body||'';
     const numeric=String(input).trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
     if(/^[1-9]$/.test(numeric)&&state.lastOptions?.[Number(numeric)-1])input=state.lastOptions[Number(numeric)-1];
     if(chosen&&['name','business','details'].includes(state.stage)&&!state.lastOptions?.includes(chosen))input='';
     const result=step(state,input);
     result.state.lastOptions=result.reply.options.map(o=>o.id);
     if(result.lead){const {service,name,business,details}=result.lead;await db('yoosal_bot_leads','POST',{message_id:m.id,phone,service,name,business,details},'resolution=ignore-duplicates,return=representation');}
     await send(phone,result.reply);sent=true;
     const finished=await db('rpc/yoosal_bot_finish','POST',{...claim,p_state:result.state});
     if(finished!==true)throw Error('Event finish failed');
    }catch(e){
     if(!sent)await db('yoosal_bot_events?claim_token=eq.'+token+'&processed=eq.false','DELETE',null,'return=minimal').catch(()=>{});
     throw e;
    }
   }
  }
  return res.status(200).send('OK');
 }catch(e){console.error('Webhook failed:',e.message);return res.status(500).send('Retry');}
};
module.exports.config={api:{bodyParser:false}};
module.exports.validSignature=validSignature;