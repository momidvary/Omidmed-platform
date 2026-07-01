import { bagColors } from "@/lib/catalog/data";

type BagPreviewProps = {
  bagColorId: string;
  logoDataUrl: string | null;
};

export function BagPreview({ bagColorId, logoDataUrl }: BagPreviewProps) {
  const color = bagColors.find((option) => option.id === bagColorId);

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-700">
        پیش‌نمایش لوگو روی کیف
      </p>
      <div
        className="relative mx-auto flex h-56 w-44 items-center justify-center rounded-2xl shadow-inner"
        style={{ backgroundColor: color?.hex ?? "#1a1a1a" }}
      >
        <div className="absolute top-0 h-6 w-16 -translate-y-3 rounded-full border-4 border-zinc-300/40" />
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUrl}
            alt="پیش‌نمایش لوگوی کلینیک"
            className="max-h-24 max-w-24 rounded bg-white/90 p-2 object-contain"
          />
        ) : (
          <p className="px-4 text-center text-xs text-white/70">
            لوگوی خود را آپلود کنید تا پیش‌نمایش را ببینید
          </p>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-zinc-400">
        این یک پیش‌نمایش شبیه‌سازی‌شده است. نسخه نهایی چاپ توسط تیم تولید تأیید می‌شود.
      </p>
    </div>
  );
}
