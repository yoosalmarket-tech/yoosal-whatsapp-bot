const services={digital_menu:'منيو تفاعلي',marketing:'تسويق وصناعة محتوى',human:'التواصل مع الفريق',consultation:'استشارة مجانية'};
const information={audience:{label:'يوصل لمين؟',text:'يوصل للمطاعم والكافيهات ومحلات الحلويات والعلامات التجارية الغذائية، اللي بدها تجذب زبائن أكثر، تسهّل الطلب وتحوّل التسويق لمبيعات. وبنساعد المصانع والموزعين كمان بحلول الأتمتة وتنظيم الطلبات.'},difference:{label:'شو بميّز يوصل؟',text:'بنوصل الإبداع بالنتائج من خلال 4 شغلات:\n\n• تجربة تفاعلية: بنصمم واجهات ومنيوهات بتخلّي الزبون يتفاعل مع علامتك وبتسهّل عليه الطلب.\n• محتوى إله شخصية: بنبني لعلامتك أسلوب واضح ومميز، عشان المتابع لما يفتح حسابك يكون عارف شو نوع المحتوى اللي رح يشوفه ويتحمّس إله.\n• تجربة زبون مدروسة: بندرس رحلته من أول ما يشوف المحتوى لحد ما يقرر يشتري.\n• قراءة النتائج: بنقيس أداء التسويق وأثره على الطلبات والمبيعات عشان نعرف شو نجح وشو لازم نحسّن.\n\nمش هدفنا بس تلفت الانتباه، هدفنا تحوّل الاهتمام لمبيعات.'}};
const descriptions={
 digital_menu:'المنيو التفاعلي مش مجرد قائمة إلكترونية. بنصمم تجربة خاصة بعلامتك، بتخلّي الزبون يتصفح المنتجات بطريقة ممتعة، يختار طلبه بسهولة، وبنضيف أدوات قياس بتساعدك تعرف من وين جايين الطلبات.',
 marketing:'بنبني لعلامتك شخصية واضحة من خلال أفكار ومحتوى إبداعي، فيديوهات وتصاميم مدروسة. بنربط المحتوى برحلة الزبون ونتابع النتائج عشان نعرف شو جاب طلبات ومبيعات.'
};
const consult={id:'consultation',label:'طلب استشارة مجانية'};
const request={id:'request_service',label:'اطلب الخدمة'};
const allServices={id:'services',label:'خدمات يوصل'};
const back={id:'menu',label:'القائمة الرئيسية'};
const human={id:'human',label:services.human};
const menu=()=>({text:'أهلاً في وكالة يوصل 💛\nكيف ممكن نساعدك اليوم؟',options:[...Object.entries(information).map(([id,x])=>({id,label:x.label})),allServices,consult,human]});
const serviceMenu=()=>({text:'أي خدمة حابب تعرف عنها أكثر؟',options:[{id:'digital_menu',label:services.digital_menu},{id:'marketing',label:services.marketing},back]});
const cancel={id:'cancel',label:'إلغاء الطلب'};
const edit={id:'edit',label:'تعديل المعلومات'};
const editFields=[{id:'edit_name',label:'الاسم'},{id:'edit_business',label:'اسم المشروع'},{id:'edit_details',label:'التفاصيل'},cancel];
const prompts={name:'تمام! شو اسمك؟',business:'تشرفنا 💛 شو اسم مشروعك أو نشاطك التجاري؟',details:'احكيلنا باختصار شو محتاج أو شو المشكلة اللي حابب نساعدك فيها.'};
const normalize=x=>String(x).replace(/[أإآ]/g,'ا').replace(/[\u064B-\u065F]/g,'').replace(/ة/g,'ه').replace(/[؟?!.,،]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
function step(state={},input='',meta={}){
 const s={...state,data:{...state.data}},value=String(input).trim(),cmd=normalize(value);
 const result=(text,options=[],lead=null)=>({state:s,reply:{text,options},lead});
 const restart=(text)=>{s.stage='menu';s.data={};return result(text||menu().text,menu().options);};
 const ask=(field)=>{s.stage=field;return result(prompts[field],[cancel]);};
 const review=()=>{s.stage='confirm';return result('تأكد من معلوماتك:\nالخدمة: '+s.data.service+'\nالاسم: '+s.data.name+'\nالمشروع: '+s.data.business+'\nالتفاصيل: '+s.data.details+'\n\nبإرسال الطلب، بتوافق إن فريق يوصل يتواصل معك بخصوصه.',[{id:'confirm',label:'إرسال الطلب'},edit,cancel]);};
 const begin=service=>{s.data={service};return ask('name');};
 const detail=id=>{s.stage='service_detail';s.data={service:services[id],serviceId:id};return result(descriptions[id],[request,allServices,back]);};
 const active=['name','business','details','confirm','edit','cancel_confirm'].includes(s.stage);
 if(active&&Number.isFinite(meta.now)&&Number.isFinite(state.lastInboundTs)&&meta.now-state.lastInboundTs>86400)return restart('أهلاً برجعتك 💛 انتهت صلاحية الطلب السابق. اختار من القائمة للبدء من جديد.');
 if(meta.unsupported)return result('حالياً بنقدر نستقبل النصوص والاختيارات من القائمة فقط. ممكن تكتب رسالتك؟',active?[cancel]:s.stage==='service_detail'?[request,allServices,back]:menu().options);
 if(active){
  if(['cancel','الغاء الطلب','الغاء','القائمه','القائمه الرئيسيه','menu','start','ابدا'].includes(cmd)&&s.stage!=='cancel_confirm'){s.data.previousStage=s.stage;s.stage='cancel_confirm';return result('متأكد إنك بدك تلغي الطلب الحالي؟',[{id:'cancel_yes',label:'نعم، إلغاء'},{id:'cancel_no',label:'كمّل الطلب'}]);}
  if(s.stage==='cancel_confirm'){
   if(['cancel_yes','نعم الغاء'].includes(cmd))return restart('تم إلغاء الطلب. كيف ممكن نساعدك؟');
   if(['cancel_no','كمل الطلب'].includes(cmd)){const prev=s.data.previousStage;delete s.data.previousStage;if(prev==='confirm')return review();if(prev==='edit'){s.stage='edit';return result('شو حابب تعدّل؟',editFields);}return ask(Object.hasOwn(prompts,prev)?prev:'name');}
   return result('اختار إذا بدك تلغي أو تكمّل الطلب.',[{id:'cancel_yes',label:'نعم، إلغاء'},{id:'cancel_no',label:'كمّل الطلب'}]);
  }
  if(s.stage==='confirm'){
   if(['edit','تعديل المعلومات','تعديل'].includes(cmd)){s.stage='edit';return result('شو حابب تعدّل؟',editFields);}
   if(!['confirm','ارسال الطلب'].includes(cmd))return review();
   s.stage='done';const {service,name,business,details}=s.data;return result('وصلنا طلبك بنجاح 💛\nفريق يوصل رح يتواصل معك بخصوصه.\nللتعرف علينا: https://yoosal.net',menu().options,{service,name,business,details});
  }
  if(s.stage==='edit'){
   const field={edit_name:'name',edit_business:'business',edit_details:'details','الاسم':'name','اسم المشروع':'business','التفاصيل':'details'}[cmd];
   if(['name','business','details'].includes(field)){s.data.editing=true;return ask(field);}
   return result('اختار المعلومة اللي بدك تعدّلها.',editFields);
  }
  if(meta.choice&&cmd!=='cancel')return result('ممكن تكتب الإجابة برسالة نصية؟',[cancel]);
  if(!value)return result(prompts[s.stage]||'ممكن تكتب إجابتك؟',[cancel]);
  if(['هلا','مرحبا','اهلا','تمام','نعم','لا','اوكي','ok','شكرا'].includes(cmd))return result(prompts[s.stage],[cancel]);
  if(s.stage==='name'&&(value.length<2||value.length>80||!/^\p{L}[\p{L}\p{M}\s.'’-]*$/u.test(value)||['منيو','منيو الكتروني','منيو تفاعلي','تسويق','خدمات يوصل','اطلب الخدمه'].includes(cmd)))return result('اكتب اسمك بحروف، مثلاً: محمد أحمد.',[cancel]);
  if(s.stage==='business'&&(value.length<2||value.length>100||!/[\p{L}\p{N}]/u.test(value)))return result('اكتب اسم مشروعك باختصار.',[cancel]);
  if(s.stage==='details'&&(value.length<3||value.length>500))return result('اكتب تفاصيل طلبك من 3 إلى 500 حرف.',[cancel]);
  const field=s.stage;s.data[field]=value;
  if(s.data.editing){delete s.data.editing;return review();}
  return field==='name'?ask('business'):field==='business'?ask('details'):review();
 }
 if(['القائمه','القائمه الرئيسيه','ابدا','start','menu','هلا','مرحبا','اهلا','hello','hi','cancel'].includes(cmd))return restart();
 if(['services','خدمات يوصل','الخدمات'].includes(cmd)){s.data={};s.stage='services';return result(serviceMenu().text,serviceMenu().options);}
 const info=(Object.hasOwn(information,value)?information[value]:null)||Object.values(information).find(x=>normalize(x.label)===cmd);
 if(info){s.stage='menu';s.data={};return result(info.text,menu().options);}
 if(cmd==='digital_menu'||/(?:^| )(?:ال)?منيو(?: |$)|قائمه الكترونيه|digital menu/.test(cmd))return detail('digital_menu');
 if(cmd==='marketing'||/تسويق|صناعه محتوي|صناعه محتوى|marketing/.test(cmd))return detail('marketing');
 if(cmd==='consultation'||/استشاره/.test(cmd))return begin(services.consultation);
 if(cmd==='human'||/التواصل مع الفريق|احكي مع الفريق|خدمه العملاء/.test(cmd))return begin(services.human);
 if(s.stage==='service_detail'&&['request_service','اطلب الخدمه','طلب الخدمه'].includes(cmd)&&Object.hasOwn(descriptions,s.data.serviceId))return begin(services[s.data.serviceId]);
 if(s.stage==='service_detail'&&Object.hasOwn(descriptions,s.data.serviceId))return detail(s.data.serviceId);
 if(s.stage==='services')return result(serviceMenu().text,serviceMenu().options);
 return restart();
}
module.exports={step};
