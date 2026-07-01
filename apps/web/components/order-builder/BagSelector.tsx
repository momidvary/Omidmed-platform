import { bagOptions } from "@/lib/catalog/data";
import { formatToman } from "@/lib/catalog/pricing";
import { ColorSwatchPicker } from "./ColorSwatchPicker";

type BagSelectorProps = {
  selectedId: string;
  selectedColorId: string;
  onSelect: (bagId: string) => void;
  onSelectColor: (colorId: string) => void;
};

export function BagSelector({
  selectedId,
  selectedColorId,
  onSelect,
  onSelectColor,
}: BagSelectorProps) {
  const selectedBag = bagOptions.find((bag) => bag.id === selectedId);

  return (
    <div className="space-y-3">
      <p className="mb-2 text-sm font-medium text-zinc-700">سایز کیف</p>
      <div className="grid grid-cols-2 gap-2">
        {bagOptions.map((bag) => {
          const isSelected = bag.id === selectedId;
          return (
            <button
              key={bag.id}
              type="button"
              onClick={() => onSelect(bag.id)}
              className={`rounded-xl border p-3 text-center transition ${
                isSelected
                  ? "border-emerald-600 bg-emerald-50"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <p className="font-medium text-zinc-900">{bag.size}</p>
              <p className="mt-2 text-sm text-emerald-700">
                {formatToman(bag.price)}
              </p>
            </button>
          );
        })}
      </div>
      {selectedBag && (
        <ColorSwatchPicker
          label="رنگ کیف"
          colors={selectedBag.colors}
          selectedId={selectedColorId}
          onSelect={onSelectColor}
        />
      )}
    </div>
  );
}
