# OmidMed Platform - Project Log

## 2026-07-01

- Implemented the first vertical slice of the Custom Order Builder /
  AI Product Preview described in `EXPERIENCE_FLOW.md` and
  `PRODUCT_SPEC.md`.
- Added the product catalog engine foundation at `apps/web/lib/catalog/`
  (types, seed data for pad/sheet/bag variants and colors, price
  calculation).
- Added `apps/web/app/order/page.tsx`: an unauthenticated order builder
  page where a clinic can pick a pad model, sheet GSM + color, bag size +
  color, upload a logo, see a mockup preview of the logo on the selected
  bag color, and see a live estimated price.
- Set the app to Persian/RTL by default (`lang="fa" dir="rtl"`, Vazirmatn
  font) and gave the homepage a real hero section linking to `/order`,
  matching the "value before login" flow in `EXPERIENCE_FLOW.md`.
- Verified in a browser: catalog selection, price calc, and logo-upload →
  mockup preview all work.

Not included in this slice (intentionally, per MVP scope): auth,
Supabase persistence, order submission/invoice, admin panel. The "ثبت
سفارش" button is present but inert until auth + order persistence are
built next.
