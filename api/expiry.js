const crypto=require('node:crypto');
const {db,send}=require('./webhook.js');
const expiryText='انتهت الجلسة لأنك ما رديت خلال 5 دقايق. إذا حابب ترجع تكمل، ابعتلنا «هلا» وبنبدأ من جديد 💛';
function validScheduler(timestamp,signature,key,now=Math.floor(Date.now()/1000)){
 if(!key||!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp))>120||!/^\w{64}$/.test(signature)||!/^[a-f0-9]{64}$/.test(signature))return false;
 const expected=crypto.createHmac('sha256',key).update(timestamp).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).end();
 if(!validScheduler(String(req.headers['x-yoosal-timestamp']||''),String(req.headers['x-yoosal-signature']||''),process.env.YOOSAL_EXPIRY_SIGNING_KEY))return res.status(401).end();
 try{
  const due=await db('rpc/yoosal_bot_expire_due','POST',{p_text:expiryText});
  const outcomes=await Promise.allSettled(due.map(async job=>{
   const report=(status,metaId,code)=>db('rpc/yoosal_bot_delivery','POST',{p_id:job.id,p_meta:metaId||null,p_status:status,p_code:code||null});
   const current=await db('yoosal_bot_sessions?phone=eq.'+job.phone+'&last_message_id=eq.'+encodeURIComponent(job.last_message_id)+'&select=state');
   if(current[0]?.state?.stage!=='expired'){await report('failed',null,'session_resumed');return;}
   // Recheck in the database immediately before dispatch; human takeover cancels expiry.
   const allowed=await db('rpc/yoosal_bot_can_dispatch','POST',{p_phone:job.phone,p_id:job.id});
   if(!allowed)return;
   let result;
   try{result=await send(job.phone,{text:expiryText,options:[]},job.id);}
   catch(e){await report('uncertain',null,'expiry_network');return;}
   if(result.metaId)await report('accepted',result.metaId,null);
   else await report(result.status>=400&&result.status<500&&result.status!==408?'failed':'uncertain',null,String(result.code||'expiry_send'));
  }));
  const failures=outcomes.filter(x=>x.status==='rejected').length;
  if(failures)console.error('Expiry worker failures count='+failures);
  return res.status(failures?500:200).json({processed:due.length,failures});
 }catch(e){console.error('Expiry worker failed');return res.status(500).json({error:'Expiry worker failed'});}
};
module.exports.validScheduler=validScheduler;
