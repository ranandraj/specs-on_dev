# Barcode support

## Workflow

The shopkeeper now prints **blank stickers first** and labels them later by scanning.

1. Open **Barcode Tools** from the dashboard sidebar (**above Inventory**) or from the billing panel button beside **SEARCH CATALOG**. There is no floating corner button.
2. **Generate** tab
   - Enter how many stickers to make: `1`, `100`, `200`, `1000`, etc. (1–5000).
   - Press **Generate random barcodes**.
   - Random, unique Code 128 values (`BC` + 10 digits) are created. A small on-screen preview is shown; **Clear unused** removes them.
   - Generated codes are kept on this device until they are scanned and labelled.
3. **Labels** tab
   - Choose A4 label size: 20 × 15 mm landscape by default, or 15 × 20 mm.
   - Select stickers or **Select all**, then press **Print A4 stickers**.
   - Printed stickers contain **only the barcode** — no product name, no `SP000…` code, no price, and no other text.
   - Print includes every selected sticker; the on-screen preview shows only the first 80 to stay fast.
4. **Scan** tab / billing button
   - On the billing screen, use **SCAN BARCODE** for the camera. It opens in **Scan for billing** mode. **BARCODE TOOLS** (next to **SEARCH CATALOG**) also opens the tools.
   - Allow camera access and point the device camera at a sticker. Code 128, EAN/UPC and other common formats are supported. If the camera cannot read a code, type or paste it into **Or type / paste barcode here** and press **Use code**.
   - **Scan for billing**: only barcodes already labelled in inventory are added to the bill. An unlabelled barcode is rejected with **Non-labeled barcode. Use Scan for assigning to label it first.** Nothing is added.
   - **Scan for assigning**: only unlabelled barcodes are accepted. A labelled barcode is rejected with **Barcode already labeled. Use Scan for billing to add it.** Nothing is added.
   - When an unlabelled barcode is scanned in assigning mode, the picker lists only inventory products that still have **no barcode**, each with its saved price. Choose the product and press **Assign label**. The barcode is saved to `products.barcode`; no price is asked and no item is added to the bill. Scan the same barcode again in **Scan for billing** mode and the product is recognised and added at its saved price.
5. **Assign** tab (optional manual management)
   - Search for a product and press **Generate** to assign an automatic code (`SP000123`).
   - Press **Edit** to type your own code, **Remove barcode** to clear it, or **Generate all missing** for bulk assignment. Clearing a generated `BC…` sticker puts it back in the unused sticker list for reuse.
   - A small live Code 128 preview is shown next to each assigned product.
   - The same barcode field is also available in the **Inventory → Add / Edit Products** form.

## Files

- `assets/barcode-tools.js` — blank batch generation, blank label preview/printing, camera scanner, assignment UI.
- `assets/JsBarcode.all.min.js` — MIT-licensed Code 128 renderer.
- `assets/zxing-browser.min.js` — Apache-2.0 licensed camera decoder.
- `supabase/barcodes.sql` — unique index for non-empty assigned barcodes.

Barcodes are stored in the existing `products.barcode` column once labelled. Generated-but-unused codes stay only in this browser's local storage. No PII is stored in the repository.
