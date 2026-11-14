// Explicit Telegram language preferences. One representative flag per language,
// never one flag for every country where the language happens to be spoken.
export const BOT_LANGUAGES=Object.freeze([
 {code:'ar',flag:'🇸🇦',name:'العربية'},
 {code:'en',flag:'🇬🇧',name:'English'},
 {code:'es',flag:'🇪🇸',name:'Español'},
 {code:'fr',flag:'🇫🇷',name:'Français'},
 {code:'de',flag:'🇩🇪',name:'Deutsch'},
 {code:'pt',flag:'🇧🇷',name:'Português'},
 {code:'tr',flag:'🇹🇷',name:'Türkçe'},
 {code:'ru',flag:'🇷🇺',name:'Русский'},
 {code:'fa',flag:'🇮🇷',name:'فارسی'},
 {code:'hi',flag:'🇮🇳',name:'हिन्दी'},
 {code:'id',flag:'🇮🇩',name:'Indonesia'},
 {code:'ur',flag:'🇵🇰',name:'اردو'}
]);
const LOCALES=new Set(BOT_LANGUAGES.map(l=>l.code));
const texts={
 ar:{
 choose:'🌍 اختَر لغة بوت AIM8 من القائمة التالية:',
 intro:'🎱 أهلاً بيك في AIM8!\nاختَر باقة للاشتراك أو استرجع كودك.',
 quarter:'3 أشهر',half:'6 أشهر',year:'سنة كاملة',
 recover:'♻️ استرجاع التفعيل',language:'🌐 تغيير اللغة',
 copy:'📋 نسخ كود التفعيل',menu:'🏠 الباقات',
 invoice:'اشتراك AIM8 لمدة {days} يوم. يصلك كود تفعيل بعد الدفع.',
 paid:'✅ تم الدفع بنجاح!',replacement:'✅ تم إصدار كود تفعيل بديل!',
 code:'🔑 كود AIM8 الخاص بك:',expiry:'⏳ آخر موعد لتفعيل الكود: {until} (بتوقيت بغداد).',
 rules:'🔐 احتفظ بكودك في مكان آمن ولا تشاركه مع أي شخص.\n📱 الكود يُستخدم مرة واحدة وعلى جهاز واحد فقط.\n♻️ إذا ضاع الكود أو غيّرت هاتفك، استخدم /recover للحصول على كود جديد.\n⏰ صلاحية الكود 24 ساعة من إصداره، وانتهاء الكود ما يلغي اشتراكك.',
 replaced:'✅ صدر كود جديد، ومدة اشتراكك باقية مثل ما هي.',
 confirm:'هل تريد إصدار كود تفعيل جديد؟ مدة اشتراكك تبقى مثل ما هي.',
 yes:'✅ نعم، إصدار كود جديد',
 noEntitlement:'لا يوجد اشتراك مدفوع صالح لاسترجاع التفعيل.',
 refund:'تم تأكيد استرجاع النجوم وإلغاء مدة هذه الدفعة. أي اشتراكات أخرى تبقى محفوظة.',
 unavailable:'هذه الباقة غير متوفرة حالياً.',
 expiredInvoice:'الفاتورة غير صالحة أو انتهت. أرسل /start لفتح الباقات من جديد.',
 selectFirst:'اختَر اللغة أولاً من القائمة.',
 unknown:'هذا الخيار غير متاح.'
 },
 en:{
 choose:'🌍 Choose your AIM8 bot language:',
 intro:'🎱 Welcome to AIM8!\nSelect a subscription plan or recover your code.',
 quarter:'3 Months',half:'6 Months',year:'1 Year',
 recover:'♻️ Recover activation',language:'🌐 Change language',
 copy:'📋 Copy activation code',menu:'🏠 Plans',
 invoice:'AIM8 subscription for {days} days. Your activation code arrives after payment.',
 paid:'✅ Payment successful!',replacement:'✅ Replacement activation code issued!',
 code:'🔑 Your AIM8 code:',expiry:'⏳ Code valid until {until} (UTC).',
 rules:'🔐 Store this code safely. Never share it with anyone.\n📱 The code works once, on one device only; activation on a second device will be denied.\n♻️ Lost your code or changed phones? Send /recover for a replacement code; the old phone will be disconnected.\n⏰ Activate within 24 hours. Code expiry does not cancel your paid subscription.',
 replaced:'The previous code and device authorization have been revoked. Your remaining subscription is unchanged.',
 confirm:'Create a replacement code? ⚠️ This immediately invalidates the previous code and disconnects the old device. Your remaining subscription stays intact.',
 yes:'✅ Yes, issue a replacement code',
 noEntitlement:'You have no valid paid subscription to recover.',
 refund:'Your Stars purchase was refunded. Only that purchase’s subscription time was revoked; other subscriptions remain.',
 unavailable:'This plan is currently unavailable.',
 expiredInvoice:'This invoice is invalid or expired. Send /start for a fresh plan menu.',
 selectFirst:'Choose your language first.',
 unknown:'This option is unavailable.'
 },
 es:{
 choose:'🌍 Elige el idioma del bot AIM8:',
 intro:'🎱 ¡Bienvenido a AIM8! Elige un plan o recupera tu código.',
 quarter:'3 meses',half:'6 meses',year:'1 año',recover:'♻️ Recuperar activación',language:'🌐 Cambiar idioma',
 copy:'📋 Copiar código',menu:'🏠 Planes',invoice:'Suscripción AIM8 de {days} días. Recibirás un código después de pagar.',
 paid:'✅ ¡Pago completado!',replacement:'✅ ¡Código de reemplazo emitido!',code:'🔑 Tu código AIM8:',expiry:'⏳ Válido hasta {until} (UTC).',
 rules:'🔐 Guarda el código y no lo compartas.\n📱 Solo se usa una vez y en un dispositivo; se rechaza un segundo dispositivo.\n♻️ Si cambias de móvil o pierdes el código, usa /recover; se desconectará el móvil anterior.\n⏰ Actívalo en 24 horas. El vencimiento del código no anula tu suscripción.',
 replaced:'El código anterior y el dispositivo antiguo se han desactivado. Conservas el tiempo restante.',
 confirm:'¿Generar un código de reemplazo? ⚠️ El código y el dispositivo anteriores se desactivarán inmediatamente sin perder tu suscripción.',
 yes:'✅ Sí, generar otro código',noEntitlement:'No tienes una suscripción válida para recuperar.',
 refund:'Pago reembolsado. Solo se revocó el tiempo de esa compra.',
 unavailable:'Este plan no está disponible.',expiredInvoice:'Factura vencida. Envía /start.',selectFirst:'Elige primero el idioma.',unknown:'Opción no disponible.'
 },
 fr:{
 choose:'🌍 Choisissez la langue du bot AIM8 :',
 intro:'🎱 Bienvenue sur AIM8 ! Choisissez une offre ou récupérez votre code.',
 quarter:'3 mois',half:'6 mois',year:'1 an',recover:'♻️ Récupérer le code',language:'🌐 Changer de langue',
 copy:'📋 Copier le code',menu:'🏠 Offres',invoice:'Abonnement AIM8 de {days} jours. Un code sera envoyé après paiement.',
 paid:'✅ Paiement effectué !',replacement:'✅ Nouveau code de remplacement créé !',code:'🔑 Votre code AIM8 :',expiry:'⏳ Valable jusqu’au {until} (UTC).',
 rules:'🔐 Conservez votre code en lieu sûr, ne le partagez jamais.\n📱 Usage unique sur un seul appareil ; un deuxième appareil sera refusé.\n♻️ Code perdu ou nouveau téléphone ? Envoyez /recover ; l’ancien téléphone sera déconnecté.\n⏰ Activez-le sous 24 h. La fin de validité du code n’annule pas l’abonnement.',
 replaced:'Ancien code et ancien appareil révoqués. Votre durée restante est conservée.',
 confirm:'Créer un code de remplacement ? ⚠️ L’ancien code et l’ancien appareil seront désactivés immédiatement, sans perte de durée.',
 yes:'✅ Oui, créer un nouveau code',noEntitlement:'Aucun abonnement payé valide à récupérer.',
 refund:'Paiement remboursé. Seule la durée de cet achat a été retirée.',
 unavailable:'Offre indisponible.',expiredInvoice:'Facture expirée. Envoyez /start.',selectFirst:'Choisissez d’abord une langue.',unknown:'Option indisponible.'
 },
 de:{
 choose:'🌍 Wähle die Sprache des AIM8-Bots:',
 intro:'🎱 Willkommen bei AIM8! Wähle ein Abo oder stelle deinen Code wieder her.',
 quarter:'3 Monate',half:'6 Monate',year:'1 Jahr',recover:'♻️ Aktivierung wiederherstellen',language:'🌐 Sprache ändern',
 copy:'📋 Code kopieren',menu:'🏠 Abos',invoice:'AIM8-Abo für {days} Tage. Nach der Zahlung erhältst du einen Code.',
 paid:'✅ Zahlung erfolgreich!',replacement:'✅ Neuer Ersatzcode erstellt!',code:'🔑 Dein AIM8-Code:',expiry:'⏳ Gültig bis {until} (UTC).',
 rules:'🔐 Bewahre den Code sicher auf und gib ihn nicht weiter.\n📱 Einmalig und nur auf einem Gerät nutzbar; ein zweites Gerät wird abgelehnt.\n♻️ Bei Handywechsel oder Codeverlust: /recover für einen neuen Code; das alte Handy wird getrennt.\n⏰ Innerhalb von 24 Stunden aktivieren. Ein abgelaufener Code beendet nicht das bezahlte Abo.',
 replaced:'Alter Code und altes Gerät sind gesperrt. Die Restlaufzeit bleibt erhalten.',
 confirm:'Neuen Ersatzcode erstellen? ⚠️ Alter Code und altes Gerät werden sofort deaktiviert; die Restlaufzeit bleibt.',
 yes:'✅ Ja, neuen Code erstellen',noEntitlement:'Kein gültiges bezahltes Abo vorhanden.',
 refund:'Zahlung erstattet. Nur die Laufzeit dieses Kaufs wurde entzogen.',
 unavailable:'Abo derzeit nicht verfügbar.',expiredInvoice:'Rechnung abgelaufen. Sende /start.',selectFirst:'Wähle zuerst deine Sprache.',unknown:'Option nicht verfügbar.'
 },
 pt:{
 choose:'🌍 Escolha o idioma do bot AIM8:',
 intro:'🎱 Bem-vindo ao AIM8! Escolha um plano ou recupere seu código.',
 quarter:'3 meses',half:'6 meses',year:'1 ano',recover:'♻️ Recuperar ativação',language:'🌐 Mudar idioma',
 copy:'📋 Copiar código',menu:'🏠 Planos',invoice:'Assinatura AIM8 por {days} dias. O código chega após o pagamento.',
 paid:'✅ Pagamento aprovado!',replacement:'✅ Novo código de substituição emitido!',code:'🔑 Seu código AIM8:',expiry:'⏳ Válido até {until} (UTC).',
 rules:'🔐 Guarde o código com segurança. Não compartilhe.\n📱 Uso único em apenas um dispositivo; um segundo aparelho será recusado.\n♻️ Perdeu o código ou trocou de celular? Use /recover; o celular antigo será desconectado.\n⏰ Ative em 24 horas. O vencimento do código não cancela sua assinatura.',
 replaced:'Código e aparelho antigos invalidados. Seu prazo restante foi preservado.',
 confirm:'Criar um código de substituição? ⚠️ O código e aparelho antigos serão desativados agora, sem perder o prazo.',
 yes:'✅ Sim, criar outro código',noEntitlement:'Nenhuma assinatura paga válida para recuperar.',
 refund:'Pagamento reembolsado. Apenas o período desta compra foi retirado.',
 unavailable:'Plano indisponível.',expiredInvoice:'Fatura expirada. Envie /start.',selectFirst:'Escolha o idioma primeiro.',unknown:'Opção indisponível.'
 },
 tr:{
 choose:'🌍 AIM8 bot dilini seçin:',
 intro:'🎱 AIM8’e hoş geldiniz! Paket seçin veya kodunuzu yenileyin.',
 quarter:'3 Ay',half:'6 Ay',year:'1 Yıl',recover:'♻️ Aktivasyonu yenile',language:'🌐 Dili değiştir',
 copy:'📋 Kodu kopyala',menu:'🏠 Paketler',invoice:'{days} günlük AIM8 aboneliği. Ödeme sonrası kod gönderilir.',
 paid:'✅ Ödeme başarılı!',replacement:'✅ Yeni kod oluşturuldu!',code:'🔑 AIM8 kodunuz:',expiry:'⏳ Son kullanım: {until} (UTC).',
 rules:'🔐 Kodu güvenle saklayın ve kimseyle paylaşmayın.\n📱 Kod tek kullanımlıktır ve yalnızca bir cihaz içindir; ikinci cihaz reddedilir.\n♻️ Telefon değişirse veya kod kaybolursa /recover ile yeni kod alın; eski telefon ayrılır.\n⏰ 24 saat içinde etkinleştirin. Kodun süresi dolunca ücretli abonelik iptal olmaz.',
 replaced:'Eski kod ve cihaz iptal edildi. Kalan abonelik süreniz korundu.',
 confirm:'Yeni kod oluşturulsun mu? ⚠️ Eski kod ve cihaz anında devre dışı kalır; süreniz korunur.',
 yes:'✅ Evet, yeni kod oluştur',noEntitlement:'Yenilenebilecek geçerli ücretli abonelik yok.',
 refund:'Ödeme iade edildi. Yalnızca bu alışverişin süresi iptal edildi.',
 unavailable:'Paket şu an kullanılamıyor.',expiredInvoice:'Fatura süresi doldu. /start yazın.',selectFirst:'Önce dil seçin.',unknown:'Geçersiz seçenek.'
 },
 ru:{
 choose:'🌍 Выберите язык бота AIM8:',
 intro:'🎱 Добро пожаловать в AIM8! Выберите подписку или восстановите код.',
 quarter:'3 месяца',half:'6 месяцев',year:'1 год',recover:'♻️ Восстановить активацию',language:'🌐 Сменить язык',
 copy:'📋 Скопировать код',menu:'🏠 Подписки',invoice:'Подписка AIM8 на {days} дней. Код придёт после оплаты.',
 paid:'✅ Оплата прошла!',replacement:'✅ Новый код создан!',code:'🔑 Ваш код AIM8:',expiry:'⏳ Действителен до {until} (UTC).',
 rules:'🔐 Сохраните код и никому его не передавайте.\n📱 Код одноразовый и рассчитан на одно устройство; второе устройство будет отклонено.\n♻️ Сменили телефон или потеряли код? Отправьте /recover; старый телефон отключится.\n⏰ Активируйте в течение 24 часов. Истечение кода не отменяет оплаченную подписку.',
 replaced:'Старый код и устройство отключены. Срок подписки сохранён.',
 confirm:'Создать новый код? ⚠️ Старый код и устройство будут отключены сразу; подписка сохранится.',
 yes:'✅ Да, создать новый код',noEntitlement:'Нет действующей оплаченной подписки.',
 refund:'Платёж возвращён. Отменён только срок этой покупки.',
 unavailable:'Подписка недоступна.',expiredInvoice:'Счёт истёк. Отправьте /start.',selectFirst:'Сначала выберите язык.',unknown:'Вариант недоступен.'
 },
 fa:{
 choose:'🌍 زبان ربات AIM8 را انتخاب کنید:',
 intro:'🎱 به AIM8 خوش آمدید! بسته را انتخاب کنید یا کد خود را بازیابی کنید.',
 quarter:'۳ ماه',half:'۶ ماه',year:'۱ سال',recover:'♻️ بازیابی کد فعال‌سازی',language:'🌐 تغییر زبان',
 copy:'📋 کپی کد فعال‌سازی',menu:'🏠 بسته‌ها',invoice:'اشتراک AIM8 برای {days} روز. کد پس از پرداخت ارسال می‌شود.',
 paid:'✅ پرداخت موفق!',replacement:'✅ کد جایگزین صادر شد!',code:'🔑 کد AIM8 شما:',expiry:'⏳ معتبر تا {until} (UTC).',
 rules:'🔐 کد را در جای امن نگه دارید و به کسی ندهید.\n📱 کد یک‌بارمصرف و فقط برای یک دستگاه است؛ دستگاه دوم رد می‌شود.\n♻️ برای تعویض گوشی یا گم‌شدن کد، /recover را بفرستید تا کد جدید بگیرید؛ گوشی قبلی قطع می‌شود.\n⏰ کد را ظرف ۲۴ ساعت فعال کنید. پایان اعتبار کد، اشتراک خریداری‌شده را لغو نمی‌کند.',
 replaced:'کد قبلی باطل و دستگاه قبلی قطع شد. مدت باقی‌مانده اشتراک حفظ شد.',
 confirm:'کد جدید صادر شود؟ ⚠️ کد و دستگاه قبلی فوراً غیرفعال می‌شوند؛ مدت اشتراک حفظ می‌شود.',
 yes:'✅ بله، کد جدید صادر شود',noEntitlement:'اشتراک پرداخت‌شده معتبر برای بازیابی ندارید.',
 refund:'پرداخت بازگردانده شد. فقط مدت همین خرید لغو شد.',
 unavailable:'این بسته فعلاً موجود نیست.',expiredInvoice:'صورت‌حساب منقضی شده؛ /start را بفرستید.',selectFirst:'ابتدا زبان را انتخاب کنید.',unknown:'گزینه نامعتبر.'
 },
 hi:{
 choose:'🌍 AIM8 बॉट की भाषा चुनें:',
 intro:'🎱 AIM8 में आपका स्वागत है! प्लान चुनें या अपना कोड दोबारा पाएँ।',
 quarter:'3 महीने',half:'6 महीने',year:'1 साल',recover:'♻️ सक्रियण कोड दोबारा पाएँ',language:'🌐 भाषा बदलें',
 copy:'📋 कोड कॉपी करें',menu:'🏠 प्लान',invoice:'{days} दिनों का AIM8 सब्सक्रिप्शन। भुगतान के बाद कोड मिलेगा।',
 paid:'✅ भुगतान सफल!',replacement:'✅ नया कोड जारी हुआ!',code:'🔑 आपका AIM8 कोड:',expiry:'⏳ {until} (UTC) तक मान्य।',
 rules:'🔐 कोड सुरक्षित रखें और किसी को न दें।\n📱 कोड एक बार, केवल एक डिवाइस पर काम करता है; दूसरा डिवाइस अस्वीकार होगा।\n♻️ फोन बदलने या कोड खोने पर /recover से नया कोड लें; पुराना फोन डिस्कनेक्ट होगा।\n⏰ 24 घंटे में सक्रिय करें। कोड समाप्त होने से खरीदी गई सदस्यता नहीं हटती।',
 replaced:'पुराना कोड रद्द और पुराना फोन डिस्कनेक्ट कर दिया गया। बचा हुआ समय सुरक्षित है।',
 confirm:'नया कोड बनाएँ? ⚠️ पुराना कोड और डिवाइस तुरंत बंद होंगे; सदस्यता का समय वही रहेगा।',
 yes:'✅ हाँ, नया कोड बनाएँ',noEntitlement:'रिकवरी के लिए कोई मान्य भुगतान वाली सदस्यता नहीं है।',
 refund:'भुगतान वापस हुआ। सिर्फ इसी खरीद का समय हटाया गया।',
 unavailable:'प्लान उपलब्ध नहीं है।',expiredInvoice:'इनवॉइस समाप्त है। /start भेजें।',selectFirst:'पहले भाषा चुनें।',unknown:'विकल्प उपलब्ध नहीं है।'
 },
 id:{
 choose:'🌍 Pilih bahasa bot AIM8:',
 intro:'🎱 Selamat datang di AIM8! Pilih paket atau pulihkan kode Anda.',
 quarter:'3 Bulan',half:'6 Bulan',year:'1 Tahun',recover:'♻️ Pulihkan kode aktivasi',language:'🌐 Ganti bahasa',
 copy:'📋 Salin kode',menu:'🏠 Paket',invoice:'Langganan AIM8 selama {days} hari. Kode dikirim setelah pembayaran.',
 paid:'✅ Pembayaran berhasil!',replacement:'✅ Kode pengganti diterbitkan!',code:'🔑 Kode AIM8 Anda:',expiry:'⏳ Berlaku hingga {until} (UTC).',
 rules:'🔐 Simpan kode dengan aman, jangan bagikan kepada siapa pun.\n📱 Kode hanya sekali pakai untuk satu perangkat; perangkat kedua akan ditolak.\n♻️ Ganti ponsel atau kehilangan kode? Kirim /recover untuk kode baru; perangkat lama terputus.\n⏰ Aktifkan dalam 24 jam. Kedaluwarsa kode tidak membatalkan langganan.',
 replaced:'Kode dan perangkat lama dinonaktifkan. Sisa langganan tetap berlaku.',
 confirm:'Buat kode pengganti? ⚠️ Kode dan perangkat lama akan langsung dinonaktifkan, tanpa mengurangi masa langganan.',
 yes:'✅ Ya, buat kode baru',noEntitlement:'Tidak ada langganan berbayar yang valid untuk dipulihkan.',
 refund:'Pembayaran dikembalikan. Hanya masa pembelian ini yang dibatalkan.',
 unavailable:'Paket tidak tersedia.',expiredInvoice:'Tagihan kedaluwarsa. Kirim /start.',selectFirst:'Pilih bahasa dahulu.',unknown:'Opsi tidak tersedia.'
 },
 ur:{
 choose:'🌍 AIM8 بوٹ کی زبان منتخب کریں:',
 intro:'🎱 AIM8 میں خوش آمدید! پیکیج منتخب کریں یا اپنا کوڈ واپس حاصل کریں۔',
 quarter:'۳ ماہ',half:'۶ ماہ',year:'۱ سال',recover:'♻️ فعال سازی کوڈ واپس حاصل کریں',language:'🌐 زبان بدلیں',
 copy:'📋 کوڈ کاپی کریں',menu:'🏠 پیکیجز',invoice:'AIM8 کی {days} دن کی سبسکرپشن۔ ادائیگی کے بعد کوڈ ملے گا۔',
 paid:'✅ ادائیگی کامیاب!',replacement:'✅ نیا کوڈ جاری ہوگیا!',code:'🔑 آپ کا AIM8 کوڈ:',expiry:'⏳ {until} (UTC) تک کارآمد۔',
 rules:'🔐 کوڈ محفوظ رکھیں اور کسی کو نہ دیں۔\n📱 کوڈ صرف ایک بار اور ایک ہی ڈیوائس پر استعمال ہوگا؛ دوسری ڈیوائس مسترد ہوگی۔\n♻️ فون بدلنے یا کوڈ کھونے پر /recover بھیجیں، نیا کوڈ ملے گا اور پرانا فون منقطع ہوگا۔\n⏰ ۲۴ گھنٹے میں فعال کریں۔ کوڈ کی میعاد ختم ہونے سے خریدی گئی سبسکرپشن ختم نہیں ہوتی۔',
 replaced:'پرانا کوڈ اور ڈیوائس منسوخ ہوگئے۔ باقی مدت محفوظ ہے۔',
 confirm:'نیا کوڈ بنائیں؟ ⚠️ پرانا کوڈ اور فون فوراً بند ہوں گے، مدت برقرار رہے گی۔',
 yes:'✅ ہاں، نیا کوڈ بنائیں',noEntitlement:'بحالی کے لیے کوئی درست ادا شدہ سبسکرپشن نہیں۔',
 refund:'رقم واپس ہوگئی۔ صرف اس خریداری کی مدت منسوخ ہوئی۔',
 unavailable:'یہ پیکیج دستیاب نہیں۔',expiredInvoice:'انوائس کی مدت ختم ہوگئی۔ /start بھیجیں۔',selectFirst:'پہلے زبان منتخب کریں۔',unknown:'آپشن دستیاب نہیں۔'
 }
};
const langTable=`CREATE TABLE IF NOT EXISTS telegram_language_preferences (
 telegram_user_id TEXT PRIMARY KEY,
 language_code TEXT NOT NULL,
 updated_at INTEGER NOT NULL
)`;
export async function getBotLanguage(env,telegramUserId){
 await env.DB.prepare(langTable).run();
 const row=await env.DB.prepare('SELECT language_code FROM telegram_language_preferences WHERE telegram_user_id=?')
  .bind(String(telegramUserId)).first();
 return LOCALES.has(row?.language_code)?row.language_code:null;
}
export async function setBotLanguage(env,telegramUserId,code){
 if(!LOCALES.has(code))throw Error('Unsupported language');
 await env.DB.prepare(langTable).run();
 await env.DB.prepare(`INSERT INTO telegram_language_preferences(telegram_user_id,language_code,updated_at)
 VALUES(?,?,?) ON CONFLICT(telegram_user_id) DO UPDATE SET
 language_code=excluded.language_code,updated_at=excluded.updated_at`)
  .bind(String(telegramUserId),code,Math.floor(Date.now()/1000)).run();
}
export function languagePicker(){
 const buttons=BOT_LANGUAGES.map(l=>({text:l.flag+' '+l.name,callback_data:'lang:'+l.code}));
 const rows=[];for(let i=0;i<buttons.length;i+=2)rows.push(buttons.slice(i,i+2));
 return {inline_keyboard:rows};
}
export function t(lang,key,vars={}){
 const template=(texts[lang]||texts.en)[key]||texts.en[key];
 if(typeof template!=='string')throw Error('Unknown bot translation '+key);
 return template.replace(/\{([a-z]+)\}/g,(_,key)=>String(vars[key]??''));
}
export function planLabel(lang,planId){return t(lang,planId);}
export function codeKeyboard(lang,code){
 return {inline_keyboard:[[{text:t(lang,'copy'),copy_text:{text:code}}]]};
}
