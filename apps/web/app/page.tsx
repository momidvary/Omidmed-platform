import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-20 text-center">
      <p className="mb-3 text-sm font-medium text-emerald-700">OmidMed Platform</p>
      <h1 className="max-w-xl text-3xl font-bold text-zinc-900 sm:text-4xl">
        لوگوی کلینیکت را آپلود کن و ببین روی کیف اختصاصی چطور دیده می‌شود
      </h1>
      <p className="mt-4 max-w-lg text-zinc-500">
        پک بهداشتی فیزیوتراپی (پد، ملحفه و کیف) را با رنگ و مدل دلخواه بسازید
        و پیش از سفارش، پیش‌نمایش آن را ببینید.
      </p>
      <Link
        href="/order"
        className="mt-8 rounded-xl bg-emerald-600 px-8 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
      >
        شروع پیش‌نمایش رایگان
      </Link>
    </div>
  );
}
