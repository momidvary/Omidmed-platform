import type { ColorOption } from "@/lib/catalog/types";

type ColorSwatchPickerProps = {
  label: string;
  colors: ColorOption[];
  selectedId: string;
  onSelect: (colorId: string) => void;
};

export function ColorSwatchPicker({
  label,
  colors,
  selectedId,
  onSelect,
}: ColorSwatchPickerProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => {
          const isSelected = color.id === selectedId;
          return (
            <button
              key={color.id}
              type="button"
              onClick={() => onSelect(color.id)}
              title={color.name}
              aria-pressed={isSelected}
              className={`h-9 w-9 rounded-full border-2 transition ${
                isSelected
                  ? "border-emerald-600 ring-2 ring-emerald-200"
                  : "border-zinc-200"
              }`}
              style={{ backgroundColor: color.hex }}
            />
          );
        })}
      </div>
    </div>
  );
}
