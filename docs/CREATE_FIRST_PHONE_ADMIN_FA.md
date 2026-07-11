# ساخت اولین platform_admin با شماره موبایل

پیش‌نیاز: هر چهار migration به ترتیب اجرا شده باشند
(001 → 002 → 003 → 004) و Phone Provider فعال باشد.

## قدم ۱ — ساخت کاربر تلفنی
پنل Supabase → **Authentication → Users → Add user → Create new user**:
- به‌جای ایمیل، **Phone** را انتخاب کنید.
- شماره را به فرمت بین‌المللی وارد کنید: `+989123456789`
- گزینه **Auto Confirm** را روشن بگذارید.

(روش جایگزین: اسکریپت سروری با `SUPABASE_SECRET_KEY` و
`auth.admin.createUser({ phone, phone_confirm: true })` — کلید secret
هرگز در مرورگر یا `NEXT_PUBLIC_*` قرار نگیرد.)

## قدم ۲ — Bootstrap (فقط یک بار)
در **SQL Editor**:

```sql
select public.bootstrap_platform_admin_by_phone('+989123456789');
```

- فرمت‌های `0912…`، `98912…` و `0098912…` هم پذیرفته می‌شوند.
- فقط وقتی کار می‌کند که **هنوز هیچ platform_admin وجود ندارد**؛ بعد از
  اولین اجرا برای همیشه پیام «already exists» می‌دهد.
- فقط از SQL Editor یا service role قابل اجراست؛ هیچ کاربر anon یا
  authenticated حتی اجازه صدازدنش را ندارد (EXECUTE از آن‌ها گرفته شده).
- هیچ کاربری نمی‌تواند نقش خودش را ارتقا دهد (تریگر + RLS).

## قدم ۳ — ورود
به برنامه بروید، همان شماره را وارد کنید، کد پیامکی را بزنید — وارد
داشبورد می‌شوید. از Settings می‌توانید اولین «مدیر کلینیک» را با شماره
موبایلش بسازید (کارت Create Clinic Owner) و او هم تیم و بیمارانش را
اضافه می‌کند. همه این عملیات در `audit_logs` ثبت می‌شوند.
