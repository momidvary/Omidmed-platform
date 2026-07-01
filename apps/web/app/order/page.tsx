"use client";

import { useMemo, useState } from "react";
import { bagOptions, sheetOptions, padModels } from "@/lib/catalog/data";
import { calculatePackPrice } from "@/lib/catalog/pricing";
import type { PackSelection } from "@/lib/catalog/types";
import { PadSelector } from "@/components/order-builder/PadSelector";
import { SheetSelector } from "@/components/order-builder/SheetSelector";
import { BagSelector } from "@/components/order-builder/BagSelector";
import { LogoUploader } from "@/components/order-builder/LogoUploader";
import { BagPreview } from "@/components/order-builder/BagPreview";
import { PriceSummary } from "@/components/order-builder/PriceSummary";

const initialSelection: PackSelection = {
  padModelId: padModels[0].id,
  sheetOptionId: sheetOptions[0].id,
  sheetColorId: sheetOptions[0].colors[0].id,
  bagOptionId: bagOptions[0].id,
  bagColorId: bagOptions[0].colors[0].id,
  quantity: 10,
  logoDataUrl: null,
};

export default function OrderBuilderPage() {
  const [selection, setSelection] = useState<PackSelection>(initialSelection);

  const breakdown = useMemo(
    () => calculatePackPrice(selection),
    [selection]
  );

  function update<K extends keyof PackSelection>(key: K, value: PackSelection[K]) {
    setSelection((prev) => ({ ...prev, [key]: value }));
  }

  function selectSheet(sheetId: string) {
    const sheet = sheetOptions.find((option) => option.id === sheetId);
    setSelection((prev) => ({
      ...prev,
      sheetOptionId: sheetId,
      sheetColorId: sheet?.colors[0]?.id ?? prev.sheetColorId,
    }));
  }

  function selectBag(bagId: string) {
    const bag = bagOptions.find((option) => option.id === bagId);
    setSelection((prev) => ({
      ...prev,
      bagOptionId: bagId,
      bagColorId: bag?.colors[0]?.id ?? prev.bagColorId,
    }));
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
          پک بهداشتی اختصاصی کلینیک خود را بسازید
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          پد، ملحفه و کیف را انتخاب کنید، لوگوی خود را آپلود کنید و پیش‌نمایش را ببینید.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <PadSelector
            selectedId={selection.padModelId}
            onSelect={(id) => update("padModelId", id)}
          />
          <SheetSelector
            selectedId={selection.sheetOptionId}
            selectedColorId={selection.sheetColorId}
            onSelect={selectSheet}
            onSelectColor={(colorId) => update("sheetColorId", colorId)}
          />
          <BagSelector
            selectedId={selection.bagOptionId}
            selectedColorId={selection.bagColorId}
            onSelect={selectBag}
            onSelectColor={(colorId) => update("bagColorId", colorId)}
          />
          <LogoUploader
            logoDataUrl={selection.logoDataUrl}
            onChange={(dataUrl) => update("logoDataUrl", dataUrl)}
          />
        </div>

        <div className="space-y-6">
          <BagPreview
            bagColorId={selection.bagColorId}
            logoDataUrl={selection.logoDataUrl}
          />
          <PriceSummary
            breakdown={breakdown}
            quantity={selection.quantity}
            onQuantityChange={(quantity) => update("quantity", quantity)}
          />
          <button
            type="button"
            disabled={!breakdown}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            ثبت سفارش
          </button>
        </div>
      </div>
    </div>
  );
}
