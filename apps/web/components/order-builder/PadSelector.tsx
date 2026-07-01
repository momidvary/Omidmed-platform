import { padModels } from "@/lib/catalog/data";
import { formatToman } from "@/lib/catalog/pricing";

type PadSelectorProps = {
  selectedId: string;
  onSelect: (padId: string) => void;
};

export function PadSelector({ selectedId, onSelect }: PadSelectorProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-700">مدل پد فیزیوتراپی</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {padModels.map((pad) => {
          const isSelected = pad.id === selectedId;
          return (
            <button
              key={pad.id}
              type="button"
              onClick={() => onSelect(pad.id)}
              className={`rounded-xl border p-3 text-right transition ${
                isSelected
                  ? "border-emerald-600 bg-emerald-50"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <p className="font-medium text-zinc-900">{pad.name}</p>
              <p className="mt-1 text-xs text-zinc-500">{pad.description}</p>
              <p className="mt-2 text-sm text-emerald-700">
                {formatToman(pad.price)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
