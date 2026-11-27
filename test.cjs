const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {step}=require('./bot.cjs');
const {validSignature}=require('./api/webhook.js');
const start=step({},'hello');assert.deepEqual(start.reply.options.map(o=>o.id),['audience','difference','services','human']);
const sub=step(start.state,'services');assert.deepEqual(sub.reply.options.map(o=>o.id),['digital_menu','marketing','menu']);
for(const service of ['digital_menu','marketing','human']){
 let s=service==='human'?start.state:sub.state;
 for(const input of [service,'Demo User','Demo Shop','Need help','confirm']){const r=step(s,input);s=r.state;if(input==='confirm'){assert.equal(r.lead.business,'Demo Shop');assert.equal(s.stage,'done');}}
 assert.equal(step(s,'القائمة').state.stage,'menu');
}
for(const id of ['audience','difference']){const r=step(start.state,id);assert.equal(r.lead,null);assert.equal(r.state.stage,'menu');assert.equal(step(r.state,'human').state.stage,'name');}
const raw=Buffer.from('{"test":true}'),sig='sha256='+crypto.createHmac('sha256','test-secret').update(raw).digest('hex');
assert(validSignature(raw,sig,'test-secret'));assert(!validSignature(Buffer.from('changed'),sig,'test-secret'));assert(!validSignature(raw,'','test-secret'));console.log('Conversation and signature checks passed');