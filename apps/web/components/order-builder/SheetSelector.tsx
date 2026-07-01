import { sheetOptions } from "@/lib/catalog/data";
import { formatToman } from "@/lib/catalog/pricing";
import { ColorSwatchPicker } from "./ColorSwatchPicker";

type SheetSelectorProps = {
  selectedId: string;
  selectedColorId: string;
  onSelect: (sheetId: string) => void;
  onSelectColor: (colorId: string) => void;
};

export function SheetSelector({
  selectedId,
  selectedColorId,
  onSelect,
  onSelectColor,
}: SheetSelectorProps) {
  const selectedSheet = sheetOptions.find((sheet) => sheet.id === selectedId);

  return (
    <div className="space-y-3">
      <p className="mb-2 text-sm font-medium text-zinc-700">ملحفه یکبار مصرف (گراژ)</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {sheetOptions.map((sheet) => {
          const isSelected = sheet.id === selectedId;
          return (
            <button
              key={sheet.id}
              type="button"
              onClick={() => onSelect(sheet.id)}
              className={`rounded-xl border p-3 text-center transition ${
                isSelected
                  ? "border-emerald-600 bg-emerald-50"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <p className="font-medium text-zinc-900">{sheet.gsm} گرم</p>
              <p className="mt-2 text-sm text-emerald-700">
                {formatToman(sheet.price)}
              </p>
            </button>
          );
        })}
      </div>
      {selectedSheet && (
        <ColorSwatchPicker
          label="رنگ ملحفه"
          colors={selectedSheet.colors}
          selectedId={selectedColorId}
          onSelect={onSelectColor}
        />
      )}
    </div>
  );
}
