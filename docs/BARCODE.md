# Barcode support

## What was added

- **Code 128 generation and assignment** for every inventory product.
- **Camera scanning** in the billing/POS panel; a scanned item is added to the cart instantly.
- **Barcode label printing** on A4 sheets, 15 × 20 mm by default (20 × 15 mm also available).
- **Price under every barcode** on the printed label.

## How to use

1. Open **Barcode Tools** (floating button, bottom-right of any page).
2. **Assign** tab
   - Search for a product and press **Generate** to assign an automatic code (`SP000123`).
   - Press **Edit** to type your own code, or **Generate all missing** for bulk assignment.
   - A small live Code 128 preview is shown next to each assigned product.
   - The same barcode field is also available in the **Inventory → Add / Edit Products** form.
3. **Scan** tab / billing button
   - On the billing screen, press the green **SCAN BARCODE** button, or open **Barcode Tools → Scan**.
   - Allow camera access and point the device camera at a barcode. Code 128, EAN/UPC and other common formats are supported.
   - If the camera cannot read a code, type or paste it into **Or type / paste barcode here** and press **Use code** — it follows the same flow. Camera permission problems are shown in the status line.
   - **Known code:** the item is added to the cart instantly.
   - **Unknown / unlabeled code:** enter a name and price, then choose:
     - **Add to cart only** — bill it without saving a product.
     - **Save as product & add** — create a new inventory item with that barcode.
     - **Assign to existing product** — attach the scanned code to a catalog item.
4. **Labels** tab
   - Select products (or **Select all**), choose the label size, and press **Print A4 labels**.
   - The printed sheet includes the product name, Code 128 barcode, and the price below the barcode.

## Files

- `assets/barcode-tools.js` — assignment UI, camera scanner, label preview/printing.
- `assets/JsBarcode.all.min.js` — MIT-licensed Code 128 renderer.
- `assets/zxing-browser.min.js` — Apache-2.0 licensed camera decoder.
- `supabase/barcodes.sql` — unique index for non-empty assigned barcodes.

Barcodes are stored in the existing `products.barcode` column. No PII is stored in the repository.
