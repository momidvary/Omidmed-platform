# راه‌اندازی ملی‌پیامک برای ارسال کد ورود (Provider پیش‌فرض)

ارسال پیامک کد ورود (OTP) از این نسخه به‌صورت پیش‌فرض با
**ملی‌پیامک (melipayamak.com)** انجام می‌شود. کاوه‌نگار همچنان به‌عنوان
Provider جایگزین در کد موجود است (`docs/KAVENEGAR_SETUP_FA.md`) ولی
مستندات و تنظیمات پیش‌فرض بر اساس ملی‌پیامک است.

نکته مهم امنیتی: **کد OTP را فقط Supabase تولید و اعتبارسنجی می‌کند.**
تابع ما فقط «تحویل پیامک» را انجام می‌دهد؛ کد و کلید API هرگز در لاگ،
گیت‌هاب یا مرورگر قرار نمی‌گیرند.

## ۱) فعال‌سازی وب‌سرویس و گرفتن کلید API
1. در [melipayamak.com](https://www.melipayamak.com) ثبت‌نام کنید و
   حساب را احراز هویت کنید (برای خط خدماتی معمولاً مدارک لازم است).
2. وارد **کنسول جدید** شوید: [console.melipayamak.com](https://console.melipayamak.com)
3. از منوی **وب‌سرویس** (Developers / وب‌سرویس) سرویس REST را فعال کنید.
4. **کلید API (apiKey)** را از همان بخش کپی کنید — این کلید در آدرس
   وب‌سرویس قرار می‌گیرد و باید کاملاً محرمانه بماند.

## ۲) ساخت الگوی کد تأیید (پیامک خدماتی)
پیامک OTP باید با **الگوی خدماتی** ارسال شود تا به شماره‌هایی که پیامک
تبلیغاتی‌شان مسدود است هم برسد و سریع تحویل شود:
1. در کنسول → بخش **ارسال با الگو / متن‌های پرکاربرد** یک الگوی جدید
   بسازید، مثلاً:
   «کد ورود شما به PhysioAI: {0}»
   (جای `{0}` کد ۶ رقمی قرار می‌گیرد.)
2. منتظر **تأیید الگو** توسط ملی‌پیامک بمانید (معمولاً چند ساعت کاری).
3. بعد از تأیید، **شناسه عددی الگو (bodyId)** را یادداشت کنید — همین
   عدد مقدار `MELIPAYAMAK_OTP_PATTERN` است.

## ۳) ثبت Secrets در Supabase (نه در کد!)
با CLI ([نصب](https://supabase.com/docs/guides/cli)):

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase secrets set \
  SMS_PROVIDER=melipayamak \
  MELIPAYAMAK_API_KEY=<کلید-شما> \
  MELIPAYAMAK_OTP_PATTERN=<شناسه-عددی-الگو>
```

- `MELIPAYAMAK_SENDER` (اختیاری): شماره خط ارسال، فقط برای حالت
  ارسال ساده بدون الگو. تا وقتی الگوی تأییدشده دارید لازم نیست و
  توصیه هم نمی‌شود (پیامک ساده ممکن است به شماره‌های دارای فیلتر
  تبلیغاتی نرسد).
- برای توسعه محلی: `SMS_PROVIDER=mock` (فقط لاگ Development، بدون
  ارسال واقعی و بدون نمایش کد).

⚠ این مقادیر هرگز در GitHub، فایل‌های env کلاینت، متغیرهای
`NEXT_PUBLIC_*`، پاسخ API یا لاگ قرار نمی‌گیرند.

## ۴) Deploy کردن Edge Function

```bash
supabase functions deploy send-auth-sms --no-verify-jwt
```

## ۵) فعال‌کردن Phone Provider و Send SMS Hook
1. پنل Supabase → **Authentication → Providers → Phone** → Enable.
2. **Authentication → Hooks → Send SMS** → Enable → نوع HTTPS →
   آدرس تابع: `https://<PROJECT_REF>.supabase.co/functions/v1/send-auth-sms`
3. Secret ای که پنل نشان می‌دهد را کپی و ثبت کنید:

```bash
supabase secrets set SEND_SMS_HOOK_SECRET=<hook-secret>
```

## ۶) تست ارسال واقعی
1. یک کاربر تلفنی بسازید (راهنمای CREATE_FIRST_PHONE_ADMIN_FA.md).
2. در برنامه شماره را وارد و «ارسال کد» را بزنید.
3. پیامک باید با متن الگوی تأییدشده برسد.
4. لاگ‌ها: پنل → Logs → Auth؛ لاگ تابع: Edge Functions →
   send-auth-sms → Logs (شماره‌ها Mask هستند و کد هرگز لاگ نمی‌شود).

## خطاهای رایج
برچسب `detail` در لاگ تابع (Edge Functions → send-auth-sms → Logs)
علت را مشخص می‌کند:

| برچسب در لاگ | معنی | راه‌حل |
| --- | --- | --- |
| `invalid_api_key` | کلید API اشتباه یا وب‌سرویس غیرفعال | کلید را از کنسول دوباره کپی و secret را به‌روز کنید |
| `invalid_pattern` | شناسه الگو (bodyId) اشتباه یا الگو هنوز تأیید نشده | تأیید الگو و عددی‌بودن `MELIPAYAMAK_OTP_PATTERN` را چک کنید |
| `insufficient_credit` | اعتبار حساب ملی‌پیامک تمام شده | حساب را شارژ کنید |
| `invalid_number` | شماره گیرنده نامعتبر | شماره را با فرمت 09xxxxxxxxx تست کنید |
| `rate_limited` | ارسال بیش از حد مجاز | چند دقیقه صبر کنید |
| `network` | خطای شبکه بین Supabase و ملی‌پیامک | دوباره تلاش کنید؛ وضعیت سرویس ملی‌پیامک را چک کنید |
| `not_configured` | نه الگو تنظیم شده نه خط ارسال | `MELIPAYAMAK_OTP_PATTERN` را ثبت کنید |
| «Error sending sms» در UI بدون لاگ تابع | Hook فعال نیست یا secret اشتباه است | مرحله ۵ را بازبینی کنید |
| کد نمی‌رسد ولی خطا نیست | صف اپراتور یا ارسال ساده به شماره فیلترشده | از الگوی خدماتی (مرحله ۲) استفاده کنید |

## تبدیل فرمت شماره
در Supabase و دیتابیس، شماره‌ها استاندارد E.164 هستند (+989123456789).
تابع ارسال، شماره را فقط برای API ملی‌پیامک به فرمت محلی
(09123456789) تبدیل می‌کند؛ در هیچ‌جای دیگری فرمت تغییر نمی‌کند.

## فعال‌کردن CAPTCHA (اختیاری ولی توصیه‌شده)
1. در Cloudflare Turnstile یک site بسازید → Site Key و Secret Key.
2. Supabase → Authentication → **Attack Protection** → Enable CAPTCHA →
   provider را Turnstile و Secret را وارد کنید.
3. در `.env.local` (و Vercel): `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site-key>`
