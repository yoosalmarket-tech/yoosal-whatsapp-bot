const crypto=require('node:crypto');
const {step}=require('../bot.cjs');
const required=['META_APP_SECRET','META_VERIFY_TOKEN','META_ACCESS_TOKEN','META_PHONE_NUMBER_ID','META_GRAPH_VERSION','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
async function db(path,method='GET',data,prefer){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const r=await fetch(process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('Database HTTP '+r.status);
 const raw=await r.text();return raw?JSON.parse(raw):null;
}
async function send(to,reply,outboxId){
 const base={messaging_product:'whatsapp',recipient_type:'individual',to,biz_opaque_callback_data:outboxId};
 let body={...base,type:'text',text:{body:reply.text}};
 if(reply.options.length){
  const text={text:reply.text};
  body={...base,type:'interactive',interactive:reply.options.length<=3?{type:'button',body:text,action:{buttons:reply.options.map(o=>({type:'reply',reply:{id:o.id,title:o.label.slice(0,20)}}))}}:{type:'list',body:text,action:{button:'اختر من القائمة',sections:[{title:'وكالة يوصل',rows:reply.options.map(o=>({id:o.id,title:o.label.slice(0,24)}))}]}}};
 }
 async function transmit(payload){
  const r=await fetch('https://graph.facebook.com/'+process.env.META_GRAPH_VERSION.trim()+'/'+process.env.META_PHONE_NUMBER_ID.trim()+'/messages',{method:'POST',headers:{Authorization:'Bearer '+process.env.META_ACCESS_TOKEN.trim(),'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
  if(r.ok){const data=await r.json();const metaId=data?.messages?.[0]?.id;if(!metaId)throw Error('Meta response missing message ID');console.info('Meta reply accepted; messageType='+payload.type);return {metaId};}
  const data=await r.json().catch(()=>null);
  const e=data?.error||{};
  const code=Number.isSafeInteger(e.code)?e.code:'unknown';
  const detail=String(e.error_data?.details||e.message||'');
  const field=['interactive.body.text','interactive.body','interactive.action','recipient_type','title','button','sections','rows'].find(x=>detail.toLowerCase().includes(x))||'unknown';
  console.warn('Meta rejected reply: HTTP '+r.status+' code='+code+' field='+field+' messageType='+payload.type);
  return {status:r.status,code};
 }
 let fallback=false,outcome=await transmit(body);
 if(!outcome.metaId&&body.type==='interactive'&&outcome.status===400&&[100,131009].includes(outcome.code)){
  fallback=true;console.info('Trying numbered text fallback');
  const numbered=reply.text+'\n\n'+reply.options.map((o,i)=>(i+1)+'. '+o.label).join('\n')+'\n\nاكتب رقم الخيار.';
  outcome=await transmit({...base,type:'text',text:{body:numbered}});
 }
 return {...outcome,fallback};
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
 if(required.some(k=>!process.env[k])){console.error('Webhook configuration missing');return res.status(503).send('Configuration required');}
 try{
  const raw=await rawBody(req);
  if(!validSignature(raw,String(req.headers['x-hub-signature-256']||''),process.env.META_APP_SECRET))return res.status(401).end();
  const body=JSON.parse(raw.toString());
  for(const entry of body.entry||[])for(const change of entry.changes||[]){
   const v=change.value||{};if(String(v.metadata?.phone_number_id)!==process.env.META_PHONE_NUMBER_ID){console.info('Webhook event ignored: nonmatching phone number ID');continue;}
   for(const st of v.statuses||[]){
    if(!['sent','delivered','read','failed'].includes(st.status)||typeof st.id!=='string')continue;
    const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(st.biz_opaque_callback_data||'')?st.biz_opaque_callback_data:null;
    const code=Number.isSafeInteger(st.errors?.[0]?.code)?String(st.errors[0].code):null;
    await db('rpc/yoosal_bot_delivery','POST',{p_id:id,p_meta:st.id,p_status:st.status,p_code:code});
   }
   for(const echo of v.smb_message_echoes||[]){
    const recipient=String(echo.to||echo.recipient_id||'');
    if(!/^\d{6,20}$/.test(recipient))continue;
    await db('rpc/yoosal_bot_set_mode','POST',{p_phone:recipient,p_mode:'human',p_reason:'manual_whatsapp_reply',p_actor:'whatsapp_business_app'});
    console.info('Manual WhatsApp message detected; chat paused');
   }
   for(const m of v.messages||[]){
    if(!m.id||!/^\d{6,20}$/.test(m.from||''))continue;
    const ts=Number(m.timestamp);
    if(!Number.isSafeInteger(ts)||ts<=0)continue;
    const phone=m.from,token=crypto.randomUUID(),claim={p_phone:phone,p_id:m.id,p_ts:ts,p_token:token};
    const started=Date.now(),context=await db('rpc/yoosal_bot_claim_context','POST',claim),status=context.status;
    const claimMs=Date.now()-started;
    if(status==='duplicate'){console.info('Duplicate or stale inbound event ignored');continue;}
    if(status==='busy')throw Error('Conversation busy; retry');
    if(status!=='claimed')throw Error('Unexpected event claim result');
    let prepared=false;
    try{
     const state=context.state||{};
     const inBody=String(m.interactive?.button_reply?.title||m.interactive?.list_reply?.title||m.text?.body||'[وسائط غير نصية]').slice(0,4096);
     if(context.mode==='human'){
      const recorded=await db('rpc/yoosal_bot_human_inbound','POST',{...claim,p_in:inBody,p_type:String(m.type||'text').slice(0,30)});
      if(!recorded)throw Error('Human inbound not recorded');
      continue;
     }
     const chosen=m.interactive?.button_reply?.id||m.interactive?.list_reply?.id;
     let input=chosen||m.text?.body||'';
     const numeric=String(input).trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
     const numericChoice=!chosen&&state.numberedFallback&&/^(?:[1-9]|10)$/.test(numeric)&&state.lastOptions?.[Number(numeric)-1];
     if(numericChoice)input=state.lastOptions[Number(numeric)-1];
     if(chosen&&state.stage!=='expired'&&!(state.expiresAt&&ts>=state.expiresAt)&&!state.lastOptions?.includes(chosen)){console.info('Stale menu selection ignored');await db('rpc/yoosal_bot_finish','POST',{...claim,p_state:state});continue;}
     const supported=Boolean(chosen)||typeof m.text?.body==='string';
     const result=step(state,input,{now:ts,choice:Boolean(chosen||numericChoice),unsupported:!supported,config:context.config});
     result.state.lastOptions=result.reply.options.map(o=>o.id);
     result.state.numberedFallback=false;
     if(result.state.stage!=='done')result.state.expiresAt=Math.floor(Date.now()/1000)+300;else delete result.state.expiresAt;
     const outboxId=await db('rpc/yoosal_bot_prepare','POST',{...claim,p_state:result.state,p_reply:result.reply,p_in:inBody,p_type:String(m.type||'text').slice(0,30),p_lead:result.lead||null});
     if(!outboxId){console.info('Auto dispatch suppressed by takeover');continue;}
     prepared=true;
     const prepareMs=Date.now()-started-claimMs;
     const report=(status,metaId,code)=>db('rpc/yoosal_bot_delivery','POST',{p_id:outboxId,p_meta:metaId||null,p_status:status,p_code:code||null});
     let outcome;
     const allowed=await db('rpc/yoosal_bot_can_dispatch','POST',{p_phone:phone,p_id:outboxId});
     if(!allowed){console.info('Auto send cancelled after takeover');continue;}
     try{outcome=await send(phone,result.reply,outboxId);}
     catch(e){console.error('Meta dispatch outcome uncertain');await report('uncertain',null,'network_or_response');continue;}
     if(!outcome.metaId){
      const status=outcome.status>=400&&outcome.status<500&&outcome.status!==408?'failed':'uncertain';
      await report(status,null,String(outcome.code||'unknown'));
      continue;
     }
     const totalMs=Date.now()-started;
     console.info('Bot reply latency ms='+totalMs+' claim_ms='+claimMs+' prepare_ms='+prepareMs+' meta_ms='+(totalMs-claimMs-prepareMs));
     await report('accepted',outcome.metaId,null);
     if(outcome.fallback){
      const latest=await db('yoosal_bot_sessions?phone=eq.'+phone+'&last_message_id=eq.'+encodeURIComponent(m.id)+'&select=state');
      if(latest[0])await db('yoosal_bot_sessions?phone=eq.'+phone+'&last_message_id=eq.'+encodeURIComponent(m.id),'PATCH',{state:{...latest[0].state,numberedFallback:true}},'return=minimal');
     }
    }catch(e){
     if(!prepared)await db('yoosal_bot_events?claim_token=eq.'+token+'&processed=eq.false','DELETE',null,'return=minimal').catch(()=>{});
     throw e;
    }
   }
  }
  return res.status(200).send('OK');
 }catch(e){console.error('Webhook failed:',e.message);await db('yoosal_bot_alerts','POST',{kind:'webhook',code:'runtime_error'},'return=minimal').catch(()=>{});return res.status(500).send('Retry');}
};
module.exports.config={api:{bodyParser:false}};
module.exports.validSignature=validSignature;
module.exports.db=db;
module.exports.send=send;