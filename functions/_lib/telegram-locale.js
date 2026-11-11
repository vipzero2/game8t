// Telegram Bot API User.language_code is an optional IETF tag.
// Follow Telegram's language with Arabic RTL or English fallback; no manual selector.
export function isArabicTelegram(user) {
  return /^ar(?:-|$)/i.test(String(user?.language_code||''));
}
const dictionary=new Map([
  ['توكن تيليجرام غير مضبوط','Telegram bot token is not configured'],
  ['تعذر التواصل مع تيليجرام','Could not contact Telegram'],
  ['مفتاح الخادم غير مضبوط','Server key is not configured'],
  ['الباقة غير مفعلة للدفع بالنجوم حالياً.','This plan is not currently available for Stars.'],
  ['أكد بريدك أولاً','Please verify your email first'],
  ['هذه الباقة غير مفعلة للنجوم بعد','This plan is not enabled for Stars yet'],
  ['اسم البوت غير صالح','Invalid bot username'],
  ['صيغة الكود غير صحيحة','Invalid activation code format'],
  ['الكود غير مخصص لهذا الحساب أو غير موجود','The code does not belong to this account or does not exist'],
  ['الكود مستخدم أو الدفعة مسترجعة','Code already redeemed or payment refunded'],
  ['انتهت صلاحية الكود','Activation code expired'],
  ['الكود مستخدم؛ حدّث الصفحة ثم افحص الاشتراك','Code already redeemed; refresh and check your subscription'],
  ['اشتراكات النجوم غير مفعلة بعد.','Stars subscriptions are not available yet.'],
  ['اختر الباقة لحساب AIM8 المرتبط:','Select a plan for your linked AIM8 account:'],
  ['رابط غير صحيح. ارجع للموقع للحصول على رابط جديد.','Invalid link. Return to AIM8 to get a new link.'],
  ['انتهت صلاحية الربط. ارجع لموقع AIM8 وابدأ من جديد.','This link has expired. Return to AIM8 and start again.'],
  ['الرابط مستخدم. اطلب رابط جديد من الموقع.','This link has already been used. Get a new one from AIM8.'],
  ['حساب تيليجرام هذا مربوط بحساب AIM8 مختلف، أو حسابك مربوط بتيليجرام آخر. تواصل مع الدعم.','This Telegram account is already linked to another AIM8 account, or your AIM8 account is linked to another Telegram user. Contact support.'],
  ['الفاتورة غير صالحة أو انتهت صلاحيتها. افتح رابط شراء جديد من موقع AIM8.','This invoice is invalid or expired. Open a new purchase link from AIM8.'],
  ['تم تسجيل استرجاع دفعة النجوم. أُلغي كود الدفع وأُزيلت مدة هذه الدفعة فقط.','Your Stars payment was refunded. Its activation code and subscription grant were revoked. Other purchases remain intact.'],
  ['خيار غير متاح','Option unavailable'],
  ['استخدم الرابط الآمن','Use the secure link'],
  ['حدد سعراً صحيحاً بالنجوم','Enter a valid Stars price'],
  ['الباقة غير موجودة','Plan not found'],
  ['3 أشهر','3 Months'],
  ['6 أشهر','6 Months'],
  ['سنة كاملة','1 Year']
]);
const phrases=[
  ['تم الدفع بنجاح ✅\nكود AIM8 الخاص بحسابك:\n','Payment successful ✅\nYour AIM8 activation code:\n'],
  ['\n\nصالح حتى ','\n\nValid until '],
  ['\nاستخدمه مرة واحدة في صفحة حسابك على ','\nRedeem it once on your dashboard at '],
  ['أهلاً بك في AIM8. سجّل دخولك في ','Welcome to AIM8. Sign in at '],
  [' ثم اضغط الحصول على كود التفعيل لربط حسابك.',' and tap Get Activation Code to link your account.'],
  ['افتح حسابك في ','Open your account at '],
  [' ثم اضغط الحصول على كود التفعيل لربط الحساب.',' and tap Get Activation Code to link the account.'],
  ['اشتراك AIM8 لمدة ','AIM8 subscription for '],
  [' يوم. يصدر كود صالح 24 ساعة بعد الدفع.',' days. A code valid for 24 hours will be issued after payment.'],
  ['لدعم الدفع والاسترجاع: افتح ','For payment or refund support, visit '],
  ['/support.html وسجّل تذكرة بحسابك. احتفظ بإيصال تيليجرام.','/support.html and submit a ticket. Keep your Telegram receipt.']
];
export function telegramText(input,user){
  const text=String(input);
  if(isArabicTelegram(user))return text;
  if(dictionary.has(text))return dictionary.get(text);
  let out=text;
  for(const [from,to] of phrases)out=out.split(from).join(to);
  return out;
}
