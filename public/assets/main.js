'use strict';
(()=>{
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
let toastTimer;
function showToast(message){const el=$('toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4000)}
function openDialog(title,message){const d=$('infoDialog');if(!d)return showToast(message);$('dialogTitle').textContent=title;$('dialogBody').textContent=message;typeof d.showModal==='function'?d.showModal():showToast(message)}
$('dialogClose')?.addEventListener('click',()=>$('infoDialog').close());$('infoDialog')?.addEventListener('click',e=>{if(e.target===$('infoDialog'))e.target.close()});
if($('currentYear'))$('currentYear').textContent=new Date().getFullYear();
$('menuBtn')?.addEventListener('click',()=>{const nav=$('mainNav'),open=$('menuBtn').getAttribute('aria-expanded')==='true';nav.classList.toggle('open',!open);$('menuBtn').setAttribute('aria-expanded',String(!open));$('menuBtn').textContent=open?'☰':'×'});
document.querySelectorAll('#mainNav a').forEach(a=>a.addEventListener('click',()=>{$('mainNav')?.classList.remove('open');$('menuBtn')?.setAttribute('aria-expanded','false')}));
let alternate=false;$('toggleRoute')?.addEventListener('click',()=>{alternate=!alternate;$('poolSvg')?.classList.toggle('alt',alternate);$('routeTitle').textContent=alternate?'ارتداد من الجدار':'تسديد مباشر';$('toggleRoute').textContent=alternate?'جرّب التسديد المباشر ↗':'جرّب ارتداد الجدار ↗'});
const userLang=window.AIM8_I18N?.lang||'ar';
const tr=value=>window.AIM8_I18N?.translate(value)||value;
const fmtTime=ts=>ts?new Date(ts*1000).toLocaleDateString(userLang==='ar'?'ar-IQ':'en-US',{year:'numeric',month:'short',day:'numeric'}):'—';
const fmtMoney=cents=>Number.isInteger(cents)&&cents>=100?'$'+(cents/100).toFixed(2):'السعر قريبًا';
const names={week:'الأسبوعية (قديمة)',month:'الشهرية (قديمة)',quarter:'3 أشهر',half:'6 أشهر',year:'سنة كاملة'};
async function api(path,options={}){let response;try{response=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{'content-type':'application/json',...(options.headers||{})}})}catch{throw Error('تعذّر الاتصال بالسيرفر. افتح الموقع بعد ربط Cloudflare وD1.')}let data;try{data=await response.json()}catch{throw Error('رد غير متوقع من السيرفر. تحقق من ربط Pages Functions.')}if(!response.ok||!data.ok){const err=Error(data.message||'تعذّرت العملية');err.status=response.status;throw err;}return data}
async function post(path,payload){return api(path,{method:'POST',body:JSON.stringify(payload||{})})}
function setBusy(button,busy,loading='جارٍ التنفيذ...'){if(!button)return;if(busy){button.dataset.original=button.textContent;button.disabled=true;button.textContent=loading;}else{button.disabled=false;button.textContent=button.dataset.original||button.textContent;}}
function el(tag,txt,cls){const node=document.createElement(tag);if(txt!==undefined&&txt!==null)node.textContent=String(txt);if(cls)node.className=cls;return node}
// Website doesn't display payment amounts or let the user choose a plan.
// The linked Telegram bot owns the package picker and the official invoice.
async function loadPlans(){return null;}
// Pre-create the short-lived, account-bound bot link. Once ready, the button
// is a native <a href="https://t.me/..."> so app opening keeps user activation.
// No plan is chosen on the site; the picker and invoice stay inside Telegram.
const botLaunch={url:null,linkCode:null,validUntil:0,inflight:null};
const botLoginUrl='auth.html?next=dashboard.html';
const botFallbackId=btn=>btn.id==='botActivateHome'?'botLinkBackupHome':'botLinkBackupDash';
const botPairId=btn=>btn.id==='botActivateHome'?'botPairingHome':'botPairingDash';
const botPairInputId=btn=>btn.id==='botActivateHome'?'botPairCodeHome':'botPairCodeDash';
function showPairingCode(linkCode){
 for(const id of ['botActivateHome','starsStart']){
  const button=$(id);if(!button)continue;
  const wrap=$(botPairId(button)),input=$(botPairInputId(button));
  if(wrap&&input){input.value=linkCode;wrap.hidden=false;}
 }
}
function bindPairCopy(button){
 if(!button)return;
 const id=button.id==='botActivateHome'?'botCopyHome':'botCopyDash';
 $(id)?.addEventListener('click',async()=>{
  const input=$(botPairInputId(button));if(!input?.value)return;
  try{
   if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');
   await navigator.clipboard.writeText(input.value);
   const status=$(button.id==='botActivateHome'?'botLaunchStatusHome':'starsResult');
   if(status)status.textContent='تم نسخ رمز الربط. افتح البوت والصقه برسالة.';
  }catch{
   input.focus();input.select();
   const status=$(button.id==='botActivateHome'?'botLaunchStatusHome':'starsResult');
   if(status)status.textContent='حدد الرمز ثم انسخه وأرسله داخل البوت.';
  }
 });
}
function botLinkReady(){return !!botLaunch.url&&Date.now()<botLaunch.validUntil-30000;}
function showBotDirectLink(button,url){
 const backup=$(botFallbackId(button));
 if(backup){backup.href=url;backup.hidden=false;backup.rel='noreferrer';}
 const status=$(button.id==='botActivateHome'?'botLaunchStatusHome':'starsResult');
 if(status)status.textContent='إذا لم يفتح تيليجرام تلقائياً، اضغط زر الرابط المباشر.';
}
function setBotButtonUrl(button,url){
 if(button?.tagName==='A'){button.href=url;button.rel='noreferrer';}
}
async function prepareActivationBot(){
 if(botLinkReady())return botLaunch.url;
 if(botLaunch.inflight)return botLaunch.inflight;
 botLaunch.inflight=(async()=>{
   const data=await post('/telegram/link',{});
   const url=new URL(data.url);
   if(url.protocol!=='https:'||url.hostname!=='t.me'||!/^\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(url.pathname))
     throw Error('رابط تيليجرام غير صالح');
   const lifetime=Math.min(600,Math.max(60,Number(data.expiresIn)||600));
   botLaunch.url=url.href;
   botLaunch.linkCode=String(data.linkCode||'');
   botLaunch.validUntil=Date.now()+lifetime*1000;
   if(/^[A-Za-z0-9_-]{12,64}$/.test(botLaunch.linkCode))showPairingCode(botLaunch.linkCode);
   setBotButtonUrl($('botActivateHome'),url.href);
   setBotButtonUrl($('starsStart'),url.href);
   return url.href;
 })();
 try{return await botLaunch.inflight;}finally{botLaunch.inflight=null;}
}
async function openActivationBot(button,errorNode){
 setBusy(button,true,'جارٍ فتح بوت تيليجرام...');
 try{
   const url=await prepareActivationBot();
   showBotDirectLink(button,url); // Always keep a direct, click-to-open fallback.
   location.assign(url);
 }catch(err){
   if(err.status===401){location.assign(botLoginUrl);return;}
   if(errorNode)errorNode.textContent=err.message;
   else openDialog('تعذّر فتح تيليجرام',err.message);
 }finally{setBusy(button,false);}
}
function attachActivationButton(button,errorNode){
 if(!button)return;
 // Background preparation makes the ordinary hyperlink work on the first click.
 prepareActivationBot().catch(err=>{
   if(err.status===401){setBotButtonUrl(button,botLoginUrl);return;}
   const status=$(button.id==='botActivateHome'?'botLaunchStatusHome':'starsResult');
   if(status)status.textContent=err.message;
 });
 button.addEventListener('click',event=>{
   if(button.tagName==='A'&&(botLinkReady()||new URL(button.href,location.href).pathname==='/api/telegram/open'))return;
   if(!botLinkReady()&&button.href===new URL(botLoginUrl,location.href).href)return;
   event.preventDefault();
   openActivationBot(button,errorNode);
 });
}
async function homeInit(){attachActivationButton($('botActivateHome'),null);bindPairCopy($('botActivateHome'));}
window.addEventListener('pageshow',event=>{
 if(!event.persisted)return;
 botLaunch.url=null;botLaunch.linkCode=null;botLaunch.validUntil=0;
 const button=$('botActivateHome')||$('starsStart');
 if(button)prepareActivationBot().catch(()=>{});
});
let mode=params.get('mode')==='signup'?'signup':'login';
function setMode(next){mode=next;const signup=next==='signup';$('tabLogin').classList.toggle('active',!signup);$('tabSignup').classList.toggle('active',signup);$('tabLogin').setAttribute('aria-pressed',String(!signup));$('tabSignup').setAttribute('aria-pressed',String(signup));$('nameWrap').hidden=!signup;$('confirmWrap').hidden=!signup;$('authSubmit').textContent=signup?'إنشاء الحساب ←':'تسجيل الدخول ←';$('password').autocomplete=signup?'new-password':'current-password';$('confirm').required=signup;$('userName').required=signup;}
async function authInit(){setMode(mode);$('tabLogin').addEventListener('click',()=>setMode('login'));$('tabSignup').addEventListener('click',()=>setMode('signup'));$('authForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;const payload={email:$('email').value.trim(),password:$('password').value};if(mode==='signup'){payload.name=$('userName').value.trim();if(payload.password!==$('confirm').value){$('authError').textContent='كلمتا المرور غير متطابقتين';return}}const btn=$('authSubmit');setBusy(btn,true);$('authError').textContent='';try{const result=await post(mode==='signup'?'/auth/register':'/auth/login',payload);if(mode==='signup'){sessionStorage.setItem('aim8SignupEmail',payload.email);location.href='verify.html?mode=signup';return;}const next=params.get('next');location.href=['/api/telegram/open','activate.html'].includes(next)?next:'dashboard.html';}catch(err){$('authError').textContent=err.message;showToast(err.message)}finally{setBusy(btn,false)}})}
async function recoveryInit(){
 const mode=params.get('mode')||'reset';const isSignup=mode==='signup';const heading=$('recoveryTitle');if(heading)heading.textContent=isSignup?'تأكيد إنشاء الحساب':'استعادة كلمة المرور';
 if(isSignup){$('recoveryEmail').value=sessionStorage.getItem('aim8SignupEmail')||'';$('recoveryEmail').readOnly=true;$('sendRecovery').textContent='إعادة إرسال رمز التسجيل';$('recoveryCodeGroup').hidden=false;$('recoveryPassGroup').hidden=true;}
 $('sendRecovery').addEventListener('click',async()=>{const email=$('recoveryEmail').value.trim();const btn=$('sendRecovery');setBusy(btn,true);try{await post(isSignup?'/auth/signup/resend':'/auth/password/request',{email});$('recoveryResult').textContent='إذا كان البريد مؤهلًا، افحص Gmail والرسائل غير المرغوبة.';$('recoveryCodeGroup').hidden=false;if(!isSignup)$('recoveryPassGroup').hidden=false;}catch(err){$('recoveryResult').textContent=err.message}finally{setBusy(btn,false)}});
 $('recoveryForm').addEventListener('submit',async ev=>{ev.preventDefault();const email=$('recoveryEmail').value.trim(),code=$('recoveryCode').value.trim();const btn=$('recoverySubmit');setBusy(btn,true);try{if(isSignup){await post('/auth/signup/verify',{email,code});sessionStorage.removeItem('aim8SignupEmail');location.href='dashboard.html';}else{const password=$('recoveryPassword').value;if(password!==$('recoveryConfirm').value)throw Error('كلمتا المرور غير متطابقتين');await post('/auth/password/reset',{email,code,newPassword:password});$('recoveryResult').textContent='تم تغيير كلمة المرور. ادخل إلى حسابك.';btn.hidden=true;}}catch(err){$('recoveryResult').textContent=err.message}finally{setBusy(btn,false)}});
}
async function checkoutInit(){ location.replace('dashboard.html#telegramActivation'); }
async function activateInit(){
 const form=$('activationForm'),status=$('activationResult'),input=$('activationCode'),submit=$('activationSubmit');
 if(!form||!status||!input)return;
 // Keep the activation code on the user's device only: never put it in a URL.
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const code=input.value.trim();
  if(!/^A8-[A-Za-z0-9_-]{28}$/.test(code)){status.textContent='تحقق من كود التفعيل الذي استلمته من البوت.';return;}
  setBusy(submit,true,'جارٍ تفعيل الاشتراك...');
  status.textContent='';
  try{
   const data=await post('/telegram/redeem',{code});
   input.value='';status.textContent='تم تفعيل اشتراك '+data.days+' يوم بنجاح. ينتهي في '+fmtTime(data.subscriptionUntil)+'.';
   status.style.color='var(--mint)';
   form.hidden=true;
  }catch(error){
   if(error.status===401){location.href='auth.html?next=activate.html';return;}
   status.textContent=error.message;
   status.style.color='var(--error)';
  }finally{setBusy(submit,false);}
 });
}
async function starsInit(){
 const start=$('starsStart'),result=$('starsResult'),redeem=$('starsRedeem');
 if(!start||!redeem)return;
 attachActivationButton(start,result);
 bindPairCopy(start);
 redeem.addEventListener('click',async()=>{
   const code=$('starsCode').value.trim();
   if(!code){result.textContent='أدخل الكود أولاً';return;}
   setBusy(redeem,true,'جارٍ التفعيل...');
   try{
     const data=await post('/telegram/redeem',{code});
     result.textContent='تم تفعيل '+data.days+' يوم بنجاح. تاريخ الانتهاء: '+fmtTime(data.subscriptionUntil);
     $('accountExpiry').textContent=fmtTime(data.subscriptionUntil);
     $('accountExpiry2').textContent=fmtTime(data.subscriptionUntil);
     $('accountStatus').textContent='نشط';
     $('accountStatus').className='pill green';
     $('starsCode').value='';
   }catch(e){result.textContent=e.message;}
   finally{setBusy(redeem,false);}
 });
}
async function dashboardInit(){starsInit();try{const data=await api('/auth/me');const u=data.user;$('accountAlert').textContent='أهلًا '+u.name+'، هذه بياناتك المباشرة من السيرفر.';$('accountStatus').textContent=u.subscriptionActive?'نشط':'غير نشط';$('accountStatus').className='pill '+(u.subscriptionActive?'green':'orange');const paidOrder=data.orders.find(o=>o.status==='paid');$('accountPlan').textContent=u.subscriptionActive?(paidOrder?(names[paidOrder.plan_id]||'اشتراك AIM8'):'اشتراك نشط'):'لا توجد باقة نشطة';$('accountExpiry').textContent=fmtTime(u.subscriptionUntil);$('accountExpiry2').textContent=fmtTime(u.subscriptionUntil);$('accountStart').textContent=fmtTime(u.subscriptionStartedAt);$('accountEmail').textContent=u.email;$('deviceStatus').textContent=u.deviceBound?'مرتبط بجهاز Android واحد':'لم يُربط جهاز بعد';$('emailVerificationState').textContent=u.emailVerified?'البريد مؤكد':'البريد غير مؤكد، يلزم تأكيده قبل استخدام التطبيق';$('emailVerifySection').hidden=!!u.emailVerified;$('deviceChangeSection').hidden=!u.deviceBound||!u.emailVerified;$('lastOrder').textContent=data.telegramOrders?.[0]?.id||data.orders[0]?.id||'—';$('adminEntry').hidden=u.role!=='admin';const list=$('userOrders');list.replaceChildren();
const botOrders=data.telegramOrders||[];
if(!data.orders.length&&!botOrders.length)list.append(el('p','لا توجد طلبات بعد.','muted'));
botOrders.forEach(o=>{
 const item=el('div',null,'order-row');
 item.append(el('span','بوت تيليجرام · '+(names[o.plan_id]||o.plan_id)+' · '+fmtTime(o.created_at)),
   el('strong',({pending:'بانتظار الدفع',paid:'تم الدفع — أدخل كود التفعيل',redeemed:'مفعّل',refunded:'تم الاسترجاع'})[o.status]||o.status));
 list.append(item);
});
data.orders.forEach(o=>{const item=el('div',null,'order-row');item.append(el('span',`${names[o.plan_id]||o.plan_id} · ${fmtMoney(o.amount_cents)} · ${fmtTime(o.created_at)}`),el('strong',({pending:'بانتظار الدفع',paying:'قيد التأكيد',paid:'مدفوع',failed:'فشل',expired:'منتهي'})[o.status]||o.status));list.append(item)});
}catch(err){$('accountAlert').textContent=err.message+' — سجّل الدخول حتى تشوف حسابك.';$('accountAlert').className='alert warn';$('adminEntry').hidden=true;}
$('logoutBtn')?.addEventListener('click',async()=>{try{await post('/auth/logout',{});location.href='auth.html'}catch(err){openDialog('تعذّر تسجيل الخروج',err.message)}})}
$('emailVerifySend')?.addEventListener('click',async()=>{try{await post('/auth/email/request',{});$('emailVerifyMessage').textContent='تم إرسال رمز التحقق إلى بريدك';}catch(err){$('emailVerifyMessage').textContent=err.message}});
$('emailVerifyConfirm')?.addEventListener('click',async()=>{try{await post('/auth/email/verify',{code:$('emailVerifyCode').value.trim()});location.reload()}catch(err){$('emailVerifyMessage').textContent=err.message}});
$('deviceChangeSend')?.addEventListener('click',async()=>{if(!confirm(tr('سيتم إلغاء اعتماد الجهاز القديم بعد تأكيد الرمز، هل تريد المتابعة؟')))return;try{await post('/device/change/request',{});$('deviceChangeMessage').textContent='أرسلنا رمزًا إلى بريدك. لن ينفصل الجهاز قبل تأكيد الرمز.';}catch(err){$('deviceChangeMessage').textContent=err.message}});
$('deviceChangeConfirm')?.addEventListener('click',async()=>{if(!confirm(tr('هل تؤكد فصل الجهاز القديم الآن؟')))return;try{await post('/device/change/confirm',{code:$('deviceChangeCode').value.trim()});location.reload()}catch(err){$('deviceChangeMessage').textContent=err.message}});
let users=[],selected=null;
function selectUser(u){selected=u;$('targetId').value=u.id;$('targetEmail').value=u.email;showToast('تم اختيار '+u.email)}
function addCell(row,value){row.append(el('td',value));}
function renderUsers(){const q=$('userSearch').value.trim().toLowerCase(),tbody=$('adminUsers');tbody.replaceChildren();users.filter(u=>(u.email+' '+u.name).toLowerCase().includes(q)).forEach(u=>{const tr=el('tr');addCell(tr,u.name+'\n'+u.email);addCell(tr,u.subscriptionUntil>Math.floor(Date.now()/1000)?'نشط حتى '+fmtTime(u.subscriptionUntil):'غير نشط');addCell(tr,u.deviceBound?'مرتبط':'بدون جهاز');addCell(tr,u.blocked?'محظور':u.role==='admin'?'مدير':'مسموح');const td=el('td'),b=el('button','اختيار','btn ghost small');b.type='button';b.addEventListener('click',()=>selectUser(u));td.append(b);tr.append(td);tbody.append(tr)})}
function renderPlans(plans){const node=$('adminPlans');node.replaceChildren();plans.forEach(p=>{const wrap=el('div',null,'admin-plan');const title=el('strong',p.name+' · '+p.days+' أيام');const field=el('input');field.type='number';field.min='0';field.step='0.01';field.value=(p.price_cents/100).toFixed(2);field.setAttribute('aria-label','السعر بالدولار للباقة '+p.name);const toggle=el('input');toggle.type='checkbox';toggle.checked=!!p.enabled;const label=el('label','تفعيل البيع');label.prepend(toggle);const btn=el('button','حفظ الباقة','btn small');btn.type='button';btn.addEventListener('click',async()=>{setBusy(btn,true);try{await post('/admin/plan',{id:p.id,priceCents:Math.round(Number(field.value)*100),enabled:toggle.checked});showToast('تم حفظ باقة '+p.name)}catch(err){openDialog('خطأ حفظ الباقة',err.message)}finally{setBusy(btn,false)}});wrap.append(title,field,label,btn);node.append(wrap)})}
function renderStarsAdmin(plans){
 const root=$('adminStarsPlans');if(!root)return;root.replaceChildren();
 plans.forEach(p=>{
  const wrap=el('div',null,'admin-plan');
  const heading=el('strong',p.name+' · '+p.days+' يوم');
  const input=el('input');input.type='number';input.min='0';input.max='100000';input.step='1';input.value=p.stars_price||0;input.setAttribute('aria-label','قيمة الدفع داخل البوت: '+p.name);
  const check=el('input');check.type='checkbox';check.checked=!!p.stars_enabled;
  const label=el('label','تفعيل الباقة في البوت');label.prepend(check);
  const save=el('button','حفظ إعدادات الباقة','btn small');save.type='button';
  save.addEventListener('click',async()=>{setBusy(save,true);try{
    await post('/admin/telegram/plan',{id:p.id,starsPrice:Number(input.value),enabled:check.checked});
    showToast('تم تحديث إعدادات الباقة');
  }catch(e){openDialog('خطأ في إعدادات الباقة',e.message)}finally{setBusy(save,false)}});
  wrap.append(heading,input,label,save);root.append(wrap);
 });
 $('adminTelegramWebhook')?.addEventListener('click',async()=>{const btn=$('adminTelegramWebhook');setBusy(btn,true,'جارٍ الربط...');
 try{const data=await post('/admin/telegram/configure',{});
 $('adminTelegramStatus').textContent='تم تسجيل Webhook على: '+data.webhookUrl;
 }catch(e){$('adminTelegramStatus').textContent=e.message;}finally{setBusy(btn,false)}});
}
async function adminTelegramSecurityInit(){
 const element=$('telegramSecurityStatus');
 if(!element)return;
 try{
  const info=await api('/admin/telegram/security/status');
  const attempts=info.events.reduce((sum,x)=>sum+x.total,0);
  const details=info.events.map(x=>x.category+': '+x.total);
  element.textContent=[
   'البلاغات في آخر 24 ساعة: '+attempts,
   'الحماية المستقلة لـ Webhook: '+(info.independentWebhookSecret?'مفعلة':'تحتاج إعداد'),
   'تنبيه المدير: '+(info.alertRecipientConfigured?'مفعّل':'غير مفعّل'),
   ...details
  ].join(' | ');
 }catch(e){element.textContent='تعذر تحميل حالة البوت: '+e.message;}
}
function attachWebhookSecretGenerator(){
 const output=$('adminWebhookSecretValue'),message=$('adminWebhookSecretStatus');
 $('adminGenerateWebhookSecret')?.addEventListener('click',()=>{
  if(!output||!globalThis.crypto?.getRandomValues){
   if(message)message.textContent='التوليد الآمن غير متاح بهذا المتصفح. استخدم متصفح حديث عبر HTTPS.';
   return;
  }
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  output.value=btoa(String.fromCharCode(...bytes)).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/g,'');
  bytes.fill(0);
  if(message)message.textContent='تم توليد المفتاح محلياً؛ لا ترسله لأحد. انسخه إلى Cloudflare Secrets باسم TELEGRAM_WEBHOOK_SECRET. بعد حفظه وإعادة نشر الموقع، اضغط زر ربط Webhook.';
 });
 $('adminCopyWebhookSecret')?.addEventListener('click',async()=>{
  if(!output?.value){
   if(message)message.textContent='ولّد مفتاحاً أولاً ثم انسخه.';
   return;
  }
  try{
   await navigator.clipboard.writeText(output.value);
   if(message)message.textContent='تم نسخ المفتاح. الصقه في Cloudflare كـ Secret مشفّر؛ لا تنشره في GitHub أو المحادثة.';
  }catch{
   if(message)message.textContent='تعذّر النسخ التلقائي؛ جرّب تحديد المفتاح ونسخه يدوياً.';
  }
 });
}
function attachTelegramAlertPairing(){
 const button=$('adminPairTelegramAlerts'),unlink=$('adminUnpairTelegramAlerts');
 button?.addEventListener('click',async()=>{
  const status=$('telegramAlertPairingStatus'),link=$('telegramAlertLink');
  setBusy(button,true,'جارٍ تجهيز رابط الأمان...');
  if(link)link.hidden=true;
  try{
   const info=await post('/admin/telegram/security/alert-link',{});
   const u=new URL(info.url);
   if(u.protocol!=='https:'||u.hostname!=='t.me')throw Error('Invalid Telegram link');
   link.href=u.href;link.hidden=false;
   status.textContent='تم تجهيز الرابط. افتحه بحسابك، ثم اضغط Start داخل تيليجرام خلال 5 دقائق. لا تشارك الرابط مع أحد.';
  }catch(e){status.textContent='تعذّر إنشاء رابط الأمان: '+e.message;}
  finally{setBusy(button,false);}
 });
 unlink?.addEventListener('click',async()=>{
  if(!confirm('هل تريد إيقاف تنبيهات الحماية عن الحساب المرتبط؟'))return;
  const status=$('telegramAlertPairingStatus'),link=$('telegramAlertLink');
  setBusy(unlink,true);
  try{
   const info=await post('/admin/telegram/security/alert-unlink',{});
   if(link)link.hidden=true;
   status.textContent=info.envOverrideActive?'تم إلغاء الربط من الموقع. لا تزال تنبيهات Cloudflare اليدوية مفعّلة؛ احذف المتغير من إعدادات Cloudflare لإيقافها.':'تم إلغاء ربط المحادثة بالتنبيهات.';
   await adminTelegramSecurityInit();
  }catch(e){status.textContent='تعذر إلغاء الربط: '+e.message;}
  finally{setBusy(unlink,false);}
 });
}
async function adminStarsMonitorInit(){
 const output=$('starsMonitorStatus');if(!output)return;
 try{
  const data=await api('/admin/telegram/reconcile/status');
  const last=data.lastSync?fmtTime(data.lastSync)+' — '+new Date(data.lastSync*1000).toLocaleTimeString(userLang==='ar'?'ar-IQ':'en-US'):'لم يُنفّذ فحص بعد';
  const parts=['آخر فحص ناجح: '+last,
   'رصيد نجوم البوت: '+(data.balance===null?'غير متوفر':data.balance+' ⭐'),
   'عمليات غير معرّفة تحتاج مراجعة: '+data.unmatchedAlerts,
   'آخر فحص ألغى '+data.lastRevocations+' اشتراكات مسترجعة'];
  if(data.lastError)parts.push('تنبيه: آخر فحص فشل');
  if(data.truncated)parts.push('تنبيه: عدد المعاملات أكبر من نطاق الفحص الأخير');
  output.textContent=parts.join(' | ');
 }catch(err){output.textContent='تعذّر تحميل سجل الحماية: '+err.message;}
}
function attachStarsMonitorControls(){
 $('adminRefreshStarsMonitor')?.addEventListener('click',adminStarsMonitorInit);
 $('adminRunStarsScan')?.addEventListener('click',async()=>{
  const button=$('adminRunStarsScan');setBusy(button,true,'جارٍ فحص معاملات تيليجرام...');
  try{
   const r=await post('/admin/telegram/reconcile',{});
   const status=$('starsMonitorStatus');
   status.textContent=r.skipped?'يوجد فحص آخر يعمل الآن.':'اكتمل الفحص: '+r.scanned+' معاملة، '+r.revoked+' اشتراكات ملغاة، '+r.unmatched+' حركات غير معرّفة. (الحركات غير المعرّفة لا تلغي المستخدمين تلقائياً.)';
   await adminTelegramOrdersInit();
   await adminStarsMonitorInit();
  }catch(e){$('starsMonitorStatus').textContent='تعذّر الفحص: '+e.message;}
  finally{setBusy(button,false);}
 });
}
async function adminTelegramOrdersInit(){
 const root=$('adminTelegramOrders');if(!root)return;
 try{
  const data=await api('/admin/telegram/orders');
  root.replaceChildren();
  if($('telegramPaymentCount'))$('telegramPaymentCount').textContent='طلبات تيليجرام: '+data.orders.length;
  if(!data.orders.length){const tr=el('tr'),td=el('td','لا توجد مدفوعات تيليجرام بعد.');td.colSpan=6;tr.append(td);root.append(tr);return;}
  for(const order of data.orders){
   const tableRow=el('tr');
   const values=[order.id.slice(0,17)+'…',order.email,names[order.plan_id]||order.plan_id,String(order.stars_amount)+' ⭐',order.status];
   for(const value of values)addCell(tableRow,value);
   const cell=el('td');
   if(['paid','redeemed'].includes(order.status)){
    const refund=el('button','استرجاع دفعة النجوم','btn small ghost');refund.type='button';
    refund.addEventListener('click',async()=>{
     if(!confirm(tr('تأكيد استرجاع '+order.stars_amount+' نجمة إلى المشتري وإلغاء مدة هذه الدفعة فقط؟')))return;
     const reason=prompt(tr('سبب الاسترجاع (5 أحرف على الأقل):'),'');
     if(!reason||reason.trim().length<5)return;
     setBusy(refund,true,'جارٍ الاسترجاع...');
     try{
      const res=await post('/admin/telegram/refund',{orderId:order.id,reason:reason.trim()});
      $('adminTelegramRefundStatus').textContent='أكد تيليجرام استرجاع '+res.starsRefunded+' نجمة. تم إلغاء مدة الدفعة.';
      showToast('تم استرجاع النجوم وإلغاء مدة الدفعة');
      await adminTelegramOrdersInit();
     }catch(err){openDialog('تعذّر استرجاع الدفعة',err.message);}
     finally{setBusy(refund,false);}
    });cell.append(refund);
   }else cell.textContent=order.status==='refunded'?'تم الاسترجاع':'بانتظار الدفع';
   tableRow.append(cell);root.append(tableRow);
  }
 }catch(err){root.replaceChildren();const tr=el('tr'),td=el('td',err.message);td.colSpan=6;tr.append(td);root.append(tr);if($('telegramPaymentCount'))$('telegramPaymentCount').textContent='تعذّر تحميل مدفوعات تيليجرام';}
}
async function adminInit(){try{const data=await api('/admin/overview');$('adminAlert').textContent='تم التحقق من صلاحية المدير. التغييرات تُحفظ في قاعدة البيانات.';$('statUsers').textContent=data.counts.users;$('statActive').textContent=data.counts.active;$('statBound').textContent=data.counts.bound;users=data.users;renderUsers();renderPlans(data.plans);renderStarsAdmin(data.plans);adminTelegramOrdersInit();adminStarsMonitorInit();adminTelegramSecurityInit();attachStarsMonitorControls();attachTelegramAlertPairing();attachWebhookSecretGenerator();$('adminRefreshTelegramSecurity')?.addEventListener('click',adminTelegramSecurityInit);const tb=$('adminOrders');tb.replaceChildren();data.orders.forEach(o=>{const tr=el('tr');[o.id.slice(0,17)+'…',o.email,names[o.plan_id]||o.plan_id,fmtMoney(o.amount_cents),o.status].forEach(text=>addCell(tr,text));tb.append(tr)});}catch(err){$('adminAlert').textContent=err.message+' — هذه الصفحة للمدير فقط.';$('adminAlert').className='alert warn';return}
$('refreshTelegramPayments')?.addEventListener('click',adminTelegramOrdersInit);
$('userSearch').addEventListener('input',renderUsers);
async function doAction(path,payload,msg){if(!selected)return openDialog('اختر مستخدمًا','اختر المستخدم من جدول الحسابات أولًا');const reason=$('adminReason').value.trim();if(reason.length<5)return openDialog('السبب مطلوب','اكتب سببًا واضحًا لا يقل عن 5 أحرف');if(!confirm(tr(msg)+'\n'+tr('المستخدم')+': '+selected.email))return;try{await post(path,{userId:selected.id,reason,...payload});showToast('تم تنفيذ الإجراء');location.reload()}catch(err){openDialog('فشل الإجراء',err.message)}}
$('adminReset').addEventListener('click',()=>doAction('/admin/reset-device',{},'فك ربط جهاز المستخدم؟'));
$('adminGrant').addEventListener('click',()=>doAction('/admin/grant',{days:Number($('adminDays').value)},'إضافة أيام للاشتراك؟'));
$('adminBlock').addEventListener('click',()=>doAction('/admin/block',{blocked:!selected?.blocked},'تغيير حالة حظر المستخدم؟'));
}
async function supportInit(){
try{const r=await api('/support/mine');const h=$('ticketHistory');h.replaceChildren();if(!r.tickets.length)h.append(el('p','ما عندك طلبات سابقة.','muted'));r.tickets.forEach(t=>{const box=el('div',null,'ticket-card');box.append(el('h3',t.subject),el('small',fmtTime(t.created_at)+' · '+(t.status==='answered'?'تم الرد':'بانتظار الرد')),el('p',t.message));if(t.reply)box.append(el('div','رد الإدارة: '+t.reply,'ticket-reply'));h.append(box)});$('supportStatus').textContent='يمكنك إرسال 5 طلبات دعم يوميًا من حسابك.'}catch(err){$('ticketHistory').replaceChildren(el('p','يجب تسجيل الدخول لعرض الطلبات.','muted'));$('supportStatus').textContent=err.message}
$('ticketForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('ticketSubmit');setBusy(btn,true,'جارٍ الإرسال...');try{await post('/support/ticket',{subject:$('ticketSubject').value,message:$('ticketMessage').value});showToast('تم استلام طلب الدعم');location.reload()}catch(err){$('supportStatus').textContent=err.message}finally{setBusy(btn,false)}})
}
async function adminTicketsInit(){try{const response=await api('/admin/tickets');const root=$('adminTickets');if(!root)return;root.replaceChildren();if(!response.tickets.length)root.append(el('p','لا توجد طلبات دعم.','muted'));response.tickets.forEach(t=>{const wrap=el('div',null,'ticket-card');wrap.append(el('h3',t.subject+' — '+t.email),el('small',fmtTime(t.created_at)+' · '+t.status),el('p',t.message));if(t.reply)wrap.append(el('div','الرد السابق: '+t.reply,'ticket-reply'));const btn=el('button','الرد على الطلب','btn small ghost');btn.type='button';btn.addEventListener('click',async()=>{const answer=prompt(tr('اكتب رد الإدارة:'),t.reply||'');if(!answer||answer.trim().length<3)return;try{await post('/admin/reply-ticket',{ticketId:t.id,reply:answer.trim()});showToast('تم إرسال الرد');adminTicketsInit()}catch(e){openDialog('تعذّر الرد',e.message)}});wrap.append(btn);root.append(wrap)})}catch(err){if($('adminTickets'))$('adminTickets').textContent=err.message}}
$('downloadDemo')?.addEventListener('click',()=>openDialog('تنزيل التطبيق','لا يوجد رابط تنزيل رسمي بعد. سيظهر فقط بعد تجهيز إصدار Android.'));
const page=document.body.dataset.page;if(page==='home')homeInit();else if(page==='auth')authInit();else if(page==='recovery')recoveryInit();else if(page==='checkout')checkoutInit();else if(page==='dashboard')dashboardInit();else if(page==='activate')activateInit();else if(page==='admin'){adminInit();adminTicketsInit();}else if(page==='support')supportInit();
})();
