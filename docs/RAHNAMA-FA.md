# راهنمای راه‌اندازی PhysioAI

این راهنما برای محیط آزمایشی و استقرار کنترل‌شده است. ساخت موفق برنامه در Vercel
به‌تنهایی مجوز ورود داده بیمار یا استفاده بالینی نیست. وضعیت دروازه‌های انتشار در
`docs/PRODUCT_READINESS_FA.md` نگهداری می‌شود.

## ۱ — آماده‌سازی امن دیتابیس

1. یک پروژه Supabase جدا برای staging بسازید؛ migration اول را روی دیتابیس
   production موجود اجرا نکنید. `001_schema.sql` تعدادی جدول قدیمی را حذف می‌کند.
2. پیش از هر migration از دیتابیس مقصد backup بگیرید و بازیابی همان backup را
   عملاً آزمایش کنید.
3. فایل‌های زیر را دقیقاً به ترتیب اجرا کنید:

   1. `001_schema.sql`
   2. `002_rls.sql`
   3. `003_security_fixes.sql`
   4. `004_security_hardening.sql`
   5. `005_ai_governance.sql`
   6. `006_case_episode_linkage.sql`
   7. `007_treatment_plan_workflow.sql`
   8. `008_exercise_prescriptions.sql`
   9. `009_ai_request_reservations.sql`
   10. `010_ai_review_hardening.sql`
   11. `011_treatment_plan_validation.sql`
   12. `012_access_and_ai_race_hardening.sql`
   13. `013_clinical_safety_and_portal_controls.sql`
   14. `014_clinical_alerts.sql`
   15. `015_patient_onboarding_and_episode_lifecycle.sql`
   16. `016_exercise_catalog_and_date_validation.sql`
   17. `017_ticket_workflow_and_escalation.sql`
   18. `018_clinical_documentation_and_outcomes.sql`
   19. `019_notification_outbox.sql`
   20. `020_case_assessment_versioning.sql`
   21. `021_structured_exercise_adherence.sql`
   22. `022_adherence_retry_hardening.sql`
   23. `023_prescription_schedule.sql`
   24. `024_structured_progress_guard.sql`
   25. `025_exercise_measurement_targets.sql`
   26. `026_auth_email_type_fix.sql` — بدون آن صفحه Patient Registry در Supabase
       واقعی باز نمی‌شود.
   27. `027_patient_prescription_visibility.sql` — بدون آن بیمار برنامه تمرینی
       منتشرشده خود را نمی‌بیند.
   28. `028_patient_phone_accounts.sql` — اتصال حساب پرتال بیمار با شماره همراه.
   29. `029_case_clinical_findings.sql` — ثبت ساختاریافته شرح حال و معاینه و
       رتبه‌بندی فرضیه‌ها (راهنما: `docs/CLINICAL_REASONING_FA.md`).

   اگر دیتابیس را قبلاً با `02_all_migrations.sql` ساخته‌اید، migrationهای جدید را
   با فایل‌های پوشه `database/supabase-sql-editor/upgrades/` (به ترتیب شماره) در
   SQL Editor اجرا کنید؛ هر فایل فقط یک بار اجرا می‌شود.

   برای دیتابیس کاملاً خالی از runner دارای checksum و قفل هم‌زمانی استفاده کنید:

   ```bash
   DATABASE_URL='postgresql://…' node database/scripts/migrate.mjs --allow-baseline
   ```

   در انتشارهای بعدی همان فرمان را بدون `--allow-baseline` اجرا کنید. runner روی
   schema موجودِ بدون ledger عمداً متوقف می‌شود؛ چنین پروژه‌ای باید بعد از backup
   و مقایسه schema توسط DBA تطبیق داده شود و نباید با دستکاری ledger دور زده شود.

   **مسیر بدون psql (فقط با SQL Editor سوپابیس):** سه فایل پوشه
   `database/supabase-sql-editor/` را به ترتیب اجرا کنید (هر فایل را کامل کپی و
   یک بار Run بزنید):

   1. `01_reset_app_schema.sql` — فقط اگر پروژه قبلاً با برنچ قدیمی‌تری راه‌اندازی
      شده است. جدول‌های برنامه را پاک می‌کند ولی کاربران Authentication می‌مانند؛
      اگر حتی یک پرونده بیمار وجود داشته باشد، اجرا نمی‌شود.
   2. `02_all_migrations.sql` — همه migrationها (۰۰۱ تا ۰۲۷) به‌همراه همان
      ledger که runner می‌سازد؛ ارتقاهای بعدی با `migrate.mjs` انجام می‌شود.
   3. `03_first_clinic_owner.sql` — ایمیل، نام و اسم کلینیک را در ابتدای فایل
      ویرایش کنید؛ آن حساب `clinic_owner` یک کلینیک جدید می‌شود.

4. `database/seed/seed.dev.sql` فقط داده دموی توسعه است و نباید در production
   اجرا شود.
5. CI مخزن همین ترتیب، اجرای مجدد migrationهای سخت‌سازی و سناریوهای چندنقشی
   RLS را در PostgreSQL موقت آزمایش می‌کند. علاوه بر CI، همان آزمون‌ها را روی
   staging و با تنظیمات واقعی Supabase نیز اجرا کنید.

workflow دستی `Staging real-mode E2E` فقط با environment محافظت‌شده `staging`
اجرا می‌شود. متغیرهای `REAL_E2E_BASE_URL` و `REAL_E2E_EXPECTED_HOST` (hostname
دقیق همان Preview بدون scheme/path) و secretهای حساب‌های اختصاصی owner،
therapist، staff و patient را در همان environment قرار دهید؛ از حساب یا داده
بیمار واقعی و از URL production استفاده نکنید.

## ۲ — ساخت اولین مدیر پلتفرم

1. در Supabase از مسیر **Authentication → Users** یک حساب مدیریتی با ایمیل
   سازمانی و ایمیل تأییدشده بسازید.
2. UUID حساب را بردارید و فقط یک بار در SQL Editor اجرا کنید:

```sql
select public.bootstrap_platform_admin('UUID-حساب');
```

این تابع بعد از ساخت اولین مدیر قفل می‌شود. نقش `platform_admin` عمداً دسترسی
ضمنی به اطلاعات بالینی بیمار ندارد؛ پشتیبانی فنی نباید با این نقش PHI ببیند.
برای production، MFA درمانگران/مدیران و فرآیند عملیاتی تطبیق هویت و رضایت باید
در Supabase و رویه سازمان فعال و آزموده شود.

## ۳ — کلینیک و کاربران

Bootstrap اولیه کلینیک هنوز یک کار عملیاتی مدیر است. نمونه زیر را فقط با UUIDهای
واقعی و در محیط کنترل‌شده اجرا کنید:

```sql
insert into public.clinics (name, city)
values ('نام کلینیک', 'شهر')
returning id;

update public.profiles
set role = 'clinic_owner', full_name = 'نام مدیر کلینیک'
where id = 'UUID-مدیر-کلینیک';

insert into public.clinic_members (clinic_id, user_id, member_role)
values ('UUID-کلینیک', 'UUID-مدیر-کلینیک', 'clinic_owner');
```

درمانگر باید نقش `therapist` و عضویت همان کلینیک را داشته باشد. نقش
`clinic_staff` به PHI بالینی دسترسی ندارد. تخصیص بیمار به درمانگر از طریق Registry
انجام می‌شود و RLS دسترسی درمانگران تخصیص‌نیافته را رد می‌کند.

## ۴ — تنظیم برنامه

فایل `apps/web/.env.local.example` همه نام متغیرها را بدون credential واقعی دارد.
برای حالت واقعی حداقل این مقادیر لازم‌اند:

```dotenv
NEXT_PUBLIC_DATA_MODE=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
CRON_SECRET=
CLINICAL_ALERT_WEBHOOK_URL=
CLINICAL_ALERT_WEBHOOK_SECRET=
```

- `SUPABASE_SECRET_KEY` فقط در secret store سرور/Vercel قرار می‌گیرد و هرگز نباید
  `NEXT_PUBLIC_` داشته باشد، commit شود یا در مرورگر دیده شود.
- در production مقدار `NEXT_PUBLIC_DATA_MODE=mock` ممنوع است.
- sandbox پاسچر باید با `NEXT_PUBLIC_ENABLE_POSTURE_SANDBOX=false` خاموش بماند.
- متغیرهای `NEXT_PUBLIC_*` هنگام build داخل bundle قرار می‌گیرند؛ پس بعد از تغییر
  آن‌ها rebuild/redeploy لازم است.
- `CRON_SECRET` و `CLINICAL_ALERT_WEBHOOK_SECRET` باید تصادفی و حداقل ۳۲ بایت
  باشند. هر سه متغیر اعلان فقط در secret store سرور قرار می‌گیرند.
- `CLINICAL_ALERT_WEBHOOK_URL` باید endpoint عمومی HTTPS متعلق به پردازشگر
  تأییدشده باشد؛ آدرس local/internal، IP مستقیم، credential داخل URL یا پورت
  غیراستاندارد توسط worker رد می‌شود.

## ۵ — بیمار، اپیزود و پرتال

مدیر کلینیک یا درمانگر مجاز از صفحه Patient Registry بیمار و care episode را
می‌سازد. هر case واقعی باید به همان `patient_id` و `episode_id` متصل باشد.
پرتال بیمار فقط حساب‌های موجود در `patient_users` را می‌پذیرد و اگر یک حساب به
چند بیمار/عضو خانواده متصل باشد، انتخاب صریح لازم است.

بیمار فقط با **شماره همراه و کد پیامکی** وارد پرتال می‌شود (ایمیل و رمز عبور
ندارد و ثبت‌نام آزاد هم وجود ندارد). مالک کلینیک از پنل Manage در Patient
Registry شماره همراه، رابطه با بیمار و attestation رضایت/اختیار قانونی را ثبت
می‌کند؛ اگر حسابی با آن شماره نباشد، با `SUPABASE_SECRET_KEY` ساخته و لینک
می‌شود (در این مرحله پیامکی ارسال نمی‌شود). سپس بیمار در `/patient` شماره را
وارد می‌کند، کد را پیامک دریافت می‌کند و وارد می‌شود. شماره‌ای که در کلینیک ثبت
نشده کد دریافت نمی‌کند. حساب همراه بدون تاریخ انقضا و بیش از یک سال پذیرفته
نمی‌شود و لغو دسترسی فوراً در RLS اثر می‌گذارد. راه‌اندازی ارسال پیامک با
ملی‌پیامک: `docs/PATIENT_PHONE_LOGIN_FA.md`. قبل از لینک، هویت و رضایت را طبق
رویه سازمان تطبیق دهید. کد ملی فقط شناسه پرونده است و credential ورود نیست.
ورود کادر درمان همچنان با ایمیل و رمز عبور است.

همین پنل ویرایش مشخصات، انتساب درمانگر، pause/resume/complete اپیزود، شروع دوره
بعدی و archive بدون حذف سابقه را انجام می‌دهد. pause/complete نسخه actionable را
باطل می‌کند؛ پس بعد از resume باید نسخه جدید بازبینی و منتشر شود.

## ۶ — گردش‌کار بالینی

1. بیمار و اپیزود را انتخاب کنید و case بسازید.
2. غربالگری ساختاریافته علائم خطر را کامل کنید. وضعیت نامشخص یا نگران‌کننده
   planner، آموزش بیمار، AI بالینی و انتشار نسخه را قفل می‌کند.
3. برنامه درمان را به‌عنوان draft ذخیره و پس از بازبینی صریح approve/reject کنید.
4. نسخه تمرینی را با تاریخ‌ها، dosage، precautions، stop rules و review date
   بسازید. فقط نسخه `published` در پرتال بیمار دیده می‌شود و انتشار نسخه جدید،
   نسخه قبلی را اتمیک revoke می‌کند.
5. پاسخ تیکت درمانگر فقط از RPC اتمیک ثبت می‌شود. پیام خودکار تیکت یک
   acknowledgment قطعی و rule-based است، نه پاسخ مدل و نه تأیید مشاهده درمانگر.
6. درد ۷ از ۱۰ یا بیشتر در گزارش بیمار، در همان تراکنش یک هشدار idempotent
   می‌سازد و نسخه جاری را `suspended` می‌کند. درمانگر هشدار را در صفحه
   Clinical Alerts تأیید/حل می‌کند؛ resume فقط پس از غربالگری clear جدیدتر از
   هشدار، plan تأییدشده و تاریخ معتبر نسخه پذیرفته می‌شود.
7. alertهای urgent/emergency در migration `019` وارد outbox پایدار می‌شوند.
   worker هر بار حداکثر ۱۰ رویداد را lease می‌کند، payload ثابتِ بدون نام/متن
   آزاد بیمار را با HMAC امضا و نتیجه را با retry/dead-letter ثبت می‌کند. این
   زیرساخت فقط کانال تحویل است: پیش از پایلوت endpoint تأییدشده email/SMS/push،
   مانیتور dead-letter، گیرنده on-call و آزمون عملی receipt/escalation لازم است.
   شناسه پایدار بیمار/کلینیک نیز داده سلامت pseudonymous و مشمول DPA است.

Vercel Cron مسیر `/api/internal/notifications/drain` را طبق `apps/web/vercel.json`
فراخوانی می‌کند و `CRON_SECRET` را در هدر Bearer می‌فرستد. برای اینکه deploy روی
پلن رایگان Hobby رد نشود، زمان‌بندی روزانه است (`0 4 * * *`)؛ Hobby زمان‌بندی
پرتکرارتر را نمی‌پذیرد. این برای هشدار بالینی از طریق webhook کافی نیست: قبل از
اتکا به webhook، پلن Pro بگیرید و زمان‌بندی را `* * * * *` کنید. هشدارهای داخل
برنامه (صفحه Alerts) به این cron وابسته نیستند. cron تضمین real-time یا مشاهده انسانی نمی‌دهد.

## ۷ — AI بالینی اختیاری

این قابلیت پیش‌فرض خاموش است. فقط پس از تصویب پردازش داده، قرارداد/DPA، مدل،
retention، پایش و مسئول بازبینی، همه متغیرهای زیر را در محیط کنترل‌شده تنظیم کنید:

```dotenv
NEXT_PUBLIC_ENABLE_CLINICAL_AI_DRAFTS=true
ENABLE_CLINICAL_AI_DRAFTS=true
OPENAI_CLINICAL_DATA_PROCESSING_APPROVED=true
OPENAI_API_KEY=
OPENAI_MODEL=
CLINICAL_AI_PER_MINUTE_LIMIT=
CLINICAL_AI_DAILY_USER_LIMIT=
CLINICAL_AI_DAILY_CLINIC_LIMIT=
```

ورودی فقط از case ذخیره‌شده و safety-cleared ساخته می‌شود؛ شناسه‌های مستقیم رایج
از متن آزاد حذف می‌شوند، اما این جایگزین DPA و سیاست حریم خصوصی نیست. درخواست
قبل از تماس provider اتمیک reserve می‌شود، quota دارد، خروجی با schema و قواعد
ایمنی کنترل می‌شود و بدون accept/edit/reject درمانگر هیچ اثر بالینی یا انتشار
مستقیم ندارد. در refusal، timeout یا خطا هیچ پاسخ بالینی جایگزین ساخته نمی‌شود.

از نسخه `clinical-draft-v3`، آخرین یافته‌های ساختاریافته ذخیره‌شده کیس (با برچسب،
یادداشت‌ها پس از حذف شناسه) و رتبه‌بندی قاعده‌محور هم به ورودی ممیزی‌شده اضافه
می‌شود تا مدل آن را نقد کند. راهنمای کامل: `docs/CLINICAL_REASONING_FA.md`.

## ۸ — آزمون پیش از انتشار

در `apps/web` اجرا کنید:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

سپس در staging حداقل owner، therapist تخصیص‌یافته/تخصیص‌نیافته، staff، patient،
دو کلینیک، logout/account switch، ساخت case، sign-off برنامه، publish/revoke نسخه،
تیکت و تمام مسیرهای fail-closed AI را با حساب واقعی آزمایش کنید. نتیجه تست
backup/restore، چرخش secret، rollback deployment و incident response نیز باید
ثبت شود.

## نکات عملیاتی مهم

- ایمیل‌تأییدشده و MFA برای حساب‌های بالینی production الزامی‌اند؛ Auto-confirm
  فقط در محیط تست مجاز است.
- OTP پیامکی به ارائه‌دهنده خارجی قابل‌اعتماد و قرارداد پردازش داده نیاز دارد.
- پردازشگر اعلان واقعی، receipt/on-call escalation، SLA، مانیتور dead-letter،
  accessibility مستقل، penetration test و اعتبارسنجی بالینی هنوز دروازه‌های
  بیرونی انتشارند؛ نبود آن‌ها را با متن UI یا پاسخ خودکار پنهان نکنید.
- هیچ‌گاه credential واقعی، dump داده بیمار یا خروجی PHI را در issue، log، preview
  عمومی یا مخزن Git قرار ندهید.
