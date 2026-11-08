from pathlib import Path
from html import escape
p=Path(__file__).parent/'public'
for fp in p.glob('*.html'):
    t=fp.read_text()
    t=t.replace('هذه نسخة واجهة تجريبية — الحسابات والدفع والتفعيل غير مربوطين حالياً.', 'AIM8 · الموقع قيد الإعداد — لا تدفع قبل ظهور فاتورة رسمية من OxaPay.')
    t=t.replace('<div class="notice-bar">','<div class="notice-bar" id="siteNotice">')
    t=t.replace('نسخة ما قبل الإطلاق','قيد التجهيز')
    fp.write_text(t)
# home
fp=p/'index.html';t=fp.read_text()
t=t.replace('واجهة AIM8 للاشتراكات في أداة خطوط التسديد، تصميم تجريبي قبل التفعيل.','موقع AIM8 للاشتراك وإدارة حسابات أداة خطوط التسديد')
t=t.replace('المزايا التالية تصف الأداة، أما الموقع حاليًا فهو تصميم تجريبي للاشتراكات.','استكشف المزايا المتوفرة في أداة AIM8 مع إدارة الاشتراك من حسابك.')
t=t.replace('هذا هو المسار المخطط له عندما نكمل ربط الحسابات والدفع.','أنشئ حسابك، اختر الباقة، ثم ادفع من فاتورة رسمية عند تفعيل بوابة الدفع.')
t=t.replace('المدد هنا مقترحات للواجهة، ونحدد أسعارها النهائية لاحقًا قبل إطلاق الدفع.','الأسعار النهائية تظهر بعد اعتمادها من الإدارة. لن يتم تحصيل أي مبلغ قبلها.')
t=t.replace('تنبيه: الأسعار، مدة التفعيل، سياسة الاسترجاع، وشروط الاستخدام تحتاج اعتماد قبل تفعيل استقبال المدفوعات.','الشراء لا يعمل إلا بعد نشر السيرفر واعتماد الأسعار وربط OxaPay رسميًا.')
t=t.replace('حاليًا الموقع نسخة تجريبية للواجهة فقط. شراء الاشتراكات والتفعيل الحقيقي سيُضافان عند ربط OxaPay ونظام المستخدمين.','يصبح الشراء متاحًا فقط بعد تفعيل الباقات وربط OxaPay رسميًا؛ عندها تظهر الأسعار وفاتورة الدفع.')
t=t.replace('بعد بناء نظام الحسابات ستعرض لوحة المستخدم حالة الاشتراك وتاريخ بدايته وانتهائه.','تظهر حالة الاشتراك وتاريخ انتهاء صلاحيته داخل لوحة الحساب بعد تسجيل الدخول.')
t=t.replace('تصميم تجريبي للاشتراكات.', 'إدارة الاشتراكات.')
t=t.replace('سنعرض هنا السعر النهائي وطريقة الدفع وتأكيد الطلب.','الأسعار تظهر بعد ربط قاعدة البيانات.')
# add data classes without changing markup
fp.write_text(t)
# auth
fp=p/'auth.html';t=fp.read_text()
t=t.replace('واجهة تسجيل الدخول وإنشاء الحساب في AIM8 - نسخة تجريبية','تسجيل الدخول وإنشاء حساب AIM8')
t=t.replace('واجهة تسجيل الدخول والتسجيل جاهزة للعرض، وسيُربط التحقق وإنشاء الحسابات لاحقاً.','حساب واحد، اشتراك واحد، وجهاز Android واحد مرتبط بكل اشتراك.')
t=t.replace('minlength="8"','minlength="10"').replace('8 أحرف أو أكثر','10 أحرف أو أكثر')
t=t.replace('هذا نموذج تجريبي فقط. لا يُرسل أو يحفظ بريدك أو كلمة مرورك. لا تستخدم كلمة مرور حقيقية خلال المعاينة.','تُحفظ كلمات المرور بصيغة Hash داخل D1 بعد تشغيل السيرفر. ربط التطبيق بالجهاز يتم من داخل تطبيق Android، وليس المتصفح.')
t=t.replace('شاهد نموذج لوحة الحساب','اذهب إلى لوحة حسابك')
t=t.replace('<button type="submit" id="authSubmit" class="btn full">','<p id="authError" class="form-note" role="alert" aria-live="polite"></p><button type="submit" id="authSubmit" class="btn full">')
fp.write_text(t)
# checkout
fp=p/'checkout.html';t=fp.read_text()
t=t.replace('واجهة سلة شراء وطلب اشتراك AIM8 - تجربة بدون مدفوعات','شراء اشتراك AIM8')
t=t.replace('صفحة مراجعة الطلب مصممة، وسيتم تفعيل الدفع الفعلي بعد إعداد بوابة OxaPay.','راجع الباقة والسعر، ثم انتقل إلى فاتورة OxaPay الرسمية عندما يصبح الدفع متاحًا.')
t=t.replace('<span class="prelaunch">المعاملات غير مفعّلة الآن</span>','<span class="prelaunch" id="checkoutAvailability">تأكد من الأسعار وحالة بوابة الدفع</span>')
t=t.replace('placeholder="name@example.com" disabled','placeholder="سجل دخولك أولًا" readonly')
t=t.replace('سيتم الربط وتفعيل إنشاء فواتير الدفع لاحقاً.','لن يظهر رابط دفع إلا إذا أنشأه السيرفر عبر OxaPay.')
t=t.replace('لا ترسل أي عملات رقمية الآن. هذه الصفحة لا تنشئ فاتورة ولا عنوان دفع حقيقي.','لا ترسل الأموال إلى عنوان يدوي. ادفع فقط عبر فاتورة OxaPay التي ينشئها السيرفر.')
t=t.replace('<button type="button" class="btn full" id="payDemo">معاينة متابعة الدفع ←</button>','<button type="button" class="btn full" id="payNow" disabled>الدفع غير متاح حاليًا</button>')
t=t.replace('لن يتم تحصيل أي مبلغ من هذه الصفحة في الوضع التجريبي.','<span id="paymentStatus" role="status" aria-live="polite">سيظهر رابط الدفع عندما تكون الباقة مفعّلة.</span>')
t=t.replace('<strong>لم يُحدّد</strong>','<strong id="checkoutPrice">لم يُحدّد</strong>',1)
t=t.replace('<strong>—</strong>','<strong id="checkoutTotal">—</strong>',1)
fp.write_text(t)
# dashboard simple target ID replacements
fp=p/'dashboard.html';t=fp.read_text()
t=t.replace('نموذج لوحة إدارة اشتراك AIM8 - بيانات تجريبية','لوحة حساب AIM8')
t=t.replace('معاينة لكيف ستظهر معلومات العميل عندما نربط قاعدة البيانات واشتراكه الحقيقي.','تفاصيل حسابك واشتراكك وجهاز Android المرتبط به، مباشرة من قاعدة البيانات.')
t=t.replace('<div class="alert info" style="margin-bottom:24px"><strong>وضع العرض التجريبي:</strong> البيانات أدناه ليست مرتبطة بحساب فعلي، ولا توجد عضوية مفعّلة.</div>','<div class="alert info" style="margin-bottom:24px" id="accountAlert" role="status">جاري الاتصال بحسابك...</div>')
t=t.replace('<span class="pill orange">غير مفعّل</span>','<span class="pill orange" id="accountStatus">—</span>')
t=t.replace('<strong>لا توجد</strong>','<strong id="accountPlan">—</strong>',1)
t=t.replace('<strong>— / — / —</strong>','<strong id="accountExpiry">—</strong>')
t=t.replace('هنا يشوف المستخدم تفاصيل باقته وفواتيره وتاريخ تجديدها عندما نكمل ربط النظام.','آخر معلومات الحساب والطلبات، مع حالة ربط الجهاز.')
t=t.replace('<strong>غير متصل</strong>','<strong id="accountEmail">—</strong>')
t=t.replace('<strong>—</strong>','<strong id="lastOrder">—</strong>',1)
t=t.replace('<strong>—</strong>','<strong id="accountStart">—</strong>',1)
t=t.replace('<strong>—</strong>','<strong id="accountExpiry2">—</strong>',1)
t=t.replace('تسجيل الدخول</a></div></section>','<button id="logoutBtn" type="button" class="btn ghost">تسجيل الخروج</button><a id="adminEntry" href="admin.html" class="btn dark" hidden>لوحة الإدارة</a></div><div class="order-row"><span>الجهاز المرتبط</span><strong id="deviceStatus">—</strong></div><h3 style="margin-top:20px">آخر الطلبات</h3><div id="userOrders" class="order-list"><p class="muted">لا توجد طلبات.</p></div></section>')
t=t.replace('بعد إطلاق التطبيق سيظهر رابط تنزيل رسمي ومعلومات الإصدار في هذا القسم.','سيظهر رابط التطبيق الرسمي عند اعتماد إصدار Android.')
t=t.replace('سيتم تحديد رابط الإصدار عند الإطلاق.','لا يوجد ملف APK منشور رسميًا حتى الآن.')
t=t.replace('<button type="button" class="btn ghost full" id="downloadDemo">تنزيل التطبيق — قريبًا</button>','<button type="button" class="btn ghost full" id="downloadDemo" disabled>تنزيل التطبيق — قريبًا</button>')
fp.write_text(t)
# admin page based on shell
shell=(p/'dashboard.html').read_text()
header=shell[:shell.index('<main>')]
footer=shell[shell.index('<footer class="footer">'):]
body='''<main><div class="container"><div class="page-top"><span class="eyebrow">لوحة الإدارة</span><h1>إدارة AIM8</h1><p>إدارة المستخدمين والباقات وفك ارتباط الأجهزة — للمدير فقط.</p></div>
<div class="alert info" id="adminAlert" role="status">جاري التحقق من صلاحية المدير...</div>
<div class="account-grid"><div class="metric"><small>المستخدمون</small><strong id="statUsers">—</strong></div><div class="metric"><small>اشتراكات فعالة</small><strong id="statActive">—</strong></div><div class="metric"><small>أجهزة مرتبطة</small><strong id="statBound">—</strong></div></div>
<div class="two-cols inner-layout"><section class="glass"><h2>أسعار الباقات</h2><p>أدخل السعر بالدولار. لن تظهر الباقة للبيع إذا بقيت غير مفعلة.</p><div id="adminPlans"></div></section>
<aside class="glass"><h2>إدارة جهاز واشتراك</h2><div class="form-group"><label for="targetEmail">اختر المستخدم من القائمة</label><input id="targetEmail" type="email" readonly placeholder="انقر مستخدمًا في الجدول"></div><input id="targetId" type="hidden"><div class="form-group"><label for="adminReason">سبب الإجراء</label><input id="adminReason" maxlength="200" placeholder="مثال: تغيير هاتف بعد التحقق من العميل"></div><div class="page-actions"><button id="adminReset" class="btn ghost" type="button">فك ربط الجهاز</button></div><div class="form-group" style="margin-top:16px"><label for="adminDays">إضافة أيام يدويًا</label><input id="adminDays" type="number" min="1" max="365" value="30"></div><button class="btn full" id="adminGrant" type="button">إضافة أيام للاشتراك</button><div class="page-actions"><button type="button" id="adminBlock" class="btn dark">حظر / إلغاء حظر</button></div></aside></div>
<section class="glass" style="margin-bottom:24px"><h2>المستخدمون</h2><div class="form-group"><input id="userSearch" placeholder="بحث بالبريد أو الاسم"></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>المستخدم</th><th>الاشتراك</th><th>الجهاز</th><th>الحالة</th><th>اختيار</th></tr></thead><tbody id="adminUsers"></tbody></table></div></section>
<section class="glass" style="margin-bottom:48px"><h2>أحدث الطلبات</h2><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>الطلب</th><th>العميل</th><th>الباقة</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody id="adminOrders"></tbody></table></div></section>
</div></main>'''
(p/'admin.html').write_text(header.replace('<title>dashboard | AIM8</title>','<title>لوحة إدارة AIM8</title>').replace('data-page="dashboard"','data-page="admin"')+body+footer)
