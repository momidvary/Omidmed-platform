import { formatToman, type PriceBreakdown } from "@/lib/catalog/pricing";

type PriceSummaryProps = {
  breakdown: PriceBreakdown | null;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
};

export function PriceSummary({
  breakdown,
  quantity,
  onQuantityChange,
}: PriceSummaryProps) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <label htmlFor="quantity" className="text-sm font-medium text-zinc-700">
          تعداد پک
        </label>
        <input
          id="quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(event) =>
            onQuantityChange(Math.max(1, Number(event.target.value) || 1))
          }
          className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-center"
        />
      </div>
      {breakdown ? (
        <div className="space-y-1 text-sm text-zinc-600">
          <div className="flex justify-between">
            <span>قیمت هر پک</span>
            <span>{formatToman(breakdown.unitPrice)}</span>
          </div>
          <div className="flex justify-between border-t border-zinc-100 pt-2 text-base font-semibold text-zinc-900">
            <span>مجموع تخمینی</span>
            <span>{formatToman(breakdown.total)}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-400">همه گزینه‌ها را انتخاب کنید</p>
      )}
    </div>
  );
}
