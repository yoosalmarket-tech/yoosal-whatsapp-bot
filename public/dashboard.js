'use strict';
const $=id=>document.getElementById(id);
let rows=[],selected=null,loaded=false,loading=false,botConfig=null,configLoading=false,configDirty=false,currentPage='overview',member=null;
let chatRows=[],activeChatPhone=null,chatLoading=false,activeChatMode='auto',leadMode='auto';
const deliveryNames={sending:'قيد الإرسال',accepted:'قبله واتساب',sent:'تم الإرسال',delivered:'تم التسليم',read:'تمت القراءة',failed:'فشل الإرسال',uncertain:'تسليم غير مؤكد'};
const statusNames={new:'طلب جديد',contacted:'تم التواصل',closed:'مغلق'};
const date=v=>new Date(v).toLocaleString('ar-PS',{dateStyle:'short',timeStyle:'short'});
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
async function api(method='GET',body,path=''){const r=await fetch('/api/dashboard'+path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||'Request failed');e.status=r.status;throw e;}return d;}
function showLogin(){member=null;chatRows=[];activeChatPhone=null;activeChatMode='auto';leadMode='auto';$('chatIndex').replaceChildren();$('chatConsoleHistory').replaceChildren();$('chatConsoleEmpty').hidden=false;$('chatConsoleDetail').hidden=true;$('chatIndexStatus').textContent='';$('chatToggleStatus').textContent='';$('leadTakeoverState').textContent='';$('staffList').replaceChildren();$('staffForm').reset();$('staffState').textContent='';document.querySelectorAll('[data-owner-only]').forEach(e=>e.hidden=true);document.body.classList.remove('authenticated');$('sidebar').hidden=true;$('topbar').hidden=true;$('loginBrand').hidden=false;closeSidebar();currentPage='overview';$('recentRequests').replaceChildren();$('deliveryChart').replaceChildren();$('requestLegend').replaceChildren();$('requestTotal').textContent='0';botConfig=null;configDirty=false;$('botSettings').open=false;$('configEditor').hidden=true;$('responseFields').replaceChildren();$('serviceFields').replaceChildren();$('configState').textContent='';loaded=false;rows=[];selected=null;$('login').hidden=false;$('app').hidden=true;$('logout').hidden=true;$('password').value='';$('list').replaceChildren();$('chat').replaceChildren();$('alerts').replaceChildren();$('deliveryStats').replaceChildren();$('notes').value='';$('info').textContent='';$('details').textContent='';$('business').textContent='';$('detail').hidden=true;$('empty').hidden=false;}
function showApp(){const first=!loaded;loaded=true;document.body.classList.add('authenticated');$('loginBrand').hidden=true;$('login').hidden=true;$('app').hidden=false;$('sidebar').hidden=false;$('topbar').hidden=false;$('logout').hidden=false;if(first)navigate('overview');}
function render(){const q=$('search').value.trim().toLowerCase(),filter=$('filter').value;const list=$('list');list.replaceChildren();const filtered=rows.filter(r=>(!filter||r.status===filter)&&[r.name,r.business,r.phone,r.service].some(x=>String(x||'').toLowerCase().includes(q)));
if(!filtered.length){list.append(el('p','ما في طلبات مطابقة.','muted'));return;}
for(const r of filtered){const b=el('button',undefined,'item'+(r.message_id===selected?' active':''));b.type='button';const body=el('div');body.append(el('strong',r.business),el('div',r.name+' · '+r.service,'muted'),el('small',date(r.created_at),'muted'));b.append(body,el('span',statusNames[r.status]||r.status,'tag '+r.status));b.addEventListener('click',()=>select(r));list.append(b);}}
async function select(r){selected=r.message_id;leadMode='auto';$('leadTakeover').disabled=true;$('leadTakeoverState').textContent='';render();$('empty').hidden=true;$('detail').hidden=false;$('business').textContent=r.business;$('info').textContent=r.name+' · '+r.service+'\n+'+r.phone+' · '+date(r.created_at);$('details').textContent=r.details;$('status').value=r.status;$('notes').value=r.notes||'';$('saveState').textContent='';$('whatsapp').href='https://wa.me/'+r.phone;$('chat').replaceChildren(el('p','جاري تحميل المحادثة...','muted'));const id=r.message_id;
try{const data=await api('GET',null,'?phone='+encodeURIComponent(r.phone));if(selected!==id)return;leadMode=data.mode||'auto';renderLeadTakeover();$('leadTakeover').disabled=false;$('chat').replaceChildren();if(!data.history.length)$('chat').append(el('p','لا يوجد سجل محادثة متاح لهذا العميل.','muted'));for(const m of data.history){const b=el('div',m.body,'bubble '+m.direction);b.append(el('small',(m.direction==='out'?'رد البوت':'العميل')+' · '+date(m.created_at)+(m.delivery?' · '+(deliveryNames[m.delivery.status]||m.delivery.status):'')));$('chat').append(b);}$('chat').scrollTop=$('chat').scrollHeight;}catch(e){if(e.status===401)showLogin();else if(selected===id)$('chat').replaceChildren(el('p','تعذّر تحميل سجل المحادثة.','error'));}}
function renderHealth(d){const stats=$('deliveryStats');stats.replaceChildren();for(const [key,label] of Object.entries(deliveryNames)){const c=el('div',undefined,'card');c.append(el('div',label,'muted'),el('div',String(d.delivery?.[key]||0),'metric'));stats.append(c);}const alerts=$('alerts');alerts.replaceChildren();if(!d.alerts?.length)alerts.append(el('p','لا توجد تنبيهات مسجلة.','muted'));for(const a of d.alerts||[]){const title=a.kind==='webhook'?'خطأ في الخادم':deliveryNames[a.kind]||'تنبيه';alerts.append(el('p',title+' · '+a.code+' · '+date(a.created_at),'error'));}}
async function refresh(){if(loading)return;loading=true;$('refresh').disabled=true;try{const d=await api();member=d.member;document.querySelectorAll('[data-owner-only]').forEach(e=>e.hidden=member?.role!=='owner');$('memberName').textContent=member?.name||'المستخدم';$('memberRole').textContent=member?.role==='owner'?'إدارة واتساب':'خدمة العملاء';showApp();if(member?.role!=='owner'&&!['overview','requests','chats'].includes(currentPage))navigate('overview');renderHealth(d);rows=d.leads;renderOverview(d);$('countChat').textContent=d.conversations;$('countService').textContent=rows.filter(x=>!['استشارة مجانية','التواصل مع الفريق'].includes(x.service)).length;$('countConsult').textContent=rows.filter(x=>x.service==='استشارة مجانية').length;$('countNew').textContent=rows.filter(x=>x.status==='new').length;$('last').textContent='آخر تحديث: '+new Date().toLocaleTimeString('ar-PS')+(d.limited?' · أحدث 200 طلب / حتى 1000 محادثة':'');render();if(currentPage==='chats')loadChats();}catch(e){if(e.status===401)showLogin();else if(loaded)$('last').textContent='تعذّر التحديث. حاول مرة ثانية.';else $('loginError').textContent='تعذّر الاتصال بلوحة التحكم.';}finally{loading=false;$('refresh').disabled=false;}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginBtn').disabled=true;$('loginError').textContent='';try{await api('POST',{action:'login',email:$('email').value,password:$('password').value});$('password').value='';await refresh();}catch(e){$('loginError').textContent=e.status===401?'البريد الإلكتروني أو كلمة المرور غير صحيحة.':'تعذّر تسجيل الدخول. تأكد من إعداد الحساب.';}finally{$('loginBtn').disabled=false;}});
$('logout').addEventListener('click',async()=>{try{await api('POST',{action:'logout'});showLogin();}catch(e){$('last').textContent='تعذّر تسجيل الخروج. حاول مرة ثانية.';}});
$('refresh').addEventListener('click',refresh);$('search').addEventListener('input',render);$('filter').addEventListener('change',render);
$('save').addEventListener('click',async()=>{if(!selected)return;const id=selected,status=$('status').value,notes=$('notes').value;$('save').disabled=true;$('saveState').textContent='جاري الحفظ...';try{await api('PATCH',{id,status,notes});if(selected===id)$('saveState').textContent='تم حفظ التغييرات.';await refresh();}catch(e){if(e.status===401)showLogin();else $('saveState').textContent='تعذّر الحفظ. حاول مرة ثانية.';}finally{$('save').disabled=false;}});


const pageTitles={chats:['المحادثات','تابع محادثات واتساب وأوقف البوت أو شغّله لكل عميل.'],overview:['الرئيسية','نظرة سريعة على أداء البوت وطلبات العملاء.'],requests:['طلبات العملاء','تابع الطلبات والاستشارات وسجل المحادثة.'],responses:['الردود الآلية','عدّل النصوص والرسائل التي يرسلها البوت للعملاء.'],services:['الخدمات','أضف خدماتك ورتّب ظهورها في القائمة.'],health:['حالة الرسائل والتنبيهات','راقب وصول الرسائل والأخطاء المسجلة.'],staff:['المستخدمون','أنشئ حسابات الموظفين وتحكّم في وصولهم للوحة.']};
function closeSidebar(){$('sidebar').classList.remove('open');$('backdrop').hidden=true;$('mobileMenu').setAttribute('aria-expanded','false');}
function openSidebar(){$('sidebar').classList.add('open');$('backdrop').hidden=false;$('mobileMenu').setAttribute('aria-expanded','true');}
function navigate(page){
 if(!Object.hasOwn(pageTitles,page)||(!['overview','requests','chats'].includes(page)&&member?.role!=='owner'))return;
 currentPage=page;const panel=['responses','services'].includes(page)?'config':page;
 document.querySelectorAll('[data-page]').forEach(e=>e.hidden=e.dataset.page!==panel);
 document.querySelectorAll('.sidebar [data-nav]').forEach(e=>{const active=e.dataset.nav===page;e.classList.toggle('active',active);if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});
 const title=$('pageTitle');title.replaceChildren();
 if(page==='overview'){const hour=new Date().getHours();title.append(document.createTextNode(hour<12?'صباح الخير، ':'مساء الخير، '),el('em',member?.name||'مدير الموقع'));}
 else title.textContent=pageTitles[page][0];
 $('pageDescription').textContent=pageTitles[page][1];$('breadcrumb').textContent=pageTitles[page][0];
 if(panel==='config'){$('botSettings').open=true;applyConfigView();loadConfig();}
 if(page==='staff')loadStaff();if(page==='chats')loadChats();closeSidebar();window.scrollTo({top:0,behavior:'instant'});
}
function applyConfigView(){
 const fields=$('responseFields'),services=$('serviceFields');const showServices=currentPage==='services';
 fields.hidden=showServices;fields.previousElementSibling.hidden=showServices;
 services.hidden=!showServices;services.previousElementSibling.hidden=!showServices;services.previousElementSibling.previousElementSibling.hidden=!showServices;
 $('addService').hidden=!showServices;
 $('botSettings').querySelector('summary').textContent=showServices?'إدارة الخدمات':'إدارة الردود الآلية';
}
function renderOverview(d){
 const chart=$('deliveryChart');chart.replaceChildren();
 const max=Math.max(1,...Object.keys(deliveryNames).map(k=>d.delivery?.[k]||0));
 for(const [key,label] of Object.entries(deliveryNames)){
  const count=d.delivery?.[key]||0,row=el('div',undefined,'bar-row'),track=el('div',undefined,'bar-track'),value=el('div',undefined,'bar-value');value.style.width=(count/max*100)+'%';if(key==='failed'||key==='uncertain')value.style.background='#a64b40';track.append(value);row.append(el('span',label),track,el('strong',String(count)));chart.append(row);
 }
 const groups=[{label:'طلبات الخدمات',n:rows.filter(x=>!['استشارة مجانية','التواصل مع الفريق'].includes(x.service)).length,color:'#e56932'},{label:'استشارات مجانية',n:rows.filter(x=>x.service==='استشارة مجانية').length,color:'#1f2447'},{label:'التواصل مع الفريق',n:rows.filter(x=>x.service==='التواصل مع الفريق').length,color:'#9398b0'}];
 const total=rows.length;$('requestTotal').textContent=String(total);let position=0;
 $('requestDonut').style.background=total?'conic-gradient('+groups.map(g=>{const start=position;position+=g.n/total*100;return g.color+' '+start+'% '+position+'%';}).join(',')+')':'#e9e9ee';
 const legend=$('requestLegend');legend.replaceChildren();for(const g of groups){const row=el('div',undefined,'legend-row'),label=el('span'),dot=el('i');dot.style.background=g.color;label.append(dot,document.createTextNode(g.label));row.append(label,el('strong',(total?Math.round(g.n/total*100):0)+'%'));legend.append(row);}
 const recent=$('recentRequests');recent.replaceChildren();if(!rows.length)recent.append(el('p','لا توجد طلبات مسجلة بعد.','muted'));
 for(const r of rows.slice(0,5)){const b=el('button',undefined,'recent-entry');b.type='button';const t=el('div');t.append(el('strong',r.business),el('small',r.name+' · '+r.service));b.append(t,el('span',statusNames[r.status]||r.status,'tag '+r.status));b.addEventListener('click',()=>{navigate('requests');select(r);});recent.append(b);}
}

function renderLeadTakeover(){
 $('leadTakeover').textContent=leadMode==='human'?'إعادة تشغيل البوت':'إيقاف الرد الآلي';
 $('leadTakeover').classList.toggle('secondary',leadMode==='auto');
 $('leadTakeoverState').textContent=leadMode==='human'?'المحادثة حالياً عند فريق يوصل، والبوت متوقف.':'الرد الآلي مفعّل لهذه المحادثة.';
}
$('leadTakeover').addEventListener('click',async()=>{
 const lead=rows.find(r=>r.message_id===selected);if(!lead)return;
 const old=leadMode,mode=old==='human'?'auto':'human';
 if(mode==='auto'&&!confirm('إعادة تشغيل الرد الآلي لهذا العميل؟'))return;
 $('leadTakeover').disabled=true;$('leadTakeoverState').textContent='جاري تحديث المحادثة...';
 try{
  const data=await api('PATCH',{action:'set_mode',phone:lead.phone,mode});
  leadMode=data.mode;renderLeadTakeover();
  if(activeChatPhone===lead.phone){activeChatMode=data.mode;renderChatMode();}
  if(currentPage==='chats')loadChats();
 }catch(e){if(e.status===401)showLogin();else $('leadTakeoverState').textContent='تعذّر تعديل المحادثة. حاول مرة ثانية.';}
 finally{$('leadTakeover').disabled=false;}
});

function renderChatMode(){
 const human=activeChatMode==='human';
 $('chatConsoleBadge').textContent=human?'تدخل بشري':'رد آلي';
 $('chatConsoleBadge').className='tag '+(human?'contacted':'new');
 $('chatToggle').textContent=human?'إعادة تشغيل البوت':'إيقاف الرد الآلي';
 $('chatConsoleHint').textContent=human?'المحادثة مع فريق يوصل؛ لن يرد البوت عليها ولن يرسل رسالة انتهاء الجلسة.':'الرد الآلي مفعل. أوقفه قبل بدء التحدث يدوياً، أو استخدم تطبيق واتساب بزنس إذا كانت رسائل التطبيق متزامنة.';
}
function renderChats(){
 const q=$('chatSearch').value.trim().toLowerCase(),filter=$('chatFilter').value;
 const list=$('chatIndex');list.replaceChildren();
 const filtered=chatRows.filter(r=>(!filter||filter===r.mode)&&[r.phone,r.business,r.name,r.preview].some(x=>String(x||'').toLowerCase().includes(q)));
 if(!filtered.length){list.append(el('p','لا توجد محادثات مطابقة.','muted'));return;}
 for(const r of filtered){
  const b=el('button',undefined,'item'+(r.phone===activeChatPhone?' active':''));b.type='button';
  const info=el('div');info.append(el('strong',r.business||r.name||'عميل واتساب'),el('div','+'+r.phone,'muted'));
  if(r.preview)info.append(el('small',r.preview.slice(0,75),'muted'));
  const indicator=el('span',r.mode==='human'?'تدخل بشري':'رد آلي','tag '+(r.mode==='human'?'contacted':'new'));
  b.append(info,indicator);b.addEventListener('click',()=>openChat(r));list.append(b);
 }
}
async function loadChats(){
 if(!loaded||chatLoading)return;
 chatLoading=true;$('reloadChats').disabled=true;$('chatIndexStatus').textContent='جاري تحديث المحادثات...';
 try{
  const data=await api('GET',null,'?view=chats');
  chatRows=data.chats||[];renderChats();
  $('chatIndexStatus').textContent=chatRows.length+' محادثة'+(data.limited?' · يتم عرض أحدث السجلات فقط':'');
  if(activeChatPhone){
   const row=chatRows.find(r=>r.phone===activeChatPhone);
   if(row)await openChat(row,true);
  }
 }catch(e){if(e.status===401)showLogin();else $('chatIndexStatus').textContent='تعذّر تحميل المحادثات.';}
 finally{chatLoading=false;$('reloadChats').disabled=false;}
}
async function openChat(r,quiet=false){
 const phone=r.phone;activeChatPhone=phone;
 $('chatConsoleEmpty').hidden=true;$('chatConsoleDetail').hidden=false;
 $('chatConsoleTitle').textContent=r.business||r.name||'عميل واتساب';
 $('chatConsolePhone').textContent='+'+phone;
 $('chatWhatsApp').href='https://wa.me/'+phone;
 $('chatConsoleHistory').replaceChildren(el('p','جاري تحميل المحادثة...','muted'));
 $('chatToggleStatus').textContent='';
 activeChatMode=r.mode||'auto';renderChatMode();renderChats();
 try{
  const data=await api('GET',null,'?phone='+encodeURIComponent(phone));
  if(activeChatPhone!==phone)return;
  activeChatMode=data.mode||'auto';renderChatMode();
  const log=$('chatConsoleHistory');log.replaceChildren();
  if(!data.history.length)log.append(el('p','لا يوجد سجل رسائل بعد.','muted'));
  for(const m of data.history){
   const bubble=el('div',m.body,'bubble '+m.direction);
   const caption=(m.direction==='in'?'العميل':m.message_type==='human'?'فريق يوصل':'البوت')+' · '+date(m.created_at)+(m.delivery?' · '+(deliveryNames[m.delivery.status]||m.delivery.status):'');
   bubble.append(el('small',caption));
   log.append(bubble);
  }
  if(!quiet)log.scrollTop=log.scrollHeight;
 }catch(e){if(e.status===401)showLogin();else if(activeChatPhone===phone)$('chatConsoleHistory').replaceChildren(el('p','تعذّر تحميل سجل المحادثة.','error'));}
}
$('chatToggle').addEventListener('click',async()=>{
 if(!activeChatPhone)return;
 const phone=activeChatPhone,mode=activeChatMode==='human'?'auto':'human';
 if(mode==='auto'&&!confirm('إعادة تشغيل الرد الآلي لهذه المحادثة؟'))return;
 $('chatToggle').disabled=true;$('chatToggleStatus').textContent='جاري تحديث الحالة...';
 try{
  const result=await api('PATCH',{action:'set_mode',phone,mode});
  if(activeChatPhone!==phone)return;
  activeChatMode=result.mode;renderChatMode();
  const row=chatRows.find(r=>r.phone===phone);
  if(row)row.mode=result.mode;
  renderChats();
  $('chatToggleStatus').textContent=result.mode==='human'?'تم إيقاف الرد الآلي لهذه المحادثة.':'تم تفعيل الرد الآلي لهذه المحادثة.';
  const lead=rows.find(r=>r.message_id===selected);
  if(lead?.phone===phone){leadMode=result.mode;renderLeadTakeover();}
 }catch(e){if(e.status===401)showLogin();else $('chatToggleStatus').textContent='تعذّر تعديل المحادثة. حاول مرة ثانية.';}
 finally{$('chatToggle').disabled=false;}
});
$('reloadChats').addEventListener('click',loadChats);
$('chatSearch').addEventListener('input',renderChats);
$('chatFilter').addEventListener('change',renderChats);

document.querySelectorAll('[data-nav]').forEach(e=>e.addEventListener('click',()=>navigate(e.dataset.nav)));
$('mobileMenu').addEventListener('click',()=>{$('sidebar').classList.contains('open')?closeSidebar():openSidebar();});
$('backdrop').addEventListener('click',closeSidebar);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar();});
const responseLabels={welcome:'رسالة الترحيب',audience:'يوصل لمين؟',difference:'شو بميّز يوصل؟',servicesPrompt:'رسالة اختيار الخدمة',namePrompt:'طلب الاسم واسم العائلة',businessPrompt:'طلب اسم المشروع',detailsPrompt:'طلب تفاصيل الاحتياج',success:'رسالة نجاح الطلب'};
function configInput(label,value,change,options={}){
 const box=el('label');box.append(el('span',label));const input=el(options.area?'textarea':'input');if(options.area)input.rows=3;input.maxLength=options.max||900;input.value=value;input.addEventListener('input',()=>{change(input.value);configDirty=true;$('configState').textContent='تغييرات غير محفوظة';});box.append(input);return box;
}
function renderConfig(){
 if(!botConfig)return;const fields=$('responseFields');fields.replaceChildren();for(const [key,label] of Object.entries(responseLabels))fields.append(configInput(label,botConfig[key],v=>botConfig[key]=v,{area:true}));
 const list=$('serviceFields');list.replaceChildren();
 botConfig.services.forEach((s,i)=>{const card=el('div',undefined,'card');card.style.padding='14px';card.append(el('strong','الخدمة '+(i+1)));const enabled=el('input');enabled.type='checkbox';enabled.style.width='auto';enabled.checked=s.enabled;enabled.addEventListener('change',()=>{s.enabled=enabled.checked;configDirty=true;$('configState').textContent='تغييرات غير محفوظة';});const label=el('label');label.append(enabled,document.createTextNode(' إظهار في القائمة'));card.append(label,configInput('اسم الخدمة',s.label,v=>s.label=v,{max:20}),configInput('شرح الخدمة',s.text,v=>s.text=v,{area:true}),configInput('كلمات مفتاحية (افصل بفاصلة)',s.keywords.join('، '),v=>s.keywords=v.split(/[،,]/).map(x=>x.trim()).filter(Boolean),{max:600}));
 const actions=el('div',undefined,'actions');for(const [title,delta] of [['↑ للأعلى',-1],['↓ للأسفل',1]]){const b=el('button',title,'secondary');b.type='button';b.disabled=i+delta<0||i+delta>=botConfig.services.length;b.addEventListener('click',()=>{[botConfig.services[i],botConfig.services[i+delta]]=[botConfig.services[i+delta],botConfig.services[i]];configDirty=true;renderConfig();});actions.append(b);}const del=el('button','حذف الخدمة','secondary');del.type='button';del.addEventListener('click',()=>{if(confirm('حذف الخدمة من قائمة البوت؟ الطلبات القديمة ستبقى محفوظة.')){botConfig.services.splice(i,1);configDirty=true;renderConfig();}});actions.append(del);card.append(actions);list.append(card);});
 $('addService').disabled=botConfig.services.length>=9;$('configEditor').hidden=false;applyConfigView();
}
async function loadConfig(force=false){if(configLoading||(!force&&botConfig))return;if(force&&configDirty&&!confirm('إلغاء التغييرات غير المحفوظة؟'))return;configLoading=true;$('configState').textContent='جاري التحميل...';try{const d=await api('GET',null,'?view=config');botConfig=d.config;configDirty=false;renderConfig();$('configState').textContent='';}catch(e){if(e.status===401)showLogin();else $('configState').textContent='تعذّر تحميل الإعدادات.';}finally{configLoading=false;}}
$('botSettings').addEventListener('toggle',()=>{if($('botSettings').open&&loaded)loadConfig();});
$('reloadConfig').addEventListener('click',()=>loadConfig(true));
$('addService').addEventListener('click',()=>{if(!botConfig||botConfig.services.length>=9)return;botConfig.services.push({id:'svc_'+crypto.randomUUID().replace(/-/g,'').slice(0,20),label:'',text:'',keywords:[],enabled:true});configDirty=true;renderConfig();$('configState').textContent='أضف اسم الخدمة وشرحها ثم احفظ.';});
$('saveConfig').addEventListener('click',async()=>{if(!botConfig)return;$('saveConfig').disabled=true;$('configState').textContent='جاري الحفظ...';try{const d=await api('PATCH',{action:'save_config',config:botConfig});botConfig=d.config;configDirty=false;renderConfig();$('configState').textContent='تم الحفظ. التغييرات جاهزة للمحادثات القادمة.';}catch(e){if(e.status===401)showLogin();else $('configState').textContent='تعذّر الحفظ: '+e.message;}finally{$('saveConfig').disabled=false;}});

async function loadStaff(){
 if(member?.role!=='owner')return;
 const list=$('staffList');list.replaceChildren(el('p','جاري التحميل...','muted'));
 try{
  const d=await api('GET',null,'?view=staff');if(member?.role!=='owner')return;
  list.replaceChildren();
  if(!d.staff.length)list.append(el('p','لا يوجد موظفون مضافون بعد.','muted'));
  for(const s of d.staff){
   const card=el('div',undefined,'item');const info=el('div');info.append(el('strong',s.name),el('small',s.email,'muted'),el('div',s.active?'حساب نشط':'حساب موقوف','muted'));
   const b=el('button',s.active?'إيقاف':'تفعيل','secondary');b.type='button';b.addEventListener('click',async()=>{
    if(!confirm((s.active?'إيقاف وصول ':'إعادة تفعيل حساب ')+s.name+'؟'))return;
    b.disabled=true;try{await api('PATCH',{action:'staff_access',id:s.user_id,active:!s.active});await loadStaff();}catch(e){if(e.status===401)showLogin();else $('staffState').textContent='تعذّر تعديل الحساب.';}finally{b.disabled=false;}
   });card.append(info,b);list.append(card);
  }
 }catch(e){if(e.status===401)showLogin();else list.replaceChildren(el('p','تعذّر تحميل المستخدمين.','error'));}
}
$('staffForm').addEventListener('submit',async e=>{
 e.preventDefault();if(member?.role!=='owner')return;
 $('staffCreate').disabled=true;$('staffState').textContent='جاري إنشاء الحساب...';
 try{await api('POST',{action:'create_staff',name:$('staffName').value,email:$('staffEmail').value,password:$('staffPassword').value});$('staffForm').reset();$('staffState').textContent='تم إنشاء الحساب. يمكن للموظف تسجيل الدخول الآن.';await loadStaff();}
 catch(e){if(e.status===401)showLogin();else $('staffState').textContent=e.status===409?'البريد الإلكتروني مستخدم بالفعل.':'تعذّر إنشاء الحساب. تحقق من البيانات.';}
 finally{$('staffPassword').value='';$('staffCreate').disabled=false;}
});
refresh();setInterval(()=>{if(loaded&&document.visibilityState==='visible')refresh();},60000);
