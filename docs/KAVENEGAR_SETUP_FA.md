# راه‌اندازی کاوه‌نگار برای ارسال کد ورود

## ۱) ساخت حساب و قالب
1. در [kavenegar.com](https://kavenegar.com) ثبت‌نام و حساب را فعال کنید
   (برای Verify Lookup معمولاً احراز هویت حساب لازم است).
2. از پنل کاوه‌نگار → **ابزارها → اعتبارسنجی (Verify)** یک **قالب**
   بسازید، مثلاً با نام `physioai-otp` و متن:
   «کد ورود شما به PhysioAI: %token»
   و منتظر تأیید قالب بمانید.
3. **API Key** را از پنل → تنظیمات → API بردارید.

## ۲) ثبت Secrets در Supabase (نه در کد!)
با CLI ([نصب](https://supabase.com/docs/guides/cli)):

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase secrets set \
  SMS_PROVIDER=kavenegar \
  KAVENEGAR_API_KEY=<کلید-شما> \
  KAVENEGAR_VERIFY_TEMPLATE=physioai-otp
```

⚠ این کلیدها هرگز در GitHub، فایل‌های env کلاینت، متغیرهای
`NEXT_PUBLIC_*` یا لاگ قرار نمی‌گیرند. برای توسعه محلی می‌توانید
`SMS_PROVIDER=mock` بگذارید (فقط لاگ Development، بدون ارسال واقعی و
بدون نمایش کد).

## ۳) Deploy کردن Edge Function

```bash
supabase functions deploy send-auth-sms --no-verify-jwt
```

## ۴) فعال‌کردن Phone Provider و Send SMS Hook
1. پنل Supabase → **Authentication → Providers → Phone** → Enable.
2. **Authentication → Hooks → Send SMS** → Enable → نوع HTTPS →
   آدرس تابع: `https://<PROJECT_REF>.supabase.co/functions/v1/send-auth-sms`
3. Secret ای که پنل نشان می‌دهد را کپی و ثبت کنید:

```bash
supabase secrets set SEND_SMS_HOOK_SECRET=<hook-secret>
```

## ۵) فعال‌کردن CAPTCHA (اختیاری ولی توصیه‌شده)
1. در Cloudflare Turnstile یک site بسازید → Site Key و Secret Key.
2. Supabase → Authentication → **Attack Protection** → Enable CAPTCHA →
   provider را Turnstile و Secret را وارد کنید.
3. در `.env.local` (و Vercel): `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site-key>`

## ۶) تست ارسال واقعی
1. یک کاربر تلفنی بسازید (راهنمای CREATE_FIRST_PHONE_ADMIN_FA.md).
2. در برنامه شماره را وارد و «ارسال کد» را بزنید.
3. **Auth Logs**: پنل → Logs → Auth؛ لاگ تابع: Edge Functions →
   send-auth-sms → Logs (شماره‌ها Mask هستند و کد هرگز لاگ نمی‌شود).

## خطاهای رایج
| علامت | علت رایج | راه‌حل |
| --- | --- | --- |
| «Error sending sms» در UI | Hook فعال نیست یا secret اشتباه است | مرحله ۴ را بازبینی کنید |
| status_411/412 در لاگ تابع | receptor یا قالب کاوه‌نگار نامعتبر | نام قالب و تأییدشدنش را چک کنید |
| status_418 | اعتبار حساب کاوه‌نگار تمام شده | حساب را شارژ کنید |
| کد نمی‌رسد ولی خطا نیست | صف اپراتور/فیلتر خطوط تبلیغاتی | از خط خدماتی کاوه‌نگار استفاده کنید |
| Too many requests | Rate Limit پنل Auth | چند دقیقه صبر یا تنظیمات را بالا ببرید |
