'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const STORE='aim8.nowpayments.verification';
 let token=sessionStorage.getItem(STORE)||'',busy=false,verified=false;
 function message(id,value){$(id).textContent=value||'';}
 async function post(path,data){
  const r=await fetch('/api/nowpayments/'+path,{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'content-type':'application/json'},body:JSON.stringify(data||{})
  });
  const j=await r.json();
  if(!r.ok||!j?.ok)throw Error(j?.message||'تعذر تنفيذ الطلب');
  return j;
 }
 function plansReady(value){
  verified=!!value;
  document.querySelectorAll('.crypto-plan').forEach(btn=>btn.disabled=!verified||busy);
 }
 async function check(){
  if(!token)return;
  try{
   const r=await post('identity/status',{token});
   if(r.expired&&!r.verified){sessionStorage.removeItem(STORE);token='';plansReady(false);message('verificationStatus','انتهت صلاحية التحقق؛ ابدأ من جديد.');return;}
   if(r.verified){
    plansReady(true);message('verificationStatus','✅ تم تأكيد Telegram ID: '+r.telegramId+' — يمكنك اختيار الباقة.');
    const current=await post('order/status',{token});
    if(current.order){
     const order=current.order;
     if(order.invoiceUrl){$('paymentLink').href=order.invoiceUrl;$('paymentLink').hidden=false;$('refreshOrder').hidden=false;}
     if(order.status==='paid'||order.status==='redeemed'){
      message('checkoutStatus','✅ الدفع مؤكد. افتح بوت AIM8 في تيليجرام لاستلام الكود أو مراجعة الرسائل.');
     }else if(order.status==='refunded'){
      message('checkoutStatus','هذه العملية مسترجعة. تواصل مع الدعم.');
     }
    }
   }else{plansReady(false);message('verificationStatus','بانتظار فتح البوت والضغط على /start بالرابط الخاص بك...');}
  }catch(e){message('verificationStatus',e.message);}
 }
 $('startVerification').addEventListener('click',async()=>{
  if(busy)return;busy=true;$('startVerification').disabled=true;plansReady(false);
  try{
   const r=await post('identity/start',{});
   token=r.token;sessionStorage.setItem(STORE,token);
   $('telegramVerification').href=r.botUrl;$('telegramVerification').hidden=false;
   message('verificationCode','إذا ما اشتغل رابط البوت، أرسل له: /start npv_'+token);
   message('verificationStatus','رمز التحقق صالح 10 دقائق. افتح البوت ثم ارجع هنا.');
   $('paymentLink').hidden=true;$('refreshOrder').hidden=true;message('checkoutStatus','');
  }catch(e){message('verificationStatus',e.message);}
  finally{busy=false;$('startVerification').disabled=false;}
 });
 document.querySelectorAll('.crypto-plan').forEach(btn=>btn.addEventListener('click',async()=>{
  if(!verified||busy||!token)return;
  busy=true;plansReady(false);message('checkoutStatus','جارٍ إنشاء فاتورة مستقلة مرتبطة بـTelegram ID...');
  try{
   const r=await post('invoice',{token,planId:btn.dataset.plan});
   $('paymentLink').href=r.paymentUrl;$('paymentLink').hidden=false;$('refreshOrder').hidden=false;
   message('checkoutStatus','تم تجهيز فاتورة $'+r.amountUsd+'. اضغط فتح الفاتورة وأكمل الدفع. سيصلك الكود بعد التأكيد.');
  }catch(e){message('checkoutStatus',e.message);}
  finally{busy=false;plansReady(verified);}
 }));
 $('refreshOrder').addEventListener('click',check);
 setInterval(check,6000);
 if(token)check();
})();