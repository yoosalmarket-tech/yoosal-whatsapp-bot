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