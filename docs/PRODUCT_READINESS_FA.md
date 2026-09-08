# وضعیت آمادگی محصول PhysioAI

آخرین به‌روزرسانی: ۷ شهریور ۱۴۰۵ (29 August 2026)

## نتیجه اجرایی

نسخه فعلی از یک دموی صرف عبور کرده است: مسیر واقعی Supabase برای بیمار، اپیزود،
case، safety screen، برنامه درمان نسخه‌بندی‌شده، نسخه تمرینی قابل انتشار، پرتال
خانوادگی، inbox درمانگر و draft اختیاری OpenAI در کد وجود دارد و تست می‌شود. با
این حال هنوز برای **ورود داده واقعی یا فروش عمومی آماده نیست**؛ زیرساخت واقعی،
اعتبارسنجی بالینی، اعلان و escalation عملیاتی، احراز هویت production، الزامات
حقوقی/حریم خصوصی و آزمون مستقل کامل نشده‌اند.

تحلیل عکس واقعی وجود ندارد و AI اجازه تشخیص، clearance، publish یا تصمیم درمانی
خودکار ندارد. تا پیش از عبور همه دروازه‌های این سند نباید ادعای «تشخیص»، «تحلیل
هوشمند عکس» یا «توصیه درمانی خودکار» در فروش مطرح شود.

## علائم وضعیت

- `[x]` در کد این شاخه تکمیل و با تست خودکار بررسی شده است.
- `[~]` بخشی تکمیل شده یا برای نهایی‌شدن به زیرساخت/تأیید بیرونی نیاز دارد.
- `[ ]` هنوز مانع انتشار است.

## snapshot همگام‌سازی مخزن و استقرار

- release candidate این ممیزی باید فقط از شاخه
  `codex/physioai-release-hardening-20260829` و Draft PR متناظر ارزیابی شود؛ تا
  پیش از merge، `origin/main` و Production عمداً نسخه قدیمی می‌مانند.
- پروژه Vercel محلی به `omidmed-platform` لینک است و دامنه production پاسخ می‌دهد،
  ولی مسیرهای جدید `/patients`، `/tickets`، `/clinical-records` و worker اعلان در
  بررسی ۷ شهریور ۱۴۰۵ همگی `404` بودند؛ پس deployment فعلی نسخه این workspace نیست.
- `.env.local` فعلی فقط mock mode را تنظیم می‌کند و اتصال Supabase واقعی در این
  workspace وجود ندارد. وضعیت Auth/RLS واقعی باید روی staging جداگانه آزموده شود.

## فاز ۰ — توقف ریسک‌های فوری

- [x] production در نبود تنظیمات Supabase دیگر بی‌صدا وارد mock mode نمی‌شود.
- [x] مسیر `/patient-education` دیگر با `/patient` اشتباه گرفته نمی‌شود.
- [x] ورود فضای درمانگر فقط با نقش صریح مجاز است و profile نامعتبر fail-closed است.
- [x] race خروج/تعویض حساب در state پرونده و بیمار مهار شده است.
- [x] refresh و اعتبارسنجی session در proxy واقعاً اجرا می‌شود.
- [x] انتخاب تصادفی کلینیک حذف و active clinic اجباری شده است.
- [x] query پرونده‌ها به active clinic محدود شده است.
- [x] security headers و `private, no-store` برای داده‌های بالینی افزوده شده است.
- [x] وابستگی‌های production به‌روزرسانی و audit production بدون آسیب‌پذیری است.
- [x] ثبت پیشرفت فقط پس از موفقیت write به بیمار موفقیت نشان می‌دهد.
- [x] تاریخ «امروز» از timezone محلی و نه UTC ساخته می‌شود.

## فاز ۱ — هسته ایمنی بالینی

- [x] مدل وضعیت ایمنی `not-screened / clear / medical-review / urgent / emergency` ساخته شده است.
- [x] intake بدون تکمیل صریح غربالگری علائم خطر ذخیره نمی‌شود.
- [x] نتیجه سبز پیش از تکمیل چک‌لیست نمایش داده نمی‌شود.
- [x] planner و patient education بدون safety clearance خروجی تولید نمی‌کنند.
- [x] ورودی‌های procedure، تاریخ، precautions، loading و protocol برای post-op اجباری است.
- [x] detector هشدار مکمل برای فارسی، انگلیسی و عربی و negationهای رایج افزوده شده است.
- [x] chat و ticket برای علائم emergency/urgent صریحاً می‌گویند منتظر برنامه نمانید.
- [x] تحلیل پاسچر ساختگی به‌صورت پیش‌فرض خاموش و confidence جعلی حذف شده است.
- [x] sandbox پاسچر، در صورت فعال‌سازی داخلی، صریحاً ثابت و غیر بالینی معرفی می‌شود.
- [x] ۱۵۷ تست واحد فعلی شامل ماتریس چندزبانه safety، negation/history، route،
  gateهای planner/education، schema و quota/minimization AI پاس می‌شوند.
- [ ] مجموعه تست clinician-adjudicated با نمونه‌های واقعی سه زبان، غلط املایی، negation و edge case ساخته شود.
- [ ] مسئول پزشکی مستقل قواعد escalation و متن همه هشدارها را امضا کند.

## فاز ۲ — امنیت و دیتابیس واقعی

- [x] migrationهای `001 → 020` در PostgreSQL 17 موقت از صفر اجرا، migrationهای
  `004 → 020` مجدداً اجرا، تست امنیتی در هر دو حالت پاس و seed نهایی دو بار با
  schema واقعی تأیید شده است.
- [x] تست خودکار rollback‌شونده برای دو کلینیک، owner/therapist/staff/patient/
  platform_admin، self-link، PHI، RPC، cross-tenant، برنامه درمان، نسخه تمرینی،
  رزرو/quota و بازبینی AI پاس می‌شود.
- [ ] از دیتابیس مقصد backup گرفته و restore آن عملاً آزموده شود؛ `001` فقط روی
  دیتابیس تازه اجرا شود و روی staging/production موجود فقط migrationهای ثبت‌شده
  و اعمال‌نشده تا `020` اجرا شوند.
- [ ] پروژه Supabase واقعی staging فعال و به workspace متصل شود؛ تنظیم محلی فعلی
  فقط mock است و برای تأیید Auth/RLS واقعی کافی نیست.
- [ ] نسخه فعلی کد پس از review/commit باید روی Vercel staging مستقر و متغیرهای
  production جداگانه تأیید شوند؛ deployment موجود مسیرهای جدید را ندارد و نباید
  داده واقعی دریافت کند.
- [~] password recovery، session refresh و invitation مالک‌محور با rate-limit،
  consent/authority attestation، expiry و revoke فوری در کد وجود دارد؛ email
  verification اجباری، MFA درمانگران و مدیریت device/session production کامل شود.
- [ ] national ID و داده‌های شناسایی با masking، encryption/hashed lookup و سیاست
  retention پیاده شوند.
- [ ] backup/restore عملی آزمایش و RPO/RTO مستند شود.
- [x] دسترسی ضمنی `platform_admin` به PHI حذف و حتی عضویت قدیمی کلینیک برای این
  نقش بی‌اثر شده است.
- [ ] اگر پشتیبانی بالینی break-glass لازم دارد، مسیر جداگانه زمان‌دار با دلیل،
  approval و audit طراحی شود؛ اکنون چنین مسیری وجود ندارد.

## فاز ۳ — مدل دامنه و چرخه کامل درمان

مدل هدف:

`clinic → patient → care episode → assessment → safety screen → signed plan → prescription → patient logs/tickets → review`

- [x] Patient Registry با ساخت اتمیک بیمار+اپیزود، جست‌وجو، pagination، ویرایش،
  تخصیص مجدد درمانگر، pause/resume/complete، شروع دوره بعدی، archive بدون حذف
  سابقه و دعوت/لغو حساب بیمار یا همراه با attestation و expiry ساخته شده است.
- [x] هر case جدید در حالت واقعی به `patient_id` و `episode_id` همان کلینیک متصل
  و تغییر این پیوند در دیتابیس ممنوع است؛ ردیف‌های legacy باید remediation شوند.
- [x] assessment و session note با snapshot کامل، author، زمان رخداد/ثبت، audit،
  correction/reassessment append-only و محافظت در برابر stale write نسخه‌بندی شده‌اند.
- [~] treatment plan به‌صورت append-only/versioned با ویرایش ساختاریافته draft،
  validation هم‌زمان client/database، review/approve/reject و supersede اتمیک
  ساخته شده؛ timeline کامل و UI بازکردن تمام snapshotهای تاریخی هنوز باقی است.
- [x] Prescription Builder به exercise library، برنامه درمان approved و episode
  وصل است و draft/publish/revoke اتمیک دارد.
- [x] dosage، روزهای هفته، start/end date، precautions، stop rules و review date
  ذخیره و فقط نسخه published فعلی به بیمار نمایش داده می‌شود.
- [~] outcome measureهای بازبینی‌شده با نام/نسخه، range، واحد، جهت امتیاز، تاریخ،
  author و correction append-only اضافه شده‌اند؛ نمودار روند و مجموعه ابزارهای
  تخصصی هر pathway هنوز باید با مسئول بالینی نهایی شود.
- [x] session note ساختاریافته با زمان رخداد، author، audit و correction
  append-only در UI پرونده بالینی قابل ثبت و مرور است؛ مسیرهای legacy mutable
  به حالت فقط‌خواندنی بازنشسته شده‌اند.
- [~] تاریخچه نسخه/status برنامه و نسخه تمرینی برای درمانگر قابل مشاهده است؛ دلیل
  تغییر ساختاریافته و timeline مناسب بیمار هنوز کامل نیست.

## فاز ۴ — ارتباط بیمار و درمانگر

- [x] inbox درمانگر با active clinic، unread پایدار، پاسخ/acknowledgment/closure
  اتمیک و منتسب برای owner/درمانگر تخصیص‌یافته ساخته شده است؛ staff قبل از fetch
  مسدود و direct DML در دیتابیس ممنوع است.
- [~] outbox پایدار و metadata-minimized، worker فقط‌سرور، webhook امضاشده، retry،
  attempt audit و dead-letter برای alertهای urgent/emergency پیاده و در دیتابیس
  تست شده است؛ پردازشگر واقعی email/SMS/push، قرارداد/DPA، receipt test و on-call
  هنوز باید در محیط مقصد انتخاب و عملیاتی شوند.
- [~] درد شدید و متن urgent/emergency تیکت، alert اتمیک و صف assigned-only با
  acknowledgment منتسب، resolution و resume مشروط به re-screen جدید دارند؛
  تحویل بیرون برنامه اکنون کانال webhook دارد؛ timer/SLA، مانیتور dead-letter،
  receipt و on-call fallback واقعی هنوز لازم است.
- [x] وضعیت open/acknowledged/answered/closed، priority و زمان آخرین فعالیت در
  دیتابیس ذخیره می‌شود؛ پاسخ بیمار thread را باز و پیام urgent/emergency را وارد
  صف alert می‌کند و تا resolution قابل بستن نیست.
- [~] بیمار و درمانگر thread متنی دوطرفه و پاسخ دارند؛ attachment امن، scan و retention
  فایل هنوز وجود ندارد.
- [ ] log هر تمرین جداگانه، sets/reps، درد حین تمرین و دلیل عدم انجام ثبت شود.
- [ ] reminder فقط بر اساس روزهای تجویزشده و timezone بیمار ارسال شود.
- [x] حساب خانوادگی چند بیمار را با انتخاب صریح، episode فعال قطعی و بدون
  `.limit(1)` پشتیبانی می‌کند و draft/state بین بیماران remount می‌شود.

## فاز ۵ — دستیار هوشمند واقعی

- [x] فراخوانی OpenAI فقط server-side، پیش‌فرض خاموش، با Structured Output و
  validation مجدد Zod اجرا می‌شود؛ کلید provider به مرورگر نمی‌رود.
- [~] ورودی از case ذخیره‌شده، prompt version و snapshot ممیزی‌شده ساخته و
  شناسه‌های مستقیم رایج کمینه می‌شود؛ assessment اکنون versioned است، اما شناسه
  نسخهٔ authoritative assessment هنوز در audit درخواست AI ذخیره نمی‌شود.
- [x] deterministic safety pre-check چندزبانه و post-check مستقل برای تشخیص قطعی،
  prescription عددی، abstention و medical-review اجباری است.
- [ ] پاسخ بالینی به منابع مصوب، نسخه منبع و citation قابل بازبینی متصل شود.
- [~] model، prompt version، context کمینه‌شده، hash ورودی، خروجی، usage، refusal/
  error و تصمیم accept/edit/reject audit می‌شود؛ latency و retrieval set هنوز نیست.
- [x] AI حق publish مستقیم برنامه یا تغییر پرونده ندارد و draft بدون بازبینی صریح
  درمانگر اثر بالینی ندارد.
- [x] timeout، بدون retry پنهان، abstention، رزرو idempotent، سقف دقیقه‌ای و سقف
  روزانه user/clinic و fallback امن «بدون پاسخ بالینی» پیاده شده است.
- [ ] prompt injection، data exfiltration و cross-patient context با red-team تست شود.
- [ ] معیارهای accuracy، unsafe omission، over-referral، calibration و clinician agreement تعریف شوند.
- [x] AI واقعی تا فعال‌سازی هم‌زمان gate عمومی/سرور و تصویب پردازش داده خاموش است؛
  حالت بدون آن صریحاً template/demo است و پاسچر ادعای مدل ندارد.

## فاز ۶ — محتوای تمرین و پاسچر

- [ ] همه تمرین‌ها در سه زبان محتوای کامل داشته باشند؛ هیچ نسخه‌ای بی‌صدا پنهان نشود.
- [~] شناسه تمرین نسخه فقط از catalog بازبینی‌شده پذیرفته می‌شود و محتوای دقیق
  فارسی با version داخل هر prescription snapshot می‌شود؛ media، dosage bounds
  اختصاصی، contraindications و منبع نسخه‌دار برای همه تمرین‌ها هنوز لازم است.
- [ ] محتوا توسط حداقل دو فیزیوتراپیست بازبینی و version/sign-off شود.
- [ ] دامنه جمعیت هدف روشن شود؛ pediatric، pregnancy، neuro و post-op بدون pathway اختصاصی فعال نشوند.
- [ ] پاسچر فقط پس از consent، private storage، حذف EXIF/GPS، quality gate و retention فعال شود.
- [ ] مدل پاسچر باید روی دیتاست clinician-adjudicated اعتبارسنجی، calibration و subgroup analysis شود.
- [ ] تا قبل از اعتبارسنجی، هیچ یافته یا درصد confidence از عکس نمایش داده نشود.

## فاز ۷ — تجربه کاربری، زبان و دسترس‌پذیری

- [~] `lang/dir` سند با locale و پرتال فارسی همگام شده است.
- [~] required/error/aria پایه فرم و drawer قابل استفاده با keyboard اصلاح شده است.
- [ ] ترجمه کامل فارسی و عربی برای همه صفحات و پیام‌های خطا.
- [ ] اصلاح همه layoutهای RTL و فرمت محلی تاریخ/عدد.
- [ ] WCAG 2.2 AA: contrast، focus، screen reader، tab semantics، live regions و reduced motion.
- [ ] تست axe و تست دستی VoiceOver/NVDA روی مسیرهای اصلی.
- [ ] تست responsive روی موبایل کم‌قدرت و شبکه ضعیف.

## فاز ۸ — کیفیت مهندسی و عملیات

- [x] lint، TypeScript، ۱۵۷ case تست واحد در ۸ فایل، production build و ۵ smoke E2E مرورگر در
  محیط محلی پاس می‌شوند.
- [~] workflow CI برای lint، typecheck، unit، build، Playwright، migrationهای
  `001 → 020`، idempotency، validation constraintها، RLS و seed اضافه شده؛ پس از push باید روی GitHub اجرا
  و branch protection اجباری شود.
- [~] پنج E2E فعلی جداسازی shell درمانگر/بیمار، وضعیت اولیه safety/posture،
  settings mode-aware، عدم جعل پرونده امضاشده و
  عدم ادعای تحویل هشدار در mock را
  می‌پوشاند؛ E2E واقعی owner، therapist، staff، patient، دو کلینیک، logout race و
  midnight روی staging هنوز مانع است.
- [~] صف اعلان، duration/status هر تلاش، retry و dead-letter بدون متن آزاد بیمار
  ثبت می‌شود؛ داشبورد/هشدار عملیاتی queue/SLA، error rate، model failures و audit
  alerts هنوز باید به سامانه مانیتورینگ مقصد متصل شود.
- [ ] pagination، realtime/polling کنترل‌شده، offline/error recovery و performance budget.
- [ ] staging جدا، preview بدون PHI، secret rotation و deployment rollback.
- [ ] penetration test و privacy/security review مستقل پیش از پایلوت.

## فاز ۹ — الزامات بالینی، حقوقی و فروش

- [ ] بازار و حوزه قضایی هدف مشخص شود؛ طبقه‌بندی نرم‌افزار پزشکی با مشاور حقوقی بررسی شود.
- [ ] intended use، کاربران مجاز، contraindications و claims بازاریابی دقیقاً تعریف شوند.
- [ ] clinical governance، hazard analysis، risk register و incident response تصویب شوند.
- [ ] privacy notice، consent، DPA، terms، retention/deletion و درخواست دسترسی داده آماده شود.
- [ ] پشتیبانی، SLA، آموزش مشتری، راهنمای استفاده ایمن و فرآیند شکایت تعریف شود.
- [ ] بیمه مسئولیت و قرارداد پردازش داده با ارائه‌دهندگان زیرساخت بررسی شود.
- [ ] پایلوت کنترل‌شده با چند فیزیوتراپیست و داده de-identified اجرا شود.
- [ ] معیار خروج پایلوت: صفر رخداد ایمنی حل‌نشده، نرخ escalation قابل قبول، رضایت
  درمانگر، صرفه‌جویی زمان و عدم افت کیفیت ثبت پرونده.

## دروازه نهایی انتشار

فروش عمومی فقط وقتی مجاز است که همه موارد زیر هم‌زمان برقرار باشند:

1. هیچ P0/P1 باز امنیتی یا بالینی وجود نداشته باشد.
2. migration و RLS روی staging و production با backup/restore تأیید شده باشند.
3. چرخه کامل درمان از ساخت بیمار تا بازبینی برنامه بدون SQL دستی کار کند.
4. تمام خروجی‌های AI دارای safety gate، citation، audit و تأیید انسان باشند.
5. تست‌های بالینی، E2E چندنقشی، accessibility و penetration test پاس باشند.
6. مسئول بالینی، مسئول امنیت و مالک محصول release را کتبی تأیید کنند.
7. الزامات حقوقی بازار هدف و claims فروش تأیید شده باشند.
