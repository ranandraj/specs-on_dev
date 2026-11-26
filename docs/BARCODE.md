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
   - On the billing screen, use **SCAN BARCODE** for the camera, or **BARCODE TOOLS** (next to **SEARCH CATALOG**) to switch the sidebar to Barcode Tools. On standalone `/pos`, it opens the tools popup.
   - Allow camera access and point the device camera at a sticker. Code 128, EAN/UPC and other common formats are supported.
   - A blank sticker you generated shows **Sticker not labelled yet**. Choose the product it belongs to and press **Assign & add** — the item goes straight into the bill and the code is saved to `products.barcode`.
   - You can also **Add to cart only** (bill without saving a product) or **Save as product & add** (create a new inventory item with that barcode).
   - If the camera cannot read a code, type or paste it into **Or type / paste barcode here** and press **Use code**.
   - A scan from any page is added to the bill; the app returns to the billing panel automatically.
5. **Assign** tab (optional manual management)
   - Search for a product and press **Generate** to assign an automatic code (`SP000123`).
   - Press **Edit** to type your own code, or **Generate all missing** for bulk assignment.
   - A small live Code 128 preview is shown next to each assigned product.
   - The same barcode field is also available in the **Inventory → Add / Edit Products** form.

## Files

- `assets/barcode-tools.js` — blank batch generation, blank label preview/printing, camera scanner, assignment UI.
- `assets/JsBarcode.all.min.js` — MIT-licensed Code 128 renderer.
- `assets/zxing-browser.min.js` — Apache-2.0 licensed camera decoder.
- `supabase/barcodes.sql` — unique index for non-empty assigned barcodes.

Barcodes are stored in the existing `products.barcode` column once labelled. Generated-but-unused codes stay only in this browser's local storage. No PII is stored in the repository.
