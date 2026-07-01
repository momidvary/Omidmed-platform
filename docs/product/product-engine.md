# Product Engine (OmidMed)

This file defines the core product system of OmidMed Platform.

## MVP Status

The first slice is implemented as static catalog data plus a client-side
order builder. There is no admin panel or database persistence yet — this
is the foundation the future admin-editable catalog will replace.

Code: `apps/web/lib/catalog/`

- `types.ts` — domain types: `ColorOption`, `PadModel`, `SheetOption`,
  `BagOption`, `PackSelection`.
- `data.ts` — seed catalog data for the hygiene pack (pad models, sheet
  GSM options, bag sizes, and their available colors).
- `pricing.ts` — `calculatePackPrice()` computes a price breakdown from a
  selection; `formatToman()` formats amounts for display.

## Pack Structure (current)

A "pack" is a combination of three variant slots, matching how OmidMed
customers actually order:

1. **Pad** (پد فیزیوتراپی) — model: Spanish / French / Chinese, each with
   its own price.
2. **Sheet** (ملحفه) — GSM: 30 / 38 / 40 / 60, each with selectable color.
3. **Bag** (کیف) — size: 30×40 / 25×35, each with selectable color.

Total price = pad price + sheet price + bag price, multiplied by quantity.

## Next steps (not yet built)

- Move catalog data into Supabase tables so admins can edit products,
  variants, colors, and prices without code changes (see
  `PRODUCT_SPEC.md` §13 for the target flexible schema).
- Wire the order builder to Supabase Auth + order submission.
- Replace the CSS mockup preview with the richer AI Product Preview
  described in `apps/web/docs/ui/ai-preview.md`.
