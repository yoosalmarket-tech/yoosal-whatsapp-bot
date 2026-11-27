const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {step}=require('./bot.cjs');
const {validSignature}=require('./api/webhook.js');
const {authorized}=require('./api/dashboard.js');
const ids=r=>r.reply.options.map(o=>o.id);
const menuIds=['audience','difference','services','consultation','human'];
const start=step({},'hello');assert.deepEqual(ids(start),menuIds);
const sub=step(start.state,'services');assert.deepEqual(ids(sub),['digital_menu','marketing','menu']);
for(const id of ['audience','difference']){const r=step(start.state,id);assert.deepEqual(ids(r),menuIds);assert.equal(step(r.state,'services').state.stage,'services');}
for(const id of ['digital_menu','marketing','منيو الكتروني','بدي اعرف سعر المنيو','منيو إلكتروني']){
 const r=step(sub.state,id);assert.equal(r.state.stage,'service_detail');assert.deepEqual(ids(r),['request_service','services','menu']);assert.equal(r.lead,null);assert.equal(step(r.state,'request_service').state.stage,'name');
}
for(const id of ['digital_menu','marketing','human','consultation']){
 let r=step(start.state,id);if(r.state.stage==='service_detail')r=step(r.state,'request_service');
 assert.equal(r.state.stage,'name');
 for(const bad of ['','123','تمام','منيو الكتروني'])assert.equal(step(r.state,bad).state.stage,'name');
 assert.equal(step(r.state,'',{unsupported:true}).state.stage,'name');
 assert.equal(step(r.state,'digital_menu',{choice:true}).state.stage,'name');
 let cancelled=step(r.state,'cancel');assert.equal(cancelled.state.stage,'cancel_confirm');assert.equal(step(cancelled.state,'cancel_no').state.stage,'name');assert.equal(step(cancelled.state,'cancel_yes').state.stage,'menu');
 for(const input of ['Demo User','Demo Shop','Need help'])r=step(r.state,input);
 assert.equal(r.state.stage,'confirm');
 r=step(r.state,'edit');assert.equal(r.state.stage,'edit');r=step(r.state,'edit_business');r=step(r.state,'New Shop');assert.equal(r.state.stage,'confirm');assert.equal(r.state.data.name,'Demo User');
 r=step(r.state,'إرسال الطلب');assert.equal(r.lead.business,'New Shop');assert.equal(r.state.stage,'done');
}
assert.equal(step({stage:'name',lastInboundTs:1,data:{service:'منيو تفاعلي'}},'Test',{now:90000}).state.stage,'menu');
const raw=Buffer.from('{"test":true}'),sig='sha256='+crypto.createHmac('sha256','test-secret').update(raw).digest('hex');
assert(validSignature(raw,sig,'test-secret'));assert(!validSignature(Buffer.from('changed'),sig,'test-secret'));assert(!validSignature(raw,'','test-secret'));
process.env.YOOSAL_DASHBOARD_ADMIN_EMAIL='owner@example.invalid';
assert(!authorized(null));assert(!authorized({id:'x',email:'other@example.invalid',email_confirmed_at:'yes'}));assert(!authorized({id:'x',email:'owner@example.invalid'}));assert(authorized({id:'x',email:'owner@example.invalid',email_confirmed_at:'yes'}));
console.log('Conversation, validation, cancellation, editing, expiry, signature and dashboard authorization checks passed');

async function deliveryTests(){
 const oldFetch=global.fetch;
 const env={META_APP_SECRET:'test-secret',META_VERIFY_TOKEN:'verify',META_ACCESS_TOKEN:'test-token',META_PHONE_NUMBER_ID:'12345',META_GRAPH_VERSION:'v25.0',SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-db'};
 Object.assign(process.env,env);
 const handler=require('./api/webhook.js');let claimCount=0,sendCount=0,prepared=false,reported=[],mode='accepted';
 const outbox='00000000-0000-4000-8000-000000000001';
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 global.fetch=async(url,options)=>{
  const u=new URL(url),p=u.pathname,body=options.body?JSON.parse(options.body):null;
  if(u.hostname==='graph.facebook.com'){
   sendCount++;assert(prepared);assert.equal(body.biz_opaque_callback_data,outbox);assert.equal(body.interactive.body.text.includes('يوصل'),true);
   if(mode==='uncertain')throw Error('network timeout');
   return json({messages:[{id:'wamid.mock'}]});
  }
  if(p.endsWith('/yoosal_bot_claim'))return json(++claimCount===1?'claimed':'duplicate');
  if(p.endsWith('/yoosal_bot_sessions'))return json([]);
  if(p.endsWith('/yoosal_bot_prepare')){prepared=true;assert(body.p_reply.text);return json(outbox);}
  if(p.endsWith('/yoosal_bot_delivery')){reported.push(body);return json(true);}
  throw Error('Unexpected mock URL: '+p);
 };
 const request=async(value)=>{
  const body=Buffer.from(JSON.stringify({entry:[{changes:[{value:{metadata:{phone_number_id:'12345'},...value}}]}]}));
  const sig='sha256='+crypto.createHmac('sha256','test-secret').update(body).digest('hex');
  const res={code:0,status(n){this.code=n;return this;},send(){return this;},end(){return this;}};
  await handler({method:'POST',headers:{'x-hub-signature-256':sig},body},res);assert.equal(res.code,200);
 };
 try{
  const messages=[{id:'wamid.in',from:'0000000000',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'هلا'}}];
  await request({messages});await request({messages});assert.equal(sendCount,1);assert.equal(reported[0].p_status,'accepted');
  await request({statuses:[{id:'wamid.mock',status:'delivered',biz_opaque_callback_data:outbox}]});assert.equal(reported[1].p_status,'delivered');
  claimCount=0;sendCount=0;prepared=false;reported=[];mode='uncertain';
  await request({messages});await request({messages});assert.equal(sendCount,1);assert.equal(reported[0].p_status,'uncertain');
  console.log('Durable send, retry suppression, delivery callbacks and ambiguous failures passed');
 }finally{global.fetch=oldFetch;}
}
deliveryTests().catch(e=>{console.error(e);process.exitCode=1;});
