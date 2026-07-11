# معماری Send SMS Hook

## چرا Hook؟
Supabase خودش OTP را تولید و اعتبارسنجی می‌کند؛ ما فقط «تحویل پیامک» را
به دست می‌گیریم تا از سرویس ایرانی (کاوه‌نگار) استفاده شود. کد OTP هرگز
در دیتابیس برنامه ذخیره و هرگز در UI/Log نمایش داده نمی‌شود.

## مسیر پیام
```
کاربر → signInWithOtp → Supabase Auth (تولید کد)
      → Send SMS Hook (امضاشده) → Edge Function send-auth-sms
      → SmsProvider (Kavenegar | Mock) → پیامک به کاربر
```

## Edge Function: `supabase/functions/send-auth-sms/index.ts`
1. فقط POST می‌پذیرد و **امضای Hook** را با `SEND_SMS_HOOK_SECRET`
   (استاندارد standardwebhooks) تأیید می‌کند.
2. ساختار Payload رسمی را بررسی می‌کند: `user.phone` و `sms.otp`.
3. Provider را از `SMS_PROVIDER` انتخاب می‌کند.
4. نتیجه استاندارد برمی‌گرداند: `200 {}` در موفقیت، `500 {error}` در
   شکست (تا Supabase به کاربر «خطا در ارسال پیامک» بدهد).
5. **Token هرگز لاگ نمی‌شود؛ شماره‌ها فقط Mask شده لاگ می‌شوند.**
6. تابع هرگز خودش OTP نمی‌سازد.

## معماری Provider
```ts
interface SmsProvider {
  name: string;
  sendOtp(input: { phone: string; token: string; locale?: "fa"|"en"|"ar" })
    : Promise<SmsSendResult>;
}
```
- `KavenegarSmsProvider` — Verify Lookup با قالب تأییدشده.
- `MockSmsProvider` — فقط توسعه؛ با برچسب `[DEVELOPMENT MOCK]` و بدون
  نمایش کد.
- افزودن Provider جدید = یک کلاس جدید + مقدار جدید `SMS_PROVIDER`؛
  صفحه ورود و Supabase Auth هیچ تغییری نمی‌خواهند.

## Deploy و Secrets
به `docs/KAVENEGAR_SETUP_FA.md` مراجعه کنید (secrets فقط در Supabase
Secrets؛ هرگز در کد یا env کلاینت).
