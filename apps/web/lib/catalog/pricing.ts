import { bagOptions, findById, padModels, sheetOptions } from "./data";
import type { PackSelection } from "./types";

export type PriceBreakdown = {
  padPrice: number;
  sheetPrice: number;
  bagPrice: number;
  unitPrice: number;
  quantity: number;
  total: number;
};

export function calculatePackPrice(
  selection: Pick<
    PackSelection,
    "padModelId" | "sheetOptionId" | "bagOptionId" | "quantity"
  >
): PriceBreakdown | null {
  const pad = findById(padModels, selection.padModelId);
  const sheet = findById(sheetOptions, selection.sheetOptionId);
  const bag = findById(bagOptions, selection.bagOptionId);

  if (!pad || !sheet || !bag || selection.quantity < 1) {
    return null;
  }

  const unitPrice = pad.price + sheet.price + bag.price;

  return {
    padPrice: pad.price,
    sheetPrice: sheet.price,
    bagPrice: bag.price,
    unitPrice,
    quantity: selection.quantity,
    total: unitPrice * selection.quantity,
  };
}

export function formatToman(amount: number): string {
  return `${amount.toLocaleString("fa-IR")} تومان`;
}
