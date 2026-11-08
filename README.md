# AIM8 — الموقع ونظام الحسابات (Cloudflare + GitHub + D1)

**الموقع المستهدف:** `https://aim8.site`  
**الإصدار:** 1.0 — كود قابل للنشر **وليس موقعًا منشورًا أو متجرًا جاهزًا لاستقبال أموال حقيقية**.  
**التقنيات:** HTML/CSS/JavaScript + Cloudflare Pages Functions (JavaScript) + Cloudflare D1 (SQLite) + OxaPay Merchant Invoice API.

## الملفات

| الملف/المجلد | الوظيفة |
|---|---|
| `public/` | صفحات الواجهة، CSS/JS، السياسات، الصفحات الرئيسية واللوحات |
| `functions/api/[[path]].js` | جميع مسارات API التي تعمل على Cloudflare Pages Functions |
| `functions/_lib/` | تسجيل الدخول، إدارة الاشتراكات، الدفع، إدارة الأجهزة والمستخدمين |
| `db/schema.sql` | جداول D1 والباقات الافتراضية، مع قاعدة تمديد الاشتراك مرة واحدة |
| `tests/site.test.mjs` | اختبارات الدخول والجهاز الواحد والشراء والإشعار المكرر والدعم |
| `docs/` | تعليمات Cloudflare وGitHub ودمج تطبيق Android |
| `.env.example` | أسماء الإعدادات المطلوبة — ليست مفاتيح حقيقية |

## الصفحات

- `/index.html` — الرئيسية، الميزات، معاينة تفاعلية، الاشتراكات والأسئلة.
- `/auth.html` — التسجيل والدخول بحساب حقيقي **بعد نشر API وربط D1**.
- `/checkout.html?plan=week|month|quarter` — عرض الباقة وبدء الفاتورة إن كانت مفعّلة.
- `/dashboard.html` — حالة الاشتراك، تاريخ الانتهاء، الجهاز، أحدث الطلبات.
- `/admin.html` — للمدير فقط: تغيير أسعار الباقات، تفعيلها، المستخدمون، فك ربط جهاز، إضافة أيام، الحظر.
- `/support.html` — مركز دعم وتذاكر يُظهر رد الإدارة داخل حساب المستخدم.
- `/terms.html`, `/privacy.html`, `/refunds.html` — **مسودات** يجب اعتمادها قبل البيع الحقيقي.

## تنبيه مهم عن نظام الجهاز الواحد

**أول مفتاح تشفير مسجل من تطبيق Android** يحتفظ بالحق في استخدام الحساب. جهاز ثانٍ بمفتاح مختلف يُرفض دون إلغاء الجهاز الأول. المتصفح لا يحجز جهاز Android، ويستطيع المستخدم الدخول إلى الموقع من متصفح آخر. مفتاح الجهاز الخاص يُنشأ ويحفظ **داخل Android Keystore** وليس في الموقع.

هذا المشروع يوفر خادم الـAPI والتحقق، لكنه **لا يعدّل تطبيق Android الحالي تلقائيًا**؛ يجب إدماج استدعاءات الـAPI في التطبيق، كما في `docs/ANDROID-INTEGRATION.md`. لا يوجد ضمان مطلق ضد التحايل على أجهزة مكسورة الحماية؛ ويمكن إضافة Android Play Integrity لاحقًا.

## بداية سريعة: GitHub + Cloudflare

1. المستودع موجود مسبقًا على [vipzero2/game8t](https://github.com/vipzero2/game8t) وهو **Public** حاليًا؛ يفضّل تغييره إلى **Private** من Settings → General → Danger Zone → Change repository visibility، ثم ارفع **كل محتويات هذا المجلد** إلى جذر المستودع (أو استخدم Git؛ انظر أدناه). **لا ترفع مفاتيح حقيقية أو `.dev.vars` أو `.env`.**
2. افتح [Cloudflare](https://dash.cloudflare.com/) → Workers & Pages → Create → Pages → Connect to Git. امنح Cloudflare وصولًا لهذا المستودع وحده، اختر `main`.
3. إعدادات البناء: **Framework preset: None**؛ **Build command: اتركه فارغًا**؛ **Build output directory: `public`**؛ **Root directory: اتركه فارغًا (جذر المستودع)**. أنشئ المشروع.
4. من Cloudflare → D1 SQL Database أنشئ قاعدة `aim8-db`.
5. من مشروع Pages → Settings → Bindings → Add → D1 database، اربط `aim8-db` باسم متغير **`DB`** حرفيًا. كرر للـPreview إذا أردت اختباره. أعد نشر المشروع بعد إضافة الربط.
6. في جهازك ثبّت [Node.js LTS](https://nodejs.org/en) وافتح PowerShell داخل مجلد المشروع ثم نفّذ:

   ```powershell
   npm install
   npx wrangler login
   npx wrangler d1 execute aim8-db --remote --file=./db/schema.sql
   ```

   الأمر الأخير يُنفذ الجداول والباقات على **قاعدة الإنتاج**. نفّذه **مرة واحدة** عند بدء المشروع؛ التحديثات اللاحقة تحتاج مراجعة SQL قبل تشغيلها. يمكن أيضًا استخدام لوحة D1 وإدخال `db/schema.sql` إذا كانت الواجهة تدعم تنفيذ النص الكامل.
7. من Pages → Settings → Variables and Secrets أضف `SESSION_SECRET` كـ **Secret** عشوائي طويل (مثلاً 48 بايت عشوائية في Hex). لتوليد القيمة من PowerShell:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   وأضف **`PAYMENTS_ENABLED=false`** كمتغير نصي، **`OXAPAY_SANDBOX=true`** للاختبار. أعد النشر.
8. افتح رابط `*.pages.dev` الخاص بمشروعك؛ جرّب `https://YOUR-PROJECT.pages.dev/api/config`. يجب أن يعرض `"ok": true` و3 باقات (غير مفعلة).
9. أضف النطاق `aim8.site`: Cloudflare → Add domain (إذا غير مضاف) → احصل على Nameservers من Cloudflare → استبدلها عند شركة شراء الدومين. من Pages → Custom domains → Add domain → `aim8.site` واتبع تعليمات Cloudflare الخاصة بسجلات DNS. فعّل HTTPS.
10. بعد أن يعمل الموقع، أنشئ حسابك الشخصي من `auth.html` ثم تحقّق منه يدويًا. **بعد التأكد أنه حسابك أنت فقط**، نفّذ الأمر التالي مع بريدك الحقيقي:

   ```powershell
   npx wrangler d1 execute aim8-db --remote --command "UPDATE users SET role='admin' WHERE email='YOUR_EMAIL@example.com';"
   ```

   سجّل خروجًا ثم ادخل مجددًا وافتح `/admin.html`. **لا تمنح صلاحية admin لبريد لم تتحقق من ملكيته**؛ التحقق من البريد آليًا ليس مدمجًا بعد.

## تغيير الأسعار وربط OxaPay

- الباقات الثلاث أسعارها الافتراضية `0` وهي **غير مفعّلة** عمدًا؛ عيّن الأسعار من `/admin.html`.
- اطلب Merchant API Key من لوحة OxaPay وتأكد من أهلية نشاطك وشروطهم. **لا ترسل المفتاح عبر المحادثات العامة ولا تضفه إلى GitHub.**
- أضف `OXAPAY_MERCHANT_KEY` كـ Cloudflare **Secret**.
- ابدأ بـ `OXAPAY_SANDBOX=true`، وبعد نجاح الاختبارات والتأكد من السياسات فعّل `PAYMENTS_ENABLED=true` لاختبار إنشاء الفواتير.
- عند الإطلاق الحقيقي: `OXAPAY_SANDBOX=false` ثم `PAYMENTS_ENABLED=true` بعد اختبار شامل وحماية الحسابات ومراجعة السياسات.
- رابط Webhook الذي يرسله النظام تلقائيًا: `https://aim8.site/api/payments/webhook`.
- التفعيل يتم **فقط** بعد توقيع HMAC-SHA512 الصحيح للإشعار، وبعد استعلام تأكيدي من OxaPay عن رقم الفاتورة والطلب والعملة والمبلغ والحالة؛ نقرة المستخدم على رابط العودة ليست إثباتًا للدفع.

> قبل أي بيع حقيقي: يلزم إضافة تحقق من ملكية البريد واستعادة كلمات المرور، ووسيلة دعم موثوقة، واعتماد سياسات الخصوصية والاسترجاع والشروط، واختبار OxaPay الفعلي، وتحديد معلومات تشغيل النشاط القانوني. الأفضل أيضًا تفعيل Cloudflare Turnstile لحماية التسجيل من الروبوتات وإجراء مراجعة أمنية.

## Git — بديل رفع الملفات اليدوي

```powershell
cd path\to\aim8-complete
git init
git add .
git commit -m "AIM8 website and backend v1"
git branch -M main
git remote add origin https://github.com/vipzero2/game8t.git
git push -u origin main
```

## اختبار محلي

```powershell
npm install
npm run check
```

اختبارات المشروع تعمل على Node 22+ بسبب استخدام اختبار SQLite المدمج. لفتح الواجهة فقط: `python -m http.server 8000 --directory public`، لكن الـAPI لن يعمل مع هذه الطريقة. لتشغيل الـAPI محليًا باستخدام Wrangler تحتاج إعداد ربط D1 محلي (قاعدة تجريبية)، ويمكنك استخدام:

```powershell
npx wrangler pages dev public --d1 DB=YOUR_D1_DATABASE_ID
```

أنشئ الجداول في قاعدة D1 المحلية قبل تجربة الحسابات. لا تستخدم مفتاح إنتاج OxaPay في التطوير المحلي. **Cloudflare Pages Functions تتطلب Git Integration أو Wrangler CLI؛ رفع ZIP من لوحة Direct Upload لا ينشر `/functions` الخلفية.**

## حدود الخطة المجانية — انتبه

- D1 مجاني بحد إجمالي 5 GB لكل الحساب على Free، لكن الحد **500 MB لكل قاعدة D1 منفردة**.
- Cloudflare Pages Functions تدخل ضمن حدود Workers Free: **100,000 طلب يوميًا و10 ms CPU لكل استدعاء**. عمليات اشتقاق كلمة المرور القوية (PBKDF2) قد تتجاوز حد CPU في بعض الحالات، لذا اختبر التسجيل والدخول فعليًا على Pages قبل إطلاق الموقع. لا تقلل قوة التجزئة عشوائيًا لتجاوز الحد؛ قد تحتاج Workers Paid (ابتداءً من $5 شهريًا) أو مزوّد مصادقة مُدار. الرسوم الأخرى مثل OxaPay منفصلة.

## ما لم يُنفَّذ بعد

- النشر الفعلي على حسابيك GitHub/Cloudflare لم يحدث (تحتاج أن تربط الحسابات بنفسك).
- دمج الـAPI داخل تطبيق Android الحالي، وإنشاء نسخة APK نهائية ورابط تحميل رسمي.
- التحقق من البريد، استرجاع كلمات المرور برسائل البريد، أداة مكافحة السبام المتقدمة، إعداد خدمة دعم، السياسات القانونية النهائية.
- الاعتماد الفعلي من بوابة OxaPay؛ الدفع مغلق تلقائيًا.

هذه نسخة برمجية متكاملة للبداية، وليست ادعاء بأن الخدمة آمنة للإطلاق التجاري دون مراجعة واختبارات إنتاجية.
