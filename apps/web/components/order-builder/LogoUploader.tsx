"use client";

import { useRef, useState } from "react";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

type LogoUploaderProps = {
  logoDataUrl: string | null;
  onChange: (dataUrl: string | null) => void;
};

export function LogoUploader({ logoDataUrl, onChange }: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    setError(null);

    if (!file) {
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("فرمت مجاز: PNG، JPG یا SVG");
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setError("حجم فایل باید کمتر از ۵ مگابایت باشد");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-700">لوگوی کلینیک</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-dashed border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:border-emerald-500 hover:text-emerald-700"
        >
          {logoDataUrl ? "تغییر لوگو" : "آپلود لوگو"}
        </button>
        {logoDataUrl && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-sm text-zinc-400 hover:text-red-600"
          >
            حذف
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
