const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {step}=require('./bot.cjs');
const {validSignature}=require('./api/webhook.js');
const ids=r=>r.reply.options.map(o=>o.id);
const menuIds=['audience','difference','services','consultation','human'];
const start=step({},'hello');assert.deepEqual(ids(start),menuIds);
const sub=step(start.state,'services');assert.deepEqual(ids(sub),['digital_menu','marketing','menu']);
for(const id of ['audience','difference']){const r=step(start.state,id);assert.equal(r.lead,null);assert.deepEqual(ids(r),menuIds);assert.equal(step(r.state,'services').state.stage,'services');}
for(const id of ['digital_menu','marketing','منيو الكتروني','منيو إلكتروني']){
 const r=step(sub.state,id);assert.equal(r.state.stage,'service_detail');assert.deepEqual(ids(r),['request_service','services','menu']);assert.equal(r.lead,null);
 assert.equal(step(r.state,'request_service').state.stage,'name');
}
for(const id of ['digital_menu','marketing','human','consultation']){
 let r=step(start.state,id);if(r.state.stage==='service_detail')r=step(r.state,'request_service');
 assert.equal(r.state.stage,'name');assert.equal(step(r.state,'').state.stage,'name');
 for(const input of ['Demo User','Demo Shop','Need help','confirm']){r=step(r.state,input);}
 assert.equal(r.lead.business,'Demo Shop');assert.equal(r.state.stage,'done');
 assert.equal(step(r.state,'القائمة').state.stage,'menu');
}
assert.equal(step({stage:'name',data:{service:'منيو تفاعلي'}},'منيو إلكتروني').state.stage,'service_detail');
const raw=Buffer.from('{"test":true}'),sig='sha256='+crypto.createHmac('sha256','test-secret').update(raw).digest('hex');
assert(validSignature(raw,sig,'test-secret'));assert(!validSignature(Buffer.from('changed'),sig,'test-secret'));assert(!validSignature(raw,'','test-secret'));console.log('Conversation and signature checks passed');