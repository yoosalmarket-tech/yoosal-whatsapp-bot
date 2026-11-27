const services={digital_menu:'منيو تفاعلي',marketing:'تسويق وصناعة محتوى',human:'التواصل مع الفريق'};
const information={audience:{label:'يوصل لمين؟',text:'يوصل للمطاعم والكافيهات ومحلات الحلويات والعلامات التجارية الغذائية، اللي بدها تجذب زبائن أكثر، تسهّل الطلب وتحوّل التسويق لمبيعات. وبنساعد المصانع والموزعين كمان بحلول الأتمتة وتنظيم الطلبات.'},difference:{label:'شو بميّز يوصل؟',text:'إحنا مش بس بنصمم وبننشر محتوى. بنجمع بين 3 أشياء:\n\n• الإبداع: أفكار بتخلي علامتك تتميّز.\n• التكنولوجيا: تجارب تفاعلية وأتمتة بتسهّل الشراء.\n• النتائج: أدوات بتساعدك تقيس قديش حملاتك جابت طلبات ومبيعات.\n\nهدفنا مش بس المشاهدات واللايكات، هدفنا نوصل الزبون لقرار الشراء.'}};
const back={id:'menu',label:'القائمة الرئيسية'};
const human={id:'human',label:services.human};
const menu=()=>({text:'أهلاً في وكالة يوصل 💛\nكيف ممكن نساعدك اليوم؟',options:[...Object.entries(information).map(([id,x])=>({id,label:x.label})),{id:'services',label:'خدمات يوصل'},human]});
const serviceMenu=()=>({text:'أي خدمة حابب تعرف عنها أكثر؟',options:[{id:'digital_menu',label:services.digital_menu},{id:'marketing',label:services.marketing},back]});
function step(state={},input=''){
 const s={...state,data:{...state.data}}, value=String(input).trim();
 const result=(text,options=[],lead=null)=>({state:s,reply:{text,options},lead});
 const restart=()=>{s.stage='menu';s.data={};return {state:s,reply:menu(),lead:null}};
 if(!s.stage || ['القائمة','القائمة الرئيسية','ابدأ','start','menu'].includes(value.toLowerCase()))return restart();
 if(s.stage==='done')return restart();
 if(['menu','services'].includes(s.stage)){
  if(['services','خدمات يوصل','الخدمات'].includes(value)){s.stage='services';return {state:s,reply:serviceMenu(),lead:null};}
  const info=(Object.hasOwn(information,value)?information[value]:null)||Object.values(information).find(x=>x.label===value);
  if(info){s.stage='menu';return result(info.text,[back,human]);}
  const service=(Object.hasOwn(services,value)?services[value]:null)||Object.values(services).find(x=>x===value);
  if(!service)return {state:s,reply:s.stage==='services'?serviceMenu():menu(),lead:null};
  s.data.service=service;s.stage='name';return result('تمام! شو اسمك؟');
 }
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