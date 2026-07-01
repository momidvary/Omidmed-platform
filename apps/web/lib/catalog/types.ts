export type ColorOption = {
  id: string;
  name: string;
  hex: string;
};

export type PadOrigin = "spanish" | "french" | "chinese";

export type PadModel = {
  id: string;
  name: string;
  origin: PadOrigin;
  description: string;
  price: number;
};

export type SheetGsm = 30 | 38 | 40 | 60;

export type SheetOption = {
  id: string;
  gsm: SheetGsm;
  price: number;
  colors: ColorOption[];
};

export type BagSize = "30x40" | "25x35";

export type BagOption = {
  id: string;
  size: BagSize;
  price: number;
  colors: ColorOption[];
};

export type PackSelection = {
  padModelId: string;
  sheetOptionId: string;
  sheetColorId: string;
  bagOptionId: string;
  bagColorId: string;
  quantity: number;
  logoDataUrl: string | null;
};
