import type { BagOption, ColorOption, PadModel, SheetOption } from "./types";

// NOTE: Prices are MVP placeholders (Toman). Admin panel will make these editable later.

export const bagColors: ColorOption[] = [
  { id: "black", name: "مشکی", hex: "#1a1a1a" },
  { id: "navy", name: "سرمه‌ای", hex: "#1f2a44" },
  { id: "burgundy", name: "زرشکی", hex: "#6d1f2b" },
  { id: "coffee", name: "قهوه‌ای", hex: "#4a3226" },
  { id: "cream", name: "کرم", hex: "#e8dcc4" },
  { id: "white", name: "سفید", hex: "#f5f5f5" },
];

export const sheetColors: ColorOption[] = [
  { id: "white", name: "سفید", hex: "#f5f5f5" },
  { id: "sky", name: "آبی روشن", hex: "#bfe0f0" },
  { id: "green", name: "سبز", hex: "#bfe3c8" },
];

export const padModels: PadModel[] = [
  {
    id: "pad-spanish",
    name: "پد اسپانیایی",
    origin: "spanish",
    description: "چرم درجه یک، دوخت دوطرفه",
    price: 180000,
  },
  {
    id: "pad-french",
    name: "پد فرانسوی",
    origin: "french",
    description: "چرم نرم، مقاومت بالا",
    price: 210000,
  },
  {
    id: "pad-chinese",
    name: "پد چینی",
    origin: "chinese",
    description: "اقتصادی، کیفیت استاندارد",
    price: 120000,
  },
];

export const sheetOptions: SheetOption[] = [
  { id: "sheet-30", gsm: 30, price: 25000, colors: sheetColors },
  { id: "sheet-38", gsm: 38, price: 30000, colors: sheetColors },
  { id: "sheet-40", gsm: 40, price: 34000, colors: sheetColors },
  { id: "sheet-60", gsm: 60, price: 45000, colors: sheetColors },
];

export const bagOptions: BagOption[] = [
  { id: "bag-30x40", size: "30x40", price: 95000, colors: bagColors },
  { id: "bag-25x35", size: "25x35", price: 80000, colors: bagColors },
];

export const findById = <T extends { id: string }>(
  items: T[],
  id: string
): T | undefined => items.find((item) => item.id === id);
