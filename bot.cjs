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
function step(state={},input=''){
 const s={...state,data:{...state.data}}, value=String(input).trim();
 const result=(text,options=[],lead=null)=>({state:s,reply:{text,options},lead});
 const restart=()=>{s.stage='menu';s.data={};return {state:s,reply:menu(),lead:null}};
 const normalize=x=>x.replace(/[أإآ]/g,'ا').replace(/[\u064B-\u065F]/g,'').trim();
 const command=normalize(value);
 const nameRequest=service=>{s.data={service};s.stage='name';return result('تمام! شو اسمك؟');};
 const detail=id=>{s.data={service:services[id],serviceId:id};s.stage='service_detail';return result(descriptions[id],[request,allServices,back]);};
 if(['القائمة','القائمة الرئيسية','ابدا','start','menu','هلا','مرحبا','اهلا'].includes(command.toLowerCase()))return restart();
 if(['services','خدمات يوصل','الخدمات'].includes(command)){s.data={};s.stage='services';return {state:s,reply:serviceMenu(),lead:null};}
 const info=(Object.hasOwn(information,value)?information[value]:null)||Object.values(information).find(x=>normalize(x.label)===command);
 if(info){s.data={};s.stage='menu';return result(info.text,menu().options);}
 if(['digital_menu','منيو تفاعلي','منيو الكتروني','منيو الكتروني تفاعلي','منيو رقمي','منيو'].includes(command))return detail('digital_menu');
 if(['marketing','تسويق وصناعة محتوى','تسويق','صناعة محتوى'].includes(command))return detail('marketing');
 if(['consultation','طلب استشارة مجانية','استشارة مجانية'].includes(command))return nameRequest(services.consultation);
 if(['human','التواصل مع الفريق'].includes(command))return nameRequest(services.human);
 if(s.stage==='service_detail'){
  if(['request_service','اطلب الخدمة','طلب الخدمة'].includes(command)&&Object.hasOwn(descriptions,s.data.serviceId))return nameRequest(services[s.data.serviceId]);
  return Object.hasOwn(descriptions,s.data.serviceId)?detail(s.data.serviceId):restart();
 }
 if(!s.stage||s.stage==='done')return restart();
 if(['menu','services'].includes(s.stage))return {state:s,reply:s.stage==='services'?serviceMenu():menu(),lead:null};
 if(['request_service','اطلب الخدمة','طلب الخدمة'].includes(command))return result('اختار الخدمة اللي حابب تطلبها من القائمة.',[allServices,back]);
 if(s.stage!=='confirm'&&['confirm','ارسال الطلب'].includes(command))return result('خلينا نكمّل معلومات الطلب أولاً.',[back]);
 if(!value)return result('ممكن تكتب إجابتك برسالة نصية؟');
 if(s.stage==='name'){if(value.length>100)return result('اكتب اسمك باختصار.');s.data.name=value;s.stage='business';return result('تشرفنا 💛 شو اسم مشروعك أو نشاطك التجاري؟');}
 if(s.stage==='business'){if(value.length>100)return result('اكتب اسم المشروع باختصار.');s.data.business=value;s.stage='details';return result('احكيلنا باختصار شو محتاج أو شو المشكلة اللي حابب نساعدك فيها.');}
 if(s.stage==='details'){if(value.length>500)return result('اختصر التفاصيل إلى 500 حرف.');s.data.details=value;s.stage='confirm';return result('تأكد من معلوماتك:\nالخدمة: '+s.data.service+'\nالاسم: '+s.data.name+'\nالمشروع: '+s.data.business+'\nالتفاصيل: '+s.data.details+'\n\nبإرسال الطلب، بتوافق إن فريق يوصل يتواصل معك بخصوصه.',[{id:'confirm',label:'إرسال الطلب'},back]);}
 if(s.stage==='confirm'){
  if(!['confirm','إرسال الطلب'].includes(value))return result('اضغط إرسال الطلب أو ارجع للقائمة.',[{id:'confirm',label:'إرسال الطلب'},back]);
  s.stage='done';return result('وصلنا طلبك بنجاح 💛\nفريق يوصل رح يتواصل معك بخصوصه.\nللتعرف علينا: https://yoosal.net\nاكتب القائمة لطلب جديد.',[],{...s.data});
 }
 return restart();
}
module.exports={step};